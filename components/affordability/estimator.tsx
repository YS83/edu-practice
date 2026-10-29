"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AlertCircleIcon, ExternalLinkIcon, RotateCcwIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calculateAffordability } from "@/lib/affordability";
import type {
  AffordabilityInput,
  BindingConstraint,
  NumericField,
  PolicyBasis,
} from "@/lib/affordability";
import {
  defaultPolicyId,
  policyOptions,
} from "@/lib/affordability/policies";

import { formatMan } from "./format";

const STORAGE_KEY = "edu-practice.affordability.v1";

type FormState = {
  cash: string;
  saleProceeds: string;
  ownershipStatus: "disposal" | "additional";
  annualIncome: string;
  monthlyTakeHome: string;
  existingAnnualDebtService: string;
  existingMonthlyDebtService: string;
  acquisitionCosts: string;
  rate: string;
  termYears: string;
  repayment: "annuity" | "principal";
};

type PolicyForm = {
  policyId: string;
  ltvDisposal: string;
  ltvAdditional: string;
  cap1: string;
  cap2: string;
  cap3: string;
  dsrLimit: string;
  stressRate: string;
};

type Saved = { form: FormState; policy: PolicyForm };

const initialForm: FormState = {
  cash: "",
  saleProceeds: "0",
  ownershipStatus: "disposal",
  annualIncome: "",
  monthlyTakeHome: "",
  existingAnnualDebtService: "0",
  existingMonthlyDebtService: "0",
  acquisitionCosts: "0",
  rate: "4",
  termYears: "30",
  repayment: "annuity",
};

function policyFormFor(policyId: string): PolicyForm {
  const option =
    policyOptions.find((candidate) => candidate.id === policyId) ??
    policyOptions[0];
  const { basis } = option;
  return {
    policyId: option.id,
    ltvDisposal: String(basis.ltvDisposal),
    ltvAdditional: String(basis.ltvAdditional),
    cap1: String(basis.priceCaps[0].cap),
    cap2: String(basis.priceCaps[1].cap),
    cap3: String(basis.priceCaps[2].cap),
    dsrLimit: String(basis.dsrLimit),
    stressRate: String(basis.stressRate),
  };
}

// 빈 칸은 숫자 0이 아니라 "입력되지 않음"이므로 NaN으로 바꾼다.
function toNumber(text: string): number {
  return text.trim() === "" ? Number.NaN : Number(text);
}

function toInput(form: FormState): AffordabilityInput {
  return {
    cash: toNumber(form.cash),
    saleProceeds: toNumber(form.saleProceeds),
    ownershipStatus: form.ownershipStatus,
    annualIncome: toNumber(form.annualIncome),
    monthlyTakeHome: toNumber(form.monthlyTakeHome),
    existingAnnualDebtService: toNumber(form.existingAnnualDebtService),
    existingMonthlyDebtService: toNumber(form.existingMonthlyDebtService),
    acquisitionCosts: toNumber(form.acquisitionCosts),
    rate: toNumber(form.rate),
    termYears: toNumber(form.termYears),
    repayment: form.repayment,
  };
}

function toBasis(policy: PolicyForm): PolicyBasis | null {
  const option =
    policyOptions.find((candidate) => candidate.id === policy.policyId) ??
    policyOptions[0];
  const numbers = [
    policy.ltvDisposal,
    policy.ltvAdditional,
    policy.cap1,
    policy.cap2,
    policy.cap3,
    policy.dsrLimit,
    policy.stressRate,
  ].map(toNumber);
  if (numbers.some((value) => !Number.isFinite(value) || value < 0)) return null;
  const [ltvDisposal, ltvAdditional, cap1, cap2, cap3, dsrLimit, stressRate] =
    numbers;
  return {
    ltvDisposal,
    ltvAdditional,
    priceCaps: [
      { upTo: option.basis.priceCaps[0].upTo, cap: cap1 },
      { upTo: option.basis.priceCaps[1].upTo, cap: cap2 },
      { upTo: null, cap: cap3 },
    ],
    dsrLimit,
    stressRate,
  };
}

