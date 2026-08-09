import {
  parsedSummarySchema,
  type ParsedSummary,
  ISSUE_TAGS,
  type Approach,
} from "./types";

export interface ParseResult {
  parsed: ParsedSummary;
  warnings: string[];
  matchedTemplate: boolean;
}

const LABELS: Record<string, RegExp> = {
  meta: /^(?:[-*]\s*)?(?:url\s*\/\s*difficulty\s*\/\s*patterns?)\s*[:：]/i,
  url: /^(?:[-*]\s*)?url\s*[:：]/i,
  difficulty: /^(?:[-*]\s*)?difficulty\s*[:：]/i,
  patterns: /^(?:[-*]\s*)?patterns?\s*[:：]/i,
  language: /^(?:[-*]\s*)?language\s*[:：]/i,
  solved: /^(?:[-*]\s*)?solved\s*[:：]/i,
  recallSpeed: /^(?:[-*]\s*)?recall\s*speed\s*[:：]/i,
  confidence: /^(?:[-*]\s*)?confidence\s*[:：]/i,
  time: /^(?:[-*]\s*)?time\s*[:：]/i,
  fundamentals: /^(?:[-*]\s*)?fundamentals?(?:\s*missing)?\s*[:：]/i,
  issues: /^(?:[-*]\s*)?issues?\b[^:：]*[:：]/i,
  bruteForce: /^(?:[-*]\s*)?brute\s*force\s*[:：]/i,
  optimal: /^(?:[-*]\s*)?optimal\s*[:：]/i,
  keyInsight: /^(?:[-*]\s*)?key\s*insight\s*[:：]/i,
  tips: /^(?:[-*]\s*)?tips?\s*[:：]/i,
  revise: /^(?:[-*]\s*)?revise\s*[:：]/i,
  suggestedGrade: /^(?:[-*]\s*)?suggested\s*grade\s*[:：]/i,
};

// "Solved: ... Recall speed: ..." can share a line; these labels may start mid-line.
const INLINE_LABELS: Array<[string, RegExp]> = [
  ["recallSpeed", /recall\s*speed\s*[:：]/i],
  ["time", /\btime\s*[:：]/i],
  ["suggestedGrade", /suggested\s*grade\s*[:：]/i],
];

// Inline splitting only applies on the template's compact lines. Anywhere else
// it corrupts content — e.g. "Optimal: ... Time: O(n)" would hijack the
// complexity into the time-spent field.
const INLINE_HOST_KEYS = new Set(["solved", "confidence", "revise"]);

function splitList(value: string): string[] {
  return value
    .split(/[;•\n]|(?:,\s+)|(?:^|\s)[-*]\s+/)
    .map((s) => s.trim().replace(/^[,;·]+|[,;·]+$/g, ""))
    .filter((s) => s && !/^(none|n\/a|nothing|-|—)$/i.test(s));
}

