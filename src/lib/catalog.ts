import curated from "@/data/curated-lists.json";
import { canonicalizePattern } from "./patterns";

export interface CatalogEntry {
  slug: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  url: string;
  pattern: string;
  patternDisplay: string;
  neetcode150Order: number | null;
  blind75: boolean;
}

export const CATALOG = curated as CatalogEntry[];

const BY_SLUG = new Map(CATALOG.map((e) => [e.slug, e]));
const BY_TITLE = new Map(CATALOG.map((e) => [normTitle(e.title), e]));

function normTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/^\d+[.)]\s*/, "")
    .replace(/[^a-z0-9]/g, "");
}

export function lcSlugFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/leetcode\.com\/problems\/([a-z0-9-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

export function catalogLookup(ref: {
  url?: string | null;
  title?: string | null;
}): CatalogEntry | null {
  const slug = lcSlugFromUrl(ref.url);
  if (slug && BY_SLUG.has(slug)) return BY_SLUG.get(slug)!;
  if (ref.title) {
    const hit = BY_TITLE.get(normTitle(ref.title));
    if (hit) return hit;
  }
  return null;
}

/**
 * Enrich a parsed summary from the bundled catalog: fill url/difficulty when
 * missing, always canonicalize patterns, and add the catalog pattern if the
 * summary carried none. Returns the resolved LeetCode slug when known.
 */
export function enrichFromCatalog<
  T extends {
    title: string;
    url: string;
    difficulty: "Easy" | "Medium" | "Hard" | null;
    patterns: string[];
  },
>(parsed: T): { parsed: T; lcSlug: string | null } {
  const entry = catalogLookup({ url: parsed.url, title: parsed.title });
  const patterns = [...new Set(parsed.patterns.map(canonicalizePattern))];
  // Always union in the catalog's canonical pattern: a summary tagged with a
  // custom pattern must still join against the list vocabulary.
  if (entry && !patterns.includes(entry.pattern)) patterns.push(entry.pattern);
  return {
    parsed: {
      ...parsed,
      url: parsed.url || entry?.url || "",
      difficulty: parsed.difficulty ?? entry?.difficulty ?? null,
      patterns,
    },
    lcSlug: lcSlugFromUrl(parsed.url) ?? entry?.slug ?? null,
  };
}
