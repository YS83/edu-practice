import { fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, expect, test } from "vitest";

import Home from "@/app/page";

beforeEach(() => {
  window.localStorage.clear();
});

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

test("필수 입력이 비어 있으면 결과 대신 채워야 할 항목을 안내한다", () => {
  render(<Home />);

  expect(
    screen.getByRole("heading", { level: 1, name: "입성각" })
  ).toBeInTheDocument();
  expect(
    screen.getByText("서울 입성, 내 형편으로 각이 나올까?")
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
