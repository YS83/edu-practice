import { describe, expect, test } from "vitest";

import {
  acquisitionCostsAt,
  calculateAffordability,
  evaluatePrice,
} from "@/lib/affordability";
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
  // 기존 기대값은 자동 계산 없이 직접 입력한 부대비용만 쓰는 경우를 기준으로 한다.
  autoCosts: false,
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

describe("evaluatePrice", () => {
  const tiered: PolicyBasis = {
    ...ltvOnlyPolicy,
    ltvDisposal: 70,
    priceCaps: [
      { upTo: 150000, cap: 60000 },
      { upTo: 250000, cap: 40000 },
      { upTo: null, cap: 20000 },
    ],
  };

  test("가격이 구매력 안이면 필요한 대출액과 한도, 월 상환액, 실질 소득을 돌려준다", () => {
    // 현금 5억, LTV 40%: 8억 집은 대출 3억이 필요하고 한도는 3억 2,000만원이다.
    const result = evaluatePrice(baseInput, ltvOnlyPolicy, 80000);

    if (result.status !== "ok") throw new Error("ok 결과가 아니다");
    expect(result.affordable).toBe(true);
    expect(result.loan).toBeCloseTo(30000, 1);
    expect(result.loanLimit).toBeCloseTo(32000, 1);
    expect(result.shortfall).toBe(0);
    expect(result.binding).toBe("ltv");
    expect(result.monthlyPayment).toBeGreaterThan(0);
  });

  test("가격이 구매력을 넘으면 부족액을 돌려준다", () => {
    // 9억 집은 대출 4억이 필요한데 한도는 3억 6,000만원이다.
    const result = evaluatePrice(baseInput, ltvOnlyPolicy, 90000);

    if (result.status !== "ok") throw new Error("ok 결과가 아니다");
    expect(result.affordable).toBe(false);
    expect(result.loan).toBeCloseTo(40000, 1);
    expect(result.loanLimit).toBeCloseTo(36000, 1);
    expect(result.shortfall).toBeCloseTo(4000, 1);
  });

  test("현금이 가격보다 많으면 대출이 필요 없다", () => {
    const result = evaluatePrice(baseInput, ltvOnlyPolicy, 30000);

    if (result.status !== "ok") throw new Error("ok 결과가 아니다");
    expect(result.affordable).toBe(true);
    expect(result.loan).toBe(0);
    expect(result.monthlyPayment).toBe(0);
  });

  test("가격 구간에 따라 한도 캡이 바뀌고, 최대 구매 가격에서의 한도는 구매력 계산과 같다", () => {
    const calculated = calculateAffordability({ ...baseInput, cash: 120000 }, tiered);
    if (calculated.status !== "ok") throw new Error("ok 결과가 아니다");

    const atMax = evaluatePrice({ ...baseInput, cash: 120000 }, tiered, calculated.maxPrice);
    if (atMax.status !== "ok") throw new Error("ok 결과가 아니다");
    expect(atMax.loanLimit).toBeCloseTo(calculated.loanLimit, 1);
    expect(atMax.binding).toBe(calculated.binding);

    // 15억 이하는 캡 6억, 15억 초과는 캡 4억이다.
    const below = evaluatePrice({ ...baseInput, cash: 120000 }, tiered, 150000);
    const above = evaluatePrice({ ...baseInput, cash: 120000 }, tiered, 150001);
    if (below.status !== "ok" || above.status !== "ok")
      throw new Error("ok 결과가 아니다");
    expect(below.loanLimit).toBeCloseTo(60000, 1);
    expect(above.loanLimit).toBeCloseTo(40000, 1);
  });

  test("입력이 잘못됐거나 가격이 숫자가 아니면 invalid를 돌려준다", () => {
    expect(
      evaluatePrice({ ...baseInput, cash: Number.NaN }, ltvOnlyPolicy, 80000)
    ).toEqual({ status: "invalid", fields: ["cash"] });
    expect(evaluatePrice(baseInput, ltvOnlyPolicy, Number.NaN)).toEqual({
      status: "invalid",
      fields: [],
    });
  });
});

