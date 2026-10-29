import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { GET } from "@/app/api/location/route";

const request = (query: string) => new Request(`http://localhost/api/location?${query}`);

const meta = (isEnd = true, totalCount = 0) => ({ meta: { is_end: isEnd, total_count: totalCount } });
const place = (name: string, distance: number) => ({
  place_name: name,
  distance: String(distance),
  address_name: "서울 서초구 반포동",
});

// 카카오 로컬 API 대역: 경로와 카테고리 코드로 응답을 나눈다.
function stubKakao(overrides: {
  keyword?: unknown;
  stations?: unknown[];
  schools?: unknown[][];
  academies?: { docs: unknown[]; isEnd: boolean }[];
  academyTotal?: number;
  status?: number;
} = {}) {
  const calls: URL[] = [];
  const headers: Record<string, string>[] = [];
  const fetchMock = vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    headers.push(Object.fromEntries(new Headers(init?.headers).entries()));
    if (overrides.status && overrides.status !== 200) {
      return Response.json(
        { errorType: "AccessDeniedError", message: "invalid key test-key" },
        { status: overrides.status }
      );
    }
    if (url.pathname.endsWith("keyword.json")) {
      const keyword = overrides.keyword ?? {
        documents: [
          { place_name: "래미안퍼스티지", address_name: "서울 서초구 반포동 1-1", x: "127.0", y: "37.5" },
        ],
      };
      return Response.json(keyword);
    }
    const code = url.searchParams.get("category_group_code");
    const page = Number(url.searchParams.get("page") ?? "1");
    if (code === "SW8") {
      return Response.json({
        ...meta(),
        documents: overrides.stations ?? [place("고속터미널역 7호선", 410)],
      });
    }
    if (code === "SC4") {
      const pages = overrides.schools ?? [
        [
          place("반포초등학교병설유치원", 120),
          place("반포고등학교", 200),
          place("서울반포초등학교", 350),
          place("반포중학교", 600),
          place("서울반포초등학교", 900),
        ],
      ];
      const total = pages.reduce((sum, docs) => sum + docs.length, 0);
      return Response.json({ ...meta(page >= pages.length, total), documents: pages[page - 1] ?? [] });
    }
    const pages = overrides.academies ?? [
      { docs: Array.from({ length: 12 }, (_, i) => place(`학원${i}`, 100 + i)), isEnd: true },
    ];
    const current = pages[page - 1] ?? { docs: [], isEnd: true };
    const total = overrides.academyTotal ?? pages.reduce((sum, item) => sum + item.docs.length, 0);
    return Response.json({ ...meta(current.isEnd, total), documents: current.docs });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls, headers };
}

beforeEach(() => {
  vi.stubEnv("KAKAO_REST_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("단지 위치를 찾고 가장 가까운 초등학교, 중학교, 지하철역과 학원 수를 돌려준다", async () => {
  const { calls, headers } = stubKakao();

  const response = await GET(request("district=11650&name=래미안퍼스티지"));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.place).toEqual({ name: "래미안퍼스티지", address: "서울 서초구 반포동 1-1" });
  // 유치원과 고등학교는 건너뛰고 이름이 초등학교, 중학교로 끝나는 가장 가까운 곳만 고른다.
  expect(body.elementary).toEqual({ name: "서울반포초등학교", distance: 350 });
  expect(body.middle).toEqual({ name: "반포중학교", distance: 600 });
  expect(body.station).toEqual({ name: "고속터미널역 7호선", distance: 410 });
  expect(body.academies).toEqual({ count: 12, capped: false, radius: 800 });

  // 키워드는 구 이름과 단지명으로 찾고, 인증은 서버에서만 헤더로 한다.
  const keyword = calls.find((url) => url.pathname.endsWith("keyword.json"))!;
  expect(keyword.searchParams.get("query")).toBe("서초구 래미안퍼스티지 아파트");
  expect(headers[0].authorization).toBe("KakaoAK test-key");
  const academy = calls.find((url) => url.searchParams.get("category_group_code") === "AC5")!;
  expect(academy.searchParams.get("radius")).toBe("800");
  expect(academy.searchParams.get("x")).toBe("127.0");
  expect(JSON.stringify(body)).not.toContain("test-key");
});

