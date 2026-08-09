import { parsedSummarySchema, type ParsedSummary, ISSUE_TAGS } from "./types";

/**
 * AI fallback for free-form summaries that don't match the template.
 * Only used when ANTHROPIC_API_KEY is set; forced tool-use keeps the output
 * on-schema, and zod validates it regardless. ~$0.006 per parse on Haiku.
 */
export function aiParseAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// JSON Schema for a problem-log payload — shared by the AI-parse tool call
// and the MCP add_problem tool. Kept in sync with parsedSummarySchema (zod),
// which remains the source of truth at validation time.
export const SUMMARY_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    number: { type: ["integer", "null"] },
    title: { type: "string" },
    url: { type: "string" },
    difficulty: { type: ["string", "null"], enum: ["Easy", "Medium", "Hard", null] },
    patterns: { type: "array", items: { type: "string" } },
    language: { type: "string" },
    solved: { type: "string", enum: ["solo", "hints", "solution"] },
    hintsUsed: { type: "integer", minimum: 0 },
    recallSpeed: { type: "string", enum: ["instant", "slow", "hinted", "failed"] },
    confidenceBefore: { type: ["integer", "null"], minimum: 1, maximum: 5 },
    confidenceAfter: { type: ["integer", "null"], minimum: 1, maximum: 5 },
    timeApproachMin: { type: ["number", "null"] },
    timeCodeMin: { type: ["number", "null"] },
    fundamentalsMissing: { type: "array", items: { type: "string" } },
    issues: { type: "array", items: { type: "string" } },
    issueTags: { type: "array", items: { type: "string", enum: [...ISSUE_TAGS] } },
    bruteForce: {
      type: ["object", "null"],
      properties: {
        approach: { type: "string" },
        time: { type: "string" },
        space: { type: "string" },
      },
    },
    optimal: {
      type: ["object", "null"],
      properties: {
        approach: { type: "string" },
        time: { type: "string" },
        space: { type: "string" },
      },
    },
    keyInsight: { type: "string" },
    tips: { type: "array", items: { type: "string" } },
    revise: { type: "boolean" },
    suggestedGrade: {
      type: ["string", "null"],
      enum: ["again", "hard", "good", "easy", null],
    },
    gradeRationale: { type: "string" },
  },
  required: ["title", "solved", "recallSpeed", "revise"],
};

export async function aiParse(text: string): Promise<ParsedSummary> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const message = await client.messages.create({
    model: process.env.PARSE_MODEL ?? "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    tools: [
      {
        name: "log_problem",
        description:
          "Record a structured LeetCode problem log extracted from a tutoring-session summary.",
        input_schema: SUMMARY_TOOL_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "log_problem" },
    messages: [
      {
        role: "user",
        content: `Extract a structured problem log from this LeetCode tutoring-session summary. Rules: map free-text mistakes onto the issueTags taxonomy; patterns are lowercase-kebab-case; if the summary says the user saw the solution, solved="solution"; leave unknown fields null/empty rather than guessing.\n\n<summary>\n${text}\n</summary>`,
      },
    ],
  });
  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("AI parse returned no structured output");
  }
  return parsedSummarySchema.parse(toolUse.input);
}
