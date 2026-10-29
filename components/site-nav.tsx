import Link from "next/link";

const links = [
  { href: "/", label: "구매력 계산" },
  { href: "/candidates", label: "후보지" },
];

export function SiteNav() {
  return (
    <nav
      aria-label="주요 메뉴"
      className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 pt-4 text-sm sm:px-6"
    >
      <Link href="/" className="mr-2 font-heading text-base font-semibold">
        입성각
      </Link>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