describe("acquisitionCostsAt", () => {
  const auto = { ...baseInput, autoCosts: true, acquisitionCosts: 0 };

  test("6억 이하는 취득세 1%, 지방교육세 0.1%, 중개보수 0.4%를 더한다", () => {
    // 5억: 취득세 500 + 교육세 50 + 중개보수 200
    const costs = acquisitionCostsAt(auto, 50000);

    expect(costs.tax).toBeCloseTo(550, 1);
    expect(costs.brokerage).toBeCloseTo(200, 1);
    expect(costs.total).toBeCloseTo(750, 1);
  });

  test("6억 초과 9억 이하는 취득세율이 가격에 따라 1%에서 3%까지 오른다", () => {
    // 7.5억: 취득세율 (7.5 × 2/3 − 3) = 2.0% → 취득세 1,500 + 교육세 150 + 중개보수 300
    expect(acquisitionCostsAt(auto, 75000).total).toBeCloseTo(1950, 1);
  });

  test("9억 초과는 취득세 3%에 중개보수 0.5%다", () => {
    // 9.5억: 취득세 2,850 + 교육세 285 + 중개보수 475
    expect(acquisitionCostsAt(auto, 95000).total).toBeCloseTo(3610, 1);
  });

  test("15억 이상은 중개보수가 0.7%다", () => {
    // 16억: 취득세 4,800 + 교육세 480 + 중개보수 1,120
    expect(acquisitionCostsAt(auto, 160000).total).toBeCloseTo(6400, 1);
  });

  test("처분하지 않고 추가 매수하면 취득세를 중과(8%)하고 교육세 0.4%를 더한다", () => {
    // 5억: 취득세 4,000 + 교육세 200 + 중개보수 200
    const costs = acquisitionCostsAt({ ...auto, ownershipStatus: "additional" }, 50000);

    expect(costs.total).toBeCloseTo(4400, 1);
  });

  test("자동 계산을 끄면 직접 입력한 부대비용만 쓰고, 켜면 직접 입력한 기타 비용을 더한다", () => {
    expect(
      acquisitionCostsAt({ ...auto, autoCosts: false, acquisitionCosts: 300 }, 95000).total
    ).toBe(300);
    expect(
      acquisitionCostsAt({ ...auto, acquisitionCosts: 300 }, 50000).total
    ).toBeCloseTo(1050, 1);
  });
});

describe("자동 부대비용을 반영한 최대 구매 가격", () => {
  const auto = { ...baseInput, autoCosts: true, acquisitionCosts: 0 };

  test("집값에 따라 늘어나는 취득세와 중개보수를 빼고 살 수 있는 최대 가격을 구한다", () => {
    // 현금 5억, LTV 40%. 가격 + 부대비용 − 대출 = 5억이 되는 가격은 약 7억 9,457만원이다(손계산).
    const result = calculateAffordability(auto, ltvOnlyPolicy);

    if (result.status !== "ok") throw new Error("ok 결과가 아니다");
    expect(result.maxPrice).toBeCloseTo(79457, -1);
    expect(result.costs.total).toBeCloseTo(2326, -1);
    expect(result.loan).toBeCloseTo(31783, -1);
    // 그 가격에서 대출은 LTV 한도와 같다.
    expect(result.loan).toBeCloseTo(result.loanLimit, -1);
  });

  test("자동 계산을 끄면 비용이 없어 같은 현금으로 더 비싼 집을 살 수 있다", () => {
    const withCosts = calculateAffordability(auto, ltvOnlyPolicy);
    const without = calculateAffordability({ ...auto, autoCosts: false }, ltvOnlyPolicy);

    if (withCosts.status !== "ok" || without.status !== "ok")
      throw new Error("ok 결과가 아니다");
    expect(without.maxPrice).toBeCloseTo(83333, -1);
    expect(without.maxPrice).toBeGreaterThan(withCosts.maxPrice);
    expect(without.costs.total).toBe(0);
  });

  test("기타 비용은 자동 비용에 더해져 최대 가격을 더 낮춘다", () => {
    const base = calculateAffordability(auto, ltvOnlyPolicy);
    const withExtra = calculateAffordability({ ...auto, acquisitionCosts: 1000 }, ltvOnlyPolicy);

    if (base.status !== "ok" || withExtra.status !== "ok")
      throw new Error("ok 결과가 아니다");
    expect(withExtra.maxPrice).toBeLessThan(base.maxPrice);
    expect(withExtra.costs.extra).toBe(1000);
  });

  test("비용을 내면 현금이 남지 않으면 살 수 있는 가격이 없다", () => {
    expect(
      calculateAffordability({ ...auto, cash: 500, acquisitionCosts: 1000 }, ltvOnlyPolicy)
    ).toEqual({ status: "unaffordable" });
  });

  test("evaluatePrice는 그 가격의 부대비용을 더한 필요한 대출액을 돌려준다", () => {
    // 9억 5천만원: 비용 3,610만원 → 현금 7억을 쓰고 부족한 2억 8,610만원이 대출이다. 한도는 LTV 40%인 3억 8,000만원.
    const result = evaluatePrice({ ...auto, cash: 70000 }, ltvOnlyPolicy, 95000);

    if (result.status !== "ok") throw new Error("ok 결과가 아니다");
    expect(result.costs.total).toBeCloseTo(3610, 1);
    expect(result.loan).toBeCloseTo(28610, 1);
    expect(result.loanLimit).toBeCloseTo(38000, 1);
    expect(result.affordable).toBe(true);
  });

  test("evaluatePrice와 calculateAffordability는 최대 가격에서 같은 결론을 낸다", () => {
    const calculated = calculateAffordability(auto, ltvOnlyPolicy);
    if (calculated.status !== "ok") throw new Error("ok 결과가 아니다");

    const atMax = evaluatePrice(auto, ltvOnlyPolicy, calculated.maxPrice);
    const above = evaluatePrice(auto, ltvOnlyPolicy, calculated.maxPrice + 500);

    if (atMax.status !== "ok" || above.status !== "ok") throw new Error("ok 결과가 아니다");
    expect(atMax.affordable).toBe(true);
    expect(atMax.loan).toBeCloseTo(calculated.loan, 0);
    expect(above.affordable).toBe(false);
  });
});
