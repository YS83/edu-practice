import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import CandidatesPage from "@/app/candidates/page";
import { defaultPolicyId } from "@/lib/affordability/policies";
import { initialForm, policyFormFor, STORAGE_KEY } from "@/lib/affordability/saved";
import { CANDIDATES_KEY } from "@/lib/candidates";

// 현금 5억, 연 소득 1억, LTV 40%: 구매력 계산 화면이 저장해 둔 입력이다.
function saveAffordability() {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      form: { ...initialForm, cash: "50000", annualIncome: "10000", monthlyTakeHome: "800", autoCosts: false },
      policy: policyFormFor(defaultPolicyId),
    })
  );
}

const tradesBody = {
  trades: [
    { complex: "래미안 퍼스티지", dong: "반포동", area: 84.97, price: 280000, date: "2026-07-10", floor: 5, buildYear: 2009 },
    { complex: "래미안 퍼스티지", dong: "반포동", area: 84.97, price: 295000, date: "2026-10-01", floor: 9, buildYear: 2009 },
    { complex: "래미안 퍼스티지", dong: "반포동", area: 84.93, price: 290000, date: "2026-08-01", floor: 7, buildYear: 2009 },
    { complex: "래미안 퍼스티지", dong: "반포동", area: 59.9, price: 200000, date: "2026-09-01", floor: 3, buildYear: 2009 },
  ],
  fetchedAt: "2026-10-29",
};

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async (url: string) => {
    void url;
    return Response.json(body, { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function lookup(name = "퍼스티지") {
  type(/^단지명/, name);
  fireEvent.click(screen.getByRole("button", { name: /실거래가 조회/ }));
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("단지를 조회해 등록하면 최근 실거래가와 6개월 범위가 보이고, 호가를 넣으면 구매력과 비교한다", async () => {
  saveAffordability();
  const fetchMock = stubFetch(200, tradesBody);
  render(<CandidatesPage />);

  await lookup();
  const registerButtons = await screen.findAllByRole("button", { name: /후보지로 등록/ });
  // 84.93과 84.97㎡는 같은 85㎡로 묶여서, 85㎡와 60㎡ 두 선택지만 나온다.
  expect(registerButtons).toHaveLength(2);
  expect(String(fetchMock.mock.calls[0][0])).toContain("name=%ED%8D%BC");

  const option = screen.getByText(/85㎡/).closest("li")!;
  fireEvent.click(within(option).getByRole("button", { name: /후보지로 등록/ }));

  expect(await screen.findByText(/최근 6개월 28억 원~29억 5,000만 원, 3건/)).toBeInTheDocument();
  expect(screen.getByText(/2026-10-29 조회 \(국토교통부\)/)).toBeInTheDocument();

  // 호가 7억: 필요한 대출 2억, 한도 2억 8,000만원이라 살 수 있다.
  fireEvent.change(screen.getByLabelText(/^호가/), { target: { value: "70000" } });
  expect(screen.getAllByText("가능").length).toBeGreaterThan(0);
  expect(screen.getByText(/필요한 대출액 2억 원 · 대출 한도 2억 8,000만 원/)).toBeInTheDocument();

  // 호가 9억: 필요한 대출 4억, 한도 3억 6,000만원이라 4,000만원이 부족하다.
  fireEvent.change(screen.getByLabelText(/^호가/), { target: { value: "90000" } });
  expect(screen.getAllByText("부족").length).toBeGreaterThan(0);
  expect(screen.getByText(/부족액 4,000만 원/)).toBeInTheDocument();
  // 최근 실거래가 29억 5,000만원보다 호가가 낮으면 차이는 음수다.
  expect(screen.getByText("-20억 5,000만 원 (-69.5%)")).toBeInTheDocument();
});

test("호가가 비어 있으면 최근 실거래가 기준으로 비교한다고 알려 준다", async () => {
  saveAffordability();
  stubFetch(200, tradesBody);
  render(<CandidatesPage />);

  await lookup();
  const option = (await screen.findByText(/60㎡/)).closest("li")!;
  fireEvent.click(within(option).getByRole("button", { name: /후보지로 등록/ }));

  expect(await screen.findByText(/호가가 없어 최근 실거래가 기준/)).toBeInTheDocument();
});

test("인증키가 없으면 이유를 보여 주고, 직접 입력으로 후보지를 등록할 수 있다", async () => {
  saveAffordability();
  stubFetch(503, { error: "missing-key" });
  render(<CandidatesPage />);

  await lookup("반포자이");

  expect(await screen.findByText(/DATA_GO_KR_API_KEY/)).toBeInTheDocument();
  type(/^전용면적/, "84.9");
  type(/^최근 실거래가/, "250000");
  fireEvent.click(screen.getByRole("button", { name: /직접 입력으로 등록/ }));

  expect(await screen.findByText("직접 입력한 값")).toBeInTheDocument();
  expect(screen.getAllByText(/반포자이/).length).toBeGreaterThan(0);
});

test("일치하는 거래가 없으면 안내와 함께 직접 입력 등록을 보여 준다", async () => {
  saveAffordability();
  stubFetch(200, { trades: [], fetchedAt: "2026-10-29" });
  render(<CandidatesPage />);

  await lookup("없는단지");

  expect(await screen.findByText("일치하는 거래가 없습니다")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /직접 입력으로 등록/ })).toBeInTheDocument();
});

test("구매력 입력이 없으면 비교 대신 구매력 계산으로 가는 안내를 보여 준다", () => {
  render(<CandidatesPage />);

  expect(screen.getByText("구매력 입력이 아직 없습니다")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /구매력 계산으로 가기/ })).toHaveAttribute("href", "/");
});

