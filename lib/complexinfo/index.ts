// 국토교통부 공동주택 단지 정보(K-apt) 응답을 읽는다. XML과 JSON을 모두 받는다.
// 필드 이름은 공개된 사용 사례와 실제 응답을 근거로 한 것이다.
import { readPortal } from "../portal";

export type Complex = { code: string; name: string; address: string };

export type ComplexInfo = {
  households: number | null;
  builtYear: number | null;
  parkingGround: number | null;
  parkingUnderground: number | null;
};

function positiveInt(text: string | undefined): number | null {
  if (!text) return null;
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function parseComplexList(text: string): Complex[] {
  const complexes: Complex[] = [];
  for (const item of readPortal(text).items) {
    const code = item.kaptCode;
    const name = item.kaptName;
    if (!code || !name) continue;
    const address = [item.as1, item.as2, item.as3, item.as4]
      .filter((part): part is string => Boolean(part))
      .join(" ");
    complexes.push({ code, name, address });
  }
  return complexes;
}

const normalize = (name: string) => name.replace(/\s+/g, "").toLowerCase();

export function findComplexes(complexes: Complex[], name: string): Complex[] {
  const query = normalize(name);
  if (!query) return [];
  return complexes.filter((complex) => normalize(complex.name).includes(query));
}

export function parseComplexInfo(basisText: string, detailText: string): ComplexInfo {
  const basis = readPortal(basisText).items[0] ?? {};
  const detail = readPortal(detailText).items[0] ?? {};
  const usedate = basis.kaptUsedate;
  const year = usedate && /^\d{4}/.test(usedate) ? Number(usedate.slice(0, 4)) : null;
  return {
    households: positiveInt(basis.kaptdaCnt),
    builtYear: year,
    parkingGround: positiveInt(detail.kaptdPcnt),
    parkingUnderground: positiveInt(detail.kaptdPcntu),
  };
}
