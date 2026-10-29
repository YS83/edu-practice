// 공공데이터포털(data.go.kr) API를 서버에서 부르는 공용 도구다. 인증키는 서버 밖으로 나가지 않는다.
import { readPortal } from "./portal";

export type ServiceKey =
  | { ok: true; key: string }
  | { ok: false; error: "missing-key" | "bad-key" };

export function getServiceKey(): ServiceKey {
  const raw = process.env.DATA_GO_KR_API_KEY?.trim();
  if (!raw) return { ok: false, error: "missing-key" };
  // 포털에서 복사한 Encoding 키가 오면 한 번만 풀어서 쓴다.
  if (!raw.includes("%")) return { ok: true, key: raw };
  try {
    return { ok: true, key: decodeURIComponent(raw) };
  } catch {
    return { ok: false, error: "bad-key" };
  }
}

// 포털이 알려 준 오류 코드와 메시지를 담는다. 원인을 찾는 데 쓰고, 인증키는 담지 않는다.
export class PortalError extends Error {}

// 키 오류나 한도 초과도 HTTP 200으로 오기 때문에 본문의 resultCode를 본다. 정상은 00(또는 000)이다.
export async function fetchPortalXml(url: URL): Promise<string> {
  const response = await fetch(url);
  const xml = await response.text();
  // XML이든 JSON이든 결과 코드를 읽는다.
  const { code, message } = readPortal(xml);
  if (!response.ok || !code || !/^\d+$/.test(code) || Number(code) !== 0) {
    // 성공 코드를 찾지 못한 응답은 형식이 달라진 것일 수 있어 앞부분을 원인으로 남긴다.
    const snippet = xml.replace(/\s+/g, " ").trim().slice(0, 200);
    throw new PortalError(
      code
        ? `${code}${message ? ` ${message}` : ""}`
        : `HTTP ${response.status}${snippet ? `: ${snippet}` : ""}`
    );
  }
  return xml;
}

// 오류 응답에 실을 설명. 어떤 경우에도 인증키 값이 섞여 나가지 않게 지운다.
export function upstreamDetail(error: unknown, key: string): string | undefined {
  if (!(error instanceof PortalError)) return undefined;
  return error.message.split(key).join("[KEY]");
}

export function localDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
