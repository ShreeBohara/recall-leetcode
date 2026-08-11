"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { difficultyClass, formatDate } from "@/lib/format";
import { patternDisplay } from "@/lib/patterns";
import type { Approach, Grade } from "@/lib/types";

export interface ReviewItem {
  id: number;
  number: number | null;
  title: string;
  url: string | null;
  difficulty: string | null;
  patterns: string[];
  keyInsight: string | null;
  optimal: Approach | null;
  tips: string[];
}

type Phase = "recall" | "revealed";

const GRADE_KEYS: { key: string; grade: Grade; label: string; classes: string }[] = [
  { key: "1", grade: "again", label: "Failed", classes: "border-warn/40 text-warn hover:bg-warn/10 data-[pressed=true]:bg-warn/25" },
  { key: "2", grade: "hard", label: "Hard", classes: "data-[pressed=true]:bg-secondary" },
  { key: "3", grade: "good", label: "Good", classes: "data-[pressed=true]:bg-secondary" },
  { key: "4", grade: "easy", label: "Easy", classes: "border-good/40 text-good hover:bg-good/10 data-[pressed=true]:bg-good/25" },
];

export function ReviewPlayer({ items }: { items: ReviewItem[] }) {
  const router = useRouter();
  // Snapshot the queue: the server-derived prop shrinks as grades land, and
  // indexing into a shrinking prop skips cards / ends the session early.
  const [queue] = useState(items);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("recall");
  const [preConfidence, setPreConfidence] = useState<number | null>(null);
  const [postConfidence, setPostConfidence] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(0);
  const [pressed, setPressed] = useState<Grade | null>(null);
  const [newRecords, setNewRecords] = useState<string[]>([]);
  const revealedAt = useRef<number | null>(null);

  const item = queue[index];

  useEffect(() => {
    if (phase !== "recall") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase, index]);

  const reveal = useCallback(() => {
    revealedAt.current = seconds;
    setPhase("revealed");
  }, [seconds]);

  const grade = useCallback(
    async (g: Grade) => {
      if (saving || !item) return;
      setPressed(g);
      setSaving(true);
      try {
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            problemId: item.id,
            tier: "approach_recall",
            grade: g,
            preConfidence,
            postConfidence,
            timeToApproachSec: revealedAt.current ?? seconds,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to save review");
        toast.success(`Logged — next review ${formatDate(data.nextDue)}`);
        if (Array.isArray(data.newRecords) && data.newRecords.length > 0) {
          // One chip per record family; the latest value wins (a session can
          // beat "most reviews in a day" on every single grade).
          setNewRecords((prev) => {
            const merged = new Map(prev.map((r) => [r.split(" — ")[0], r]));
            for (const r of data.newRecords as string[]) {
              merged.set(r.split(" — ")[0], r);
            }
            return [...merged.values()];
          });
        }
        setDone((d) => d + 1);
        setIndex((i) => i + 1);
        setPhase("recall");
        setPreConfidence(null);
        setPostConfidence(null);
        setSeconds(0);
        revealedAt.current = null;
        // Safe now that the queue is snapshotted: keeps the nav badge fresh.
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save review");
      } finally {
        setSaving(false);
        setTimeout(() => setPressed(null), 150);
      }
    },
    [saving, item, preConfidence, postConfidence, seconds, router]
  );

  // Keyboard: Space reveals, 1–4 grade, Esc exits.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      // Browser shortcuts (⌘1 = first tab, etc.) must never log a grade.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        router.push("/");
        router.refresh();
        return;
      }
      if (!item) return;
      if (phase === "recall") {
        if (e.key === " ") {
          e.preventDefault();
          reveal();
        } else if (/^[1-5]$/.test(e.key)) {
          setPreConfidence(Number(e.key));
        }
      } else {
        const hit = GRADE_KEYS.find((g) => g.key === e.key);
        if (hit) grade(hit.grade);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, item, reveal, grade, router]);

  if (!item) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
        <h1 className="text-xl font-semibold">Queue clear ✨</h1>
        <p className="text-sm text-muted-foreground">
          {done} memor{done === 1 ? "y" : "ies"} reinforced. The Today page has
          your next problem when you&apos;re ready.
        </p>
        {newRecords.length > 0 ? (
          <div className="mt-2 flex flex-col items-center gap-1.5">
            {newRecords.map((r) => (
              <span
                key={r}
                className="motion-safe:animate-pulse rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-xs text-primary"
              >
                PR · {r}
              </span>
            ))}
          </div>
        ) : null}
        <Button
          onClick={() => {
            router.push("/");
            router.refresh();
          }}
        >
          Back to Today
        </Button>
      </div>
    );
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
        <span className="tabular-nums">
          review {index + 1} / {queue.length}
        </span>
        <span className="tabular-nums">{mm}:{ss}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${(index / queue.length) * 100}%` }}
        />
      </div>

      <Card
        key={item.id}
        className="animate-in fade-in slide-in-from-right-4 duration-300 motion-reduce:animate-none"
      >
        <CardContent className="flex flex-col gap-6 px-6 py-4">
          <div>
            <div className="flex items-center gap-2 text-xs">
              <span className={difficultyClass(item.difficulty)}>
                {item.difficulty ?? "—"}
              </span>
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  open problem ↗
                </a>
              ) : null}
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {item.number ? `${item.number}. ` : ""}
              {item.title}
            </h1>
          </div>

          {phase === "recall" ? (
            <>
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                Out loud or on paper: <strong className="text-foreground">name the pattern</strong>,{" "}
                <strong className="text-foreground">state the invariant / key idea</strong>, and{" "}
                <strong className="text-foreground">give the optimal complexity</strong>.
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  Confidence before checking{" "}
                  <span className="font-mono text-xs">(optional · keys 1–5)</span>
                </span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() =>
                        setPreConfidence((c) => (c === n ? null : n))
                      }
                      className={cn(
                        "size-8 rounded-md border border-border font-mono text-xs tabular-nums transition-colors",
                        preConfidence === n
                          ? "border-primary bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={reveal} className="self-start">
                Reveal answer
                <kbd className="ml-2 rounded bg-primary-foreground/20 px-1.5 font-mono text-[10px]">
                  space
                </kbd>
              </Button>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-3 text-sm">
                {item.patterns.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {item.patterns.map((p) => (
                      <Badge
                        key={p}
                        variant="secondary"
                        className="font-mono text-[10px]"
                      >
                        {patternDisplay(p)}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {item.optimal ? (
                  <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-primary">
                      optimal
                    </div>
                    <p className="mt-1">{item.optimal.approach}</p>
                    <p className="mt-1.5 font-mono text-xs text-muted-foreground">
                      {item.optimal.time}
                      {item.optimal.space ? ` · ${item.optimal.space}` : ""}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    No stored solution — check your notes on the problem page.
                  </p>
                )}
                {item.keyInsight ? (
                  <p className="italic text-muted-foreground">
                    “{item.keyInsight}”
                  </p>
                ) : null}
                {item.tips.length > 0 ? (
                  <ul className="list-disc pl-5 text-xs text-muted-foreground">
                    {item.tips.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Confidence now (optional):</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() =>
                        setPostConfidence((c) => (c === n ? null : n))
                      }
                      className={cn(
                        "size-6 rounded-md border border-border font-mono text-[11px] transition-colors duration-150",
                        postConfidence === n
                          ? "border-primary bg-primary/15 text-primary"
                          : "hover:bg-secondary"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm text-muted-foreground">
                  How did the recall actually go?{" "}
                  <span className="font-mono text-xs">(keys 1–4)</span>
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {GRADE_KEYS.map((g) => (
                    <Button
                      key={g.grade}
                      variant="outline"
                      disabled={saving}
                      data-pressed={pressed === g.grade}
                      onClick={() => grade(g.grade)}
                      className={cn("transition-colors duration-150", g.classes)}
                    >
                      <kbd className="mr-1.5 rounded bg-secondary px-1 font-mono text-[10px] text-muted-foreground">
                        {g.key}
                      </kbd>
                      {g.label}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Failed = couldn&apos;t state the approach · Hard = got there
                  slowly · Good = solid with friction · Easy = instant and exact
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
