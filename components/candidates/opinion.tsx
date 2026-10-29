import { formatMan } from "@/components/affordability/format";
import { Badge } from "@/components/ui/badge";
import type {
  CheckKey,
  CheckStatus,
  Criteria,
  Opinion,
  Recommendation,
} from "@/lib/recommendation";

// 학원 수를 세는 반경(m). 서버의 조회 반경과 같다.
export const ACADEMY_RADIUS = 800;

export const DISCLAIMER =
  "투자는 개인 판단에 따른 것이며, 서비스는 투자로 인한 피해에 책임지지 않습니다.";

const opinionVariant: Record<Opinion, "default" | "secondary" | "outline"> = {
  적극매수: "default",
  매수: "secondary",
  중립: "outline",
  보류: "outline",
};

const statusText: Record<CheckStatus, string> = {
  met: "충족",
  unmet: "미충족",
  unknown: "확인 불가",
};

export function OpinionBadge({ opinion }: { opinion: Opinion }) {
  return <Badge variant={opinionVariant[opinion]}>{opinion}</Badge>;
}

function labelOf(key: CheckKey, criteria: Criteria): string {
  switch (key) {
    case "affordable":
      return "내 구매력으로 살 수 있음";
    case "minHouseholds":
      return `세대수 ${criteria.minHouseholds}세대 이상`;
    case "priceRange":
      return `가격 ${formatMan(criteria.priceMin)}~${formatMan(criteria.priceMax)}`;
    case "preferHouseholds":
      return `세대수 ${criteria.preferHouseholds}세대 이상`;
    case "builtYear":
      return `준공 ${criteria.builtWithinYears}년 이내`;
    case "parking":
      return `주차 세대당 ${criteria.parkingPerHousehold}대 이상`;
    case "elementary":
      return `초등학교 ${criteria.elementaryMax}m 이내`;
    case "middle":
      return `중학교 ${criteria.middleMax}m 이내`;
    case "station":
      return `지하철역 ${criteria.stationMax}m 이내`;
    case "academy":
      return `학원 ${criteria.academyMin}개 이상 (반경 ${ACADEMY_RADIUS}m)`;
  }
}

export function OpinionPanel({
  recommendation,
  criteria,
}: {
  recommendation: Recommendation;
  criteria: Criteria;
}) {
  const { opinion, checks } = recommendation;
  const locationUnknown = checks.some(
    (check) =>
      ["elementary", "middle", "station", "academy"].includes(check.key) &&
      check.status === "unknown"
  );
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-base font-semibold">매수 의견</h3>
        <OpinionBadge opinion={opinion} />
        {opinion === "보류" ? (
          <span className="text-sm text-muted-foreground">
            확인 불가 항목이 있어 판정을 보류합니다.
          </span>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {checks.map((check) => (
          <li key={check.key} className="flex flex-wrap justify-between gap-2">
            <span>
              <span className="text-muted-foreground">
                {check.kind === "required" ? "필수" : "선호"}
              </span>{" "}
              {labelOf(check.key, criteria)}
            </span>
            <span
              className={
                check.status === "met"
                  ? "font-medium"
                  : check.status === "unmet"
                    ? "font-medium text-destructive"
                    : "text-muted-foreground"
              }
            >
              {statusText[check.status]}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        이 의견은 시세 전망이 아니라 내가 정한 기준에 얼마나 맞는지를 나타냅니다.
        {locationUnknown
          ? " 학교, 지하철역, 학원 같은 위치 기준은 위치 정보를 가져오면 반영됩니다."
          : ""}
      </p>
      <p className="text-xs text-muted-foreground">{DISCLAIMER}</p>
    </div>
  );
}
