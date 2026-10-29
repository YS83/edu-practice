import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { LocationMap } from "@/components/candidates/location-map";
import type { LocationResult } from "@/lib/location";

const location: LocationResult = {
  place: { name: "래미안퍼스티지", address: "서울 서초구 반포동 18-1", lat: 37.5, lng: 127.0 },
  elementary: { name: "서울잠원초등학교", distance: 188, lat: 37.51, lng: 127.01 },
  middle: { name: "신반포중학교", distance: 446, lat: 37.49, lng: 127.02 },
  station: { name: "신반포역 9호선", distance: 295, lat: 37.505, lng: 126.99 },
  academies: { count: 12, capped: false, radius: 800 },
};

// 카카오맵 SDK 대역: 호출을 기록해 핀과 범위 맞춤을 확인한다.
function stubKakao() {
  const markers: { lat: number; lng: number }[] = [];
  const overlays: string[] = [];
  const bounds: { lat: number; lng: number }[] = [];
  const setBounds = vi.fn();
  const mapOptions: unknown[] = [];

  class LatLng {
    constructor(public lat: number, public lng: number) {}
  }
  class Map {
    constructor(_el: HTMLElement, options: unknown) {
      mapOptions.push(options);
    }
    setBounds = setBounds;
  }
  class Marker {
    constructor(options: { position: LatLng }) {
      markers.push({ lat: options.position.lat, lng: options.position.lng });
    }
  }
  class CustomOverlay {
    constructor(options: { content: HTMLElement | string }) {
      overlays.push(typeof options.content === "string" ? options.content : options.content.textContent ?? "");
    }
  }
  class LatLngBounds {
    extend(point: LatLng) {
      bounds.push({ lat: point.lat, lng: point.lng });
    }
  }

  window.kakao = {
    maps: {
      load: (callback: () => void) => callback(),
      LatLng,
      Map,
      Marker,
      CustomOverlay,
      LatLngBounds,
    },
  } as unknown as typeof window.kakao;
  return { markers, overlays, bounds, setBounds, mapOptions };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_KAKAO_JS_KEY", "js-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete window.kakao;
});

test("JavaScript 키가 없으면 지도 대신 설정 안내를 보이고 카카오맵 링크는 그대로 보여준다", () => {
  vi.stubEnv("NEXT_PUBLIC_KAKAO_JS_KEY", "");

  render(<LocationMap location={location} />);

  expect(screen.getByText(/NEXT_PUBLIC_KAKAO_JS_KEY/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /카카오맵에서 크게 보기/ })).toHaveAttribute(
    "href",
    `https://map.kakao.com/link/map/${encodeURIComponent("래미안퍼스티지")},37.5,127`
  );
});

test("단지와 가까운 시설마다 핀과 이름표를 찍고 모두 보이도록 범위를 맞춘다", async () => {
  const kakao = stubKakao();

  render(<LocationMap location={location} />);

  await waitFor(() => expect(kakao.markers).toHaveLength(4));
  expect(kakao.markers[0]).toEqual({ lat: 37.5, lng: 127 });
  expect(kakao.overlays).toEqual([
    "단지 래미안퍼스티지",
    "초 서울잠원초등학교 188m",
    "중 신반포중학교 446m",
    "역 신반포역 9호선 295m",
  ]);
  expect(kakao.bounds).toHaveLength(4);
  expect(kakao.setBounds).toHaveBeenCalledTimes(1);
});

test("반경 안에 없는 시설은 핀을 찍지 않는다", async () => {
  const kakao = stubKakao();

  render(<LocationMap location={{ ...location, station: null, middle: null }} />);

  await waitFor(() => expect(kakao.markers).toHaveLength(2));
  expect(kakao.overlays).toEqual(["단지 래미안퍼스티지", "초 서울잠원초등학교 188m"]);
});

test("시설이 하나도 없으면 단지만 가운데에 두고 범위를 맞추지 않는다", async () => {
  const kakao = stubKakao();

  render(
    <LocationMap location={{ ...location, elementary: null, middle: null, station: null }} />
  );

  await waitFor(() => expect(kakao.markers).toHaveLength(1));
  expect(kakao.setBounds).not.toHaveBeenCalled();
});

test("이름표 글자는 HTML로 해석하지 않는다", async () => {
  const kakao = stubKakao();
  const evil = { ...location, place: { ...location.place, name: "<img src=x onerror=alert(1)>" } };

  render(<LocationMap location={evil} />);

  await waitFor(() => expect(kakao.overlays).toHaveLength(4));
  expect(kakao.overlays[0]).toBe("단지 <img src=x onerror=alert(1)>");
});

test("지도 스크립트를 불러오지 못하면 오류 안내를 보이고 링크는 그대로다", async () => {
  vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
    queueMicrotask(() => (node as HTMLScriptElement).onerror?.(new Event("error")));
    return node;
  });

  render(<LocationMap location={location} />);

  expect(await screen.findByText(/지도를 불러오지 못했습니다/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /카카오맵에서 크게 보기/ })).toBeInTheDocument();
});
