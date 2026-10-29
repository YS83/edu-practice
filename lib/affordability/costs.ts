import type { AffordabilityInput } from "./index";

// 금액은 만원 단위다.
export type AcquisitionCosts = {
  // 취득세와 지방교육세
  tax: number;
  // 중개보수(상한요율 기준)
  brokerage: number;
  // 직접 입력한 기타 비용(이사비 등)
  extra: number;
  total: number;
};

// 가격에 따라 계산식이 바뀌는 지점. 최대 구매 가격을 구간별로 풀 때 쓴다.
export const COST_BREAKPOINTS = [5000, 20000, 60000, 90000, 120000, 150000];

// 취득세율(%). 6억 이하 1%, 6억 초과 9억 이하 (가격(억) × 2/3 − 3)%, 9억 초과 3%.
// 처분하지 않고 추가 매수하면 조정지역 2주택 중과세율 8%를 쓴다.
// 농어촌특별세(전용 85㎡ 초과 0.2%)는 면적을 몰라 넣지 않는다.
function taxRate(price: number, additional: boolean): number {
  if (additional) return 8;
  const eok = price / 10000;
  if (eok <= 6) return 1;
  if (eok <= 9) return (eok * 2) / 3 - 3;
  return 3;
}

// 서울 주택 매매 중개보수 상한요율(%)과 한도(만원). 9억 정확히는 낮은 구간으로 본다.
function brokerageOf(price: number): number {
  if (price < 5000) return Math.min(price * 0.006, 25);
  if (price < 20000) return Math.min(price * 0.005, 80);
  if (price <= 90000) return price * 0.004;
  if (price <= 120000) return price * 0.005;
  if (price <= 150000) return price * 0.006;
  return price * 0.007;
}

export function acquisitionCostsAt(
  input: Pick<AffordabilityInput, "autoCosts" | "acquisitionCosts" | "ownershipStatus">,
  price: number
): AcquisitionCosts {
  const extra = input.acquisitionCosts;
  if (!input.autoCosts) return { tax: 0, brokerage: 0, extra, total: extra };
  const rate = taxRate(price, input.ownershipStatus === "additional");
  // 지방교육세는 취득세율의 10분의 1이고, 중과(8%)는 0.4%다.
  const educationRate = rate === 8 ? 0.4 : rate / 10;
  const tax = (price * (rate + educationRate)) / 100;
  const brokerage = brokerageOf(price);
  return { tax, brokerage, extra, total: tax + brokerage + extra };
}
