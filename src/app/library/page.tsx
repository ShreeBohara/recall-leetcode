import Link from "next/link";
import { getAllProblems, getReviewSummaries } from "@/lib/data";
import { patternDisplay } from "@/lib/patterns";
import { safeJsonParse, type Grade } from "@/lib/types";
import {
  daysUntil,
  difficultyClass,
  formatDue,
  formatRelativePast,
  GRADE_LABELS,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const GRADE_DOT: Record<string, string> = {
  again: "bg-warn",
  hard: "bg-chart-4",
  good: "bg-chart-2",
  easy: "bg-primary",
};

export default async function LibraryPage() {
  const [all, summaries] = await Promise.all([
    getAllProblems(),
    getReviewSummaries(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {all.length} problem{all.length === 1 ? "" : "s"} · your full
            logbook — every attempt lives on each problem&apos;s page
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/log" />}>Log a problem</Button>
      </div>

      {all.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing here yet — <Link href="/log" className="underline">log your first problem</Link>.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Problem</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead>Patterns</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead>Last result</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead className="text-right">Next review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {all.map((p) => {
                const patterns = safeJsonParse<string[]>(p.patterns, []);
                const s = summaries.get(p.id);
                const overdue =
                  p.revise && p.due ? daysUntil(p.due) < 0 : false;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-[280px]">
                      <Link
                        href={`/library/${p.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {p.number ? `${p.number}. ` : ""}
                        {p.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs ${difficultyClass(p.difficulty)}`}>
                        {p.difficulty ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-[220px] flex-wrap gap-1">
                        {patterns.slice(0, 2).map((pattern) => (
                          <Badge
                            key={pattern}
                            variant="secondary"
                            className="font-mono text-[10px]"
                          >
                            {patternDisplay(pattern)}
                          </Badge>
                        ))}
                        {patterns.length > 2 ? (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            +{patterns.length - 2}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      ×{s?.count ?? 0}
                    </TableCell>
                    <TableCell>
                      {s?.lastGrade ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span
                            className={`size-1.5 rounded-full ${GRADE_DOT[s.lastGrade] ?? "bg-muted-foreground"}`}
                          />
                          {GRADE_LABELS[s.lastGrade as Grade] ?? s.lastGrade}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelativePast(s?.last ?? p.firstSolvedAt)}
                    </TableCell>
                    <TableCell
                      className={`text-right text-xs ${overdue ? "font-medium text-warn" : "text-muted-foreground"}`}
                    >
                      {p.revise && p.due ? formatDue(p.due) : "not scheduled"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