const fieldLabels: Record<NumericField, string> = {
  cash: "현금 자산",
  saleProceeds: "주택 매도 확보 현금",
  annualIncome: "연 소득(세전)",
  monthlyTakeHome: "월 실수령 소득",
  existingAnnualDebtService: "기존 대출 연 원리금 상환액",
  existingMonthlyDebtService: "기존 대출 월 상환액",
  acquisitionCosts: "부대비용",
  rate: "대출 금리",
  termYears: "상환 기간",
};

const bindingLabels: Record<BindingConstraint, string> = {
  ltv: "LTV(담보인정비율)",
  cap: "주택 시가별 대출 한도",
  dsr: "DSR(총부채원리금상환비율)",
};

function MoneyField({
  id,
  label,
  description,
  value,
  unit = "만원",
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  value: string;
  unit?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>
        {label} <span className="font-normal text-muted-foreground">({unit})</span>
      </FieldLabel>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={
          emphasis
            ? "font-heading text-3xl font-semibold tracking-tight"
            : "text-lg font-medium"
        }
      >
        {value}
      </dd>
    </div>
  );
}

const subscribeNothing = () => () => {};

function readSaved(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // 저장소를 쓸 수 없어도 화면은 정상 동작해야 한다.
    return null;
  }
}

function parseSaved(raw: string | null | undefined): Saved {
  const fallback: Saved = {
    form: initialForm,
    policy: policyFormFor(defaultPolicyId),
  };
  if (!raw) return fallback;
  try {
    const saved = JSON.parse(raw) as Partial<Saved>;
    return {
      form: { ...initialForm, ...saved.form },
      policy: { ...fallback.policy, ...saved.policy },
    };
  } catch {
    return fallback;
  }
}

// 서버에서는 저장값이 없으므로(undefined) 기본 화면으로 그리고,
// 브라우저에서 저장값을 읽는 순간 한 번만 그 값으로 다시 시작한다.
export function AffordabilityEstimator() {
  const raw = useSyncExternalStore(subscribeNothing, readSaved, () => undefined);
  return (
    <EstimatorForm
      key={raw === undefined ? "server" : "browser"}
      initial={parseSaved(raw)}
      // 서버용 첫 렌더는 기본값이므로, 저장된 값을 덮어쓰지 않게 저장하지 않는다.
      persist={raw !== undefined}
    />
  );
}