test("임장기를 추가, 수정, 삭제할 수 있고 다시 열어도 남아 있다", async () => {
  saveAffordability();
  stubFetch(503, { error: "missing-key" });
  const first = render(<CandidatesPage />);
  await lookup("반포자이");
  await screen.findByText(/DATA_GO_KR_API_KEY/);
  type(/^최근 실거래가/, "250000");
  fireEvent.click(screen.getByRole("button", { name: /직접 입력으로 등록/ }));

  fireEvent.change(await screen.findByLabelText(/^임장 기록/), {
    target: { value: "역에서 걸어서 7분, 소음 적음" },
  });
  fireEvent.click(screen.getByRole("button", { name: /임장기 추가/ }));
  expect(await screen.findByText("역에서 걸어서 7분, 소음 적음")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "수정" }));
  fireEvent.change(screen.getByLabelText("임장기 수정"), {
    target: { value: "역에서 걸어서 7분, 소음 적음, 주차 여유" },
  });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByText(/주차 여유/)).toBeInTheDocument();

  first.unmount();
  render(<CandidatesPage />);
  expect(await screen.findByText(/주차 여유/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "삭제" }));
  expect(screen.queryByText(/주차 여유/)).not.toBeInTheDocument();
  expect(screen.getByText("아직 남긴 임장기가 없습니다.")).toBeInTheDocument();
});

test("후보지를 삭제하기 전에 임장기도 함께 사라진다고 알려 준다", async () => {
  saveAffordability();
  stubFetch(503, { error: "missing-key" });
  render(<CandidatesPage />);
  await lookup("반포자이");
  await screen.findByText(/DATA_GO_KR_API_KEY/);
  type(/^최근 실거래가/, "250000");
  fireEvent.click(screen.getByRole("button", { name: /직접 입력으로 등록/ }));
  fireEvent.change(await screen.findByLabelText(/^임장 기록/), { target: { value: "첫 방문" } });
  fireEvent.click(screen.getByRole("button", { name: /임장기 추가/ }));

  fireEvent.click(screen.getByRole("button", { name: /후보지 삭제/ }));
  expect(screen.getByText(/임장기 1건도 함께 사라지고/)).toBeInTheDocument();

  const confirmation = screen.getByText("이 후보지를 삭제할까요?").closest("[role=alert]") as HTMLElement;
  fireEvent.click(within(confirmation).getByRole("button", { name: "삭제" }));
  await waitFor(() => expect(screen.getByText("등록한 후보지가 없습니다")).toBeInTheDocument());
});

