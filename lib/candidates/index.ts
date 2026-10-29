// 금액은 만원, 면적은 ㎡ 단위다.

export type Note = { id: string; date: string; text: string };

export type Market = {
  // 가장 최근 실거래가
  price: number;
  // 직접 입력한 값은 거래일을 모른다.
  date: string | null;
  min: number | null;
  max: number | null;
  count: number;
  // 국토교통부 API를 조회한 날짜. 직접 입력이면 null이다.
  fetchedAt: string | null;
  source: "api" | "manual";
};

export type Candidate = {
  id: string;
  district: string;
  complex: string;
  dong: string;
  area: number | null;
  market: Market | null;
  // 사용자가 직접 입력하므로 비어 있을 수 있어 문자열로 둔다.
  listing: string;
  households: string;
  builtYear: string;
  // 지상과 지하 주차 대수. 비어 있으면 모르는 값이다.
  parkingGround: string;
  parkingUnderground: string;
  // 공식 단지 정보(K-apt)에서 가져왔다면 그 출처와 가져온 시점의 값. 직접 고쳤는지 비교하는 데 쓴다.
  info: ComplexSource | null;
  notes: Note[];
};

export type ComplexSource = {
  code: string;
  name: string;
  fetchedAt: string;
  snapshot: {
    households: string;
    builtYear: string;
    parkingGround: string;
    parkingUnderground: string;
  };
};

function toPositive(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// 비교에 쓰는 가격: 호가를 우선하고, 없으면 최근 실거래가로 대신한다.
export function priceBasis(
  candidate: Candidate
): { price: number; basis: "listing" | "market" } | null {
  const listing = toPositive(candidate.listing);
  if (listing !== null) return { price: listing, basis: "listing" };
  if (candidate.market) return { price: candidate.market.price, basis: "market" };
  return null;
}

// 호가가 최근 실거래가보다 얼마나 높은지(낮으면 음수).
export function listingGap(
  candidate: Candidate
): { amount: number; percent: number } | null {
  const listing = toPositive(candidate.listing);
  if (listing === null || !candidate.market) return null;
  const amount = listing - candidate.market.price;
  return { amount, percent: (amount / candidate.market.price) * 100 };
}

export function parseCandidates(raw: string | null | undefined): Candidate[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 예전에 저장된 후보지에는 없는 필드를 기본값으로 채운다.
    return (parsed as Partial<Candidate>[]).map(
      (candidate) =>
        ({
          parkingGround: "",
          parkingUnderground: "",
          info: null,
          ...candidate,
        }) as Candidate
    );
  } catch {
    return [];
  }
}

export const CANDIDATES_KEY = "edu-practice.candidates.v1";
