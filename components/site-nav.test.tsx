import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { SiteNav } from "@/components/site-nav";

const pathname = vi.hoisted(() => ({ current: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

afterEach(() => {
  pathname.current = "/";
});

test("로고는 홈으로 가는 링크이고 현재 화면의 메뉴만 활성으로 표시한다", () => {
  render(<SiteNav />);

  expect(screen.getByRole("link", { name: "입성각 홈" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "구매력 계산" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "후보지" })).not.toHaveAttribute("aria-current");
});

test("후보지 화면에서는 후보지 메뉴가 활성이고 구매력 계산은 아니다", () => {
  pathname.current = "/candidates";
  render(<SiteNav />);

  expect(screen.getByRole("link", { name: "후보지" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "구매력 계산" })).not.toHaveAttribute("aria-current");
});