test("서버에서 그린 화면을 브라우저가 이어받아도 저장된 후보지가 덮어써지지 않는다", async () => {
  saveAffordability();
  window.localStorage.setItem(
    CANDIDATES_KEY,
    JSON.stringify([
      {
        id: "c1",
        district: "11650",
        complex: "저장된 단지",
        dong: "",
        area: 84.9,
        market: { price: 250000, date: null, min: null, max: null, count: 0, fetchedAt: null, source: "manual" },
        listing: "",
        households: "",
        builtYear: "",
        notes: [],
      },
    ])
  );
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.innerHTML = renderToString(<CandidatesPage />);
  render(<CandidatesPage />, { container, hydrate: true });

  expect((await screen.findAllByText(/저장된 단지/)).length).toBeGreaterThan(0);
  expect(window.localStorage.getItem(CANDIDATES_KEY)).toContain("저장된 단지");
});

// URL에 따라 응답을 나눠 주는 외부 API 대역이다.
function stubRoutes(routes: Record<string, { status: number; body: unknown }>) {
  const fetchMock = vi.fn(async (url: string) => {
    const key = Object.keys(routes).find((prefix) => String(url).startsWith(prefix));
    const route = key ? routes[key] : { status: 404, body: {} };
    return Response.json(route.body, { status: route.status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// 현금 7억이라 9억 5천만원 집(대출 2억 5천만원)을 살 수 있다.
function saveRichAffordability() {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      form: { ...initialForm, cash: "70000", annualIncome: "10000", monthlyTakeHome: "800", autoCosts: false },
      policy: policyFormFor(defaultPolicyId),
    })
  );
}

async function registerManually(price: string) {
  await lookup("반포자이");
  await screen.findByText(/DATA_GO_KR_API_KEY/);
  type(/^최근 실거래가/, price);
  fireEvent.click(screen.getByRole("button", { name: /직접 입력으로 등록/ }));
  await screen.findByRole("button", { name: /단지 정보 가져오기/ });
}

const complexRoutes = {
  "/api/trades": { status: 503, body: { error: "missing-key" } },
  "/api/complex?district": {
    status: 200,
    body: {
      complexes: [
        { code: "A10027000", name: "반포자이", address: "서울특별시 서초구 반포동" },
      ],
      fetchedAt: "2026-10-29",
    },
  },
  "/api/complex?code": {
    status: 200,
    body: {
      info: { households: 3410, builtYear: 2009, parkingGround: 100, parkingUnderground: 3500 },
      fetchedAt: "2026-10-29",
    },
  },
};

test("단지 정보를 가져오면 세대수, 준공연도, 주차가 채워지고 기준에 맞춰 매수 의견이 나온다", async () => {
  saveRichAffordability();
  stubRoutes(complexRoutes);
  render(<CandidatesPage />);
  await registerManually("95000");

  fireEvent.click(screen.getByRole("button", { name: /단지 정보 가져오기/ }));
  fireEvent.click(await screen.findByRole("button", { name: /이 단지로 채우기/ }));

  expect(await screen.findByText(/국토교통부 K-apt · 반포자이 · 2026-10-29 조회/)).toBeInTheDocument();
  expect(screen.getByLabelText(/^세대수/)).toHaveValue("3410");
  expect(screen.getByLabelText(/^준공연도/)).toHaveValue("2009");
  expect(screen.getByLabelText(/^지상 주차/)).toHaveValue("100");
  expect(screen.getByLabelText(/^지하 주차/)).toHaveValue("3500");

  // 필수 2개 충족, 선호 중 가격(9.5억), 500세대, 주차(3,600대/3,410세대) 3개 충족, 준공 10년 초과는 미충족.
  expect(screen.getAllByText("적극매수").length).toBeGreaterThan(0);
  expect(screen.getByText(/세대수 200세대 이상/)).toBeInTheDocument();
  expect(screen.getByText(/준공 10년 이내/).closest("li")).toHaveTextContent("미충족");
  expect(screen.getAllByText(/투자는 개인 판단에 따른 것이며/).length).toBeGreaterThan(0);
  expect(screen.getByText(/위치 정보를 가져오면 반영됩니다/)).toBeInTheDocument();
});

test("가져온 값을 직접 고치면 직접 수정 표시가 붙고 의견이 다시 계산된다", async () => {
  saveRichAffordability();
  stubRoutes(complexRoutes);
  render(<CandidatesPage />);
  await registerManually("95000");
  fireEvent.click(screen.getByRole("button", { name: /단지 정보 가져오기/ }));
  fireEvent.click(await screen.findByRole("button", { name: /이 단지로 채우기/ }));
  await screen.findByText(/국토교통부 K-apt/);
  expect(screen.queryByText(/직접 수정:/)).not.toBeInTheDocument();

  // 세대수를 150으로 고치면 필수 조건(200세대)을 못 지켜 중립이 된다.
  type(/^세대수/, "150");

  expect(screen.getByText("직접 수정: 세대수")).toBeInTheDocument();
  expect(screen.getAllByText("중립").length).toBeGreaterThan(0);
  expect(screen.getByText(/세대수 200세대 이상/).closest("li")).toHaveTextContent("미충족");
});

test("단지 정보 조회가 실패해도 직접 입력으로 의견을 계산할 수 있다", async () => {
  saveRichAffordability();
  stubRoutes({
    ...complexRoutes,
    "/api/complex?district": { status: 503, body: { error: "missing-key" } },
  });
  render(<CandidatesPage />);
  await registerManually("95000");

  fireEvent.click(screen.getByRole("button", { name: /단지 정보 가져오기/ }));
  expect(await screen.findByText("단지 정보를 가져오지 못했습니다")).toBeInTheDocument();

  type(/^세대수/, "800");
  type(/^준공연도/, "2020");
  type(/^지상 주차/, "300");
  type(/^지하 주차/, "700");

  // 가격, 500세대, 준공, 주차(1,000대/800세대) 4개 충족.
  expect(screen.getAllByText("적극매수").length).toBeGreaterThan(0);
});

test("세대수를 모르면 판정을 보류하고, 주차만 모르면 나머지 조건으로 계산한다", async () => {
  saveRichAffordability();
  stubRoutes(complexRoutes);
  render(<CandidatesPage />);
  await registerManually("95000");

  expect(screen.getAllByText("보류").length).toBeGreaterThan(0);
  expect(screen.getByText("확인 불가 항목이 있어 판정을 보류합니다.")).toBeInTheDocument();

  type(/^세대수/, "800");
  type(/^준공연도/, "2020");

  // 주차는 확인 불가이지만 가격, 500세대, 준공 3개 충족으로 적극매수다.
  expect(screen.getAllByText("적극매수").length).toBeGreaterThan(0);
  expect(screen.getByText(/주차 세대당/).closest("li")).toHaveTextContent("확인 불가");
});

test("기준을 바꾸면 모든 후보지의 의견이 다시 계산되고 새로고침 후에도 유지된다", async () => {
  saveRichAffordability();
  stubRoutes(complexRoutes);
  const first = render(<CandidatesPage />);
  await registerManually("95000");
  type(/^세대수/, "800");
  type(/^준공연도/, "2020");
  type(/^지상 주차/, "1000");
  expect(screen.getAllByText("적극매수").length).toBeGreaterThan(0);

  // 세대수 최소를 1,000으로 올리면 800세대는 필수를 못 지켜 중립이다.
  type(/^필수 · 세대수 최소/, "1000");
  expect(screen.getAllByText("중립").length).toBeGreaterThan(0);
  expect(screen.queryByText("적극매수")).not.toBeInTheDocument();

  first.unmount();
  render(<CandidatesPage />);
  expect(await screen.findByLabelText(/^필수 · 세대수 최소/)).toHaveValue("1000");
});

test("기준 값이 잘못되면 의견을 계산하지 않고 이유를 알려 준다", async () => {
  saveRichAffordability();
  stubRoutes(complexRoutes);
  render(<CandidatesPage />);
  await registerManually("95000");

  type(/^선호 · 선호 가격 최소/, "abc");

  expect(screen.getByText(/고칠 때까지 의견을 계산하지 않습니다/)).toBeInTheDocument();
  expect(screen.getByText(/매수 의견 기준을 확인하면/)).toBeInTheDocument();
});

test("자동 부대비용을 켜 두면 후보지의 필요한 대출액에 그 집값의 취득세와 중개보수가 더해진다", async () => {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      form: { ...initialForm, cash: "50000", annualIncome: "10000", monthlyTakeHome: "800", autoCosts: true },
      policy: policyFormFor(defaultPolicyId),
    })
  );
  stubFetch(200, tradesBody);
  render(<CandidatesPage />);
  await lookup();
  const option = (await screen.findByText(/85㎡/)).closest("li")!;
  fireEvent.click(within(option).getByRole("button", { name: /후보지로 등록/ }));

  // 호가 7억: 부대비용 1,563만원이 더해져 필요한 대출은 2억 1,563만원이다(손계산).
  fireEvent.change(await screen.findByLabelText(/^호가/), { target: { value: "70000" } });

  expect(screen.getByText(/부대비용 1,563만 원/)).toBeInTheDocument();
  expect(screen.getByText(/필요한 대출액 2억 1,563만 원 · 대출 한도 2억 8,000만 원/)).toBeInTheDocument();
});

