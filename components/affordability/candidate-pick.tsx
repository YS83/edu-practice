"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { evaluatePrice } from "@/lib/affordability";
import type { AffordabilityInput, PolicyBasis } from "@/lib/affordability";
import { priceBasis } from "@/lib/candidates";
import type { Candidate } from "@/lib/candidates";

import { formatMan } from "./format";

const labelOf = (candidate: Candidate) =>
  `${candidate.complex}${candidate.area ? ` ${candidate.area}㎡` : ""}`;

// 등록한 후보지 하나를 골라, 그 후보지 가격 기준으로 부대비용과 대출을 보여준다.
export function CandidatePick({
  input,
  basis,
  candidates,
}: {
  input: AffordabilityInput;
  basis: PolicyBasis | null;
  candidates: Candidate[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const candidate = candidates.find((item) => item.id === selected);
  const priced = candidate ? priceBasis(candidate) : null;
  const result = priced && basis ? evaluatePrice(input, basis, priced.price) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>후보지로 계산</CardTitle>
        <CardDescription>
          등록한 후보지를 고르면 그 후보지 가격을 기준으로 부대비용과 필요한 대출을 계산합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            등록한 후보지가 없습니다.{" "}
            <Link href="/candidates" className="font-medium text-foreground underline underline-offset-4">
              후보지 등록하러 가기
            </Link>
          </p>
        ) : (
          <Field>
            <FieldLabel htmlFor="candidate-pick">후보지로 계산</FieldLabel>
            <Select
              value={selected}
              items={candidates.map((item) => ({ value: item.id, label: labelOf(item) }))}
              onValueChange={(value) => setSelected(value)}
            >
              <SelectTrigger id="candidate-pick" className="w-full">
                <SelectValue placeholder="후보지를 고르세요" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {labelOf(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {candidate && !priced ? (
          <p className="text-sm text-muted-foreground">
            이 후보지에는 가격 정보가 없습니다. 후보지 화면에서 호가나 실거래가를 넣어 주세요.
          </p>
        ) : null}

        {candidate && priced && result?.status === "invalid" ? (
          <p className="text-sm text-muted-foreground">
            위의 입력을 먼저 확인해 주세요. 값이 비어 있으면 계산할 수 없습니다.
          </p>
        ) : null}

        {candidate && priced && result?.status === "ok" ? (
          <section
            aria-label="후보지 기준 계산"
            className="flex flex-col gap-3 rounded-lg bg-muted p-4 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={result.affordable ? "default" : "destructive"}>
                {result.affordable ? "가능" : "부족"}
              </Badge>
              <span>
                {priced.basis === "listing" ? "호가" : "최근 실거래가"} {formatMan(priced.price)}
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {result.costs.tax > 0 ? <li>취득세 등 {formatMan(result.costs.tax)}</li> : null}
              {result.costs.brokerage > 0 ? (
                <li>중개보수 {formatMan(result.costs.brokerage)}</li>
              ) : null}
              {result.costs.extra > 0 ? <li>기타 비용 {formatMan(result.costs.extra)}</li> : null}
              <li className="font-medium">부대비용 합계 {formatMan(result.costs.total)}</li>
            </ul>
            <p>
              필요한 대출액 {formatMan(result.loan)} · 대출 한도 {formatMan(result.loanLimit)}
              {result.affordable ? "" : ` · 부족액 ${formatMan(result.shortfall)}`}
            </p>
            <p>
              월 상환액 {formatMan(result.monthlyPayment)} · 상환 후 실질 소득{" "}
              {formatMan(result.netMonthlyIncome)}
            </p>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
