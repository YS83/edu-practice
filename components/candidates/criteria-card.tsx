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
  group: "필수" | "선호";
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
          필수 조건(구매력, 세대수 최소)을 모두 지키면 선호 조건 충족 개수로 의견을 정합니다. 3개 이상이면 적극매수, 1~2개면 매수, 0개면 중립입니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((field) => (
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
