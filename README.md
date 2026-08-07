# Recall

A memory engine for your LeetCode practice. Paste the Problem Log summary from
your Claude tutoring session; Recall parses it, derives a review grade from how
the solve actually went, schedules spaced-repetition reviews with
[FSRS](https://github.com/open-spaced-repetition/ts-fsrs), and mirrors due
dates onto your calendar.

## Run it

```bash
npm install
npm run db:push        # create/update the SQLite schema (data/recall.db)
npm run import:sheet   # one-time: seed from the DSA Google Sheet history
npm run dev            # http://localhost:3000
```

## Daily loop

1. Solve a problem with your Claude tutor (the tutor Skill ends the session
   with a Problem Log summary).
2. **Log** → paste → Parse → confirm → Save. (~15 seconds)
3. Each morning, **Today** shows what's due. Each review is a 2-minute
   approach recall: name the pattern, state the invariant, give the
   complexity — then reveal and grade yourself honestly.

## The Problem Log template

Anything close to this parses perfectly (free-form text also works, best-effort;
set `ANTHROPIC_API_KEY` to parse messy summaries with Claude):

```
## Problem Log — 49. Group Anagrams
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
Suggested grade: hard — needed hints for the invariant
```

Grades: `again` (couldn't do it) · `hard` (hints/slow/low confidence) ·
`good` (solo with friction) · `easy` (instant + optimal). The tutor's
suggested grade wins; otherwise Recall derives it from the signals.

## Calendar

Subscribe once in Google Calendar: **Other calendars → From URL** →
`http://<host>:3000/api/calendar/dev.ics` (set `CALENDAR_TOKEN` to change the
secret). Overdue reviews appear on today. Note: Google only refreshes
subscribed feeds every 12–24h, which is fine for multi-day intervals; Apple
Calendar refreshes faster. While the app only runs on localhost the feed can't
be reached by Google's servers — use the in-app Today queue as primary (it is
anyway), or deploy first.

## MCP — let the tutoring chat log problems itself

Recall is also an MCP server at `/api/mcp` (tools: `add_problem`,
`get_due_reviews`, `log_review`, `get_stats`). With the dev server running,
connect Claude Code:

```bash
claude mcp add --transport http recall http://localhost:3000/api/mcp --header "Authorization: Bearer dev"
```

(Replace `dev` if you set `MCP_TOKEN`.) Then at the end of a tutoring session,
say **"log it"** — Claude calls `add_problem` directly, zero copy-paste. For
claude.ai custom connectors the endpoint must be publicly reachable, i.e.
after deployment.

The tutor prompt in [docs/tutor-prompt.md](docs/tutor-prompt.md) is written to
use these tools when available and fall back to the paste template otherwise.

## Insights

`/insights` — activity heatmap, felt-vs-actual calibration (fed by the review
player's pre-reveal confidence slider), confidence trend, per-pattern mastery,
and grade distribution. Sparse until you've logged a few weeks of reviews.

## Environment (.env)

| Variable            | Default          | Purpose                                   |
| ------------------- | ---------------- | ----------------------------------------- |
| `DATABASE_PATH`     | `data/recall.db` | SQLite location                           |
| `CALENDAR_TOKEN`    | `dev`            | Secret in the ICS feed URL                |
| `ANTHROPIC_API_KEY` | —                | Enables AI parsing of free-form summaries |
| `PARSE_MODEL`       | Haiku 4.5        | Model for AI parsing                      |
| `MCP_TOKEN`         | `dev`            | Bearer token for the MCP endpoint         |
| `RECALL_USER_ID`    | `shreet`         | Row owner (multi-user later)              |

## Deploy (Vercel + Turso)

The app runs on local SQLite with zero setup; setting `TURSO_DATABASE_URL`
switches it to [Turso](https://turso.tech) (hosted libSQL — same schema, same
queries). Deployed instances should also set `APP_PASSWORD`, which activates
the login gate on every page and API (the MCP endpoint and ICS feed keep their
own tokens).

One-time, interactive (browser OAuth — only steps a human can do):

```bash
turso auth signup
```

```bash
npx vercel login
```

Then, from `recall/`:

1. `sqlite3 data/recall.db "PRAGMA wal_checkpoint(TRUNCATE);"` then
   `turso db create recall --from-file data/recall.db` — creates the cloud DB
   *with all existing data*.
2. `turso db show recall --url` and `turso db tokens create recall` → the two
   `TURSO_*` values.
3. `npx vercel link`, add env vars (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
   `APP_PASSWORD`, `CALENDAR_TOKEN`, `MCP_TOKEN`, optionally
   `ANTHROPIC_API_KEY`), then `npx vercel --prod`.

After deploy:

- **Calendar**: Google Calendar → Other calendars → From URL →
  `https://<app>.vercel.app/api/calendar/<CALENDAR_TOKEN>.ics` (now reachable
  by Google's servers, so it actually syncs).
- **MCP from claude.ai**: Settings → Connectors → Add custom connector →
  `https://<app>.vercel.app/api/mcp` with header
  `Authorization: Bearer <MCP_TOKEN>`.
- **Note**: local SQLite and Turso are now separate databases. Treat the
  deployed app as the source of truth; for cloud-backed local dev, put the
  `TURSO_*` values in `.env`.

## Architecture notes

- Next.js 16 App Router · Tailwind v4 + shadcn/ui (Base UI) · Drizzle +
  better-sqlite3 · ts-fsrs (FSRS-6, long-term mode, retention 0.9, max
  interval 365d, first interval floored at 2 days).
- Every table carries `user_id` so multi-user (Supabase/Postgres + auth) is a
  migration, not a rewrite.
- A re-solve of an existing problem (same slug) logs a review against the
  existing record — never a duplicate row.
- Roadmap: concept-level scheduling (a fundamentals table that schedules the
  *skill*, not just the problem); sibling-problem substitution on mature cards;
  deployment (Vercel + Supabase) so the calendar feed and claude.ai connector
  work from anywhere.
