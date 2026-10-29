import { isSeoulDistrict } from "@/lib/trades/districts";
import { findComplexTrades, parseTrades, recentMonths } from "@/lib/trades";
import type { Trade } from "@/lib/trades";

const ENDPOINT =
  "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade";
const MONTHS = 6;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function localDate(now: Date) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

async function fetchMonth(
  key: string,
  district: string,
  month: string
): Promise<Trade[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("LAWD_CD", district);
  url.searchParams.set("DEAL_YMD", month);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "1000");
  const response = await fetch(url);
  const xml = await response.text();
  // 정상 응답만 resultCode 00(또는 000)이다. 키 오류나 한도 초과도 200으로 오기 때문에 본문을 본다.
  const code = xml.match(/<resultCode>\s*(\d+)\s*<\/resultCode>/)?.[1];
  if (!response.ok || !code || Number(code) !== 0) {
    throw new Error(`upstream ${code ?? response.status}`);
  }
  return parseTrades(xml);
}

// 인증키는 서버에서만 읽는다. 응답과 오류 메시지에는 키를 싣지 않는다.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const district = params.get("district") ?? "";
  const name = (params.get("name") ?? "").trim();
  if (!isSeoulDistrict(district) || !name) {
    return json({ error: "bad-request" }, 400);
  }

  const raw = process.env.DATA_GO_KR_API_KEY?.trim();
  if (!raw) return json({ error: "missing-key" }, 503);
  // 포털에서 복사한 Encoding 키가 오면 한 번만 풀어서 쓴다.
  const key = raw.includes("%") ? decodeURIComponent(raw) : raw;

  const now = new Date();
  try {
    const months = await Promise.all(
      recentMonths(now, MONTHS).map((month) => fetchMonth(key, district, month))
    );
    return json({
      trades: findComplexTrades(months.flat(), name),
      fetchedAt: localDate(now),
    });
  } catch {
    return json({ error: "upstream" }, 502);
  }
}
