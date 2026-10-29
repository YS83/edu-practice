import { findPlace, KakaoError } from "@/lib/location";
import { isSeoulDistrict, seoulDistricts } from "@/lib/trades/districts";

// 한 번에 찾는 단지 수의 상한. 카카오 호출 수를 정한다.
const MAX_NAMES = 8;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

// 검색 결과에 나온 단지들의 위치를 찾는다. 인증키는 서버에서만 읽고 결과는 저장하지 않는다.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const district = params.get("district") ?? "";
  const names = [
    ...new Set(params.getAll("name").map((name) => name.trim()).filter(Boolean)),
  ];
  if (!isSeoulDistrict(district) || names.length === 0) {
    return json({ error: "bad-request" }, 400);
  }

  const key = process.env.KAKAO_REST_API_KEY?.trim();
  if (!key) return json({ error: "missing-key" }, 503);

  const districtName = seoulDistricts.find((item) => item.code === district)!.name;
  const targets = names.slice(0, MAX_NAMES);
  try {
    const places = await Promise.all(
      targets.map(async (query) => ({
        query,
        place: await findPlace(key, districtName, query),
      }))
    );
    return json({ places, truncated: names.length > MAX_NAMES });
  } catch (error) {
    const detail =
      error instanceof KakaoError ? error.message.split(key).join("[KEY]") : undefined;
    return json({ error: "upstream", detail }, 502);
  }
}