const locationBody = {
  place: { name: "래미안퍼스티지", address: "서울 서초구 반포동 1-1" },
  elementary: { name: "서울반포초등학교", distance: 350 },
  middle: { name: "반포중학교", distance: 600 },
  station: { name: "고속터미널역 7호선", distance: 410 },
  academies: { count: 12, capped: false, radius: 800 },
};

function locationRoutes(location: { status: number; body: unknown }) {
  return { ...complexRoutes, "/api/location": location };
}

async function openLocationCandidate() {
  saveRichAffordability();
  render(<CandidatesPage />);
  await registerManually("95000");
  type(/^세대수/, "800");
  type(/^준공연도/, "2020");
}

test("위치 정보를 가져오면 가까운 학교, 역, 학원 수가 보이고 매수 의견 근거에 반영된다", async () => {
  stubRoutes(locationRoutes({ status: 200, body: locationBody }));
  await openLocationCandidate();
  expect(screen.getByText(/위치 정보를 가져오면 반영됩니다/)).toBeInTheDocument();
  expect(screen.getByText(/초등학교 800m 이내/).closest("li")).toHaveTextContent("확인 불가");

  fireEvent.click(screen.getByRole("button", { name: /위치 정보 가져오기/ }));

  expect(await screen.findByText("서울반포초등학교 · 350m")).toBeInTheDocument();
  expect(screen.getByText("반포중학교 · 600m")).toBeInTheDocument();
  expect(screen.getByText("고속터미널역 7호선 · 410m")).toBeInTheDocument();
  expect(screen.getByText("12개")).toBeInTheDocument();
  expect(screen.getByText(/찾은 장소: 래미안퍼스티지 \(서울 서초구 반포동 1-1\)/)).toBeInTheDocument();
  expect(screen.getAllByText(/직선거리/).length).toBeGreaterThan(0);
  expect(screen.getByText(/카카오 로컬 API/)).toBeInTheDocument();
  expect(screen.getByText(/초등학교 800m 이내/).closest("li")).toHaveTextContent("충족");
  expect(screen.getByText(/학원 10개 이상/).closest("li")).toHaveTextContent("충족");
  expect(screen.queryByText(/위치 정보를 가져오면 반영됩니다/)).not.toBeInTheDocument();
});