test("반경 안에 학교나 역이 없으면 null로 돌려주고, 학원은 0개다", async () => {
  stubKakao({
    stations: [],
    schools: [[place("반포고등학교", 200)]],
    academies: [{ docs: [], isEnd: true }],
  });

  const body = await (await GET(request("district=11650&name=래미안퍼스티지"))).json();

  expect(body.elementary).toBeNull();
  expect(body.middle).toBeNull();
  expect(body.station).toBeNull();
  expect(body.academies).toEqual({ count: 0, capped: false, radius: 800 });
});

test("학원이 한 번에 다 오지 않으면 최대 3쪽까지 세고 45개 이상이면 capped로 알린다", async () => {
  const docs = Array.from({ length: 15 }, (_, i) => place(`학원${i}`, 100));
  const { calls } = stubKakao({
    academies: [
      { docs, isEnd: false },
      { docs, isEnd: false },
      { docs, isEnd: false },
    ],
  });

  const body = await (await GET(request("district=11650&name=래미안퍼스티지"))).json();

  expect(body.academies).toEqual({ count: 45, capped: true, radius: 800 });
  const academyCalls = calls.filter((url) => url.searchParams.get("category_group_code") === "AC5");
  expect(academyCalls).toHaveLength(3);
});

test("학교를 찾을 때까지 여러 쪽을 보되 최대 3쪽에서 멈춘다", async () => {
  const { calls } = stubKakao({
    schools: [
      [place("반포고등학교", 100)],
      [place("서울반포초등학교", 700)],
      [place("반포중학교", 790)],
    ],
  });

  const body = await (await GET(request("district=11650&name=래미안퍼스티지"))).json();

  expect(body.elementary?.distance).toBe(700);
  expect(body.middle?.distance).toBe(790);
  expect(calls.filter((url) => url.searchParams.get("category_group_code") === "SC4")).toHaveLength(3);
});

test("단지 위치를 찾지 못하면 not-found를 돌려주고 시설을 조회하지 않는다", async () => {
  const { calls } = stubKakao({ keyword: { documents: [] } });

  const response = await GET(request("district=11650&name=없는단지"));

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "not-found" });
  expect(calls).toHaveLength(1);
});

test("서울 구 코드가 아니거나 단지명이 비면 400이다", async () => {
  const { fetchMock } = stubKakao();

  expect((await GET(request("district=41135&name=a"))).status).toBe(400);
  expect((await GET(request("district=11650&name=%20"))).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("인증키가 없으면 missing-key를 돌려주고 카카오를 부르지 않는다", async () => {
  vi.stubEnv("KAKAO_REST_API_KEY", "");
  const { fetchMock } = stubKakao();

  const response = await GET(request("district=11650&name=래미안퍼스티지"));

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "missing-key" });
  expect(fetchMock).not.toHaveBeenCalled();
});

test("카카오가 오류를 돌려주면 upstream과 원인을 알리되 인증키는 지운다", async () => {
  stubKakao({ status: 401 });

  const response = await GET(request("district=11650&name=래미안퍼스티지"));
  const text = await response.text();
  const body = JSON.parse(text);

  expect(response.status).toBe(502);
  expect(body.error).toBe("upstream");
  expect(body.detail).toContain("HTTP 401");
  expect(body.detail).toContain("invalid key [KEY]");
  expect(text).not.toContain("test-key");
});

test("카카오가 45개까지만 돌려주고 전체 건수가 더 많으면 capped로 알린다", async () => {
  const docs = Array.from({ length: 15 }, (_, i) => place(`학원${i}`, 100));
  stubKakao({
    // 카카오는 마지막 쪽에서 is_end를 true로 주지만 전체 건수는 그보다 많다.
    academies: [
      { docs, isEnd: false },
      { docs, isEnd: false },
      { docs, isEnd: true },
    ],
    academyTotal: 120,
  });

  const body = await (await GET(request("district=11650&name=래미안퍼스티지"))).json();

  expect(body.academies).toEqual({ count: 45, capped: true, radius: 800 });
});

test("정확히 45개이고 전체 건수도 45개이면 capped가 아니다", async () => {
  const docs = Array.from({ length: 15 }, (_, i) => place(`학원${i}`, 100));
  stubKakao({
    academies: [
      { docs, isEnd: false },
      { docs, isEnd: false },
      { docs, isEnd: true },
    ],
    academyTotal: 45,
  });

  const body = await (await GET(request("district=11650&name=래미안퍼스티지"))).json();

  expect(body.academies).toEqual({ count: 45, capped: false, radius: 800 });
});
