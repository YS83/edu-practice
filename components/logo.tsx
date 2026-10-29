import { cn } from "@/lib/utils";

// 지붕 모양의 꺾쇠(각)가 두 겹으로 위를 향한다. 집, 입성(들어감), 각(꺾인 선)을 한 번에 담는다.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M7 17 L16 8 L25 17"
        fill="none"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground"
      />
      <path
        d="M11 24 L16 19 L21 24"
        fill="none"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground"
        opacity="0.75"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="font-heading text-2xl font-extrabold tracking-tight">
          입성각
        </span>
        <span className="mt-1 hidden text-[0.7rem] font-medium tracking-wide text-muted-foreground sm:block">
          서울 입성, 각 재보기
        </span>
      </span>
    </span>
  );
}
