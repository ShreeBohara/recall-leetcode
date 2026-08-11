import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { Nav } from "@/components/nav";
import { CommandPalette } from "@/components/command-palette";
import { getAllProblems, getDueProblems } from "@/lib/data";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Recall",
  description:
    "A memory engine for your LeetCode practice — log solves, review on schedule, never forget a pattern.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The login page renders inside this layout too: never run (or leak) the
  // due-count query for unauthenticated visitors, and never crash the shell.
  const password = process.env.APP_PASSWORD;
  const authed =
    !password || (await cookies()).get("recall_auth")?.value === password;
  const dueCount = authed
    ? await getDueProblems()
        .then((d) => d.length)
        .catch(() => 0)
    : 0;
  const paletteProblems = authed
    ? await getAllProblems()
        .then((all) =>
          all.map((p) => ({ id: p.id, number: p.number, title: p.title }))
        )
        .catch(() => [])
    : [];
  return (
    // suppressHydrationWarning: next-themes sets the class on <html> from an
    // inline script before React hydrates, so server and client markup differ
    // by design here (see node_modules/next/dist/docs/01-app/02-guides/
    // preventing-flash-before-hydration.md).
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider>
          <Nav dueCount={dueCount} />
          <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-20 pt-8">
            {children}
          </main>
          <Toaster position="bottom-right" richColors />
          {authed ? (
            <CommandPalette problems={paletteProblems} dueCount={dueCount} />
          ) : null}
        </ThemeProvider>
      </body>
    </html>
  );
}
