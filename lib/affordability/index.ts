// 금액 단위는 만원, 비율은 퍼센트(40 = 40%)다.

import { acquisitionCostsAt, COST_BREAKPOINTS } from "./costs";
import type { AcquisitionCosts } from "./costs";

export { acquisitionCostsAt };
export type { AcquisitionCosts };

export type OwnershipStatus = "disposal" | "additional";
export type Repayment = "annuity" | "principal";

export type AffordabilityInput = {
  cash: number;
  saleProceeds: number;
  ownershipStatus: OwnershipStatus;
  annualIncome: number;
  monthlyTakeHome: number;
  existingAnnualDebtService: number;
  existingMonthlyDebtService: number;
  acquisitionCosts: number;
  rate: number;
  termYears: number;
  repayment: Repayment;
  // 켜면 사려는 집값에 따라 취득세와 중개보수를 자동으로 더한다. acquisitionCosts는 그 밖의 기타 비용이다.
  autoCosts: boolean;
};

export type PolicyBasis = {
  ltvDisposal: number;
  ltvAdditional: number;
  // upTo가 null이면 마지막 구간(상한 없음)이다.
  priceCaps: { upTo: number | null; cap: number }[];
  dsrLimit: number;
  stressRate: number;
};

export type BindingConstraint = "ltv" | "cap" | "dsr";

export type NumericField = Exclude<
  keyof AffordabilityInput,
  "ownershipStatus" | "repayment" | "autoCosts"
>;

export type AffordabilityResult =
  | {
      status: "ok";
      maxPrice: number;
      // 그 가격을 사는 데 필요한 대출액. 대출 한도(loanLimit) 이하다.
      loan: number;
      loanLimit: number;
      binding: BindingConstraint;
      // 그 가격에서 드는 부대비용(취득세, 중개보수, 기타)
      costs: AcquisitionCosts;
      // 원금균등이면 첫 달 상환액이다.
      monthlyPayment: number;
      netMonthlyIncome: number;
    }
  | { status: "invalid"; fields: NumericField[] }
  | { status: "unaffordable" };

// 화면의 입력 순서와 같다. 상환 기간만 0보다 커야 하고 나머지는 0 이상이면 된다.
const numericFields: NumericField[] = [
  "cash",
  "saleProceeds",
  "annualIncome",
  "monthlyTakeHome",
  "existingAnnualDebtService",
  "existingMonthlyDebtService",
  "acquisitionCosts",
  "rate",
  "termYears",
];

export function calculateAffordability(
  input: AffordabilityInput,
  policy: PolicyBasis
): AffordabilityResult {
  const invalid = invalidFields(input);
  if (invalid.length > 0) return { status: "invalid", fields: invalid };

  const funds = input.cash + input.saleProceeds;
  if (funds <= input.acquisitionCosts) return { status: "unaffordable" };

  // 부대비용은 집값에 따라 늘고 한도 캡도 가격 구간마다 다르므로, 계산식이 일정한 구간으로 나눠 푼다.
  // 한 구간 안에서 "가격 + 비용 − 대출 한도"는 가격에 따라 계속 늘어나므로 이분 탐색으로 풀 수 있다.
  const gap = (price: number) =>
    price + acquisitionCostsAt(input, price).total - funds - limitsAt(price, input, policy)[1];
  const edges = [
    ...new Set([
      0,
      ...policy.priceCaps.flatMap((tier) => (tier.upTo === null ? [] : [tier.upTo])),
      ...COST_BREAKPOINTS,
      UPPER_PRICE,
    ]),
  ].sort((a, b) => a - b);

  for (let i = edges.length - 2; i >= 0; i--) {
    const lo = edges[i] + EPSILON;
    const hi = edges[i + 1];
    if (gap(lo) > 0) continue;
    let low = lo;
    let high = hi;
    if (gap(hi) <= 0) {
      low = hi;
    } else {
      for (let step = 0; step < 100; step++) {
        const mid = (low + high) / 2;
        if (gap(mid) <= 0) low = mid;
        else high = mid;
      }
    }
    const maxPrice = low;
    const costs = acquisitionCostsAt(input, maxPrice);
    const [binding, loanLimit] = limitsAt(maxPrice, input, policy);
    const loan = Math.max(0, maxPrice + costs.total - funds);
    return {
      status: "ok",
      maxPrice,
      loan,
      loanLimit,
      binding,
      costs,
      ...repaymentOf(loan, input),
    };
  }
  return { status: "unaffordable" };
}

