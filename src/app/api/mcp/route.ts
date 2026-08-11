import { NextResponse } from "next/server";
import {
  saveParsedSummary,
  logReview,
  getDueProblems,
  getTodayStats,
  resolveProblem,
} from "@/lib/data";
import { parsedSummarySchema, GRADES } from "@/lib/types";
import { SUMMARY_TOOL_SCHEMA } from "@/lib/ai-parse";
import { formatDate, daysUntil } from "@/lib/format";
import { getNextAction } from "@/lib/recommend";
import { getWeeklyReportData, saveCoachReport } from "@/lib/coach";
import { localMonday } from "@/lib/records";
import { sharedToken } from "@/lib/secrets";
import { z } from "zod";

const baseUrl = () =>
  process.env.APP_URL ??
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

/**
 * Stateless MCP server (Streamable HTTP transport, JSON responses).
 * Connect from Claude Code:
 *   claude mcp add --transport http recall http://localhost:3000/api/mcp \
 *     --header "Authorization: Bearer <MCP_TOKEN>"
 * The tutoring chat can then call add_problem at session end — zero copy-paste.
 */
export const dynamic = "force-dynamic";

const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const TOOLS = [
  {
    name: "get_next_action",
    description:
      "The day's plan — call this at the START of every tutoring session. Returns due reviews first (spaced repetition takes priority), otherwise the recommended next problem to solve from the user's active curated list with the reason it was chosen, otherwise a prompt to log new work. If a recommended problem includes its pattern, do NOT reveal the pattern to the user — recognizing it is the skill being trained.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "add_problem",
    description:
      "Log a solved LeetCode problem into Recall from a tutoring-session post-mortem. Creates the problem (or logs a re-solve of an existing one), derives the FSRS review grade from the signals, and schedules the next spaced-repetition review. Call this at the end of a tutoring session with the full Problem Log data.",
    inputSchema: SUMMARY_TOOL_SCHEMA,
  },
  {
    name: "get_due_reviews",
    description:
      "List the problems whose spaced-repetition review is due today (or overdue). Use for awareness and planning; the actual review should happen in the Recall web app's review player, which keeps the answer hidden.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "log_review",
    description:
      "Record a completed review for an existing problem and reschedule it. Use only for reviews done OUTSIDE the Recall app (e.g. the user fully re-solved the problem on LeetCode during this chat); prefer the web review player otherwise. Grade honestly: again = couldn't state the approach, hard = got there slowly or with hints, good = solid with friction, easy = instant and exact.",
    inputSchema: {
      type: "object",
      properties: {
        problem: {
          type: ["string", "number"],
          description: "LeetCode number, slug, or exact title",
        },
        grade: { type: "string", enum: [...GRADES] },
        tier: {
          type: "string",
          enum: ["approach_recall", "full_resolve"],
          description: "Defaults to full_resolve",
        },
        pre_confidence: { type: ["integer", "null"], minimum: 1, maximum: 5 },
        notes: { type: "string" },
      },
      required: ["problem", "grade"],
    },
  },
  {
    name: "get_stats",
    description:
      "Current practice stats: due/overdue counts, streak, library size, weakest issue areas.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_weekly_report_data",
    description:
      "Structured data for the weekly coach report: totals, per-pattern mastery movement with top issue tags, confidence calibration, lapses, next-week due forecast, recommendation, and personal records. Call this, then write an encouraging, specific coach report in markdown and save it with save_coach_report. Do not reveal the recommendation's pattern.",
    inputSchema: {
      type: "object",
      properties: {
        week_start: {
          type: "string",
          description:
            "Local Monday YYYY-MM-DD; defaults to the current week",
        },
      },
    },
  },
  {
    name: "save_coach_report",
    description:
      "Save the weekly coach report (markdown). It renders at the top of the user's dashboard until dismissed. Keep it under ~300 words: headline numbers, one pattern to celebrate, one to work on (with its issue tags), a calibration observation if the data supports one, and next week's plan.",
    inputSchema: {
      type: "object",
      properties: {
        week_start: { type: "string", description: "Local Monday YYYY-MM-DD" },
        markdown: { type: "string" },
      },
      required: ["week_start", "markdown"],
    },
  },
];

const weekStartSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

