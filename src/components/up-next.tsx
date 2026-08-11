"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SectionTitle } from "@/components/primitives";
import { DailyRing } from "@/components/daily-ring";
import { cn } from "@/lib/utils";
import { difficultyClass } from "@/lib/format";
import type { NextAction } from "@/lib/recommend";

interface ListOption {
  slug: string;
  name: string;
  description: string | null;
  attribution: string | null;
  count: number;
}

export function UpNext({
  action,
  reviewsToday,
  listOptions,
  hasActiveList,
}: {
  action: NextAction;
  reviewsToday: number;
  listOptions: ListOption[];
  hasActiveList: boolean;
}) {
  const router = useRouter();
  const [picking, setPicking] = useState<string | null>(null);

  async function pickList(slug: string) {
    setPicking(slug);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "active_list", value: slug }),
      });
      if (!res.ok) throw new Error();
      toast.success("List selected — your next problem is ready.");
      router.refresh();
    } catch {
      toast.error("Couldn't save that — try again.");
      setPicking(null);
    }
  }

  // In catch-up the session (and the ring's goal) is the capped list, not the pile.
  const sessionSize = action.due?.length ?? action.dueCount;
  const goal = reviewsToday + sessionSize;
  const catchUp = action.backlog?.active ?? false;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-card to-accent/40 py-5">
      <CardContent className="flex items-center gap-6 px-6">
        <DailyRing done={reviewsToday} goal={goal} />

        {action.type === "review" ? (
          <div className="min-w-0 flex-1">
            <SectionTitle className="text-primary">
              {catchUp ? "Up next · catch-up" : "Up next"}
            </SectionTitle>
            <p className="mt-1 text-lg font-semibold leading-snug">
              {catchUp
                ? `${sessionSize} reviews today — the most rescuable of ${action.dueCount}.`
                : `${action.dueCount} review${action.dueCount === 1 ? "" : "s"} waiting — memory first, new problems after.`}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {catchUp
                ? "Welcome back — your memories are intact. No need to clear the pile today."
                : "Each one is a two-minute approach recall."}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button nativeButton={false} render={<Link href="/review" />}>
                Start reviews
              </Button>
              <Button
                variant="ghost"
                nativeButton={false}
                render={<Link href="/log" />}
              >
                Log a problem
              </Button>
            </div>
          </div>
        ) : action.type === "solve" && action.solve ? (
          <div className="min-w-0 flex-1">
            <SectionTitle className="text-primary">
              Up next · solve
            </SectionTitle>
            <p className="mt-1 truncate text-lg font-semibold leading-snug">
              {action.solve.title}
              <span
                className={cn(
                  "ml-2 align-middle text-xs font-medium",
                  difficultyClass(action.solve.difficulty)
                )}
              >
                {action.solve.difficulty}
              </span>
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/40 text-primary">
                {action.solve.reason}
              </Badge>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {action.solve.position}/{action.solve.total} ·{" "}
                {action.solve.listName}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {action.solve.url ? (
                <Button
                  nativeButton={false}
                  render={
                    <a
                      href={action.solve.url}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                >
                  Open on LeetCode ↗
                </Button>
              ) : null}
              <Button
                variant="ghost"
                nativeButton={false}
                render={<Link href="/log" />}
              >
                Solved it — log it
              </Button>
            </div>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <SectionTitle className="text-primary">
              {hasActiveList ? "All clear" : "Start here"}
            </SectionTitle>
            {hasActiveList ? (
              <>
                <p className="mt-1 text-lg font-semibold leading-snug">
                  List complete and nothing due. Legend.
                </p>
                <div className="mt-3">
                  <Button nativeButton={false} render={<Link href="/log" />}>
                    Log a problem
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-lg font-semibold leading-snug">
                  Pick your list — Recall will hand you one problem at a time.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {listOptions.map((l) => (
                    <button
                      key={l.slug}
                      onClick={() => pickList(l.slug)}
                      disabled={picking !== null}
                      className="rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/50 disabled:opacity-60"
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold">{l.name}</span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {picking === l.slug ? "…" : `${l.count} problems`}
                        </span>
                      </span>
                      {l.description ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {l.description}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {listOptions
                    .map((l) => l.attribution)
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
