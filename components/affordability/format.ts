// 금액은 만원 단위 숫자를 "3억 3,333만 원" 형태로 보여준다.
export function formatMan(value: number): string {
  const sign = value < 0 ? "-" : "";
  const rounded = Math.round(Math.abs(value));
  const eok = Math.floor(rounded / 10000);
  const man = rounded % 10000;
  if (eok === 0) return `${sign}${man.toLocaleString("ko-KR")}만 원`;
  if (man === 0) return `${sign}${eok.toLocaleString("ko-KR")}억 원`;
  return `${sign}${eok.toLocaleString("ko-KR")}억 ${man.toLocaleString("ko-KR")}만 원`;
}
