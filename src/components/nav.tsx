"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/log", label: "Log" },
  { href: "/library", label: "Library" },
  { href: "/insights", label: "Insights" },
];

export function Nav({ dueCount = 0 }: { dueCount?: number }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-5">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold tracking-wide text-foreground">
            recall
          </span>
          <span className="size-1.5 translate-y-[-1px] rounded-full bg-primary" />
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname === link.href ||
                  pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {dueCount > 0 ? (
            <Link
              href="/review"
              className="flex items-center gap-2 rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Start review
              <span className="rounded-full bg-primary-foreground/20 px-1.5 font-mono text-xs tabular-nums">
                {dueCount}
              </span>
            </Link>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">
              queue clear
            </span>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
