// 금액은 만원, 면적은 ㎡ 단위다.

export type Trade = {
  complex: string;
  dong: string;
  area: number;
  price: number;
  // YYYY-MM-DD
  date: string;
  floor: number;
  buildYear: number | null;
};

function tag(item: string, name: string): string | null {
  const match = item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return match ? match[1].trim() : null;
}

// 국토교통부 아파트 매매 실거래가 응답(XML)에서 유효한 거래만 읽는다.
export function parseTrades(xml: string): Trade[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const trades: Trade[] = [];
  for (const item of items) {
    // 해제(취소)된 거래는 시세로 보지 않는다.
    if (tag(item, "cdealType") === "O") continue;
    const complex = tag(item, "aptNm");
    const price = Number((tag(item, "dealAmount") ?? "").replace(/,/g, ""));
    const area = Number(tag(item, "excluUseAr") ?? tag(item, "exclUseAr"));
    const year = tag(item, "dealYear");
    const month = tag(item, "dealMonth");
    const day = tag(item, "dealDay");
    if (!complex || !year || !month || !day) continue;
    if (!Number.isFinite(price) || !Number.isFinite(area)) continue;
    const buildYear = Number(tag(item, "buildYear"));
    trades.push({
      complex,
      dong: tag(item, "umdNm") ?? "",
      area,
      price,
      date: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
      floor: Number(tag(item, "floor")),
      buildYear: Number.isFinite(buildYear) && buildYear > 0 ? buildYear : null,
    });
  }
  return trades;
}

const normalize = (name: string) => name.replace(/\s+/g, "").toLowerCase();

// 단지명 표기가 입력과 조금 달라도 찾을 수 있도록 포함 여부로 고른다.
export function findComplexTrades(trades: Trade[], name: string): Trade[] {
  const query = normalize(name);
  if (!query) return [];
  return trades.filter((trade) => normalize(trade.complex).includes(query));
}

export type TradeSummary = {
  latest: { price: number; date: string };
  min: number;
  max: number;
  count: number;
};

export function summarizeTrades(
  trades: Trade[],
  complex: string,
  area: number
): TradeSummary | null {
  const matched = trades.filter(
    (trade) => trade.complex === complex && trade.area === area
  );
  if (matched.length === 0) return null;
  const latest = matched.reduce((newest, next) =>
    next.date > newest.date ? next : newest
  );
  const prices = matched.map((trade) => trade.price);
  return {
    latest: { price: latest.price, date: latest.date },
    min: Math.min(...prices),
    max: Math.max(...prices),
    count: matched.length,
  };
}

// 조회 날짜가 속한 달부터 거슬러 올라간 YYYYMM 목록.
export function recentMonths(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return `${month.getFullYear()}${String(month.getMonth() + 1).padStart(2, "0")}`;
  });
}
