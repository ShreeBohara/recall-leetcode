"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

/**
 * Light/dark switch.
 *
 * Both icons are rendered and CSS picks one, rather than the usual
 * `useState(mounted)` guard: the resolved theme is unknown during SSR, and
 * gating on an effect trips react-hooks/set-state-in-effect under React 19.
 * The `.dark` class next-themes puts on <html> is already the source of
 * truth, so letting the `dark:` variant choose costs no state and cannot
 * produce a hydration mismatch. `resolvedTheme` is only read inside onClick,
 * which never runs before hydration.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      aria-label="Toggle light and dark theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="block size-4 dark:hidden" />
    </button>
  );
}
