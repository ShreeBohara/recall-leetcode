/**
 * Canonical pattern vocabulary — the 18 NeetCode categories.
 * Every pattern string entering the system (parser, MCP, AI parse) is
 * normalized through canonicalizePattern; without this, "sliding-window"
 * from a tutoring chat would never match "Sliding Window" from the curated
 * lists and recommendations would silently degrade.
 */

export interface CanonicalPattern {
  slug: string;
  display: string;
}

export const CANONICAL_PATTERNS: CanonicalPattern[] = [
  { slug: "arrays-hashing", display: "Arrays & Hashing" },
  { slug: "two-pointers", display: "Two Pointers" },
  { slug: "sliding-window", display: "Sliding Window" },
  { slug: "stack", display: "Stack" },
  { slug: "binary-search", display: "Binary Search" },
  { slug: "linked-list", display: "Linked List" },
  { slug: "trees", display: "Trees" },
  { slug: "heap-priority-queue", display: "Heap / Priority Queue" },
  { slug: "backtracking", display: "Backtracking" },
  { slug: "tries", display: "Tries" },
  { slug: "graphs", display: "Graphs" },
  { slug: "advanced-graphs", display: "Advanced Graphs" },
  { slug: "1d-dynamic-programming", display: "1-D Dynamic Programming" },
  { slug: "2d-dynamic-programming", display: "2-D Dynamic Programming" },
  { slug: "greedy", display: "Greedy" },
  { slug: "intervals", display: "Intervals" },
  { slug: "math-geometry", display: "Math & Geometry" },
  { slug: "bit-manipulation", display: "Bit Manipulation" },
];

const ALIASES: Record<string, string> = {
  // arrays & hashing
  array: "arrays-hashing",
  arrays: "arrays-hashing",
  hashing: "arrays-hashing",
  "hash-map": "arrays-hashing",
  "hash-table": "arrays-hashing",
  hashmap: "arrays-hashing",
  "hash-set": "arrays-hashing",
  "prefix-sum": "arrays-hashing",
  // two pointers
  "two-pointer": "two-pointers",
  "2-pointers": "two-pointers",
  // sliding window
  window: "sliding-window",
  substring: "sliding-window",
  // stack
  stacks: "stack",
  "monotonic-stack": "stack",
  queue: "stack",
  // binary search
  "binary-search-tree": "trees",
  bsearch: "binary-search",
  "search": "binary-search",
  // linked list
  "linked-lists": "linked-list",
  linkedlist: "linked-list",
  "fast-slow-pointers": "linked-list",
  // trees
  tree: "trees",
  "binary-tree": "trees",
  bst: "trees",
  dfs: "trees",
  bfs: "trees",
  // heap
  heap: "heap-priority-queue",
  "priority-queue": "heap-priority-queue",
  heaps: "heap-priority-queue",
  "top-k": "heap-priority-queue",
  // backtracking
  recursion: "backtracking",
  permutations: "backtracking",
  subsets: "backtracking",
  // tries
  trie: "tries",
  "prefix-tree": "tries",
  // graphs
  graph: "graphs",
  "union-find": "graphs",
  "topological-sort": "graphs",
  matrix: "graphs",
  // advanced graphs
  dijkstra: "advanced-graphs",
  "shortest-path": "advanced-graphs",
  mst: "advanced-graphs",
  // dp
  dp: "1d-dynamic-programming",
  "dynamic-programming": "1d-dynamic-programming",
  "1d-dp": "1d-dynamic-programming",
  memoization: "1d-dynamic-programming",
  "2d-dp": "2d-dynamic-programming",
  "grid-dp": "2d-dynamic-programming",
  // greedy
  "greedy-algorithm": "greedy",
  // intervals
  interval: "intervals",
  "merge-intervals": "intervals",
  // math
  math: "math-geometry",
  geometry: "math-geometry",
  "math-and-geometry": "math-geometry",
  // bit
  "bit-manip": "bit-manipulation",
  bits: "bit-manipulation",
  bitwise: "bit-manipulation",
  xor: "bit-manipulation",
};

const BY_SLUG = new Map(CANONICAL_PATTERNS.map((p) => [p.slug, p]));

function kebab(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9\s/-]/g, "")
    .replace(/[\s/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Normalize any pattern string to a canonical slug. Unknown patterns pass
 * through in kebab form (custom concepts are allowed, just not encouraged).
 */
export function canonicalizePattern(input: string): string {
  const k = kebab(input);
  if (BY_SLUG.has(k)) return k;
  if (ALIASES[k]) return ALIASES[k];
  // "1-d-dynamic-programming" / "heap-priority-queue" style near-misses
  const squeezed = k.replace(/^(\d)-d-/, "$1d-");
  if (BY_SLUG.has(squeezed)) return squeezed;
  return k;
}

export function canonicalizeAll(patterns: string[]): string[] {
  return [...new Set(patterns.map(canonicalizePattern).filter(Boolean))];
}

export function patternDisplay(slug: string): string {
  return (
    BY_SLUG.get(slug)?.display ??
    slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
