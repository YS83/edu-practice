import { findComplexes, parseComplexInfo, parseComplexList } from "@/lib/complexinfo";
import {
  fetchPortalXml,
  getServiceKey,
  localDate,
  upstreamDetail,
} from "@/lib/datagokr";
import { isSeoulDistrict } from "@/lib/trades/districts";

const BASE = "https://apis.data.go.kr/1613000";
const LIST = `${BASE}/AptListService4/getSigunguAptList4`;
const BASIS = `${BASE}/AptBasisInfoServiceV5/getAphusBassInfoV5`;
const DETAIL = `${BASE}/AptBasisInfoServiceV5/getAphusDtlInfoV5`;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function portalUrl(endpoint: string, key: string, params: Record<string, string>) {
  const url = new URL(endpoint);
  url.searchParams.set("serviceKey", key);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  return url;
}

// 구와 단지명으로 단지 목록을, 단지코드로 세대수·준공·주차 정보를 조회한다.
// 인증키는 서버에서만 읽고 응답에 싣지 않는다.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const district = params.get("district");
  const name = (params.get("name") ?? "").trim();
  const code = params.get("code");

  const byList = district !== null && isSeoulDistrict(district) && name !== "";
  const byCode = code !== null && /^[A-Za-z0-9]{6,20}$/.test(code);
  if (!byList && !byCode) return json({ error: "bad-request" }, 400);

  const service = getServiceKey();
  if (!service.ok) return json({ error: service.error }, 503);

  const now = new Date();
  try {
    if (byCode) {
      const [basis, detail] = await Promise.all([
        fetchPortalXml(portalUrl(BASIS, service.key, { kaptCode: code! })),
        fetchPortalXml(portalUrl(DETAIL, service.key, { kaptCode: code! })),
      ]);
      return json({ info: parseComplexInfo(basis, detail), fetchedAt: localDate(now) });
    }
    const list = await fetchPortalXml(
      portalUrl(LIST, service.key, {
        sigunguCode: district!,
        pageNo: "1",
        numOfRows: "1000",
      })
    );
    return json({
      complexes: findComplexes(parseComplexList(list), name),
      fetchedAt: localDate(now),
    });
  } catch (error) {
    return json(
      { error: "upstream", detail: upstreamDetail(error, service.key) },
      502
    );
  }
}
