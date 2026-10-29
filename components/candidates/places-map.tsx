"use client";

import { useEffect, useRef, useState } from "react";

import type { FoundPlace } from "@/lib/location";

import { drawPins } from "./draw-pins";
import { loadKakaoMaps } from "./kakao-maps";

export type FoundPlaceEntry = { query: string; place: FoundPlace | null };

// 검색 결과에 나온 단지들의 위치를 한 지도에 보여준다. 등록하기 전에 맞는 단지인지 확인하는 용도이고, 좌표는 저장하지 않는다.
export function PlacesMap({
  places,
  truncated,
}: {
  places: FoundPlaceEntry[];
  truncated: boolean;
}) {
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  const found = places.filter((entry) => entry.place !== null);
  const missing = places.filter((entry) => entry.place === null).map((entry) => entry.query);

  useEffect(() => {
    if (!key || !container.current || found.length === 0) return;
    const element = container.current;
    let cancelled = false;
    setFailed(false);
    loadKakaoMaps(key)
      .then((maps) => {
        if (cancelled) return;
        drawPins(
          maps,
          element,
          found.map((entry) => ({
            label: entry.query,
            lat: entry.place!.lat,
            lng: entry.place!.lng,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      element.innerHTML = "";
    };
    // found는 places에서 매번 새로 만들어지므로 places가 바뀔 때만 다시 그린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, places]);

  return (
    <div className="flex flex-col gap-2">
      {found.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          지도에 표시할 단지 위치를 찾지 못했습니다. 아래 목록으로 등록할 수 있습니다.
        </p>
      ) : !key ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          지도를 표시하려면 카카오 JavaScript 키를 .env.local에 NEXT_PUBLIC_KAKAO_JS_KEY로 넣고 서버를 다시 시작해 주세요.
        </p>
      ) : failed ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-destructive">
          지도를 불러오지 못했습니다. 아래 목록으로 등록할 수 있습니다.
        </p>
      ) : (
        <div
          ref={container}
          role="img"
          aria-label="검색한 단지 위치 지도"
          className="h-72 w-full overflow-hidden rounded-lg border"
        />
      )}
      {missing.length > 0 && found.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          위치를 찾지 못한 단지: {missing.join(", ")}
        </p>
      ) : null}
      {truncated ? (
        <p className="text-xs text-muted-foreground">
          단지가 많아 앞의 8곳만 지도에 표시했습니다.
        </p>
      ) : null}
    </div>
  );
}
