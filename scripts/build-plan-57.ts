/**
 * Build src/data/plan-57.json from Shreet's 57-day plan
 * (~/Desktop/Leetcode_prepare/57-day-leetcode-plan-final.md), verifying every
 * slug against LeetCode via the cached lookup (each slug fetched once, ever).
 * Run: npx tsx scripts/build-plan-57.ts
 */
import "dotenv/config";
import fs from "node:fs";
import { lookupLc } from "../src/lib/lc-lookup";

type Entry = [day: number, number: number, title: string, diff: "Easy" | "Medium" | "Hard", slug: string, pattern: string];

const P: Entry[] = [
  // Block 1 — Arrays, Hashing, Prefix Sums
  [1, 49, "Group Anagrams", "Medium", "group-anagrams", "arrays-hashing"],
  [1, 347, "Top K Frequent Elements", "Medium", "top-k-frequent-elements", "arrays-hashing"],
  [2, 169, "Majority Element", "Easy", "majority-element", "arrays-hashing"],
  [2, 238, "Product of Array Except Self", "Medium", "product-of-array-except-self", "arrays-hashing"],
  [3, 560, "Subarray Sum Equals K", "Medium", "subarray-sum-equals-k", "arrays-hashing"],
  [3, 53, "Maximum Subarray", "Medium", "maximum-subarray", "arrays-hashing"],
  [4, 152, "Maximum Product Subarray", "Medium", "maximum-product-subarray", "arrays-hashing"],
  [4, 128, "Longest Consecutive Sequence", "Medium", "longest-consecutive-sequence", "arrays-hashing"],
  [5, 36, "Valid Sudoku", "Medium", "valid-sudoku", "arrays-hashing"],
  [5, 448, "Find All Numbers Disappeared in an Array", "Easy", "find-all-numbers-disappeared-in-an-array", "arrays-hashing"],
  [6, 271, "Encode and Decode Strings", "Medium", "encode-and-decode-strings", "arrays-hashing"],
  [6, 41, "First Missing Positive", "Hard", "first-missing-positive", "arrays-hashing"],
  // Block 2 — Two Pointers
  [7, 167, "Two Sum II - Input Array Is Sorted", "Medium", "two-sum-ii-input-array-is-sorted", "two-pointers"],
  [7, 15, "3Sum", "Medium", "3sum", "two-pointers"],
  [8, 88, "Merge Sorted Array", "Easy", "merge-sorted-array", "two-pointers"],
  [8, 11, "Container With Most Water", "Medium", "container-with-most-water", "two-pointers"],
  [9, 680, "Valid Palindrome II", "Easy", "valid-palindrome-ii", "two-pointers"],
  [9, 75, "Sort Colors", "Medium", "sort-colors", "two-pointers"],
  [10, 42, "Trapping Rain Water", "Hard", "trapping-rain-water", "two-pointers"],
  // Block 3 — Sliding Window
  [11, 3, "Longest Substring Without Repeating Characters", "Medium", "longest-substring-without-repeating-characters", "sliding-window"],
  [11, 424, "Longest Repeating Character Replacement", "Medium", "longest-repeating-character-replacement", "sliding-window"],
  [12, 567, "Permutation in String", "Medium", "permutation-in-string", "sliding-window"],
  [12, 209, "Minimum Size Subarray Sum", "Medium", "minimum-size-subarray-sum", "sliding-window"],
  [13, 76, "Minimum Window Substring", "Hard", "minimum-window-substring", "sliding-window"],
  [14, 239, "Sliding Window Maximum", "Hard", "sliding-window-maximum", "sliding-window"],
  // Block 4 — Stack & Monotonic Stack
  [15, 232, "Implement Queue using Stacks", "Easy", "implement-queue-using-stacks", "stack"],
  [15, 155, "Min Stack", "Medium", "min-stack", "stack"],
  [16, 394, "Decode String", "Medium", "decode-string", "stack"],
  [16, 22, "Generate Parentheses", "Medium", "generate-parentheses", "stack"],
  [17, 496, "Next Greater Element I", "Easy", "next-greater-element-i", "stack"],
  [17, 739, "Daily Temperatures", "Medium", "daily-temperatures", "stack"],
  [18, 84, "Largest Rectangle in Histogram", "Hard", "largest-rectangle-in-histogram", "stack"],
  // Block 5 — Binary Search
  [19, 278, "First Bad Version", "Easy", "first-bad-version", "binary-search"],
  [19, 33, "Search in Rotated Sorted Array", "Medium", "search-in-rotated-sorted-array", "binary-search"],
  [20, 153, "Find Minimum in Rotated Sorted Array", "Medium", "find-minimum-in-rotated-sorted-array", "binary-search"],
  [20, 875, "Koko Eating Bananas", "Medium", "koko-eating-bananas", "binary-search"],
  [21, 162, "Find Peak Element", "Medium", "find-peak-element", "binary-search"],
  [21, 981, "Time Based Key-Value Store", "Medium", "time-based-key-value-store", "binary-search"],
  [22, 4, "Median of Two Sorted Arrays", "Hard", "median-of-two-sorted-arrays", "binary-search"],
  // Block 6 — Linked List
  [23, 206, "Reverse Linked List", "Easy", "reverse-linked-list", "linked-list"],
  [23, 92, "Reverse Linked List II", "Medium", "reverse-linked-list-ii", "linked-list"],
  [24, 160, "Intersection of Two Linked Lists", "Easy", "intersection-of-two-linked-lists", "linked-list"],
  [24, 19, "Remove Nth Node From End of List", "Medium", "remove-nth-node-from-end-of-list", "linked-list"],
  [25, 234, "Palindrome Linked List", "Easy", "palindrome-linked-list", "linked-list"],
  [25, 143, "Reorder List", "Medium", "reorder-list", "linked-list"],
  [26, 142, "Linked List Cycle II", "Medium", "linked-list-cycle-ii", "linked-list"],
  [26, 202, "Happy Number", "Easy", "happy-number", "linked-list"],
  [27, 138, "Copy List with Random Pointer", "Medium", "copy-list-with-random-pointer", "linked-list"],
  [28, 146, "LRU Cache", "Medium", "lru-cache", "linked-list"],
  [28, 25, "Reverse Nodes in k-Group", "Hard", "reverse-nodes-in-k-group", "linked-list"],
  // Block 7 — Trees & BST
  [29, 543, "Diameter of Binary Tree", "Easy", "diameter-of-binary-tree", "trees"],
  [29, 236, "Lowest Common Ancestor of a Binary Tree", "Medium", "lowest-common-ancestor-of-a-binary-tree", "trees"],
  [30, 572, "Subtree of Another Tree", "Easy", "subtree-of-another-tree", "trees"],
  [30, 102, "Binary Tree Level Order Traversal", "Medium", "binary-tree-level-order-traversal", "trees"],
  [31, 199, "Binary Tree Right Side View", "Medium", "binary-tree-right-side-view", "trees"],
  [31, 98, "Validate Binary Search Tree", "Medium", "validate-binary-search-tree", "trees"],
  [32, 230, "Kth Smallest Element in a BST", "Medium", "kth-smallest-element-in-a-bst", "trees"],
  [32, 105, "Construct Binary Tree from Preorder and Inorder Traversal", "Medium", "construct-binary-tree-from-preorder-and-inorder-traversal", "trees"],
  [33, 124, "Binary Tree Maximum Path Sum", "Hard", "binary-tree-maximum-path-sum", "trees"],
  [33, 297, "Serialize and Deserialize Binary Tree", "Hard", "serialize-and-deserialize-binary-tree", "trees"],
  // Block 8 — Heaps / Priority Queue
  [34, 215, "Kth Largest Element in an Array", "Medium", "kth-largest-element-in-an-array", "heap-priority-queue"],
  [34, 973, "K Closest Points to Origin", "Medium", "k-closest-points-to-origin", "heap-priority-queue"],
  [35, 621, "Task Scheduler", "Medium", "task-scheduler", "heap-priority-queue"],
  [35, 295, "Find Median from Data Stream", "Hard", "find-median-from-data-stream", "heap-priority-queue"],
  [36, 23, "Merge k Sorted Lists", "Hard", "merge-k-sorted-lists", "heap-priority-queue"],
  // Block 9 — Backtracking
  [37, 78, "Subsets", "Medium", "subsets", "backtracking"],
  [37, 39, "Combination Sum", "Medium", "combination-sum", "backtracking"],
  [38, 46, "Permutations", "Medium", "permutations", "backtracking"],
  [38, 90, "Subsets II", "Medium", "subsets-ii", "backtracking"],
  [39, 79, "Word Search", "Medium", "word-search", "backtracking"],
  [39, 131, "Palindrome Partitioning", "Medium", "palindrome-partitioning", "backtracking"],
  [40, 51, "N-Queens", "Hard", "n-queens", "backtracking"],
  // Block 10 — Tries
  [41, 208, "Implement Trie (Prefix Tree)", "Medium", "implement-trie-prefix-tree", "tries"],
  [41, 211, "Design Add and Search Words Data Structure", "Medium", "design-add-and-search-words-data-structure", "tries"],
  // Block 11 — Graphs
  [42, 200, "Number of Islands", "Medium", "number-of-islands", "graphs"],
  [42, 994, "Rotting Oranges", "Medium", "rotting-oranges", "graphs"],
  [43, 133, "Clone Graph", "Medium", "clone-graph", "graphs"],
  [43, 417, "Pacific Atlantic Water Flow", "Medium", "pacific-atlantic-water-flow", "graphs"],
  [44, 207, "Course Schedule", "Medium", "course-schedule", "graphs"],
  [44, 210, "Course Schedule II", "Medium", "course-schedule-ii", "graphs"],
  [45, 684, "Redundant Connection", "Medium", "redundant-connection", "graphs"],
  [45, 323, "Number of Connected Components in an Undirected Graph", "Medium", "number-of-connected-components-in-an-undirected-graph", "graphs"],
  [46, 127, "Word Ladder", "Hard", "word-ladder", "graphs"],
  [47, 269, "Alien Dictionary", "Hard", "alien-dictionary", "graphs"],
  [47, 743, "Network Delay Time", "Medium", "network-delay-time", "advanced-graphs"],
  // Block 12 — Bit Manipulation
  [48, 136, "Single Number", "Easy", "single-number", "bit-manipulation"],
  [48, 338, "Counting Bits", "Easy", "counting-bits", "bit-manipulation"],
  // Block 13 — 1-D DP
  [49, 70, "Climbing Stairs", "Easy", "climbing-stairs", "1d-dynamic-programming"],
  [49, 198, "House Robber", "Medium", "house-robber", "1d-dynamic-programming"],
  [50, 213, "House Robber II", "Medium", "house-robber-ii", "1d-dynamic-programming"],
  [50, 322, "Coin Change", "Medium", "coin-change", "1d-dynamic-programming"],
  [51, 139, "Word Break", "Medium", "word-break", "1d-dynamic-programming"],
  [51, 300, "Longest Increasing Subsequence", "Medium", "longest-increasing-subsequence", "1d-dynamic-programming"],
  [52, 91, "Decode Ways", "Medium", "decode-ways", "1d-dynamic-programming"],
  [52, 5, "Longest Palindromic Substring", "Medium", "longest-palindromic-substring", "1d-dynamic-programming"],
  // Block 14 — 2-D DP, Intervals, Greedy
  [53, 62, "Unique Paths", "Medium", "unique-paths", "2d-dynamic-programming"],
  [53, 1143, "Longest Common Subsequence", "Medium", "longest-common-subsequence", "2d-dynamic-programming"],
  [54, 416, "Partition Equal Subset Sum", "Medium", "partition-equal-subset-sum", "2d-dynamic-programming"],
  [54, 72, "Edit Distance", "Medium", "edit-distance", "2d-dynamic-programming"],
  [55, 56, "Merge Intervals", "Medium", "merge-intervals", "intervals"],
  [55, 57, "Insert Interval", "Medium", "insert-interval", "intervals"],
  [56, 55, "Jump Game", "Medium", "jump-game", "greedy"],
  [56, 45, "Jump Game II", "Medium", "jump-game-ii", "greedy"],
  [57, 253, "Meeting Rooms II", "Medium", "meeting-rooms-ii", "intervals"],
  [57, 134, "Gas Station", "Medium", "gas-station", "greedy"],
];

async function main() {
  console.log(`${P.length} problems in the plan (expect 105)`);
  const entries = [];
  let verified = 0;
  const problems: string[] = [];
  for (const [day, number, title, difficulty, slug, pattern] of P) {
    const live = await lookupLc(slug);
    if (!live) {
      problems.push(`UNVERIFIED (lookup failed): ${number}. ${title} → ${slug}`);
    } else if (live.number != null && live.number !== number) {
      problems.push(
        `NUMBER MISMATCH: expected ${number}. ${title} but ${slug} is #${live.number} (${live.title})`
      );
    } else {
      verified++;
    }
    entries.push({
      day,
      number,
      title,
      difficulty,
      slug,
      url: `https://leetcode.com/problems/${slug}/`,
      pattern,
    });
  }
  fs.writeFileSync("src/data/plan-57.json", JSON.stringify(entries, null, 1));
  console.log(`verified against LeetCode: ${verified}/${P.length}`);
  for (const p of problems) console.log("  ⚠ " + p);
  console.log("wrote src/data/plan-57.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
