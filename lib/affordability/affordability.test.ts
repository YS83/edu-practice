import { describe, expect, test } from "vitest";

import { calculateAffordability } from "@/lib/affordability";
import type { AffordabilityInput, PolicyBasis } from "@/lib/affordability";

// 금액 단위는 만원이다.
const baseInput: AffordabilityInput = {
  cash: 50000,
  saleProceeds: 0,
  ownershipStatus: "disposal",
  annualIncome: 100000,
  monthlyTakeHome: 8000,
  existingAnnualDebtService: 0,
  existingMonthlyDebtService: 0,
  acquisitionCosts: 0,
  rate: 4,
  termYears: 30,
  repayment: "annuity",
};

// 한도 캡과 DSR 허용액이 사실상 무한대인 정책: LTV만 대출 한도를 정한다.
const ltvOnlyPolicy: PolicyBasis = {
  ltvDisposal: 40,
  ltvAdditional: 0,
  priceCaps: [{ upTo: null, cap: 1_000_000 }],
  dsrLimit: 1000,
  stressRate: 0,
};

describe("calculateAffordability", () => {
  test("LTV만 대출 한도를 정하면 최대 구매 가격은 현금 합계 ÷ (1 − LTV)다", () => {
    const result = calculateAffordability(baseInput, ltvOnlyPolicy);

    if (result.status !== "ok") throw new Error("ok 결과가 아니다");
    expect(result.maxPrice).toBeCloseTo(83333.33, 1);
    expect(result.loan).toBeCloseTo(33333.33, 1);
    expect(result.loanLimit).toBeCloseTo(33333.33, 1);
    expect(result.binding).toBe("ltv");
  });

  test("구간 상단이 가격을 막으면 필요한 대출액이 대출 한도보다 작다", () => {
    // 현금 12억, 캡 6억(15억 이하) 구간: 15억에서 끝나므로 필요한 대출은 3억이고 한도는 6억이다.
    const policy: PolicyBasis = {
      ...ltvOnlyPolicy,
      ltvDisposal: 70,
      priceCaps: [
        { upTo: 150000, cap: 60000 },
        { upTo: null, cap: 0 },
      ],
    };

    const result = calculateAffordability({ ...baseInput, cash: 120000 }, policy);

    if (result.status !== "ok") throw new Error("ok 결과가 아니다");
    expect(result.maxPrice).toBeCloseTo(150000, 1);
    expect(result.loan).toBeCloseTo(30000, 1);
    expect(result.loanLimit).toBeCloseTo(60000, 1);
    expect(result.binding).toBe("cap");
  });

  test("주택 시가별 한도 캡이 LTV보다 낮으면 캡이 대출 한도를 정하고 최대 구매 가격도 낮아진다", () => {
    const policy: PolicyBasis = {
      ...ltvOnlyPolicy,
      ltvDisposal: 70,
      priceCaps: [
        { upTo: 150000, cap: 60000 },
        { upTo: 250000, cap: 40000 },
        { upTo: null, cap: 20000 },
      ],
    };

    const result = calculateAffordability(baseInput, policy);

    if (result.status !== "ok") throw new Error("ok 결과가 아니다");
    // 현금 5억 + 캡 6억 = 11억. LTV 70%만 보면 약 16.7억까지 가능하다.
    expect(result.maxPrice).toBeCloseTo(110000, 1);
    expect(result.loan).toBeCloseTo(60000, 1);
    expect(result.binding).toBe("cap");
  });

  test("소득이 낮아 DSR 허용액이 LTV 한도보다 작으면 DSR이 대출 한도를 정한다", () => {
    const policy: PolicyBasis = { ...ltvOnlyPolicy, dsrLimit: 40, stressRate: 3 };

    // 연 소득 5,000만원 × 40% = 연 2,000만원. 금리 4% + 스트레스 3% = 7%, 30년 원리금균등으로
    // 월 약 166.7만원을 갚는 원금은 약 2억 5,050만원이다(7%·30년 현가계수 ≈ 150.31).
    const result = calculateAffordability(
      { ...baseInput, annualIncome: 5000 },
      policy
    );

    if (result.status !== "ok") throw new Error("ok 결과가 아니다");
    expect(result.binding).toBe("dsr");
    expect(result.loan).toBeGreaterThan(25000);
    expect(result.loan).toBeLessThan(25100);
    expect(result.maxPrice).toBeCloseTo(50000 + result.loan, 1);
  });

  test("기존 대출 원리금 상환액이 DSR 허용액을 줄여 대출 한도를 낮춘다", () => {
    const policy: PolicyBasis = { ...ltvOnlyPolicy, dsrLimit: 40, stressRate: 3 };
    const withoutDebt = calculateAffordability(
      { ...baseInput, annualIncome: 5000 },
      policy
    );
    const withDebt = calculateAffordability(
      { ...baseInput, annualIncome: 5000, existingAnnualDebtService: 1000 },
      policy
    );

    if (withoutDebt.status !== "ok" || withDebt.status !== "ok")
      throw new Error("ok 결과가 아니다");
    // 허용액이 2,000 → 1,000으로 절반이 되므로 대출도 절반이다.
    expect(withDebt.loan).toBeCloseTo(withoutDebt.loan / 2, 0);
  });

  test("처분하지 않고 추가 매수하면 정책의 추가 매수 LTV(0%)가 적용되어 대출이 없다", () => {
    const result = calculateAffordability(
      { ...baseInput, ownershipStatus: "additional" },
      ltvOnlyPolicy
    );

    if (result.status !== "ok") throw new Error("ok 결과가 아니다");
    expect(result.loan).toBe(0);
    expect(result.maxPrice).toBeCloseTo(50000, 1);
    expect(result.binding).toBe("ltv");
  });

  test("월 상환액은 입력한 실제 금리로 계산하고 실질 소득은 신규·기존 상환액을 뺀 값이다", () => {
    const policy: PolicyBasis = { ...ltvOnlyPolicy, stressRate: 3 };

    const result = calculateAffordability(
      { ...baseInput, rate: 6, existingMonthlyDebtService: 100 },
      policy
    );

    if (result.status !== "ok") throw new Error("ok 결과가 아니다");
    // 대출 약 3억 3,333만원, 6%·30년 원리금균등은 원금 1당 월 0.00599551.
    expect(result.monthlyPayment).toBeCloseTo(199.85, 1);
    expect(result.netMonthlyIncome).toBeCloseTo(8000 - 199.85 - 100, 1);
  });

  test("원금균등은 첫 달 상환액이 원금 ÷ 개월 수 + 첫 달 이자다", () => {
    const result = calculateAffordability(
      { ...baseInput, rate: 6, repayment: "principal" },
      ltvOnlyPolicy
    );

    if (result.status !== "ok") throw new Error("ok 결과가 아니다");
    // 33,333.33 ÷ 360 = 92.59, 첫 달 이자 33,333.33 × 0.5% = 166.67
    expect(result.monthlyPayment).toBeCloseTo(259.26, 1);
  });

  test("비었거나 숫자가 아니거나 음수인 입력은 고쳐야 할 입력 목록과 함께 invalid로 돌려준다", () => {
    const result = calculateAffordability(
      { ...baseInput, cash: Number.NaN, annualIncome: -1, termYears: 0 },
      ltvOnlyPolicy
    );

    expect(result).toEqual({
      status: "invalid",
      fields: ["cash", "annualIncome", "termYears"],
    });
  });

  test("현금이 부대비용보다 적으면 살 수 있는 가격이 없다고 돌려준다", () => {
    const result = calculateAffordability(
      { ...baseInput, cash: 1000, acquisitionCosts: 3000 },
      ltvOnlyPolicy
    );

    expect(result).toEqual({ status: "unaffordable" });
  });

  test("가격 구간이 올라가 캡이 줄어드는 경계에서는 더 비싼 구간에서 살 수 있을 때만 그 구간 가격을 낸다", () => {
    const policy: PolicyBasis = {
      ...ltvOnlyPolicy,
      ltvDisposal: 70,
      priceCaps: [
        { upTo: 150000, cap: 60000 },
        { upTo: 250000, cap: 40000 },
        { upTo: null, cap: 20000 },
      ],
    };

    // 현금 10억: 15억 구간 끝(15억)까지 가능, 15억 초과 구간은 캡 4억이라 14억밖에 안 된다.
    const stuck = calculateAffordability({ ...baseInput, cash: 100000 }, policy);
    // 현금 12억: 15억 초과 구간에서 16억(= 12억 + 4억)까지 가능하다.
    const crossed = calculateAffordability({ ...baseInput, cash: 120000 }, policy);

    if (stuck.status !== "ok" || crossed.status !== "ok")
      throw new Error("ok 결과가 아니다");
    expect(stuck.maxPrice).toBeCloseTo(150000, 1);
    expect(crossed.maxPrice).toBeCloseTo(160000, 1);
    expect(crossed.loan).toBeCloseTo(40000, 1);
  });
});