test("반경 안에 시설이 없으면 근처에 없음으로 보이고 미충족이다", async () => {
  stubRoutes(
    locationRoutes({
      status: 200,
      body: { ...locationBody, station: null, academies: { count: 45, capped: true, radius: 800 } },
    })
  );
  await openLocationCandidate();

  fireEvent.click(screen.getByRole("button", { name: /위치 정보 가져오기/ }));

  expect(await screen.findByText("근처에 없음")).toBeInTheDocument();
  expect(screen.getByText("45개 이상")).toBeInTheDocument();
  expect(screen.getByText(/지하철역 800m 이내/).closest("li")).toHaveTextContent("미충족");
});

test("거리 기준을 바꾸면 다시 조회하지 않고 의견 근거가 바뀐다", async () => {
  const fetchMock = stubRoutes(locationRoutes({ status: 200, body: locationBody }));
  await openLocationCandidate();
  fireEvent.click(screen.getByRole("button", { name: /위치 정보 가져오기/ }));
  await screen.findByText("서울반포초등학교 · 350m");
  const before = fetchMock.mock.calls.length;

  type(/^선호 · 초등학교까지/, "300");

  expect(screen.getByText(/초등학교 300m 이내/).closest("li")).toHaveTextContent("미충족");
  expect(fetchMock.mock.calls.length).toBe(before);
});

