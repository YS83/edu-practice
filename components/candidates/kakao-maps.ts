// 카카오맵 JavaScript SDK를 브라우저에서 한 번만 불러온다. 필요한 부분만 타입으로 적었다.

type LatLng = object;
type MapInstance = {
  setBounds(
    bounds: BoundsInstance,
    paddingTop?: number,
    paddingRight?: number,
    paddingBottom?: number,
    paddingLeft?: number
  ): void;
};
type BoundsInstance = { extend(point: LatLng): void };

export type KakaoMapsApi = {
  load(callback: () => void): void;
  LatLng: new (lat: number, lng: number) => LatLng;
  Map: new (container: HTMLElement, options: { center: LatLng; level: number }) => MapInstance;
  Marker: new (options: { position: LatLng; map: MapInstance }) => unknown;
  CustomOverlay: new (options: {
    position: LatLng;
    content: HTMLElement;
    yAnchor: number;
    map: MapInstance;
  }) => unknown;
  LatLngBounds: new () => BoundsInstance;
};

declare global {
  interface Window {
    kakao?: { maps: KakaoMapsApi };
  }
}

let loading: Promise<KakaoMapsApi> | null = null;

function whenReady(): Promise<KakaoMapsApi> {
  return new Promise((resolve) => {
    const maps = window.kakao!.maps;
    maps.load(() => resolve(maps));
  });
}

// autoload=false로 받아 두고 load()가 끝난 뒤에 지도 객체를 쓴다.
export function loadKakaoMaps(key: string): Promise<KakaoMapsApi> {
  if (window.kakao?.maps) return whenReady();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.async = true;
    script.onload = () => {
      if (window.kakao?.maps) whenReady().then(resolve);
      else {
        loading = null;
        reject(new Error("kakao maps missing"));
      }
    };
    script.onerror = () => {
      loading = null;
      reject(new Error("kakao maps script failed"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