export function mapIssueTags(issues: string[]): ParsedSummary["issueTags"] {
  const tags = new Set<(typeof ISSUE_TAGS)[number]>();
  // Exact taxonomy names first. The tutor prompt asks for tag names on the
  // Issues line, and four of the seven ("off_by_one", "wrong_data_structure",
  // "missed_edge_case", "wrong_pattern") match none of the prose regexes
  // below — a tutor following its own instructions produced zero tags.
  // Normalizing to underscores also makes off-by-one / off by one / off_by_one
  // all land on the same tag.
  const normalized = issues.join(" ").toLowerCase().replace(/[\s-]+/g, "_");
  for (const tag of ISSUE_TAGS) {
    // "other" is too common a word in prose to match on its name.
    if (tag === "other") continue;
    if (new RegExp(`(?:^|_)${tag}(?:_|$)`).test(normalized)) tags.add(tag);
  }
  const text = issues.join(" ").toLowerCase();
  if (/off[\s-]*by[\s-]*one/.test(text)) tags.add("off_by_one");
  if (/wrong\s*(data\s*structure|ds)\b|\bds\s*choice/.test(text))
    tags.add("wrong_data_structure");
  if (/edge\s*case|empty\s*(input|array|string)|boundar/.test(text))
    tags.add("missed_edge_case");
  if (/wrong\s*pattern|pattern\s*(recognition|id)|didn'?t\s*(know|see)\s*the\s*(approach|pattern|logic)/.test(text))
    tags.add("wrong_pattern");
  if (/complexit|big[\s-]*o/.test(text)) tags.add("complexity_error");
  if (/messy|not\s*clean|clean\s*code|refactor/.test(text))
    tags.add("implementation_messy");
  if (/syntax|typo|compile/.test(text)) tags.add("syntax");
  return [...tags];
}

/**
 * The part of a DASH-LESS approach line that actually states the complexity.
 * A bare O(...) mentioned mid-prose ("avoid the O(n²) nested loop by hashing")
 * is part of the explanation, not the recorded complexity — harvesting it
 * files the brute force as the optimal, and that string is what the review
 * player shows as the reveal answer.
 */
function complexityTail(value: string): string {
  // "… Time: O(NK log K), Space: O(NK)" — explicitly labelled.
  const labelled = value.match(/\btime\s*[:=][\s\S]*$/i);
  if (labelled) return labelled[0];
  // "… O(n log n) / O(n)" — a trailing pair with nothing after it.
  const pair = value.match(/O\([^)]*\)\s*[\/·|]\s*O\([^)]*\)\s*$/);
  return pair ? pair[0] : "";
}

export function parseApproach(value: string): Approach | null {
  if (!value.trim()) return null;
  // Cut at the LAST spaced dash that still has a complexity after it, so
  // approach prose containing " - " clauses (or O(...) mentions) survives:
  // "sort each word - use sorted key - O(nk log k) / O(nk)" keeps both clauses.
  let cut = -1;
  for (const m of value.matchAll(/\s[—–-]\s/g)) {
    if (/O\(/.test(value.slice(m.index + m[0].length))) cut = m.index;
  }
  const approach = (cut >= 0 ? value.slice(0, cut) : value).trim();
  const tail = cut >= 0 ? value.slice(cut) : complexityTail(value);
  const complexities = tail.match(/O\([^)]*\)/g) ?? [];
  return {
    approach,
    time: complexities[0] ?? "",
    space: complexities[1] ?? "",
  };
}

function parseHeader(lines: string[]): {
  number: number | null;
  title: string;
  headerIdx: number;
} | null {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(
      /^#{0,6}\s*problem\s*log\s*[—–:-]+\s*(?:(\d+)[.)]\s*)?(.+)$/i
    );
    if (m) return { number: m[1] ? Number(m[1]) : null, title: m[2].trim(), headerIdx: i };
  }
  // Fallback: first line that looks like "49. Group Anagrams"
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const m = lines[i].replace(/^#+\s*/, "").match(/^(\d+)[.)]\s+([A-Za-z].{2,80})$/);
    if (m) return { number: Number(m[1]), title: m[2].trim(), headerIdx: i };
  }
  return null;
}

/**
 * Deterministic parser for the Problem Log template. Forgiving about
 * separators, bullets, and label order; anything it can't find becomes a
 * warning surfaced on the edit-before-save screen.
 */
