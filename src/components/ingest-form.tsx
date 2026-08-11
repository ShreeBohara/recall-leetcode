"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GRADE_LABELS, formatDate } from "@/lib/format";
import { parseApproach } from "@/lib/parser";
import type { Grade } from "@/lib/types";

function approachToText(
  a: { approach: string; time: string; space: string } | null
): string {
  if (!a) return "";
  const cx = [a.time, a.space].filter(Boolean).join(" / ");
  return cx ? `${a.approach} — ${cx}` : a.approach;
}

// Mirrors ParsedSummary; kept as plain state for the edit form.
interface EditableParsed {
  number: number | null;
  title: string;
  url: string;
  difficulty: "Easy" | "Medium" | "Hard" | null;
  patterns: string[];
  language: string;
  solved: "solo" | "hints" | "solution";
  hintsUsed: number;
  recallSpeed: "instant" | "slow" | "hinted" | "failed";
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  timeApproachMin: number | null;
  timeCodeMin: number | null;
  fundamentalsMissing: string[];
  issues: string[];
  issueTags: string[];
  bruteForce: { approach: string; time: string; space: string } | null;
  optimal: { approach: string; time: string; space: string } | null;
  keyInsight: string;
  tips: string[];
  revise: boolean;
  suggestedGrade: Grade | null;
  gradeRationale: string;
}

const TEMPLATE_HINT = `## Problem Log — 49. Group Anagrams
URL / Difficulty / Patterns: https://leetcode.com/problems/group-anagrams/ · Medium · arrays-hashing
Solved: with 2 hints     Recall speed: slow
Confidence: before 2/5 → after 3/5     Time: approach 12 min · code 20 min
Fundamentals missing: definition of anagram
Issues: wrong pattern; code was messy
Brute force: compare every pair — O(n²k) / O(1)
Optimal: bucket by sorted-string key — O(nk log k) / O(nk)
Key insight: all anagrams share one canonical form
Tips: char-count tuple avoids the sort
Revise: yes — pattern recognition still weak
Suggested grade: hard — needed hints for the invariant`;

