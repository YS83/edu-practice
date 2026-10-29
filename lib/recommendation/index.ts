// 금액은 만원 단위다.

export type Criteria = {
  // 필수: 세대수 최소
  minHouseholds: number;
  // 선호
  priceMin: number;
  priceMax: number;
  preferHouseholds: number;
  builtWithinYears: number;
  // 세대당 주차 대수
  parkingPerHousehold: number;
};

export const defaultCriteria: Criteria = {
  minHouseholds: 200,
  priceMin: 90000,
  priceMax: 100000,
  preferHouseholds: 500,
  builtWithinYears: 10,
  parkingPerHousehold: 1,
};

// 값을 모르면 null이다. 모르는 것은 충족으로 치지 않는다.
export type RecommendationFacts = {
  affordable: boolean | null;
  price: number | null;
  households: number | null;
  builtYear: number | null;
  // 지상과 지하를 합친 주차 대수
  parking: number | null;
};

export type CheckKey =
  | "affordable"
  | "minHouseholds"
  | "priceRange"
  | "preferHouseholds"
  | "builtYear"
  | "parking";

export type CheckStatus = "met" | "unmet" | "unknown";

export type Check = {
  key: CheckKey;
  kind: "required" | "preferred";
  status: CheckStatus;
};

export type Opinion = "적극매수" | "매수" | "중립" | "보류";

export type Recommendation = { opinion: Opinion; checks: Check[] };

function judge(known: boolean, met: () => boolean): CheckStatus {
  if (!known) return "unknown";
  return met() ? "met" : "unmet";
}

// 의견은 시세 전망이 아니라, 사용자가 정한 기준에 얼마나 맞는지에 대한 등급이다.
export function evaluateRecommendation(
  facts: RecommendationFacts,
  criteria: Criteria,
  now: Date
): Recommendation {
  const { affordable, price, households, builtYear, parking } = facts;
  const oldestYear = now.getFullYear() - criteria.builtWithinYears;

  const checks: Check[] = [
    {
      key: "affordable",
      kind: "required",
      status: judge(affordable !== null, () => affordable === true),
    },
    {
      key: "minHouseholds",
      kind: "required",
      status: judge(households !== null, () => households! >= criteria.minHouseholds),
    },
    {
      key: "priceRange",
      kind: "preferred",
      status: judge(
        price !== null,
        () => price! >= criteria.priceMin && price! <= criteria.priceMax
      ),
    },
    {
      key: "preferHouseholds",
      kind: "preferred",
      status: judge(households !== null, () => households! >= criteria.preferHouseholds),
    },
    {
      key: "builtYear",
      kind: "preferred",
      status: judge(builtYear !== null, () => builtYear! >= oldestYear),
    },
    {
      key: "parking",
      kind: "preferred",
      status: judge(
        parking !== null && households !== null && households > 0,
        () => parking! / households! >= criteria.parkingPerHousehold
      ),
    },
  ];

  const required = checks.filter((check) => check.kind === "required");
  if (required.some((check) => check.status === "unmet")) {
    return { opinion: "중립", checks };
  }
  if (required.some((check) => check.status === "unknown")) {
    return { opinion: "보류", checks };
  }

  const met = checks.filter(
    (check) => check.kind === "preferred" && check.status === "met"
  ).length;
  const opinion: Opinion = met >= 3 ? "적극매수" : met >= 1 ? "매수" : "중립";
  return { opinion, checks };
}
