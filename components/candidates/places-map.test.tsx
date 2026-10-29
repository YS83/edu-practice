import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { PlacesMap } from "@/components/candidates/places-map";

// 카카오맵 SDK 대역: 핀 위치와 이름표, 범위 맞춤 호출을 기록한다.
function stubKakao() {
  const markers: { lat: number; lng: number }[] = [];
  const overlays: string[] = [];
  const setBounds = vi.fn();

  class LatLng {
    constructor(public lat: number, public lng: number) {}
  }
  class Map {
    setBounds = setBounds;
  }
  class Marker {
    constructor(options: { position: LatLng }) {
      markers.push({ lat: options.position.lat, lng: options.position.lng });
    }
  }
  class CustomOverlay {
    constructor(options: { content: HTMLElement }) {
      overlays.push(options.content.textContent ?? "");
    }
  }
  class LatLngBounds {
    extend() {}
  }
  window.kakao = {
    maps: { load: (cb: () => void) => cb(), LatLng, Map, Marker, CustomOverlay, LatLngBounds },
  } as unknown as typeof window.kakao;
  return { markers, overlays, setBounds };
}

const found = (query: string, lat: number, lng: number) => ({
  query,
  place: { name: `${query}아파트`, address: "서울 서대문구 홍은동", lat, lng },
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_KAKAO_JS_KEY", "js-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.kakao;
});

test("찾은 단지마다 핀과 단지명 이름표를 찍고 모두 보이도록 범위를 맞춘다", async () => {
  const kakao = stubKakao();

  render(
    <PlacesMap
      places={[found("북한산두산위브", 37.5877, 126.9367), found("북한산두산위브2차", 37.589, 126.938)]}
      truncated={false}
    />
  );

  await waitFor(() => expect(kakao.markers).toHaveLength(2));
  expect(kakao.overlays).toEqual(["북한산두산위브", "북한산두산위브2차"]);
  expect(kakao.setBounds).toHaveBeenCalledTimes(1);
});

test("단지가 하나면 범위를 맞추지 않고 그 단지만 찍는다", async () => {
  const kakao = stubKakao();

  render(<PlacesMap places={[found("북한산두산위브", 37.5877, 126.9367)]} truncated={false} />);

  await waitFor(() => expect(kakao.markers).toHaveLength(1));
  expect(kakao.setBounds).not.toHaveBeenCalled();
});

test("위치를 찾지 못한 단지는 핀 없이 이름을 알려 준다", async () => {
  const kakao = stubKakao();

  render(
    <PlacesMap
      places={[found("북한산두산위브", 37.5877, 126.9367), { query: "없는단지", place: null }]}
      truncated={false}
    />
  );

  await waitFor(() => expect(kakao.markers).toHaveLength(1));
  expect(screen.getByText(/위치를 찾지 못한 단지: 없는단지/)).toBeInTheDocument();
});

test("모든 단지의 위치를 찾지 못하면 지도 없이 안내만 보인다", () => {
  const kakao = stubKakao();

  render(<PlacesMap places={[{ query: "없는단지", place: null }]} truncated={false} />);

  expect(screen.getByText(/지도에 표시할 단지 위치를 찾지 못했습니다/)).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: /단지 위치 지도/ })).not.toBeInTheDocument();
  expect(kakao.markers).toHaveLength(0);
});

test("결과가 너무 많아 일부만 표시했다면 그 사실을 알린다", async () => {
  stubKakao();

  render(<PlacesMap places={[found("가", 37.5, 127.0)]} truncated />);

  expect(await screen.findByText(/단지가 많아 앞의 8곳만 지도에 표시했습니다/)).toBeInTheDocument();
});

test("JavaScript 키가 없으면 설정 안내를 보이고 목록 사용을 막지 않는다", () => {
  vi.stubEnv("NEXT_PUBLIC_KAKAO_JS_KEY", "");

  render(<PlacesMap places={[found("북한산두산위브", 37.5877, 126.9367)]} truncated={false} />);

  expect(screen.getByText(/NEXT_PUBLIC_KAKAO_JS_KEY/)).toBeInTheDocument();
});
