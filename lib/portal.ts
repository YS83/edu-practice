// 공공데이터포털 응답을 XML과 JSON 어느 쪽이든 같은 형태로 읽는다.
// API마다, 버전마다 기본 형식이 달라서 한쪽만 가정하지 않는다.

export type PortalRecord = Record<string, string>;

export type PortalResponse = {
  code: string | null;
  message: string | null;
  items: PortalRecord[];
};

const empty: PortalResponse = { code: null, message: null, items: [] };

function xmlTag(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return match ? match[1].trim() : null;
}

function fromXml(text: string): PortalResponse {
  const items = (text.match(/<item>[\s\S]*?<\/item>/g) ?? []).map((item) => {
    const record: PortalRecord = {};
    for (const match of item.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) {
      record[match[1]] = match[2].trim();
    }
    return record;
  });
  return { code: xmlTag(text, "resultCode"), message: xmlTag(text, "resultMsg"), items };
}

function toRecord(value: unknown): PortalRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record: PortalRecord = {};
  for (const [key, field] of Object.entries(value)) {
    record[key] = field === null || field === undefined ? "" : String(field);
  }
  return record;
}

function toRecords(value: unknown): PortalRecord[] {
  const list = Array.isArray(value) ? value : [value];
  return list.map(toRecord).filter((record): record is PortalRecord => record !== null);
}

function fromJson(text: string): PortalResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return empty;
  }
  const root = (parsed as { response?: unknown }).response ?? parsed;
  const { header, body } = (root ?? {}) as {
    header?: { resultCode?: unknown; resultMsg?: unknown };
    body?: { items?: unknown; item?: unknown };
  };
  const rawItems =
    body?.items && typeof body.items === "object" && !Array.isArray(body.items)
      ? (body.items as { item?: unknown }).item
      : body?.items;
  const items = toRecords(rawItems ?? body?.item).filter((record) => Object.keys(record).length > 0);
  return {
    code: header?.resultCode === undefined ? null : String(header.resultCode),
    message: header?.resultMsg === undefined ? null : String(header.resultMsg),
    items: rawItems === undefined && body?.item === undefined ? [] : items,
  };
}

export function readPortal(text: string): PortalResponse {
  return text.trimStart().startsWith("{") ? fromJson(text) : fromXml(text);
}
