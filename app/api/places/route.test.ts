import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { GET } from "@/app/api/places/route";

const request = (query: string) => new Request(`http://localhost/api/places?${query}`);

// 키워드 검색 대역: 단지명에 따라 위치를 돌려주거나 빈 결과를 돌려준다.
function stubKakao(known: Record<string, { lat: string; lng: string }>, status = 200) {
  const fetchMock = vi.fn(async (input: URL | string) => {
    if (status !== 200) {
      return Response.json({ errorType: "AccessDeniedError", message: "invalid key test-key" }, { status });
    }
    const query = new URL(String(input)).searchParams.get("query") ?? "";
    const name = Object.keys(known)
      .sort((a, b) => b.length - a.length)
      .find((candidate) => query.includes(candidate));
    if (!name) return Response.json({ documents: [] });
    return Response.json({
      documents: [
        {
          place_name: `${name}아파트`,
          address_name: `서울 서대문구 홍은동 ${name}`,
          x: known[name].lng,
          y: known[name].lat,
        },
      ],
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("KAKAO_REST_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("단지명마다 카카오 키워드 검색으로 위치를 찾아 입력 순서대로 돌려준다", async () => {
  const fetchMock = stubKakao({
    북한산두산위브: { lat: "37.5877", lng: "126.9367" },
    북한산두산위브2차: { lat: "37.5890", lng: "126.9380" },
  });

  const response = await GET(
    request("district=11410&name=북한산두산위브&name=북한산두산위브2차")
  );
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.places).toEqual([
    {
      query: "북한산두산위브",
      place: { name: "북한산두산위브아파트", address: "서울 서대문구 홍은동 북한산두산위브", lat: 37.5877, lng: 126.9367 },
    },
    {
      query: "북한산두산위브2차",
      place: { name: "북한산두산위브2차아파트", address: "서울 서대문구 홍은동 북한산두산위브2차", lat: 37.589, lng: 126.938 },
    },
  ]);
  const queries = fetchMock.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("query"));
  expect(queries).toEqual(["서대문구 북한산두산위브 아파트", "서대문구 북한산두산위브2차 아파트"]);
  expect(JSON.stringify(body)).not.toContain("test-key");
});

test("위치를 찾지 못한 단지는 place가 null이다", async () => {
  stubKakao({ 북한산두산위브: { lat: "37.5", lng: "127.0" } });

  const body = await (await GET(request("district=11410&name=북한산두산위브&name=없는단지"))).json();

  expect(body.places[0].place).not.toBeNull();
  expect(body.places[1]).toEqual({ query: "없는단지", place: null });
});

test("같은 이름은 한 번만 조회하고, 8개를 넘으면 앞의 8개만 조회한다", async () => {
  const fetchMock = stubKakao({});
  const names = Array.from({ length: 10 }, (_, i) => `name=단지${i}`).join("&");

  const body = await (await GET(request(`district=11410&${names}&name=단지0`))).json();

  expect(fetchMock).toHaveBeenCalledTimes(8);
  expect(body.places).toHaveLength(8);
  expect(body.truncated).toBe(true);
});

test("서울 구 코드가 아니거나 단지명이 하나도 없으면 400이다", async () => {
  const fetchMock = stubKakao({});

  expect((await GET(request("district=41135&name=a"))).status).toBe(400);
  expect((await GET(request("district=11410"))).status).toBe(400);
  expect((await GET(request("district=11410&name=%20"))).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("인증키가 없으면 missing-key를 돌려주고 카카오를 부르지 않는다", async () => {
  vi.stubEnv("KAKAO_REST_API_KEY", "");
  const fetchMock = stubKakao({});

  const response = await GET(request("district=11410&name=북한산두산위브"));

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "missing-key" });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("카카오가 오류를 돌려주면 upstream과 원인을 알리되 인증키는 지운다", async () => {
  stubKakao({}, 401);

  const response = await GET(request("district=11410&name=북한산두산위브"));
  const text = await response.text();

  expect(response.status).toBe(502);
  expect(JSON.parse(text).detail).toContain("invalid key [KEY]");
  expect(text).not.toContain("test-key");
});
