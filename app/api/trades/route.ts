import {
  fetchPortalXml,
  getServiceKey,
  localDate,
  upstreamDetail,
} from "@/lib/datagokr";
import { isSeoulDistrict } from "@/lib/trades/districts";
import { findComplexTrades, parseTrades, recentMonths } from "@/lib/trades";
import type { Trade } from "@/lib/trades";

const ENDPOINT =
  "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade";
const MONTHS = 6;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
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
  return parseTrades(await fetchPortalXml(url));
}

// 인증키는 서버에서만 읽는다. 응답과 오류 메시지에는 키를 싣지 않는다.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const district = params.get("district") ?? "";
  const name = (params.get("name") ?? "").trim();
  if (!isSeoulDistrict(district) || !name) {
    return json({ error: "bad-request" }, 400);
  }

  const service = getServiceKey();
  if (!service.ok) return json({ error: service.error }, 503);

  const now = new Date();
  try {
    const months = await Promise.all(
      recentMonths(now, MONTHS).map((month) => fetchMonth(service.key, district, month))
    );
    return json({
      trades: findComplexTrades(months.flat(), name),
      fetchedAt: localDate(now),
    });
  } catch (error) {
    return json(
      { error: "upstream", detail: upstreamDetail(error, service.key) },
      502
    );
  }
}
