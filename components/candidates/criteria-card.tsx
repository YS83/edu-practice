import { RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { defaultCriteriaForm } from "@/lib/recommendation/saved";
import type { CriteriaForm } from "@/lib/recommendation/saved";

const fields: {
  key: keyof CriteriaForm;
  label: string;
  unit: string;
  group: "필수" | "선호" | "등급";
  description?: string;
}[] = [
  { key: "minHouseholds", label: "세대수 최소", unit: "세대", group: "필수" },
  { key: "priceMin", label: "선호 가격 최소", unit: "만원", group: "선호" },
  { key: "priceMax", label: "선호 가격 최대", unit: "만원", group: "선호" },
  { key: "preferHouseholds", label: "선호 세대수", unit: "세대", group: "선호" },
  { key: "builtWithinYears", label: "준공 연수", unit: "년 이내", group: "선호" },
  {
    key: "parkingPerHousehold",
    label: "세대당 주차 대수",
    unit: "대 이상",
    group: "선호",
    description: "지상과 지하를 합친 값 기준입니다.",
  },
  {
    key: "elementaryMax",
    label: "초등학교까지",
    unit: "m 이내",
    group: "선호",
    description: "지도상 직선거리 기준입니다. 도보 10분은 약 800m입니다.",
  },
  { key: "middleMax", label: "중학교까지", unit: "m 이내", group: "선호" },
  { key: "stationMax", label: "지하철역까지", unit: "m 이내", group: "선호" },
  {
    key: "academyMin",
    label: "주변 학원 수",
    unit: "개 이상",
    group: "선호",
    description: "반경 800m 안의 학원입니다.",
  },
];

const gradeFields: typeof fields = [
  {
    key: "strongMin",
    label: "적극매수 기준",
    unit: "개 이상 충족",
    group: "등급",
    description: "충족한 선호 조건이 이 개수 이상이면 적극매수입니다.",
  },
  {
    key: "buyMin",
    label: "매수 기준",
    unit: "개 이상 충족",
    group: "등급",
    description: "이 개수 이상이면 매수, 그보다 적으면 중립입니다.",
  },
];

export function CriteriaCard({
  form,
  valid,
  onChange,
  onReset,
}: {
  form: CriteriaForm;
  valid: boolean;
  onChange: (key: keyof CriteriaForm, value: string) => void;
  onReset: () => void;
}) {
  const edited = (Object.keys(defaultCriteriaForm) as (keyof CriteriaForm)[]).some(
    (key) => form[key] !== defaultCriteriaForm[key]
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>매수 의견 기준</CardTitle>
        <CardDescription>
          필수 조건(구매력, 세대수 최소)을 모두 지키면 충족한 선호 조건의 개수로 의견을 정합니다. 기본은 3개 이상이면 적극매수, 1~2개면 매수, 0개면 중립이고, 선호 조건이 8개이므로 아래에서 개수 기준을 고칠 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...fields, ...gradeFields].map((field) => (
              <Field key={field.key}>
                <FieldLabel htmlFor={`criteria-${field.key}`}>
                  {field.group} · {field.label}{" "}
                  <span className="font-normal text-muted-foreground">({field.unit})</span>
                </FieldLabel>
                <Input
                  id={`criteria-${field.key}`}
                  inputMode="decimal"
                  value={form[field.key]}
                  onChange={(event) => onChange(field.key, event.target.value)}
                />
                {field.description ? (
                  <FieldDescription>{field.description}</FieldDescription>
                ) : null}
              </Field>
            ))}
          </div>
          {!valid ? (
            <p className="text-sm text-destructive">
              비었거나 숫자가 아니거나 음수인 값이 있거나, 선호 가격의 최소가 최대보다 큽니다. 고칠 때까지 의견을 계산하지 않습니다.
            </p>
          ) : null}
          {edited ? (
            <div>
              <Button type="button" variant="outline" onClick={onReset}>
                <RotateCcwIcon data-icon="inline-start" />
                기본 기준으로 되돌리기
              </Button>
            </div>
          ) : null}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