test("위치 조회 결과는 저장하지 않아 다시 열면 사라진다", async () => {
  stubRoutes(locationRoutes({ status: 200, body: locationBody }));
  await openLocationCandidate();
  fireEvent.click(screen.getByRole("button", { name: /위치 정보 가져오기/ }));
  await screen.findByText("서울반포초등학교 · 350m");

  expect(JSON.stringify({ ...window.localStorage })).not.toContain("서울반포초등학교");
  expect(JSON.stringify({ ...window.localStorage })).not.toContain("고속터미널역");
});

test("카카오 키가 없으면 이유를 보여 주고 위치 조건은 확인 불가로 남는다", async () => {
  stubRoutes(locationRoutes({ status: 503, body: { error: "missing-key" } }));
  await openLocationCandidate();

  fireEvent.click(screen.getByRole("button", { name: /위치 정보 가져오기/ }));

  expect(await screen.findByText(/KAKAO_REST_API_KEY/)).toBeInTheDocument();
  expect(screen.getByText(/초등학교 800m 이내/).closest("li")).toHaveTextContent("확인 불가");
});

test("단지 위치를 찾지 못하면 안내하고, 카카오 오류의 원인도 보여 준다", async () => {
  stubRoutes(locationRoutes({ status: 404, body: { error: "not-found" } }));
  await openLocationCandidate();
  fireEvent.click(screen.getByRole("button", { name: /위치 정보 가져오기/ }));
  expect(await screen.findByText(/이 단지의 위치를 찾지 못했습니다/)).toBeInTheDocument();

  stubRoutes(locationRoutes({ status: 502, body: { error: "upstream", detail: "HTTP 401: invalid key" } }));
  fireEvent.click(screen.getByRole("button", { name: /위치 정보 가져오기/ }));
  expect(await screen.findByText(/카카오 응답: HTTP 401: invalid key/)).toBeInTheDocument();
});

test("적극매수 기준 개수를 올리면 같은 후보지의 의견이 매수로 바뀐다", async () => {
  stubRoutes(locationRoutes({ status: 200, body: locationBody }));
  await openLocationCandidate();
  fireEvent.click(screen.getByRole("button", { name: /위치 정보 가져오기/ }));
  await screen.findByText("서울반포초등학교 · 350m");
  expect(screen.getAllByText("적극매수").length).toBeGreaterThan(0);

  type(/^등급 · 적극매수 기준/, "9");

  expect(screen.queryByText("적극매수")).not.toBeInTheDocument();
  expect(screen.getAllByText("매수").length).toBeGreaterThan(0);
});