export function parseSummary(text: string): ParseResult {
  const warnings: string[] = [];
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);

  const header = parseHeader(lines);

  // Assemble label -> value (value = rest of line + continuation lines).
  const found: Record<string, string> = {};
  let currentKey: string | null = null;
  let labelHits = 0;
  for (const line of lines) {
    if (header && line === lines[header.headerIdx]) {
      currentKey = null;
      continue;
    }
    let matchedKey: string | null = null;
    let rest = "";
    for (const [key, re] of Object.entries(LABELS)) {
      const m = line.match(re);
      if (m && line.search(re) === 0) {
        matchedKey = key;
        rest = line.slice(m[0].length).trim();
        break;
      }
    }
    if (matchedKey) {
      labelHits++;
      // Split off inline secondary labels sharing this line (compact lines only).
      if (INLINE_HOST_KEYS.has(matchedKey)) {
        for (const [inlineKey, re] of INLINE_LABELS) {
          if (inlineKey === matchedKey) continue;
          const idx = rest.search(re);
          if (idx > 0) {
            const m = rest.slice(idx).match(re)!;
            const inlineVal = rest.slice(idx + m[0].length).trim();
            found[inlineKey] = found[inlineKey]
              ? `${found[inlineKey]} ${inlineVal}`
              : inlineVal;
            labelHits++;
            rest = rest.slice(0, idx).trim();
          }
        }
      }
      found[matchedKey] = found[matchedKey]
        ? `${found[matchedKey]}\n${rest}`
        : rest;
      currentKey = matchedKey;
    } else if (currentKey && /^[-*•]\s+/.test(line)) {
      found[currentKey] += `\n${line.replace(/^[-*•]\s+/, "")}`;
    } else {
      currentKey = null;
    }
  }

  const matchedTemplate = Boolean(header) && labelHits >= 3;

  // ---- field extraction ----
  const metaLine = [found.meta, found.url, found.difficulty, found.patterns]
    .filter(Boolean)
    .join(" · ");

  const url = metaLine.match(/https?:\/\/\S+/)?.[0]?.replace(/[),.]+$/, "") ?? "";
  const difficulty =
    (metaLine.match(/\b(easy|medium|hard)\b/i)?.[1] ?? null) as string | null;

  let patternsSource = found.patterns ?? found.meta ?? "";
  patternsSource = patternsSource
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b(easy|medium|hard)\b/gi, "");
  const patterns = patternsSource
    .split(/[,·|/;\n]+/)
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter((s) => s && s !== "-" && s.length < 40);

  const solvedRaw = found.solved ?? "";
  // "no hints" / "without hints" must not trigger the hints branch.
  const negHints = /\b(?:no|without|zero|0)\s+hints?\b/i.test(solvedRaw);
  let solved: ParsedSummary["solved"] = "solo";
  let hintsUsed = 0;
  // Requires a verb. A bare mention ("solo, then compared with the solution")
  // must not record solved="solution", which forces grade=again and lapses
  // the card on a problem that was actually solved unaided.
  const sawSolution =
    /gave\s*up|(?:saw|read|looked\s*at|copied|used|needed)\s+(?:the\s+)?(?:solution|answer|editorial)/i.test(
      solvedRaw
    ) ||
    /^\s*(?:no|nope|couldn'?t)\b[^.]*\b(?:solution|answer|editorial)\b/i.test(
      solvedRaw
    );
  if (sawSolution) {
    solved = "solution";
  } else if (!negHints && /hint/i.test(solvedRaw)) {
    solved = "hints";
    hintsUsed = Number(solvedRaw.match(/(\d+)\s*hints?/i)?.[1] ?? 1);
  } else if (negHints || /solo|yes|myself|independent/i.test(solvedRaw)) {
    solved = "solo";
  } else if (solvedRaw) {
    warnings.push(`Couldn't read "Solved: ${solvedRaw}" — assuming solo.`);
  } else {
    warnings.push("No 'Solved:' line found — assuming solo.");
  }

  const speedRaw = (found.recallSpeed ?? "").toLowerCase();
  // Drop negated clauses the way negHints does above: "never stuck" is not
  // failed, "didn't come immediately" is not instant. Then check the explicit
  // labels before the fuzzy ones, so a literal "slow" beats an incidental
  // "immediately" later in the same sentence. Unreadable ⇒ slow + a warning,
  // which errs toward more review rather than less.
  const speed = speedRaw.replace(/\b(?:not|never|didn'?t|wasn'?t|no)\b[^,;.]*/g, " ");
  let recallSpeed: ParsedSummary["recallSpeed"] = "slow";
  if (/fail|stuck|couldn/.test(speed)) recallSpeed = "failed";
  else if (/slow/.test(speed)) recallSpeed = "slow";
  else if (/hinted/.test(speed)) recallSpeed = "hinted";
  else if (/instant|fast|immediate/.test(speed)) recallSpeed = "instant";
  else warnings.push("No recall speed found — assuming slow.");

  const confRaw = found.confidence ?? "";
  const beforeM = confRaw.match(/before\s*[:\s]*(\d)/i);
  const afterM = confRaw.match(/after\s*[:\s]*(\d)/i);
  const arrowM = confRaw.match(/(\d)\s*\/\s*5\s*(?:→|->|to)\s*(\d)\s*\/\s*5/);
  const clamp15 = (n: number | null) =>
    n != null && n >= 1 && n <= 5 ? n : null;
  const confidenceBefore = clamp15(
    beforeM ? Number(beforeM[1]) : arrowM ? Number(arrowM[1]) : null
  );
  const confidenceAfter = clamp15(
    afterM ? Number(afterM[1]) : arrowM ? Number(arrowM[2]) : null
  );
  if (confidenceAfter == null)
    warnings.push("No post-solve confidence found.");

  const timeRaw = found.time ?? "";
  const timeApproachMin = timeRaw.match(/approach\s*[:\s]*(\d+(?:\.\d+)?)/i)
    ? Number(timeRaw.match(/approach\s*[:\s]*(\d+(?:\.\d+)?)/i)![1])
    : null;
  const timeCodeMin = timeRaw.match(/code\s*[:\s]*(\d+(?:\.\d+)?)/i)
    ? Number(timeRaw.match(/code\s*[:\s]*(\d+(?:\.\d+)?)/i)![1])
    : null;

  const issues = splitList(found.issues ?? "");
  const reviseRaw = (found.revise ?? "").toLowerCase().trim();
  let revise = true;
  if (/^(no\b|not\b|nope\b|none\b|never\b|skip\b|n\/a)/.test(reviseRaw)) {
    revise = false;
  } else if (
    reviseRaw &&
    !/^(yes\b|yep\b|yeah\b|y\b|true\b|definitely|absolutely)/.test(reviseRaw)
  ) {
    warnings.push(
      `Couldn't read "Revise: ${reviseRaw}" — assuming yes (scheduling reviews).`
    );
  }

  const gradeM = (found.suggestedGrade ?? "").match(/\b(again|hard|good|easy)\b/i);
  const gradeRationale = (found.suggestedGrade ?? "")
    .replace(/\b(again|hard|good|easy)\b/i, "")
    .replace(/^[\s—–:-]+/, "")
    .trim();

  const candidate = {
    number: header?.number ?? null,
    title: header?.title ?? "",
    url,
    difficulty: difficulty
      ? ((difficulty[0].toUpperCase() +
          difficulty.slice(1).toLowerCase()) as ParsedSummary["difficulty"])
      : null,
    patterns,
    language: (found.language ?? "").trim(),
    solved,
    hintsUsed,
    recallSpeed,
    confidenceBefore,
    confidenceAfter,
    timeApproachMin,
    timeCodeMin,
    fundamentalsMissing: splitList(found.fundamentals ?? ""),
    issues,
    issueTags: mapIssueTags(issues),
    bruteForce: parseApproach(found.bruteForce ?? ""),
    optimal: parseApproach(found.optimal ?? ""),
    keyInsight: (found.keyInsight ?? "").trim(),
    tips: splitList(found.tips ?? ""),
    revise,
    suggestedGrade: gradeM
      ? (gradeM[1].toLowerCase() as ParsedSummary["suggestedGrade"])
      : null,
    gradeRationale,
  };

  if (!candidate.title) {
    warnings.push(
      "Couldn't find a problem title — add a '## Problem Log — 49. Group Anagrams' style header."
    );
    candidate.title = "Untitled problem";
  }

  const parsed = parsedSummarySchema.parse(candidate);
  return { parsed, warnings, matchedTemplate };
}
