import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { GET } from "@/app/api/complex/route";

const ok = (body: string) =>
  `<response><header><resultCode>00</resultCode><resultMsg>NORMAL</resultMsg></header><body>${body}</body></response>`;

const listBody = `<items>
<item><kaptCode>A10027875</kaptCode><kaptName>래미안퍼스티지</kaptName><as1>서울특별시</as1><as2>서초구</as2><as3>반포동</as3></item>
<item><kaptCode>A10027000</kaptCode><kaptName>반포자이</kaptName></item>
</items>`;

const request = (query: string) => new Request(`http://localhost/api/complex?${query}`);

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

test("구와 단지명으로 단지 목록을 조회해 이름이 맞는 단지만 돌려준다", async () => {
  const fetchMock = vi.fn(async (url: URL) => {
    void url;
    return new Response(ok(listBody));
  });
  vi.stubGlobal("fetch", fetchMock);

  const response = await GET(request("district=11650&name=퍼스티지"));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const called = new URL(String(fetchMock.mock.calls[0][0]));
  expect(called.pathname).toContain("getSigunguAptList4");
  expect(called.searchParams.get("sigunguCode")).toBe("11650");
  expect(body.complexes).toEqual([
    { code: "A10027875", name: "래미안퍼스티지", address: "서울특별시 서초구 반포동" },
  ]);
  expect(body.fetchedAt).toBe("2026-10-29");
  expect(JSON.stringify(body)).not.toContain("test-key");
});

test("단지코드로 기본정보와 상세정보를 함께 조회해 세대수, 준공연도, 주차 대수를 돌려준다", async () => {
  const fetchMock = vi.fn(async (url: URL) => {
    const path = new URL(String(url)).pathname;
    return new Response(
      path.includes("getAphusBassInfoV5")
        ? ok(`<item><kaptdaCnt>2444</kaptdaCnt><kaptUsedate>20090818</kaptUsedate></item>`)
        : ok(`<item><kaptdPcnt>120</kaptdPcnt><kaptdPcntu>2940</kaptdPcntu></item>`)
    );
  });
  vi.stubGlobal("fetch", fetchMock);

  const response = await GET(request("code=A10027875"));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("kaptCode")).toBe("A10027875");
  expect(body.info).toEqual({
    households: 2444,
    builtYear: 2009,
    parkingGround: 120,
    parkingUnderground: 2940,
  });
  expect(body.fetchedAt).toBe("2026-10-29");
});

test("서울 구 코드가 아니거나 단지명이 비거나 단지코드 형식이 틀리면 400이다", async () => {
  vi.stubGlobal("fetch", vi.fn());

  expect((await GET(request("district=41135&name=a"))).status).toBe(400);
  expect((await GET(request("district=11650&name=%20"))).status).toBe(400);
  expect((await GET(request("code=../etc"))).status).toBe(400);
  expect((await GET(request(""))).status).toBe(400);
});

test("인증키가 없으면 missing-key, 디코딩할 수 없으면 bad-key를 돌려주고 외부 API를 부르지 않는다", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  vi.stubEnv("DATA_GO_KR_API_KEY", "");
  const missing = await GET(request("district=11650&name=퍼스티지"));
  expect(missing.status).toBe(503);
  expect(await missing.json()).toEqual({ error: "missing-key" });

  vi.stubEnv("DATA_GO_KR_API_KEY", "abc%E0%A4%A");
  const bad = await GET(request("district=11650&name=퍼스티지"));
  expect(bad.status).toBe(503);
  expect(await bad.json()).toEqual({ error: "bad-key" });

  expect(fetchMock).not.toHaveBeenCalled();
});

test("외부 API가 실패하면 upstream을 돌려주고 인증키를 새지 않는다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(`<response><header><resultCode>30</resultCode><resultMsg>SERVICE KEY IS NOT REGISTERED ERROR.</resultMsg></header></response>`))
  );

  const response = await GET(request("code=A10027875"));
  const text = await response.text();

  expect(response.status).toBe(502);
  expect(JSON.parse(text).error).toBe("upstream");
  // 포털이 알려 준 오류 코드와 메시지는 원인을 찾을 수 있게 그대로 전달한다.
  expect(JSON.parse(text).detail).toBe("30 SERVICE KEY IS NOT REGISTERED ERROR.");
  expect(text).not.toContain("test-key");
});

test("성공 코드를 찾지 못한 응답은 앞부분을 원인으로 전달하되 인증키가 섞여 있으면 지운다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(`<html><body>unexpected format test-key </body></html>`))
  );

  const response = await GET(request("code=A10027875"));
  const text = await response.text();
  const body = JSON.parse(text);

  expect(response.status).toBe(502);
  expect(body.detail).toContain("HTTP 200");
  expect(body.detail).toContain("unexpected format");
  expect(text).not.toContain("test-key");
});

test("JSON으로 오는 실제 응답 형식으로도 단지 목록을 조회한다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            response: {
              header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
              body: {
                items: [{ kaptCode: "A10019911", kaptName: "디에이치방배", as1: "서울특별시", as2: "서초구", as3: "방배동", as4: null }],
              },
            },
          })
        )
    )
  );

  const response = await GET(request("district=11650&name=방배"));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.complexes).toEqual([
    { code: "A10019911", name: "디에이치방배", address: "서울특별시 서초구 방배동" },
  ]);
});

test("JSON 응답의 오류 코드와 메시지도 원인으로 전달한다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ response: { header: { resultCode: "30", resultMsg: "SERVICE KEY IS NOT REGISTERED ERROR." } } })
        )
    )
  );

  const response = await GET(request("code=A10027875"));

  expect(response.status).toBe(502);
  expect((await response.json()).detail).toBe("30 SERVICE KEY IS NOT REGISTERED ERROR.");
});
