import { describe, expect, test } from "vitest";

import { listingGap, priceBasis } from "@/lib/candidates";
import type { Candidate } from "@/lib/candidates";

const candidate = (overrides: Partial<Candidate>): Candidate => ({
  id: "c1",
  district: "11650",
  complex: "래미안 퍼스티지",
  dong: "반포동",
  area: 84.97,
  market: {
    price: 295000,
    date: "2026-10-01",
    min: 280000,
    max: 295000,
    count: 3,
    fetchedAt: "2026-10-29",
    source: "api",
  },
  listing: "",
  households: "",
  builtYear: "",
  notes: [],
  ...overrides,
});

describe("priceBasis", () => {
  test("호가가 있으면 호가를 기준으로 삼는다", () => {
    expect(priceBasis(candidate({ listing: "310000" }))).toEqual({
      price: 310000,
      basis: "listing",
    });
  });

  test("호가가 비었으면 최근 실거래가로 대신하고 그 사실을 알린다", () => {
    expect(priceBasis(candidate({ listing: "  " }))).toEqual({
      price: 295000,
      basis: "market",
    });
  });

  test("호가도 실거래가도 없으면 null이다", () => {
    expect(priceBasis(candidate({ listing: "", market: null }))).toBeNull();
  });

  test("호가가 숫자가 아니면 호가로 보지 않는다", () => {
    expect(priceBasis(candidate({ listing: "abc" }))?.basis).toBe("market");
  });
});

describe("listingGap", () => {
  test("호가와 최근 실거래가의 차이를 금액과 비율로 돌려준다", () => {
    const gap = listingGap(candidate({ listing: "310000" }));

    expect(gap?.amount).toBe(15000);
    expect(gap?.percent).toBeCloseTo(5.08, 2);
  });

  test("호가가 실거래가보다 낮으면 음수다", () => {
    expect(listingGap(candidate({ listing: "290000" }))?.amount).toBe(-5000);
  });

  test("호가나 실거래가 중 하나라도 없으면 null이다", () => {
    expect(listingGap(candidate({ listing: "" }))).toBeNull();
    expect(listingGap(candidate({ listing: "310000", market: null }))).toBeNull();
  });
});
