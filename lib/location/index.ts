// 카카오 로컬 API로 단지 주변의 학교, 지하철역, 학원을 실시간으로 조회한다.
// 결과는 저장하지 않는다(카카오가 저장을 허용하지 않는다는 안내에 따른다).

const BASE = "https://dapi.kakao.com/v2/local/search";
// 가까운 학교와 역을 찾는 최대 반경(m), 학원 수를 세는 반경(m)
const SEARCH_RADIUS = 2000;
export const ACADEMY_RADIUS = 800;
const PAGE_SIZE = 15;
const MAX_PAGES = 3;

export class KakaoError extends Error {}

// lat, lng는 지도에 핀을 찍는 데만 쓰고 저장하지 않는다.
export type Nearest = { name: string; distance: number; lat: number; lng: number };

export type LocationResult = {
  place: { name: string; address: string; lat: number; lng: number };
  elementary: Nearest | null;
  middle: Nearest | null;
  station: Nearest | null;
  academies: { count: number; capped: boolean; radius: number };
};

type Doc = {
  place_name?: string;
  address_name?: string;
  distance?: string;
  x?: string;
  y?: string;
};
type Page = { documents?: Doc[]; meta?: { is_end?: boolean; total_count?: number } };

async function kakaoGet(
  path: string,
  params: Record<string, string>,
  key: string
): Promise<Page> {
  const url = new URL(`${BASE}/${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!response.ok) {
    let message = "";
    try {
      message = ((await response.json()) as { message?: string }).message ?? "";
    } catch {
      // 본문을 읽지 못해도 상태 코드는 알린다.
    }
    throw new KakaoError(`HTTP ${response.status}${message ? `: ${message}` : ""}`);
  }
  return (await response.json()) as Page;
}

function categoryParams(
  code: string,
  place: { x: string; y: string },
  radius: number,
  page: number
) {
  return {
    category_group_code: code,
    x: place.x,
    y: place.y,
    radius: String(radius),
    sort: "distance",
    size: String(PAGE_SIZE),
    page: String(page),
  };
}

const toNearest = (doc: Doc): Nearest => ({
  name: doc.place_name ?? "",
  distance: Number(doc.distance),
  // 카카오는 x가 경도, y가 위도다.
  lat: Number(doc.y),
  lng: Number(doc.x),
});

// 이름이 초등학교, 중학교로 끝나는 가장 가까운 학교를 최대 3쪽까지 찾는다.
async function nearestSchools(place: { x: string; y: string }, key: string) {
  let elementary: Nearest | null = null;
  let middle: Nearest | null = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await kakaoGet("category.json", categoryParams("SC4", place, SEARCH_RADIUS, page), key);
    for (const doc of result.documents ?? []) {
      const name = doc.place_name ?? "";
      if (!elementary && name.endsWith("초등학교")) elementary = toNearest(doc);
      if (!middle && name.endsWith("중학교")) middle = toNearest(doc);
    }
    if ((elementary && middle) || result.meta?.is_end !== false) break;
  }
  return { elementary, middle };
}

async function nearestStation(place: { x: string; y: string }, key: string) {
  const result = await kakaoGet(
    "category.json",
    { ...categoryParams("SW8", place, SEARCH_RADIUS, 1), size: "1" },
    key
  );
  const doc = result.documents?.[0];
  return doc ? toNearest(doc) : null;
}

async function countAcademies(place: { x: string; y: string }, key: string) {
  let count = 0;
  let capped = false;
  let total = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await kakaoGet("category.json", categoryParams("AC5", place, ACADEMY_RADIUS, page), key);
    count += result.documents?.length ?? 0;
    total = result.meta?.total_count ?? 0;
    if (result.meta?.is_end !== false) break;
    if (page === MAX_PAGES) capped = true;
  }
  // 카카오는 결과를 45개까지만 주고 마지막 쪽의 is_end를 true로 보낸다. 전체 건수가 더 많으면 잘린 것이다.
  return { count, capped: capped || total > count, radius: ACADEMY_RADIUS };
}

// 단지를 찾지 못하면 null이다.
export async function lookupLocation(
  key: string,
  districtName: string,
  complexName: string
): Promise<LocationResult | null> {
  const found = await kakaoGet(
    "keyword.json",
    { query: `${districtName} ${complexName} 아파트`, size: "1" },
    key
  );
  const doc = found.documents?.[0];
  if (!doc?.x || !doc.y) return null;
  const place = { x: doc.x, y: doc.y };

  const [schools, station, academies] = await Promise.all([
    nearestSchools(place, key),
    nearestStation(place, key),
    countAcademies(place, key),
  ]);
  return {
    place: {
      name: doc.place_name ?? complexName,
      address: doc.address_name ?? "",
      lat: Number(doc.y),
      lng: Number(doc.x),
    },
    ...schools,
    station,
    academies,
  };
}
