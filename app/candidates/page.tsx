import { CandidateTracker } from "@/components/candidates/tracker";

export const metadata = {
  title: "후보지 | 서울 입성 구매력 계산",
};

export default function CandidatesPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pt-8 pb-12 sm:px-6 sm:pt-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance">
          후보지 등록과 비교
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          관심 단지를 등록하면 국토교통부 실거래가를 가져오고, 호가를 넣어 내 구매력으로 살 수 있는지 비교합니다. 임장기도 단지별로 남길 수 있습니다.
        </p>
      </header>
      <CandidateTracker />
    </main>
  );
}
