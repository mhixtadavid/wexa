import Link from "next/link";

import { SearchBox } from "./search-box";

const NAV = [
  { href: "/", label: "Applications" },
  { href: "/compare", label: "Compare" },
  { href: "/about", label: "How it works" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-md bg-accent text-[13px] font-bold text-accent-fg"
          >
            ◎
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-text">Blast Radius</span>
        </Link>

        <nav className="order-3 flex items-center gap-4 sm:order-none">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[13px] text-text-muted transition-colors hover:text-text"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto w-full sm:w-auto sm:min-w-72 sm:flex-1 sm:max-w-md">
          <SearchBox />
        </div>
      </div>
    </header>
  );
}
