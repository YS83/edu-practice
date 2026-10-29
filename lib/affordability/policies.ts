import type { PolicyBasis } from "./index";

export type PolicySource = { label: string; url: string };

export type PolicyOption = {
  id: string;
  label: string;
  // 금융당국 자료를 마지막으로 확인한 날짜다.
  checkedAt: string;
  basis: PolicyBasis;
  sources: PolicySource[];
  // 공식 자료로 확인하지 못했거나 사용자가 알아야 하는 단서다.
  notes: string[];
};

export const policyOptions: PolicyOption[] = [
  {
    id: "seoul-regulated-bank",
    label: "서울 규제지역 · 은행권 주택구입 주담대",
    checkedAt: "2026-10-29",
    basis: {
      ltvDisposal: 40,
      ltvAdditional: 0,
      priceCaps: [
        { upTo: 150000, cap: 60000 },
        { upTo: 250000, cap: 40000 },
        { upTo: null, cap: 20000 },
      ],
      dsrLimit: 40,
      stressRate: 3,
    },
    sources: [
      {
        label:
          "금융위원회 2025.10.15 주택시장 안정화 대책 (LTV 40%, 시가별 한도 6억/4억/2억, 스트레스 금리 하한 3.0%)",
        url: "https://fsc.go.kr/no010101/85432",
      },
      {
        label:
          "금융위원회 2025.6.27 가계부채 관리 강화 방안 (처분하지 않고 추가 주택 구입 시 LTV 0%)",
        url: "https://www.fsc.go.kr/no010101/84824",
      },
      {
        label: "금융위원회 2026.4.1 '26년도 가계부채 관리방안",
        url: "https://www.fsc.go.kr/no010101/86606",
      },
    ],
    notes: [
      "DSR 40%는 은행권 규제 비율로 알려진 값이지만, 위 보도자료 원문에서는 확인하지 못했습니다. 대출 상담 때 은행에 확인하세요.",
      "스트레스 금리 3.0%는 수도권·규제지역 주담대의 하한입니다. 실제 적용 값은 은행이 정합니다.",
      "정책은 자주 바뀝니다. 기준일 이후 변경분은 반영되어 있지 않으니, 값을 직접 고쳐서 쓸 수 있습니다.",
    ],
  },
];

export const defaultPolicyId = policyOptions[0].id;
