import type { PriceEvaluation } from "@/lib/affordability";
import { priceBasis } from "@/lib/candidates";
import type { Candidate } from "@/lib/candidates";
import type { RecommendationFacts } from "@/lib/recommendation";

// 입력 칸은 문자열이라 비었거나 숫자가 아니면 "모르는 값"(null)으로 본다.
function toCount(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// 후보지 정보와 구매력 비교 결과에서 매수 의견 계산에 쓸 사실을 뽑는다.
export function candidateFacts(
  candidate: Candidate,
  evaluation: PriceEvaluation | null
): RecommendationFacts {
  const ground = toCount(candidate.parkingGround);
  const underground = toCount(candidate.parkingUnderground);
  return {
    affordable: evaluation?.status === "ok" ? evaluation.affordable : null,
    price: priceBasis(candidate)?.price ?? null,
    households: toCount(candidate.households),
    builtYear: toCount(candidate.builtYear),
    // 한쪽만 알면 아는 쪽만 더한다. 둘 다 모르면 모르는 값이다.
    parking:
      ground === null && underground === null ? null : (ground ?? 0) + (underground ?? 0),
  };
}
