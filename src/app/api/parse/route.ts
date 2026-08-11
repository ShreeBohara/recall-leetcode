import { NextResponse } from "next/server";
import { parseSummary } from "@/lib/parser";
import { aiParse, aiParseAvailable } from "@/lib/ai-parse";
import { deriveGrade } from "@/lib/fsrs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text: string = body?.text ?? "";
  if (!text.trim()) {
    return NextResponse.json({ error: "No summary text provided" }, { status: 400 });
  }

  const deterministic = parseSummary(text);
  let parsed = deterministic.parsed;
  let warnings = deterministic.warnings;
  let parser: "template" | "ai" = "template";

  // Free-form text that doesn't match the template → AI fallback when available.
  if (!deterministic.matchedTemplate && aiParseAvailable()) {
    try {
      parsed = await aiParse(text);
      warnings = [];
      parser = "ai";
    } catch (err) {
      warnings = [
        ...deterministic.warnings,
        `AI fallback failed (${err instanceof Error ? err.message : "unknown error"}) — showing template parse.`,
      ];
    }
  } else if (!deterministic.matchedTemplate) {
    warnings = [
      "This doesn't look like the Problem Log template — fields below are best-effort. Set ANTHROPIC_API_KEY to enable AI parsing of free-form summaries.",
      ...deterministic.warnings,
    ];
  }

  const { grade, source } = deriveGrade(parsed);
  return NextResponse.json({ parsed, warnings, parser, derivedGrade: grade, gradeSource: source });
}
