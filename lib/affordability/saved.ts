import { defaultPolicyId, policyOptions } from "./policies";
import type { AffordabilityInput, PolicyBasis } from "./index";

export const STORAGE_KEY = "edu-practice.affordability.v1";

export type FormState = {
  cash: string;
  saleProceeds: string;
  ownershipStatus: "disposal" | "additional";
  annualIncome: string;
  monthlyTakeHome: string;
  existingAnnualDebtService: string;
  existingMonthlyDebtService: string;
  acquisitionCosts: string;
  rate: string;
  termYears: string;
  repayment: "annuity" | "principal";
  autoCosts: boolean;
};

export type PolicyForm = {
  policyId: string;
  ltvDisposal: string;
  ltvAdditional: string;
  cap1: string;
  cap2: string;
  cap3: string;
  dsrLimit: string;
  stressRate: string;
};

export type Saved = { form: FormState; policy: PolicyForm };

export const initialForm: FormState = {
  cash: "",
  saleProceeds: "0",
  ownershipStatus: "disposal",
  annualIncome: "",
  monthlyTakeHome: "",
  existingAnnualDebtService: "0",
  existingMonthlyDebtService: "0",
  acquisitionCosts: "0",
  rate: "4",
  termYears: "30",
  repayment: "annuity",
  autoCosts: true,
};

export function policyFormFor(policyId: string): PolicyForm {
  const option =
    policyOptions.find((candidate) => candidate.id === policyId) ??
    policyOptions[0];
  const { basis } = option;
  return {
    policyId: option.id,
    ltvDisposal: String(basis.ltvDisposal),
    ltvAdditional: String(basis.ltvAdditional),
    cap1: String(basis.priceCaps[0].cap),
    cap2: String(basis.priceCaps[1].cap),
    cap3: String(basis.priceCaps[2].cap),
    dsrLimit: String(basis.dsrLimit),
    stressRate: String(basis.stressRate),
  };
}

// 빈 칸은 숫자 0이 아니라 "입력되지 않음"이므로 NaN으로 바꾼다.
function toNumber(text: string): number {
  return text.trim() === "" ? Number.NaN : Number(text);
}

// 매도 확보 현금, 기존 대출, 부대비용처럼 "없으면 0"인 칸은 비어 있어도 0으로 본다.
function toNumberOrZero(text: string): number {
  return text.trim() === "" ? 0 : Number(text);
}

export function toInput(form: FormState): AffordabilityInput {
  return {
    cash: toNumber(form.cash),
    saleProceeds: toNumberOrZero(form.saleProceeds),
    ownershipStatus: form.ownershipStatus,
    annualIncome: toNumber(form.annualIncome),
    monthlyTakeHome: toNumber(form.monthlyTakeHome),
    existingAnnualDebtService: toNumberOrZero(form.existingAnnualDebtService),
    existingMonthlyDebtService: toNumberOrZero(form.existingMonthlyDebtService),
    acquisitionCosts: toNumberOrZero(form.acquisitionCosts),
    rate: toNumber(form.rate),
    termYears: toNumber(form.termYears),
    repayment: form.repayment,
    autoCosts: form.autoCosts,
  };
}

export function toBasis(policy: PolicyForm): PolicyBasis | null {
  const option =
    policyOptions.find((candidate) => candidate.id === policy.policyId) ??
    policyOptions[0];
  const numbers = [
    policy.ltvDisposal,
    policy.ltvAdditional,
    policy.cap1,
    policy.cap2,
    policy.cap3,
    policy.dsrLimit,
    policy.stressRate,
  ].map(toNumber);
  if (numbers.some((value) => !Number.isFinite(value) || value < 0)) return null;
  const [ltvDisposal, ltvAdditional, cap1, cap2, cap3, dsrLimit, stressRate] =
    numbers;
  return {
    ltvDisposal,
    ltvAdditional,
    priceCaps: [
      { upTo: option.basis.priceCaps[0].upTo, cap: cap1 },
      { upTo: option.basis.priceCaps[1].upTo, cap: cap2 },
      { upTo: null, cap: cap3 },
    ],
    dsrLimit,
    stressRate,
  };
}

export const subscribeNothing = () => () => {};

export function readSaved(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // 저장소를 쓸 수 없어도 화면은 정상 동작해야 한다.
    return null;
  }
}

export function parseSaved(raw: string | null | undefined): Saved {
  const fallback: Saved = {
    form: initialForm,
    policy: policyFormFor(defaultPolicyId),
  };
  if (!raw) return fallback;
  try {
    const saved = JSON.parse(raw) as Partial<Saved>;
    return {
      form: { ...initialForm, ...saved.form },
      policy: { ...fallback.policy, ...saved.policy },
    };
  } catch {
    return fallback;
  }
}