export function IngestForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState<EditableParsed | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [derivedGrade, setDerivedGrade] = useState<Grade>("good");
  const [gradeSource, setGradeSource] = useState<string>("derived");
  // List/approach fields are edited as RAW text and only split on save —
  // normalizing per keystroke would delete separators as the user types them.
  const [patternsText, setPatternsText] = useState("");
  const [fundamentalsText, setFundamentalsText] = useState("");
  const [issuesText, setIssuesText] = useState("");
  const [bruteText, setBruteText] = useState("");
  const [optimalText, setOptimalText] = useState("");

  async function handleParse() {
    setParsing(true);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Parse failed");
      const p: EditableParsed = data.parsed;
      // Blank the placeholder so Save stays disabled until a real title exists.
      if (/^untitled problem$/i.test(p.title)) p.title = "";
      setParsed(p);
      setPatternsText(p.patterns.join(", "));
      setFundamentalsText(p.fundamentalsMissing.join("\n"));
      setIssuesText(p.issues.join("\n"));
      setBruteText(approachToText(p.bruteForce));
      setOptimalText(approachToText(p.optimal));
      setWarnings(data.warnings ?? []);
      setDerivedGrade(data.derivedGrade);
      setGradeSource(data.gradeSource);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!parsed) return;
    setSaving(true);
    try {
      const finalParsed: EditableParsed = {
        ...parsed,
        patterns: patternsText
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
        fundamentalsMissing: fundamentalsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        issues: issuesText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        bruteForce: parseApproach(bruteText),
        optimal: parseApproach(optimalText),
      };
      const res = await fetch("/api/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsed: finalParsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      toast.success(
        data.isNew
          ? `${parsed.title} added${data.nextDue ? ` — first review ${formatDate(data.nextDue)}` : ""}`
          : `${parsed.title} updated (re-solve logged)${data.nextDue ? ` — next review ${formatDate(data.nextDue)}` : ""}`
      );
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  const set = <K extends keyof EditableParsed>(
    key: K,
    value: EditableParsed[K]
  ) => setParsed((p) => (p ? { ...p, [key]: value } : p));

  if (!parsed) {
    return (
      <div className="flex flex-col gap-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={TEMPLATE_HINT}
          className="min-h-[320px] font-mono text-[13px] leading-relaxed"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Free-form summaries work too — the template just parses perfectly.
          </p>
          <Button onClick={handleParse} disabled={parsing || !text.trim()}>
            {parsing ? "Parsing…" : "Parse"}
          </Button>
        </div>
      </div>
    );
  }

  const effectiveGrade = parsed.suggestedGrade ?? derivedGrade;

  return (
    <div className="flex flex-col gap-4">
      {warnings.length > 0 ? (
        <Card className="border-warn/30 py-3">
          <CardContent className="px-4">
            <ul className="list-disc pl-4 text-xs text-warn">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-5 px-5 py-1">
          <div className="grid gap-4 sm:grid-cols-[90px_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="number">Number</Label>
              <Input
                id="number"
                type="number"
                value={parsed.number ?? ""}
                onChange={(e) =>
                  set("number", e.target.value ? Number(e.target.value) : null)
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={parsed.title}
                onChange={(e) => set("title", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                value={parsed.url}
                onChange={(e) => set("url", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Difficulty</Label>
                <Select
                  value={parsed.difficulty ?? "unset"}
                  onValueChange={(v) =>
                    set(
                      "difficulty",
                      v === "unset" ? null : (v as EditableParsed["difficulty"])
                    )
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">—</SelectItem>
                    <SelectItem value="Easy">Easy</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Grade</Label>
                <Select
                  value={effectiveGrade}
                  onValueChange={(v) => set("suggestedGrade", v as Grade)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(GRADE_LABELS) as Grade[]).map((g) => (
                      <SelectItem key={g} value={g}>
                        {GRADE_LABELS[g]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="font-mono">
              grade: {effectiveGrade}
            </Badge>
            <span>
              {parsed.suggestedGrade && gradeSource === "tutor"
                ? `tutor-suggested${parsed.gradeRationale ? ` — ${parsed.gradeRationale}` : ""}`
                : "derived from recall speed, hints, and confidence"}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="patterns">Patterns (comma-separated)</Label>
            <Input
              id="patterns"
              value={patternsText}
              onChange={(e) => setPatternsText(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fundamentals">Fundamentals missing (one per line)</Label>
              <Textarea
                id="fundamentals"
                className="min-h-[70px] text-sm"
                value={fundamentalsText}
                onChange={(e) => setFundamentalsText(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="issues">Issues (one per line)</Label>
              <Textarea
                id="issues"
                className="min-h-[70px] text-sm"
                value={issuesText}
                onChange={(e) => setIssuesText(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="brute">Brute force (approach — time / space)</Label>
              <Textarea
                id="brute"
                className="min-h-[60px] text-sm"
                value={bruteText}
                onChange={(e) => setBruteText(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="optimal">Optimal (approach — time / space)</Label>
              <Textarea
                id="optimal"
                className="min-h-[60px] text-sm"
                value={optimalText}
                onChange={(e) => setOptimalText(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="insight">Key insight</Label>
            <Input
              id="insight"
              value={parsed.keyInsight}
              onChange={(e) => set("keyInsight", e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="revise"
              type="checkbox"
              checked={parsed.revise}
              onChange={(e) => set("revise", e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            <Label htmlFor="revise" className="cursor-pointer">
              Schedule spaced-repetition reviews for this problem
            </Label>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => {
            setParsed(null);
            setWarnings([]);
          }}
        >
          ← Back to paste
        </Button>
        <Button onClick={handleSave} disabled={saving || !parsed.title.trim()}>
          {saving ? "Saving…" : "Save problem"}
        </Button>
      </div>
    </div>
  );
}