/** Canonicalize any valid date to its local Monday — one report key per week. */
function toWeekKey(raw: string): string | null {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime()) || d.getDate() !== Number(m[3])) return null;
  return localMonday(d);
}

const saveReportInput = z.object({
  week_start: weekStartSchema,
  markdown: z.string().min(20).max(20_000),
});

const logReviewInput = z.object({
  problem: z.union([z.string(), z.number()]),
  grade: z.enum(GRADES),
  tier: z.enum(["approach_recall", "full_resolve"]).default("full_resolve"),
  pre_confidence: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().optional(),
});

function text(s: string) {
  return { content: [{ type: "text", text: s }] };
}
function errorText(s: string) {
  return { content: [{ type: "text", text: s }], isError: true };
}

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "get_next_action": {
      const action = await getNextAction();
      if (action.type === "review" && action.due) {
        const lines = action.due
          .slice(0, 10)
          .map(
            (p) =>
              `- ${p.number ? `${p.number}. ` : ""}${p.title} (${p.difficulty ?? "?"})${daysUntil(p.due!) < 0 ? ` — ${-daysUntil(p.due!)}d overdue` : ""}`
          );
        const b = action.backlog;
        const plan = b?.active
          ? `Catch-up plan: today's session is the ${action.due.length} most rescuable of ${b.dueCount} due — ~${b.cap}/day clears the backlog in ~${b.days} day(s). Relay the plan, not the pile.`
          : `Plan: ${action.dueCount} review(s) first — memory beats new material.`;
        return text(
          `${plan}\n${lines.join("\n")}\n\nReviews happen in the app (answer stays hidden): ${baseUrl()}/review\nWhen the queue is clear, call get_next_action again for the next solve.`
        );
      }
      if (action.type === "solve" && action.solve) {
        const s = action.solve;
        // Deliberately no pattern in the wire response: tool results are
        // user-visible in most MCP clients, and the pattern is the answer.
        return text(
          `Nothing due. Solve next: ${s.title} (${s.difficulty ?? "?"}) — ${s.url ?? ""}\nWhy: ${s.reason}\nProgress: problem ${s.position} of ${s.total} in ${s.listName}.`
        );
      }
      return text(
        `Nothing due and no active list picked yet. The user can pick a list (NeetCode 150 / Blind 75) on the dashboard: ${baseUrl()} — or just solve anything and log it with add_problem.`
      );
    }
    case "add_problem": {
      const check = parsedSummarySchema.safeParse(args);
      if (!check.success) {
        return errorText(
          `Invalid problem data — fix these fields and retry: ${JSON.stringify(check.error.flatten().fieldErrors)}`
        );
      }
      if (!check.data.title.trim() || /^untitled problem$/i.test(check.data.title.trim())) {
        return errorText("A real problem title is required.");
      }
      const result = await saveParsedSummary(check.data);
      return text(
        `${result.isNew ? "Added" : "Updated (re-solve logged)"}: ${check.data.title}. ` +
          `Grade: ${result.grade} (${result.gradeSource}). ` +
          (result.nextDue
            ? `Next review: ${formatDate(result.nextDue)}.`
            : "Not scheduled (revise=false).")
      );
    }
    case "get_due_reviews": {
      const due = await getDueProblems();
      if (due.length === 0) return text("No reviews due. The queue is clear.");
      const lines = due.map((p) => {
        const overdue = -daysUntil(p.due!);
        return `- ${p.number ? `${p.number}. ` : ""}${p.title} (${p.difficulty ?? "?"})${overdue > 0 ? ` — ${overdue}d overdue` : " — due today"}${p.url ? ` — ${p.url}` : ""}`;
      });
      return text(
        `${due.length} review(s) due:\n${lines.join("\n")}\n\nReview in the app (answer stays hidden): ${baseUrl()}/review`
      );
    }
    case "log_review": {
      const check = logReviewInput.safeParse(args);
      if (!check.success) {
        return errorText(
          `Invalid review data: ${JSON.stringify(check.error.flatten().fieldErrors)}`
        );
      }
      const problem = await resolveProblem(check.data.problem);
      if (!problem) {
        return errorText(
          `No problem matching "${check.data.problem}" — check the number/title, or add it first with add_problem.`
        );
      }
      const result = await logReview({
        problemId: problem.id,
        tier: check.data.tier,
        grade: check.data.grade,
        preConfidence: check.data.pre_confidence ?? null,
        notes: check.data.notes ?? null,
      });
      return text(
        `Review logged for ${problem.title} (${check.data.grade}). Next review: ${formatDate(result.nextDue)}.`
      );
    }
    case "get_stats": {
      const s = await getTodayStats();
      return text(
        `Due today: ${s.dueToday} (${s.overdue} overdue) · Streak: ${s.streak}d · Problems: ${s.totalProblems} · Avg confidence (7d): ${s.avgConfidence7d ?? "—"}\nWeakest areas: ${s.weakestIssues.map((w) => `${w.tag} (${w.count})`).join(", ") || "none yet"}`
      );
    }
    case "get_weekly_report_data": {
      let weekStart: string | undefined;
      if (typeof args.week_start === "string" && args.week_start) {
        const key = toWeekKey(args.week_start);
        if (!key) {
          return errorText(
            `Invalid week_start "${args.week_start}" — use a real YYYY-MM-DD date.`
          );
        }
        weekStart = key;
      }
      const data = await getWeeklyReportData(weekStart);
      return text(JSON.stringify(data));
    }
    case "save_coach_report": {
      const check = saveReportInput.safeParse(args);
      if (!check.success) {
        return errorText(
          `Invalid report: ${JSON.stringify(check.error.flatten().fieldErrors)}`
        );
      }
      const weekKey = toWeekKey(check.data.week_start);
      if (!weekKey) {
        return errorText(
          `Invalid week_start "${check.data.week_start}" — use a real YYYY-MM-DD date.`
        );
      }
      await saveCoachReport(weekKey, check.data.markdown);
      return text(
        `Coach report saved for week of ${weekKey} — it's live on the dashboard.`
      );
    }
    default:
      return errorText(`Unknown tool: ${name}`);
  }
}

