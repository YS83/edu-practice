import { describe, expect, test } from "vitest";

import {
  areaGroup,
  findComplexTrades,
  parseTrades,
  recentMonths,
  summarizeTrades,
} from "@/lib/trades";
import type { Trade } from "@/lib/trades";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<response><header><resultCode>000</resultCode></header><body><items>
<item>
  <aptNm>래미안 퍼스티지</aptNm><umdNm>반포동</umdNm>
  <dealAmount>   285,000</dealAmount>
  <dealYear>2026</dealYear><dealMonth>9</dealMonth><dealDay>3</dealDay>
  <excluUseAr>84.97</excluUseAr><floor>12</floor><buildYear>2009</buildYear>
</item>
<item>
  <aptNm>래미안 퍼스티지</aptNm><umdNm>반포동</umdNm>
  <dealAmount>290,000</dealAmount>
  <dealYear>2026</dealYear><dealMonth>10</dealMonth><dealDay>15</dealDay>
  <excluUseAr>84.97</excluUseAr><floor>20</floor><buildYear>2009</buildYear>
  <cdealType>O</cdealType>
</item>
</items></body></response>`;

const trade = (overrides: Partial<Trade>): Trade => ({
  complex: "래미안 퍼스티지",
  dong: "반포동",
  area: 84.97,
  price: 285000,
  date: "2026-09-03",
  floor: 12,
  buildYear: 2009,
  ...overrides,
});

describe("findComplexTrades", () => {
  test("단지명에 입력이 포함된 거래만 남기고 띄어쓰기와 대소문자는 무시한다", () => {
    const trades = [
      trade({}),
      trade({ complex: "아크로리버파크", dong: "반포동" }),
      trade({ complex: "반포자이 2차" }),
    ];

    expect(findComplexTrades(trades, "퍼스티지").map((t) => t.complex)).toEqual([
      "래미안 퍼스티지",
    ]);
    expect(
      findComplexTrades(trades, "래미안퍼스티지").map((t) => t.complex)
    ).toEqual(["래미안 퍼스티지"]);
    expect(findComplexTrades(trades, "자이2차")).toHaveLength(1);
    expect(findComplexTrades(trades, "없는단지")).toEqual([]);
    expect(findComplexTrades(trades, "   ")).toEqual([]);
  });
});

describe("summarizeTrades", () => {
  test("같은 단지와 면적의 가장 최근 거래가, 최저~최고, 거래 건수를 요약한다", () => {
    const trades = [
      trade({ price: 280000, date: "2026-07-10" }),
      trade({ price: 295000, date: "2026-10-01" }),
      trade({ price: 285000, date: "2026-09-03" }),
      trade({ price: 150000, area: 59.9, date: "2026-10-20" }),
      trade({ complex: "다른 단지", price: 999999, date: "2026-10-25" }),
    ];

    expect(summarizeTrades(trades, "래미안 퍼스티지", 84.97)).toEqual({
      latest: { price: 295000, date: "2026-10-01" },
      min: 280000,
      max: 295000,
      count: 3,
    });
  });

  test("전용면적이 소수점 아래만 다른 거래는 같은 면적으로 묶어 요약한다", () => {
    const trades = [
      trade({ area: 84.93, price: 280000, date: "2026-07-10" }),
      trade({ area: 84.97, price: 295000, date: "2026-10-01" }),
      trade({ area: 85.01, price: 285000, date: "2026-09-03" }),
      trade({ area: 59.9, price: 200000, date: "2026-10-20" }),
    ];

    const summary = summarizeTrades(trades, "래미안 퍼스티지", 84.93);

    expect(summary?.count).toBe(3);
    expect(summary?.latest).toEqual({ price: 295000, date: "2026-10-01" });
    expect(areaGroup(84.93)).toBe(areaGroup(85.01));
    expect(areaGroup(59.9)).toBe(60);
  });

  test("거래가 없으면 null을 돌려준다", () => {
    expect(summarizeTrades([], "래미안 퍼스티지", 84.97)).toBeNull();
  });
});

describe("recentMonths", () => {
  test("조회 날짜가 속한 달부터 거슬러 올라가며 YYYYMM 목록을 만든다", () => {
    expect(recentMonths(new Date("2026-10-29T00:00:00+09:00"), 6)).toEqual([
      "202610",
      "202609",
      "202608",
      "202607",
      "202606",
      "202605",
    ]);
    expect(recentMonths(new Date("2026-02-10T00:00:00+09:00"), 3)).toEqual([
      "202602",
      "202601",
      "202512",
    ]);
  });
});

describe("parseTrades", () => {
  test("취소된 거래는 빼고 단지, 면적, 금액(만원), 날짜, 건축년도를 읽는다", () => {
    expect(parseTrades(xml)).toEqual([
      {
        complex: "래미안 퍼스티지",
        dong: "반포동",
        area: 84.97,
        price: 285000,
        date: "2026-09-03",
        floor: 12,
        buildYear: 2009,
      },
    ]);
  });
});
