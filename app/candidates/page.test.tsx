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
      form: { ...initialForm, cash: "50000", annualIncome: "10000", monthlyTakeHome: "800" },
      policy: policyFormFor(defaultPolicyId),
    })
  );
}

const tradesBody = {
  trades: [
    { complex: "래미안 퍼스티지", dong: "반포동", area: 84.97, price: 280000, date: "2026-07-10", floor: 5, buildYear: 2009 },
    { complex: "래미안 퍼스티지", dong: "반포동", area: 84.97, price: 295000, date: "2026-10-01", floor: 9, buildYear: 2009 },
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
  // 면적이 다른 두 선택지(59.9㎡, 84.97㎡)가 나온다.
  expect(registerButtons).toHaveLength(2);
  expect(String(fetchMock.mock.calls[0][0])).toContain("name=%ED%8D%BC");

  const option = screen.getByText(/84\.97㎡/).closest("li")!;
  fireEvent.click(within(option).getByRole("button", { name: /후보지로 등록/ }));

  expect(await screen.findByText(/최근 6개월 28억 원~29억 5,000만 원, 2건/)).toBeInTheDocument();
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
  const option = (await screen.findByText(/59\.9㎡/)).closest("li")!;
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