function authorized(request: Request): boolean {
  const expected = sharedToken("MCP_TOKEN");
  return (
    expected != null &&
    request.headers.get("authorization") === `Bearer ${expected}`
  );
}

interface RpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

async function handleMessage(msg: RpcMessage) {
  const { id, method, params } = msg;
  switch (method) {
    case "initialize": {
      const requested = (params?.protocolVersion as string) ?? "";
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: SUPPORTED_VERSIONS.includes(requested)
            ? requested
            : SUPPORTED_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: "recall", version: "0.1.0" },
          instructions:
            "Recall is the user's LeetCode spaced-repetition tracker. At the end of a tutoring session, call add_problem with the full post-mortem. Reviews themselves belong in the Recall web app (answer-hidden); use log_review only when the user fully re-solved a problem in chat.",
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    case "tools/call": {
      const name = params?.name as string;
      const args = (params?.arguments as Record<string, unknown>) ?? {};
      try {
        return { jsonrpc: "2.0", id, result: await callTool(name, args) };
      } catch (err) {
        return {
          jsonrpc: "2.0",
          id,
          result: errorText(
            `Tool failed: ${err instanceof Error ? err.message : "unknown error"}`
          ),
        };
      }
    }
    default:
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Unauthorized" } },
      { status: 401 }
    );
  }
  const body = (await request.json().catch(() => null)) as
    | RpcMessage
    | RpcMessage[]
    | null;
  if (!body) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 }
    );
  }

  const messages = Array.isArray(body) ? body : [body];
  // Notifications (and responses) get no reply body — 202 per the spec.
  const requests = messages.filter((m) => m.method && m.id !== undefined);
  if (requests.length === 0) {
    return new Response(null, { status: 202 });
  }
  const responses = await Promise.all(requests.map(handleMessage));
  return NextResponse.json(
    Array.isArray(body) && responses.length > 1 ? responses : responses[0]
  );
}

// Stateless server: no SSE stream, no sessions to terminate.
export async function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}
export async function DELETE() {
  return new Response("Method Not Allowed", { status: 405 });
}
// Web-based MCP clients preflight cross-origin requests.
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "content-type, authorization, mcp-protocol-version, mcp-session-id",
      "Access-Control-Max-Age": "86400",
    },
  });
}
