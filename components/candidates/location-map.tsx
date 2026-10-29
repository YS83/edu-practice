"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLinkIcon } from "lucide-react";

import type { LocationResult } from "@/lib/location";

import { drawPins } from "./draw-pins";
import type { MapPin } from "./draw-pins";
import { loadKakaoMaps } from "./kakao-maps";

function pinsOf(location: LocationResult): MapPin[] {
  const { place, elementary, middle, station } = location;
  const pins: MapPin[] = [{ label: `단지 ${place.name}`, lat: place.lat, lng: place.lng }];
  const nearby: [string, typeof elementary][] = [
    ["초", elementary],
    ["중", middle],
    ["역", station],
  ];
  for (const [kind, facility] of nearby) {
    if (facility) {
      pins.push({
        label: `${kind} ${facility.name} ${facility.distance}m`,
        lat: facility.lat,
        lng: facility.lng,
      });
    }
  }
  return pins;
}

// 지도는 위치 정보를 가져온 뒤에만 그리고, 좌표는 저장하지 않는다.
export function LocationMap({ location }: { location: LocationResult }) {
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!key || !container.current) return;
    const element = container.current;
    let cancelled = false;
    setFailed(false);
    loadKakaoMaps(key)
      .then((maps) => {
        if (!cancelled) drawPins(maps, element, pinsOf(location));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      element.innerHTML = "";
    };
  }, [key, location]);

  const { place } = location;
  const link = `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${place.lat},${place.lng}`;

  return (
    <div className="flex flex-col gap-2">
      {!key ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          지도를 표시하려면 카카오 JavaScript 키를 .env.local에 NEXT_PUBLIC_KAKAO_JS_KEY로 넣고 서버를 다시 시작해 주세요.
        </p>
      ) : failed ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-destructive">
          지도를 불러오지 못했습니다. JavaScript 키가 맞는지, 카카오 앱 설정에 이 사이트 주소가 등록되어 있는지 확인해 주세요.
        </p>
      ) : (
        <div
          ref={container}
          role="img"
          aria-label={`${place.name} 주변 지도`}
          className="h-80 w-full overflow-hidden rounded-lg border"
        />
      )}
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm underline underline-offset-4"
      >
        카카오맵에서 크게 보기
        <ExternalLinkIcon className="size-3.5" />
      </a>
    </div>
  );
}
