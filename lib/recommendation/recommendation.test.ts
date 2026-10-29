import { describe, expect, test } from "vitest";

import { defaultCriteria, evaluateRecommendation } from "@/lib/recommendation";
import type { RecommendationFacts } from "@/lib/recommendation";

const now = new Date("2026-10-29T00:00:00+09:00");

// 필수와 선호를 모두 충족하는 단지: 9억 5천만원, 800세대, 2020년 준공, 주차 1,000대.
const ideal: RecommendationFacts = {
  affordable: true,
  price: 95000,
  households: 800,
  builtYear: 2020,
  parking: 1000,
};

const statusOf = (
  result: ReturnType<typeof evaluateRecommendation>,
  key: string
) => result.checks.find((check) => check.key === key)?.status;

describe("evaluateRecommendation", () => {
  test("필수를 모두 충족하고 선호를 3개 이상 충족하면 적극매수다", () => {
    const result = evaluateRecommendation(ideal, defaultCriteria, now);

    expect(result.opinion).toBe("적극매수");
    expect(statusOf(result, "affordable")).toBe("met");
    expect(statusOf(result, "minHouseholds")).toBe("met");
    expect(statusOf(result, "priceRange")).toBe("met");
    expect(statusOf(result, "preferHouseholds")).toBe("met");
    expect(statusOf(result, "builtYear")).toBe("met");
    expect(statusOf(result, "parking")).toBe("met");
  });

  test("선호를 1~2개 충족하면 매수다", () => {
    // 가격 범위 밖(12억), 500세대 미만(300), 10년 초과(2005)이지만 주차(세대당 1.0대)만 충족한다.
    const result = evaluateRecommendation(
      { ...ideal, price: 120000, households: 300, builtYear: 2005, parking: 300 },
      defaultCriteria,
      now
    );

    expect(result.opinion).toBe("매수");
    expect(statusOf(result, "priceRange")).toBe("unmet");
    expect(statusOf(result, "preferHouseholds")).toBe("unmet");
    expect(statusOf(result, "builtYear")).toBe("unmet");
    expect(statusOf(result, "parking")).toBe("met");
  });

  test("필수만 충족하고 선호를 하나도 충족하지 못하면 중립이다", () => {
    const result = evaluateRecommendation(
      { ...ideal, price: 120000, households: 300, builtYear: 2005, parking: 100 },
      defaultCriteria,
      now
    );

    expect(result.opinion).toBe("중립");
  });

  test("세대수가 최소 기준 미만이면 선호를 모두 충족해도 중립이고 이유가 남는다", () => {
    const result = evaluateRecommendation({ ...ideal, households: 150, parking: 150 }, defaultCriteria, now);

    expect(result.opinion).toBe("중립");
    expect(statusOf(result, "minHouseholds")).toBe("unmet");
  });

  test("구매력으로 살 수 없으면 다른 조건과 무관하게 중립이다", () => {
    const result = evaluateRecommendation({ ...ideal, affordable: false }, defaultCriteria, now);

    expect(result.opinion).toBe("중립");
    expect(statusOf(result, "affordable")).toBe("unmet");
  });

  test("필수 조건 중 하나라도 미충족이면 다른 필수가 확인 불가여도 중립이다", () => {
    const result = evaluateRecommendation(
      { ...ideal, affordable: false, households: null },
      defaultCriteria,
      now
    );

    expect(result.opinion).toBe("중립");
  });

  test("필수 조건을 확인할 수 없으면 판정을 보류한다", () => {
    const result = evaluateRecommendation({ ...ideal, households: null }, defaultCriteria, now);

    expect(result.opinion).toBe("보류");
    expect(statusOf(result, "minHouseholds")).toBe("unknown");
  });

  test("선호 조건 중 주차 정보만 없으면 확인 불가로 표시하고 나머지로 계산한다", () => {
    const result = evaluateRecommendation({ ...ideal, parking: null }, defaultCriteria, now);

    expect(statusOf(result, "parking")).toBe("unknown");
    // 가격, 500세대, 준공 3개를 충족해 여전히 적극매수다.
    expect(result.opinion).toBe("적극매수");
  });

  test("확인 불가인 선호 조건은 충족으로 치지 않는다", () => {
    // 가격 범위만 충족하고 나머지는 모두 정보가 없다.
    const result = evaluateRecommendation(
      { ...ideal, builtYear: null, parking: null, households: 250 },
      defaultCriteria,
      now
    );

    expect(result.opinion).toBe("매수");
    expect(statusOf(result, "builtYear")).toBe("unknown");
  });

  test("준공 10년 이내는 조회 날짜의 연도에서 10을 뺀 해 이후 준공을 말한다", () => {
    const base = { ...ideal, price: 120000, households: 300, parking: null };

    const within = evaluateRecommendation({ ...base, builtYear: 2016 }, defaultCriteria, now);
    const outside = evaluateRecommendation({ ...base, builtYear: 2015 }, defaultCriteria, now);

    expect(statusOf(within, "builtYear")).toBe("met");
    expect(statusOf(outside, "builtYear")).toBe("unmet");
  });

  test("기준 값을 바꾸면 의견이 그에 맞게 바뀐다", () => {
    const strict = { ...defaultCriteria, minHouseholds: 1000 };

    expect(evaluateRecommendation(ideal, strict, now).opinion).toBe("중립");
    expect(
      evaluateRecommendation(ideal, { ...defaultCriteria, priceMin: 100000, priceMax: 110000 }, now)
        .checks.find((check) => check.key === "priceRange")?.status
    ).toBe("unmet");
  });

  test("가격을 모르면 가격 범위는 확인 불가다", () => {
    const result = evaluateRecommendation({ ...ideal, price: null }, defaultCriteria, now);

    expect(statusOf(result, "priceRange")).toBe("unknown");
  });
});
