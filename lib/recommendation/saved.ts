import { defaultCriteria } from "./index";
import type { Criteria } from "./index";

export const CRITERIA_KEY = "edu-practice.criteria.v1";

// 입력 칸이 문자열이라 기준도 문자열로 저장한다.
export type CriteriaForm = Record<keyof Criteria, string>;

export function criteriaFormFor(criteria: Criteria): CriteriaForm {
  return {
    minHouseholds: String(criteria.minHouseholds),
    priceMin: String(criteria.priceMin),
    priceMax: String(criteria.priceMax),
    preferHouseholds: String(criteria.preferHouseholds),
    builtWithinYears: String(criteria.builtWithinYears),
    parkingPerHousehold: String(criteria.parkingPerHousehold),
  };
}

export const defaultCriteriaForm = criteriaFormFor(defaultCriteria);

// 하나라도 비었거나 숫자가 아니거나 음수이면 null이다. 이때는 의견을 계산하지 않는다.
export function toCriteria(form: CriteriaForm): Criteria | null {
  const numbers = (Object.keys(defaultCriteria) as (keyof Criteria)[]).map(
    (key) => [key, form[key].trim() === "" ? Number.NaN : Number(form[key])] as const
  );
  if (numbers.some(([, value]) => !Number.isFinite(value) || value < 0)) return null;
  const criteria = Object.fromEntries(numbers) as Criteria;
  return criteria.priceMin <= criteria.priceMax ? criteria : null;
}

export function parseCriteriaForm(raw: string | null | undefined): CriteriaForm {
  if (!raw) return defaultCriteriaForm;
  try {
    return { ...defaultCriteriaForm, ...(JSON.parse(raw) as Partial<CriteriaForm>) };
  } catch {
    return defaultCriteriaForm;
  }
}
