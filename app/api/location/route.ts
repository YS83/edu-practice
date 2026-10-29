import { KakaoError, lookupLocation } from "@/lib/location";
import { isSeoulDistrict, seoulDistricts } from "@/lib/trades/districts";

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

// 구와 단지명으로 주변 학교, 지하철역, 학원 수를 조회한다.
// 인증키는 서버에서만 읽고, 조회 결과는 어디에도 저장하지 않는다.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const district = params.get("district") ?? "";
  const name = (params.get("name") ?? "").trim();
  if (!isSeoulDistrict(district) || !name) return json({ error: "bad-request" }, 400);

  const key = process.env.KAKAO_REST_API_KEY?.trim();
  if (!key) return json({ error: "missing-key" }, 503);

  const districtName = seoulDistricts.find((item) => item.code === district)!.name;
  try {
    const result = await lookupLocation(key, districtName, name);
    if (!result) return json({ error: "not-found" }, 404);
    return json(result);
  } catch (error) {
    const detail =
      error instanceof KakaoError ? error.message.split(key).join("[KEY]") : undefined;
    return json({ error: "upstream", detail }, 502);
  }
}
