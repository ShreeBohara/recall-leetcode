"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Mounts next-themes so the `.dark` class on <html> is driven by preference
 * instead of hardcoded in the root layout.
 *
 * `attribute="class"` is what the vendored shadcn components expect: they
 * carry `dark:` utilities, and src/components/ui/chart.tsx hardcodes
 * `{ light: "", dark: ".dark" }`. Do not switch this to a data attribute
 * without regenerating those files.
 *
 * `defaultTheme="dark"` preserves what the app looked like before the toggle
 * existed, so nothing changes for anyone who never touches it.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
