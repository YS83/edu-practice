import type { KakaoMapsApi } from "./kakao-maps";

export type MapPin = { label: string; lat: number; lng: number };

// 이름표는 글자로만 넣어 HTML로 해석되지 않게 한다.
function labelElement(text: string): HTMLElement {
  const element = document.createElement("div");
  element.className =
    "rounded-md border bg-background px-1.5 py-0.5 text-xs font-medium shadow-sm";
  element.textContent = text;
  return element;
}

// 첫 핀을 가운데에 두고 모든 핀에 마커와 이름표를 찍는다. 핀이 둘 이상이면 모두 보이도록 범위를 맞춘다.
export function drawPins(maps: KakaoMapsApi, element: HTMLElement, pins: MapPin[]) {
  const [first] = pins;
  const map = new maps.Map(element, {
    center: new maps.LatLng(first.lat, first.lng),
    level: 4,
  });
  const bounds = new maps.LatLngBounds();
  for (const pin of pins) {
    const position = new maps.LatLng(pin.lat, pin.lng);
    new maps.Marker({ position, map });
    new maps.CustomOverlay({ position, content: labelElement(pin.label), yAnchor: 2.2, map });
    bounds.extend(position);
  }
  // 이름표가 핀 위에 붙으므로 위쪽 여백을 더 둔다.
  if (pins.length > 1) map.setBounds(bounds, 70, 40, 30, 40);
}