const EPSILON = 1e-6;
// 최대 가격을 찾는 탐색의 상한(10조원)이다. 마지막 구간의 끝으로만 쓴다.
const UPPER_PRICE = 1e9;

// 그 가격에서 대출 한도를 정하는 규제와 한도. LTV, 가격 구간별 캡, DSR 중 가장 낮은 값이다.
function limitsAt(
  price: number,
  input: AffordabilityInput,
  policy: PolicyBasis
): [BindingConstraint, number] {
  const ltv =
    (input.ownershipStatus === "additional"
      ? policy.ltvAdditional
      : policy.ltvDisposal) / 100;
  const tier =
    policy.priceCaps.find((candidate) => candidate.upTo === null || price <= candidate.upTo) ??
    policy.priceCaps[policy.priceCaps.length - 1];
  const limits: [BindingConstraint, number][] = [
    ["ltv", ltv * price],
    ["cap", tier.cap],
    ["dsr", dsrLoanLimit(input, policy)],
  ];
  return limits.reduce((lowest, next) => (next[1] < lowest[1] - 1e-9 ? next : lowest));
}

// 월 상환액은 스트레스 금리 없이 사용자가 입력한 실제 금리로 계산한다.
function repaymentOf(loan: number, input: AffordabilityInput) {
  const months = input.termYears * 12;
  const monthlyRate = input.rate / 100 / 12;
  let monthlyPayment: number;
  if (input.repayment === "principal") {
    monthlyPayment = loan / months + loan * monthlyRate;
  } else if (monthlyRate === 0) {
    monthlyPayment = loan / months;
  } else {
    monthlyPayment =
      (loan * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
  }
  const netMonthlyIncome =
    input.monthlyTakeHome - monthlyPayment - input.existingMonthlyDebtService;
  return { monthlyPayment, netMonthlyIncome };
}

// DSR 허용 연 상환액으로 갚을 수 있는 원금. 스트레스 금리를 더한 금리의 원리금균등으로 환산한다.
function dsrLoanLimit(input: AffordabilityInput, policy: PolicyBasis) {
  const annualAllowance = Math.max(
    0,
    (input.annualIncome * policy.dsrLimit) / 100 - input.existingAnnualDebtService
  );
  const months = input.termYears * 12;
  const monthlyRate = (input.rate + policy.stressRate) / 100 / 12;
  const annuityFactor =
    monthlyRate === 0
      ? months
      : (1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate;
  return (annualAllowance / 12) * annuityFactor;
}

function invalidFields(input: AffordabilityInput): NumericField[] {
  return numericFields.filter((field) => {
    const value = input[field];
    if (!Number.isFinite(value)) return true;
    return field === "termYears" ? value <= 0 : value < 0;
  });
}

export type PriceEvaluation =
  | {
      status: "ok";
      affordable: boolean;
      // 그 가격을 사는 데 필요한 대출액과 그 가격에서의 대출 한도.
      loan: number;
      loanLimit: number;
      // 필요한 대출액이 한도를 넘는 만큼. 살 수 있으면 0이다.
      shortfall: number;
      binding: BindingConstraint;
      costs: AcquisitionCosts;
      monthlyPayment: number;
      netMonthlyIncome: number;
    }
  | { status: "invalid"; fields: NumericField[] };

// 주어진 가격의 집을 지금 조건으로 살 수 있는지 본다. 한도 규칙은 calculateAffordability와 같다.
export function evaluatePrice(
  input: AffordabilityInput,
  policy: PolicyBasis,
  price: number
): PriceEvaluation {
  const invalid = invalidFields(input);
  if (invalid.length > 0 || !Number.isFinite(price) || price < 0) {
    return { status: "invalid", fields: invalid };
  }

  const costs = acquisitionCostsAt(input, price);
  const [binding, loanLimit] = limitsAt(price, input, policy);
  const loan = Math.max(0, price + costs.total - (input.cash + input.saleProceeds));
  const shortfall = Math.max(0, loan - loanLimit);
  return {
    status: "ok",
    affordable: shortfall === 0,
    loan,
    loanLimit,
    shortfall,
    binding,
    costs,
    ...repaymentOf(loan, input),
  };
}
