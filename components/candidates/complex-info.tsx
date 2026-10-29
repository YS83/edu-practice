"use client";

import { useState } from "react";
import { AlertCircleIcon, DownloadIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Candidate } from "@/lib/candidates";
import type { Complex } from "@/lib/complexinfo";

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "choose"; complexes: Complex[]; fetchedAt: string }
  | { phase: "error"; message: string };

const errorMessages: Record<string, string> = {
  "missing-key":
    "서버에 공공데이터포털 인증키가 설정되어 있지 않습니다. .env.local에 DATA_GO_KR_API_KEY를 넣고 서버를 다시 시작해 주세요.",
  "bad-key":
    "인증키 형식이 올바르지 않습니다. 공공데이터포털에서 복사한 키를 .env.local에 그대로 다시 넣어 주세요.",
  upstream:
    "국토교통부 단지 정보 조회에 실패했습니다. 이 API는 공공데이터포털에서 따로 활용신청이 필요하고, 승인 직후에는 반영에 시간이 걸릴 수 있습니다. 아래 칸에 직접 입력해도 됩니다.",
  network: "서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
};

// 포털이 알려 준 오류 코드와 메시지가 있으면 원인을 찾을 수 있게 함께 보여준다.
function describe(body: { error?: string; detail?: string }): string {
  const message = errorMessages[body.error ?? ""] ?? errorMessages.upstream;
  return body.detail ? `${message} (포털 응답: ${body.detail})` : message;
}

const fieldNames: Record<keyof NonNullable<Candidate["info"]>["snapshot"], string> = {
  households: "세대수",
  builtYear: "준공연도",
  parkingGround: "지상 주차",
  parkingUnderground: "지하 주차",
};

const text = (value: number | null) => (value === null ? "" : String(value));

export function ComplexInfoPanel({
  candidate,
  onChange,
}: {
  candidate: Candidate;
  onChange: (patch: Partial<Candidate>) => void;
}) {
  const [state, setState] = useState<State>({ phase: "idle" });

  async function search() {
    setState({ phase: "loading" });
    try {
      const response = await fetch(
        `/api/complex?district=${candidate.district}&name=${encodeURIComponent(candidate.complex)}`
      );
      const body = await response.json();
      if (!response.ok) {
        setState({ phase: "error", message: describe(body) });
        return;
      }
      setState({ phase: "choose", complexes: body.complexes, fetchedAt: body.fetchedAt });
    } catch {
      setState({ phase: "error", message: errorMessages.network });
    }
  }

  async function apply(complex: Complex) {
    setState({ phase: "loading" });
    try {
      const response = await fetch(`/api/complex?code=${encodeURIComponent(complex.code)}`);
      const body = await response.json();
      if (!response.ok) {
        setState({ phase: "error", message: describe(body) });
        return;
      }
      const snapshot = {
        households: text(body.info.households),
        builtYear: text(body.info.builtYear),
        parkingGround: text(body.info.parkingGround),
        parkingUnderground: text(body.info.parkingUnderground),
      };
      onChange({
        ...snapshot,
        info: { code: complex.code, name: complex.name, fetchedAt: body.fetchedAt, snapshot },
      });
      setState({ phase: "idle" });
    } catch {
      setState({ phase: "error", message: errorMessages.network });
    }
  }

  const edited = candidate.info
    ? (Object.keys(candidate.info.snapshot) as (keyof typeof fieldNames)[]).filter(
        (key) => candidate[key] !== candidate.info!.snapshot[key]
      )
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={search}
          disabled={state.phase === "loading"}
        >
          <DownloadIcon data-icon="inline-start" />
          {state.phase === "loading" ? "가져오는 중" : "단지 정보 가져오기"}
        </Button>
        {candidate.info ? (
          <span className="text-sm text-muted-foreground">
            국토교통부 K-apt · {candidate.info.name} · {candidate.info.fetchedAt} 조회
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">
            세대수, 준공연도, 주차 대수를 공식 자료로 채웁니다.
          </span>
        )}
        {edited.length > 0 ? (
          <Badge variant="outline">
            직접 수정: {edited.map((key) => fieldNames[key]).join(", ")}
          </Badge>
        ) : null}
      </div>

      {state.phase === "error" ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>단지 정보를 가져오지 못했습니다</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {state.phase === "choose" && state.complexes.length === 0 ? (
        <Alert>
          <AlertCircleIcon />
          <AlertTitle>일치하는 단지가 없습니다</AlertTitle>
          <AlertDescription>
            공동주택 단지 목록에서 이름을 찾지 못했습니다. 아래 칸에 직접 입력해 주세요.
          </AlertDescription>
        </Alert>
      ) : null}

      {state.phase === "choose" && state.complexes.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {state.complexes.map((complex) => (
            <li
              key={complex.code}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{complex.name}</span>
                <span className="text-sm text-muted-foreground">{complex.address}</span>
              </div>
              <Button type="button" size="sm" onClick={() => apply(complex)}>
                이 단지로 채우기
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
