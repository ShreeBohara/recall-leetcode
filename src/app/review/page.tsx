import Link from "next/link";
import { getDueProblems } from "@/lib/data";
import { getBacklogState, orderForSession } from "@/lib/backlog";
import { recommendNext } from "@/lib/recommend";
import { safeJsonParse, type Approach } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ReviewPlayer, type ReviewItem } from "@/components/review-player";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>;
}) {
  const { start } = await searchParams;
  const allDue = await getDueProblems();
  // Catch-up sessions are capped and ordered most-rescuable-first.
  const backlog = await getBacklogState(allDue);
  const due = orderForSession(allDue, backlog);

  if (due.length === 0) {
    // Never a dead end: hand the user their next solve instead.
    const solve = await recommendNext();
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
        <h1 className="text-xl font-semibold">Queue clear</h1>
        {solve ? (
          <>
            <p className="text-sm text-muted-foreground">
              Nothing to review — practice instead: <strong>{solve.title}</strong>{" "}
              ({solve.difficulty ?? "?"}). {solve.reason}.
            </p>
            <div className="flex gap-2">
              {solve.url ? (
                <Button
                  nativeButton={false}
                  render={<a href={solve.url} target="_blank" rel="noreferrer" />}
                >
                  Open on LeetCode ↗
                </Button>
              ) : null}
              <Button variant="secondary" nativeButton={false} render={<Link href="/log" />}>
                Log a problem
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              The queue is clear. Solve something new with your tutor, then log it.
            </p>
            <Button variant="secondary" nativeButton={false} render={<Link href="/log" />}>
              Log a problem
            </Button>
          </>
        )}
      </div>
    );
  }

  // Requested problem first, then the rest of the queue. An explicit ?start=
  // bypasses the catch-up cap: pull it from allDue so a capped-out problem the
  // user asked for is never silently dropped.
  const startId = start ? Number(start) : null;
  const requested = startId ? allDue.filter((p) => p.id === startId) : [];
  const ordered = startId
    ? [...requested, ...due.filter((p) => p.id !== startId)]
    : due;

  const items: ReviewItem[] = ordered.map((p) => ({
    id: p.id,
    number: p.number,
    title: p.title,
    url: p.url,
    difficulty: p.difficulty,
    // Patterns are part of the answer (pattern recognition is the skill),
    // so they ship hidden and only render post-reveal.
    patterns: safeJsonParse<string[]>(p.patterns, []),
    keyInsight: p.keyInsight,
    optimal: safeJsonParse<Approach | null>(p.optimal, null),
    tips: safeJsonParse<string[]>(p.tips, []),
  }));

  return <ReviewPlayer items={items} />;
}
