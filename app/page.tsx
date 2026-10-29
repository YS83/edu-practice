import { AffordabilityEstimator } from "@/components/affordability/estimator";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pt-8 pb-28 sm:px-6 sm:pt-12 lg:pb-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance">
          서울에서 살 수 있는 가격 계산
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          자산, 소득, 대출 조건을 넣으면 정책 기준을 반영해 살 수 있는 최대 가격과
          월 상환 부담을 보여줍니다.
        </p>
      </header>
      <AffordabilityEstimator />
    </main>
  );
}
