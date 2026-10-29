"use client";

import { useState } from "react";
import { AlertCircleIcon, MapPinIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Candidate } from "@/lib/candidates";
import type { LocationResult, Nearest } from "@/lib/location";

import { LocationMap } from "./location-map";

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; message: string };

const errorMessages: Record<string, string> = {
  "missing-key":
    "서버에 카카오 REST API 키가 설정되어 있지 않습니다. .env.local에 KAKAO_REST_API_KEY를 넣고 서버를 다시 시작해 주세요.",
  "not-found":
    "카카오 지도에서 이 단지의 위치를 찾지 못했습니다. 단지명을 줄이거나 바꿔 다시 등록해 보세요.",
  upstream:
    "카카오 위치 조회에 실패했습니다. 키가 올바른지, 하루 호출 한도를 넘지 않았는지 확인해 주세요.",
  network: "서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
};

function Row({ label, value }: { label: string; value: Nearest | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium">
        {value ? `${value.name} · ${value.distance.toLocaleString("ko-KR")}m` : "근처에 없음"}
      </dd>
    </div>
  );
}

// 위치 조회 결과는 저장하지 않는다. 이 화면을 떠나거나 새로고침하면 사라진다.
export function LocationPanel({
  candidate,
  location,
  onLocation,
}: {
  candidate: Candidate;
  location: LocationResult | undefined;
  onLocation: (location: LocationResult) => void;
}) {
  const [state, setState] = useState<State>({ phase: "idle" });

  async function fetchLocation() {
    setState({ phase: "loading" });
    try {
      const response = await fetch(
        `/api/location?district=${candidate.district}&name=${encodeURIComponent(candidate.complex)}`
      );
      const body = await response.json();
      if (!response.ok) {
        const base = errorMessages[body.error] ?? errorMessages.upstream;
        setState({
          phase: "error",
          message: body.detail ? `${base} (카카오 응답: ${body.detail})` : base,
        });
        return;
      }
      onLocation(body as LocationResult);
      setState({ phase: "idle" });
    } catch {
      setState({ phase: "error", message: errorMessages.network });
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-heading text-base font-semibold">주변 위치</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={fetchLocation}
          disabled={state.phase === "loading"}
        >
          <MapPinIcon data-icon="inline-start" />
          {state.phase === "loading" ? "조회 중" : "위치 정보 가져오기"}
        </Button>
      </div>

      {state.phase === "error" ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>위치 정보를 가져오지 못했습니다</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {location ? (
        <>
          <p className="text-sm text-muted-foreground">
            찾은 장소: {location.place.name}
            {location.place.address ? ` (${location.place.address})` : ""}. 다른 단지라면 단지명을 바꿔 다시 등록해 주세요.
          </p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Row label="가장 가까운 초등학교" value={location.elementary} />
            <Row label="가장 가까운 중학교" value={location.middle} />
            <Row label="가장 가까운 지하철역" value={location.station} />
            <div className="flex flex-col gap-0.5">
              <dt className="text-sm text-muted-foreground">
                반경 {location.academies.radius}m 안 학원
              </dt>
              <dd className="font-medium">
                {location.academies.capped
                  ? `${location.academies.count}개 이상`
                  : `${location.academies.count}개`}
              </dd>
            </div>
          </dl>
          <LocationMap location={location} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          단지 주변의 초등학교, 중학교, 지하철역, 학원을 가져옵니다. 가져오면 매수 의견에 반영됩니다.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        거리는 지도상 직선거리이며 걸어서 가는 경로와 다를 수 있습니다. 조회 결과는 저장하지 않아 새로고침하면 사라집니다. 출처: 카카오 로컬 API.
      </p>
    </div>
  );
}