function EstimatorForm({
  initial,
  persist,
}: {
  initial: Saved;
  persist: boolean;
}) {
  const [form, setForm] = useState<FormState>(initial.form);
  const [policy, setPolicy] = useState<PolicyForm>(initial.policy);

  useEffect(() => {
    if (!persist) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ form, policy } satisfies Saved)
      );
    } catch {
      // 위와 같다.
    }
  }, [form, policy, persist]);

  const option =
    policyOptions.find((candidate) => candidate.id === policy.policyId) ??
    policyOptions[0];
  const defaults = policyFormFor(option.id);
  const edited = (Object.keys(defaults) as (keyof PolicyForm)[]).some(
    (key) => defaults[key] !== policy[key]
  );

  const basis = useMemo(() => toBasis(policy), [policy]);
  const result = useMemo(
    () => (basis ? calculateAffordability(toInput(form), basis) : null),
    [form, basis]
  );

  const setField = (key: keyof FormState) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const setPolicyField = (key: keyof PolicyForm) => (value: string) =>
    setPolicy((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>보유 자산</CardTitle>
            <CardDescription>
              지금 바로 쓸 수 있는 돈과, 현재 주택을 팔아 손에 남는 돈입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <MoneyField
                id="cash"
                label="현금 자산"
                description="예금, 적금 등"
                value={form.cash}
                onChange={setField("cash")}
              />
              <MoneyField
                id="saleProceeds"
                label="주택 매도 확보 현금"
                description="현재 주택을 팔고 기존 대출을 갚은 뒤 남는 순액입니다. 팔지 않으면 0."
                value={form.saleProceeds}
                onChange={setField("saleProceeds")}
              />
              <MoneyField
                id="acquisitionCosts"
                label="부대비용"
                description="취득세, 중개 수수료, 이사비 등의 합계를 직접 넣어 주세요."
                value={form.acquisitionCosts}
                onChange={setField("acquisitionCosts")}
              />
              <FieldSet>
                <FieldLegend variant="label">보유 주택 상태</FieldLegend>
                <RadioGroup
                  value={form.ownershipStatus}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      ownershipStatus: value as FormState["ownershipStatus"],
                    }))
                  }
                >
                  <Label className="flex items-center gap-2 font-normal">
                    <RadioGroupItem value="disposal" />
                    현재 주택을 팔고 이사 (처분조건부)
                  </Label>
                  <Label className="flex items-center gap-2 font-normal">
                    <RadioGroupItem value="additional" />
                    처분하지 않고 추가 매수
                  </Label>
                </RadioGroup>
              </FieldSet>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>소득과 기존 대출</CardTitle>
            <CardDescription>
              DSR 한도와 상환 후 남는 소득을 계산하는 데 쓰입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <MoneyField
                id="annualIncome"
                label="연 소득(세전)"
                value={form.annualIncome}
                onChange={setField("annualIncome")}
              />
              <MoneyField
                id="monthlyTakeHome"
                label="월 실수령 소득"
                value={form.monthlyTakeHome}
                onChange={setField("monthlyTakeHome")}
              />
              <MoneyField
                id="existingAnnualDebtService"
                label="기존 대출 연 원리금 상환액"
                description="DSR 계산에 반영합니다. 없으면 0."
                value={form.existingAnnualDebtService}
                onChange={setField("existingAnnualDebtService")}
              />
              <MoneyField
                id="existingMonthlyDebtService"
                label="기존 대출 월 상환액"
                description="상환 후 실질 소득 계산에 반영합니다. 없으면 0."
                value={form.existingMonthlyDebtService}
                onChange={setField("existingMonthlyDebtService")}
              />
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>신규 대출 조건</CardTitle>
            <CardDescription>
              월 상환액은 여기에 넣은 실제 금리로 계산합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <MoneyField
                id="rate"
                label="대출 금리"
                unit="연 %"
                value={form.rate}
                onChange={setField("rate")}
              />
              <MoneyField
                id="termYears"
                label="상환 기간"
                unit="년"
                value={form.termYears}
                onChange={setField("termYears")}
              />
              <FieldSet>
                <FieldLegend variant="label">상환 방식</FieldLegend>
                <RadioGroup
                  value={form.repayment}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      repayment: value as FormState["repayment"],
                    }))
                  }
                >
                  <Label className="flex items-center gap-2 font-normal">
                    <RadioGroupItem value="annuity" />
                    원리금균등
                  </Label>
                  <Label className="flex items-center gap-2 font-normal">
                    <RadioGroupItem value="principal" />
                    원금균등
                  </Label>
                </RadioGroup>
              </FieldSet>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>정책 기준</CardTitle>
            <CardDescription>
              기준을 고르면 값이 채워지고, 채워진 값은 직접 고칠 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="policy">정책 기준 목록</FieldLabel>
                <Select
                  value={policy.policyId}
                  items={policyOptions.map((candidate) => ({
                    value: candidate.id,
                    label: candidate.label,
                  }))}
                  onValueChange={(value) => {
                    if (value) setPolicy(policyFormFor(value));
                  }}
                >
                  <SelectTrigger id="policy" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {policyOptions.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {option.checkedAt} 기준으로 확인한 값입니다.
                  {edited ? " 지금은 직접 고친 값을 쓰고 있습니다." : ""}
                </FieldDescription>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <MoneyField
                  id="ltvDisposal"
                  label="LTV (처분조건부)"
                  unit="%"
                  value={policy.ltvDisposal}
                  onChange={setPolicyField("ltvDisposal")}
                />
                <MoneyField
                  id="ltvAdditional"
                  label="LTV (추가 매수)"
                  unit="%"
                  value={policy.ltvAdditional}
                  onChange={setPolicyField("ltvAdditional")}
                />
                <MoneyField
                  id="cap1"
                  label="한도 캡: 15억 이하"
                  value={policy.cap1}
                  onChange={setPolicyField("cap1")}
                />
                <MoneyField
                  id="cap2"
                  label="한도 캡: 15억 초과 25억 이하"
                  value={policy.cap2}
                  onChange={setPolicyField("cap2")}
                />
                <MoneyField
                  id="cap3"
                  label="한도 캡: 25억 초과"
                  value={policy.cap3}
                  onChange={setPolicyField("cap3")}
                />
                <MoneyField
                  id="dsrLimit"
                  label="DSR 한도"
                  unit="%"
                  value={policy.dsrLimit}
                  onChange={setPolicyField("dsrLimit")}
                />
                <MoneyField
                  id="stressRate"
                  label="스트레스 금리 가산"
                  unit="%p"
                  description="DSR 한도 계산에만 더합니다."
                  value={policy.stressRate}
                  onChange={setPolicyField("stressRate")}
                />
              </div>

              {edited ? (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPolicy(policyFormFor(option.id))}
                  >
                    <RotateCcwIcon data-icon="inline-start" />
                    기준 값으로 되돌리기
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">출처</p>
                <ul className="flex flex-col gap-1">
                  {option.sources.map((source) => (
                    <li key={source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-start gap-1 underline underline-offset-4"
                      >
                        <span>{source.label}</span>
                        <ExternalLinkIcon className="mt-0.5 size-3.5 shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
                <ul className="flex list-disc flex-col gap-1 pl-5">
                  {option.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-6" aria-live="polite">
        <CardHeader>
          <CardTitle>계산 결과</CardTitle>
          <CardDescription>
            입력을 바꾸면 바로 다시 계산합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {result === null ? (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>정책 기준 값을 확인해 주세요</AlertTitle>
              <AlertDescription>
                비어 있거나 숫자가 아니거나 음수인 값이 있습니다.
              </AlertDescription>
            </Alert>
          ) : result.status === "invalid" ? (
            <Alert>
              <AlertCircleIcon />
              <AlertTitle>입력을 확인해 주세요</AlertTitle>
              <AlertDescription>
                {result.fields.map((field) => fieldLabels[field]).join(", ")}
                {" "}
                항목을 0 이상의 숫자로 채워 주세요. 상환 기간은 0보다 커야 합니다.
              </AlertDescription>
            </Alert>
          ) : result.status === "unaffordable" ? (
            <Alert>
              <AlertCircleIcon />
              <AlertTitle>살 수 있는 가격이 없습니다</AlertTitle>
              <AlertDescription>
                현금 자산과 주택 매도 확보 현금의 합이 부대비용보다 적습니다.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <dl className="flex flex-col gap-6">
                <Stat
                  emphasis
                  label="살 수 있는 최대 가격"
                  value={formatMan(result.maxPrice)}
                />
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
                  <Stat label="대출 한도" value={formatMan(result.loanLimit)} />
                  <Stat label="필요한 대출액" value={formatMan(result.loan)} />
                  <Stat
                    label={
                      form.repayment === "principal"
                        ? "월 상환액 (첫 달, 원금균등)"
                        : "월 상환액"
                    }
                    value={formatMan(result.monthlyPayment)}
                  />
                  <Stat
                    label="상환 후 실질 소득 (월)"
                    value={formatMan(result.netMonthlyIncome)}
                  />
                </div>
              </dl>
              <p className="text-sm text-muted-foreground">
                대출 한도를 정한 규제:{" "}
                <span className="font-medium text-foreground">
                  {bindingLabels[result.binding]}
                </span>
                {result.binding === "ltv" &&
                form.ownershipStatus === "additional" &&
                result.loanLimit === 0
                  ? ". 처분하지 않고 추가 매수하면 정책 기준의 추가 매수 LTV가 적용되어 대출이 나오지 않습니다."
                  : "."}
              </p>
            </>
          )}
          <p className="border-t pt-4 text-sm text-muted-foreground">
            실제 대출 승인액은 은행 심사에 따라 달라질 수 있습니다.
          </p>
        </CardContent>
      </Card>

      {/* 좁은 화면에서는 결과 카드가 맨 아래라서, 입력하는 동안 핵심 숫자를 고정해 보여준다. */}
      {result?.status === "ok" ? (
        <div
          aria-hidden="true"
          className="fixed inset-x-0 bottom-0 z-10 flex items-end justify-between gap-4 border-t bg-background px-4 pt-3 lg:hidden"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">살 수 있는 최대 가격</span>
            <span className="font-heading text-lg font-semibold">
              {formatMan(result.maxPrice)}
            </span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-xs text-muted-foreground">월 상환액</span>
            <span className="text-lg font-medium">
              {formatMan(result.monthlyPayment)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
