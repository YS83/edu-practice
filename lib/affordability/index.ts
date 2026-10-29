// 금액 단위는 만원, 비율은 퍼센트(40 = 40%)다.

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
  "ownershipStatus" | "repayment"
>;

export type AffordabilityResult =
  | {
      status: "ok";
      maxPrice: number;
      // 그 가격을 사는 데 필요한 대출액. 대출 한도(loanLimit) 이하다.
      loan: number;
      loanLimit: number;
      binding: BindingConstraint;
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

  const equity = input.cash + input.saleProceeds - input.acquisitionCosts;
  if (equity <= 0) return { status: "unaffordable" };
  const ltv =
    (input.ownershipStatus === "additional"
      ? policy.ltvAdditional
      : policy.ltvDisposal) / 100;

  // 구간 [lo, hi]에서 대출 = min(LTV×가격, 캡, ...)이므로
  // 가격 − 대출 ≤ 자기자본 ⇔ 가격 ≤ min(자기자본/(1−LTV), 자기자본+캡, ...).
  // 높은 구간부터 보아 처음 성립하는 구간의 가격이 최대 구매 가격이다.
  let lo = 0;
  const brackets = policy.priceCaps.map((tier) => {
    const bracket = { lo, hi: tier.upTo ?? Infinity, cap: tier.cap };
    lo = tier.upTo ?? Infinity;
    return bracket;
  });

  const dsrLoan = dsrLoanLimit(input, policy);

  for (const bracket of brackets.reverse()) {
    const maxPrice = Math.min(
      bracket.hi,
      equity / (1 - ltv),
      equity + bracket.cap,
      equity + dsrLoan
    );
    if (maxPrice <= bracket.lo) continue;
    const loan = maxPrice - equity;
    const limits: [BindingConstraint, number][] = [
      ["ltv", ltv * maxPrice],
      ["cap", bracket.cap],
      ["dsr", dsrLoan],
    ];
    const [binding, loanLimit] = limits.reduce((lowest, next) =>
      next[1] < lowest[1] - 1e-9 ? next : lowest
    );
    return {
      status: "ok",
      maxPrice,
      loan,
      loanLimit,
      binding,
      ...repaymentOf(loan, input),
    };
  }
  return {
    status: "ok",
    maxPrice: equity,
    loan: 0,
    loanLimit: 0,
    binding: "ltv",
    ...repaymentOf(0, input),
  };
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

  const equity = input.cash + input.saleProceeds - input.acquisitionCosts;
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
  const [binding, loanLimit] = limits.reduce((lowest, next) =>
    next[1] < lowest[1] - 1e-9 ? next : lowest
  );
  const loan = Math.max(0, price - equity);
  const shortfall = Math.max(0, loan - loanLimit);
  return {
    status: "ok",
    affordable: shortfall === 0,
    loan,
    loanLimit,
    shortfall,
    binding,
    ...repaymentOf(loan, input),
  };
}
