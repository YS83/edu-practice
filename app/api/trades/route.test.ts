import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { GET } from "@/app/api/trades/route";

const itemXml = (name: string, amount: string, month: string) => `<item>
  <aptNm>${name}</aptNm><umdNm>반포동</umdNm><dealAmount>${amount}</dealAmount>
  <dealYear>2026</dealYear><dealMonth>${month}</dealMonth><dealDay>3</dealDay>
  <excluUseAr>84.97</excluUseAr><floor>12</floor><buildYear>2009</buildYear>
</item>`;

const okXml = (items: string) =>
  `<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items>${items}</items></body></response>`;

const request = (query: string) =>
  new Request(`http://localhost/api/trades?${query}`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-29T12:00:00+09:00"));
  vi.stubEnv("DATA_GO_KR_API_KEY", "test-key");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("구 코드와 단지명으로 최근 6개월 거래를 조회해 단지명이 맞는 거래만 돌려준다", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    const month = new URL(url).searchParams.get("DEAL_YMD");
    return new Response(
      okXml(
        itemXml("래미안 퍼스티지", "285,000", String(Number(month!.slice(4)))) +
          itemXml("아크로리버파크", "400,000", String(Number(month!.slice(4))))
      )
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  const response = await GET(request("district=11650&name=퍼스티지"));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(6);
  const months = fetchMock.mock.calls.map(
    ([url]) => new URL(url).searchParams.get("DEAL_YMD")
  );
  expect(months).toEqual([
    "202610",
    "202609",
    "202608",
    "202607",
    "202606",
    "202605",
  ]);
  const first = new URL(fetchMock.mock.calls[0][0]);
  expect(first.searchParams.get("LAWD_CD")).toBe("11650");
  expect(body.trades).toHaveLength(6);
  expect(body.trades.every((t: { complex: string }) => t.complex === "래미안 퍼스티지")).toBe(true);
  expect(body.fetchedAt).toBe("2026-10-29");
  // 인증키는 응답 본문 어디에도 나가지 않는다.
  expect(JSON.stringify(body)).not.toContain("test-key");
});

test("서울 구 코드가 아니거나 단지명이 비면 400을 돌려준다", async () => {
  vi.stubGlobal("fetch", vi.fn());

  expect((await GET(request("district=41135&name=a"))).status).toBe(400);
  expect((await GET(request("district=11650&name=%20"))).status).toBe(400);
});

test("인증키가 없으면 missing-key를 돌려주고 외부 API를 부르지 않는다", async () => {
  vi.stubEnv("DATA_GO_KR_API_KEY", "");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const response = await GET(request("district=11650&name=퍼스티지"));

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "missing-key" });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("외부 API가 실패하면 upstream 오류를 돌려주고 인증키를 새지 않는다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("<response><header><resultCode>30</resultCode><resultMsg>SERVICE KEY IS NOT REGISTERED ERROR.</resultMsg></header></response>"))
  );

  const response = await GET(request("district=11650&name=퍼스티지"));
  const text = await response.text();

  expect(response.status).toBe(502);
  expect(JSON.parse(text).error).toBe("upstream");
  // 포털이 알려 준 오류 코드와 메시지는 원인을 찾을 수 있게 그대로 전달한다.
  expect(JSON.parse(text).detail).toBe("30 SERVICE KEY IS NOT REGISTERED ERROR.");
  expect(text).not.toContain("test-key");
});

test("인증키를 디코딩할 수 없으면 bad-key를 돌려주고 외부 API를 부르지 않는다", async () => {
  vi.stubEnv("DATA_GO_KR_API_KEY", "abc%E0%A4%A");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const response = await GET(request("district=11650&name=퍼스티지"));

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "bad-key" });
  expect(fetchMock).not.toHaveBeenCalled();
});
