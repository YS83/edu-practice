import { fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, expect, test } from "vitest";

import Home from "@/app/page";
import { defaultPolicyId } from "@/lib/affordability/policies";
import { initialForm, policyFormFor, STORAGE_KEY } from "@/lib/affordability/saved";
import { CANDIDATES_KEY } from "@/lib/candidates";

beforeEach(() => {
  window.localStorage.clear();
});

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

test("필수 입력이 비어 있으면 결과 대신 채워야 할 항목을 안내한다", () => {
  render(<Home />);

  expect(
    screen.getByRole("heading", { level: 1, name: "서울 입성, 내 형편으로 각이 나올까?" })
  ).toBeInTheDocument();
  expect(screen.getByText("입력을 확인해 주세요")).toBeInTheDocument();
  expect(
    screen.getByText(/현금 자산, 연 소득\(세전\), 월 실수령 소득/)
  ).toBeInTheDocument();
});

test("자산과 소득을 넣으면 최대 가격과 월 상환 부담을 보여주고, 정책 기준을 고치면 결과가 바뀐다", () => {
  render(<Home />);

  type(/^현금 자산/, "50000");
  type(/^연 소득/, "10000");
  type(/^월 실수령 소득/, "800");

  // 현금 5억, LTV 40%에 부대비용(취득세, 중개보수) 자동 계산이면 약 7억 9,457만 원이다(손계산).
  expect(screen.getAllByText("7억 9,457만 원").length).toBeGreaterThan(0);
  // 그 가격의 부대비용은 약 2,326만 원이다.
  expect(screen.getAllByText("2,326만 원").length).toBeGreaterThan(0);
  expect(screen.getByText(/대출 한도를 정한 규제/)).toBeInTheDocument();

  type(/^LTV \(처분조건부\)/, "50");

  // LTV 50%이면 약 9억 2,937만 원이다(손계산).
  expect(screen.getAllByText("9억 2,937만 원").length).toBeGreaterThan(0);

  // 자동 계산을 끄면 부대비용이 사라져 5억 ÷ 0.5 = 10억이 된다.
  fireEvent.click(screen.getByRole("radio", { name: /직접 입력만 사용/ }));
  expect(screen.getAllByText("10억 원").length).toBeGreaterThan(0);
});

test("서버에서 그린 화면을 브라우저가 이어받아도 저장된 입력이 기본값으로 덮어써지지 않는다", async () => {
  const first = render(<Home />);
  type(/^현금 자산/, "50000");
  first.unmount();

  // 실제 브라우저처럼 서버 렌더 결과(저장값 없음)를 하이드레이션한다.
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.innerHTML = renderToString(<Home />);
  render(<Home />, { container, hydrate: true });

  expect(await screen.findByDisplayValue("50000")).toBeInTheDocument();
  expect(window.localStorage.getItem("edu-practice.affordability.v1")).toContain(
    '"cash":"50000"'
  );
});

test("입력한 값은 다시 열어도 유지된다", async () => {
  const first = render(<Home />);
  type(/^현금 자산/, "50000");
  first.unmount();

  render(<Home />);

  expect(await screen.findByDisplayValue("50000")).toBeInTheDocument();
});

function fillRequired() {
  type(/^현금 자산/, "50000");
  type(/^연 소득/, "10000");
  type(/^월 실수령 소득/, "800");
}

test("없으면 0인 비용과 대출 칸이 비어 있어도 결과를 계산한다", () => {
  render(<Home />);
  fillRequired();

  type(/^기타 비용/, "");
  type(/^주택 매도 확보 현금/, "");
  type(/^기존 대출 연 원리금 상환액/, "");
  type(/^기존 대출 월 상환액/, "");

  expect(screen.queryByText("입력을 확인해 주세요")).not.toBeInTheDocument();
  expect(screen.getAllByText("7억 9,457만 원").length).toBeGreaterThan(0);

  // 자동 계산을 끄고 부대비용 칸이 비어 있어도 0으로 보고 계산한다.
  fireEvent.click(screen.getByRole("radio", { name: /직접 입력만 사용/ }));
  type(/^부대비용/, "");
  expect(screen.queryByText("입력을 확인해 주세요")).not.toBeInTheDocument();
  expect(screen.getAllByText("8억 3,333만 원").length).toBeGreaterThan(0);
});

test("필수 칸이 비었을 때는 그 항목만 알리고 상환 기간 문구는 붙이지 않는다", () => {
  render(<Home />);
  fillRequired();

  type(/^현금 자산/, "");

  expect(screen.getByText(/현금 자산 항목을 0 이상의 숫자로 채워 주세요\.$/)).toBeInTheDocument();
  expect(screen.queryByText(/상환 기간은 0보다 커야/)).not.toBeInTheDocument();
});

test("상환 기간이 문제일 때만 상환 기간 안내가 붙는다", () => {
  render(<Home />);
  fillRequired();

  type(/^상환 기간/, "0");

  expect(screen.getByText(/상환 기간 항목을 0 이상의 숫자로 채워 주세요\. 상환 기간은 0보다 커야 합니다\./)).toBeInTheDocument();
});

// 후보지를 저장소에 넣어 둔다. 9억 5천만원 집이다.
function seedForCandidatePick() {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      form: { ...initialForm, cash: "70000", annualIncome: "10000", monthlyTakeHome: "800" },
      policy: policyFormFor(defaultPolicyId),
    })
  );
  window.localStorage.setItem(
    CANDIDATES_KEY,
    JSON.stringify([
      {
        id: "c1",
        district: "11650",
        complex: "반포자이",
        dong: "",
        area: 85,
        market: { price: 95000, date: null, min: null, max: null, count: 0, fetchedAt: null, source: "manual" },
        listing: "",
        households: "",
        builtYear: "",
        parkingGround: "",
        parkingUnderground: "",
        info: null,
        notes: [],
      },
    ])
  );
}

test("후보지를 고르면 그 후보지 가격 기준으로 부대비용과 대출을 보여준다", async () => {
  seedForCandidatePick();
  render(<Home />);

  fireEvent.click(await screen.findByRole("combobox", { name: /후보지로 계산/ }));
  fireEvent.click(await screen.findByRole("option", { name: /반포자이/ }));

  const section = screen.getByRole("region", { name: /후보지 기준 계산/ });
  // 9억 5천만원: 취득세와 교육세 3,135만원 + 중개보수 475만원 = 3,610만원
  expect(within(section).getByText(/9억 5,000만 원/)).toBeInTheDocument();
  expect(within(section).getByText("취득세 등 3,135만 원")).toBeInTheDocument();
  expect(within(section).getByText("중개보수 475만 원")).toBeInTheDocument();
  expect(within(section).getByText("부대비용 합계 3,610만 원")).toBeInTheDocument();
  // 현금 7억을 쓰고 부족한 2억 8,610만원이 대출이다. 한도는 LTV 40%인 3억 8,000만원이라 살 수 있다.
  expect(within(section).getByText(/필요한 대출액 2억 8,610만 원/)).toBeInTheDocument();
  expect(within(section).getByText("가능")).toBeInTheDocument();
});

test("등록한 후보지가 없으면 후보지로 계산 대신 등록 안내를 보여 준다", async () => {
  render(<Home />);
  fillRequired();

  expect(await screen.findByText(/등록한 후보지가 없습니다/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /후보지 등록하러 가기/ })).toHaveAttribute("href", "/candidates");
});
