<h1 align="center">Recall</h1>

<p align="center">
  <strong>A memory engine for LeetCode practice.</strong><br>
  Most people re-solve problems they already know and never revisit the ones
  that actually broke them. Recall fixes that by scheduling reviews from
  <em>how the solve really went</em> — not from how you felt about it afterwards.
</p>

<p align="center">
  <a href="https://github.com/ShreeBohara/recall-leetcode/actions/workflows/ci.yml">
    <img alt="CI" src="https://github.com/ShreeBohara/recall-leetcode/actions/workflows/ci.yml/badge.svg">
  </a>
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-black?logo=next.js">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Drizzle + Turso" src="https://img.shields.io/badge/Drizzle-Turso%20%2F%20SQLite-C5F74F">
  <img alt="FSRS-6" src="https://img.shields.io/badge/scheduler-FSRS--6-f0b429">
</p>

<p align="center">
  <a href="https://recall-shrees-projects-a339427d.vercel.app"><strong>Live instance</strong></a>
  — passphrase-gated, since it holds one person's real practice history.
  The screenshots below are the actual app.
</p>

![Recall dashboard — due reviews, streak, forecast and weakest areas](docs/screenshots/dashboard.png)

## The idea

A flashcard app asks *"did you remember this?"* and takes your word for it.
That question is useless for algorithms, because the thing you need to recall
isn't a fact — it's **the approach**: which pattern applies, why it works, and
what it costs.

So Recall does two things differently.

**The grade is derived, not self-reported.** You finish a tutoring session and
paste (or auto-log) a summary of what happened: hints used, how fast the
approach came, confidence before and after, what went wrong. Recall turns those
signals into an [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) grade
itself. You never rate your own memory, because people are bad at it — and the
calibration chart exists to prove exactly how bad.

```mermaid
flowchart LR
    sig["<b>What happened in the session</b><br/>hints used &middot; recall speed<br/>confidence before / after<br/>mistakes made"]
    tutor{"did the tutor<br/>suggest a grade?"}
    use["<b>use it</b><br/>auditable, a human judged it"]
    derive["<b>deriveGrade()</b><br/>infer from the signals"]
    grade(["<b>again</b> &middot; <b>hard</b> &middot; <b>good</b> &middot; <b>easy</b>"])
    fsrs["<b>applyReview()</b><br/>updates the FSRS-6 card:<br/>stability &middot; difficulty &middot; reps"]
    due(["<b>next due date</b>"])
    out["Today queue &middot; calendar feed<br/>14-day forecast &middot; catch-up plan"]

    sig --> tutor
    tutor -- "yes" --> use
    tutor -- "no" --> derive
    use --> grade
    derive --> grade
    grade --> fsrs --> due --> out

    classDef sigcls  fill:#3b4a63,stroke:#232c40,color:#ffffff
    classDef gradecls fill:#f0b429,stroke:#a8761c,color:#161616
    classDef fsrscls fill:#2f6f4f,stroke:#1d4733,color:#ffffff
    class sig sigcls
    class grade,due gradecls
    class fsrs fsrscls
```

**A review is a recall, not a re-read.** The answer ships hidden. You say the
pattern, the invariant and the complexity out loud first, *then* reveal. The
recommender is built around the same rule: when it suggests your next problem it
deliberately withholds the pattern, because recognising it is the skill being
trained.

<p align="center">
  <img alt="The review player with the answer still hidden" src="docs/screenshots/review.png" width="820">
</p>

## The loop

1. Solve a problem with your Claude tutor. The session ends with a Problem Log.
2. **Log it** — paste it, or let Claude call the MCP tool directly. ~15 seconds.
3. Each morning **Today** shows what's due. Two minutes per card: name the
   pattern, state the invariant, give the complexity, reveal, grade honestly.

Due dates also mirror onto your calendar, so the queue finds you even when you
don't open the app.

## Architecture

Three ways in, one way to write, one scheduler. Bold arrows mutate; dotted
arrows only read.

```mermaid
flowchart LR
    chat["Claude<br/>tutoring session"]
    browser["Browser"]
    calapp["Calendar app"]

    subgraph edge["Next.js 16 &mdash; every request passes src/proxy.ts"]
        direction TB
        mcp["<b>/api/mcp</b><br/>7 tools &middot; bearer token"]
        pages["<b>Today &middot; Review</b><br/><b>Library &middot; Insights</b><br/>server components"]
        rest["<b>/api/problems</b><br/><b>/api/reviews</b>"]
        ics["<b>/api/calendar/….ics</b><br/>token in URL"]
    end

    subgraph core["src/lib &mdash; the only two functions that write"]
        direction TB
        save["<b>saveParsedSummary()</b><br/>new solve or re-solve"]
        logr["<b>logReview()</b><br/>a graded review"]
        sched["<b>applyReview()</b><br/>ts-fsrs &middot; FSRS-6"]
    end

    db[("<b>Drizzle ORM</b><br/>Turso libSQL deployed<br/>better-sqlite3 local")]

    chat --> mcp
    browser --> pages
    calapp --> ics
    pages --> rest

    mcp ==> save
    mcp ==> logr
    rest ==> save
    rest ==> logr
    save ==> sched
    logr ==> sched
    sched ==> db

    pages -.-> db
    ics -.-> db
    mcp -.-> db

    classDef client fill:#f0b429,stroke:#a8761c,color:#161616
    classDef writer fill:#2f6f4f,stroke:#1d4733,color:#ffffff
    classDef store  fill:#3b4a63,stroke:#232c40,color:#ffffff
    class chat,browser,calapp client
    class save,logr,sched writer
    class db store
```

**Built with** Next.js 16 App Router · React 19 · TypeScript (strict) ·
Tailwind v4 + shadcn/ui on Base UI · Drizzle ORM · ts-fsrs (FSRS-6, long-term
mode, retention 0.9, max interval 365d, first interval floored at 2 days).

The shape worth noticing: **exactly two functions in the whole codebase write
to the database** — `saveParsedSummary()` for a solve, `logReview()` for a
graded review — and both reach the scheduler through the same `applyReview()`.
The MCP tool and the web form are two doors into one funnel, so logging from a
Claude session and logging from the browser cannot drift into producing
different rows.

### Where things live

```
src/
  proxy.ts              passphrase gate; MCP + .ics carry their own tokens
  app/
    page.tsx            Today — due queue, streak, forecast
    review/             the answer-hidden review player
    log/  library/  insights/
    api/
      mcp/              MCP server, 7 tools (+ /[token] for claude.ai)
      calendar/[token]/ dynamic .ics feed
      problems/  reviews/  parse/  settings/  backlog/
  lib/
    data.ts             every query + the two write paths
    fsrs.ts             grade rubric and FSRS scheduling
    recommend.ts        what to solve next (pattern-blind on purpose)
    parser.ts           Problem Log → structured summary
    patterns.ts         canonical pattern vocabulary + aliases
    records.ts          streaks, freezes, personal records
    coach.ts            weekly report data
  db/
    schema.ts           9 tables, Drizzle
    index.ts            runtime driver choice
drizzle/                migration files (0000_baseline.sql onward)
scripts/                4 test suites, backup, seeding, plan builder
```

### Decisions worth reading

| | |
|---|---|
| **The grade is evidence, not a vote** | [`src/lib/fsrs.ts`](src/lib/fsrs.ts) — `deriveGrade()` maps solve signals to an FSRS rating; a tutor's explicit grade wins, otherwise it's inferred |
| **Answer-hiding as a type** | [`src/lib/recommend.ts`](src/lib/recommend.ts) — `NextAction.solve` has *no* pattern fields, because that object crosses into a client component |
| **Two doors, one funnel** | [`src/app/api/mcp/route.ts`](src/app/api/mcp/route.ts) and the paste form both call the same `saveParsedSummary` |
| **One schema, two drivers** | [`src/db/index.ts`](src/db/index.ts) — libSQL over HTTP when deployed, better-sqlite3 locally, chosen at runtime |
| **Day math is the product** | `TZ` is assigned unconditionally at startup; a streak that silently shifts by a day is a broken app |
| **A backup that proves itself** | [`scripts/backup.ts`](scripts/backup.ts) — rebuilds a real SQLite file, reopens it, and checks domain invariants before calling it a backup |

## Insights

![Insights — activity heatmap, calibration, pattern mastery and review outcomes](docs/screenshots/insights.png)

The calibration chart is the one that earns the design. Grey is perfect
calibration; amber is your actual recall rate at each confidence level. Amber
sitting below grey at 4/5 and 5/5 means you are overconfident — which is
exactly the failure mode that makes people skip the reviews they most need,
and the reason Recall never asks you to grade your own memory.

Alongside it: an activity heatmap, confidence over time, per-pattern mastery
weighted toward recent grades, and the spread of review outcomes. Sparse until
a few weeks of reviews have accumulated.

## Run it

```bash
npm install
npm run db:migrate     # create/update the schema from drizzle/
npm run seed:lists     # one-time: seed the problem list and make it active
npm run dev            # http://localhost:3000
```

Works immediately on local SQLite with no accounts and no cloud setup.

Skip `seed:lists` and there is no active list, so the recommender has nothing
to draw from and "what should I solve next" stays empty.

> **These follow your `.env`, not the filename above.** `drizzle.config.ts`
> loads dotenv, so if `TURSO_DATABASE_URL` is set (see
> [Deploy](#deploy-vercel--turso)) then `db:migrate`, `db:push` and
> `import:sheet` target the **deployed** database, not `data/recall.db`. Unset
> the `TURSO_*` vars for a purely local run.

`npm run import:sheet` is a one-time historical import from the original Google
Sheet; it is not part of a normal setup.

## Tests

```bash
npm test               # parser, identity ladder, FSRS scheduler, timezone
```

No test runner — each suite is a plain `tsx` script that exits non-zero on
failure. The DB-backed suites seed a scratch SQLite file in `os.tmpdir()` and
never touch a real database. All four run in CI
(`.github/workflows/ci.yml`) alongside lint, typecheck, `drizzle-kit check`
and a production build.

Each suite covers something that fails *silently* rather than loudly — the
only kind of bug that survives in a single-user app:

| Suite | Guards against |
|---|---|
| `test:parser` | a misread log writing the wrong FSRS grade |
| `test:identity` | the lcSlug → slug → number → bare-slug ladder drifting apart |
| `test:fsrs` | the scheduler quietly returning the wrong next date |
| `test:tz` | day-boundary math shifting when `TZ` is preset by the host |

One thing `test:fsrs` documents rather than enforces: `maximum_interval: 365`
is a *soft* cap. `LongTermScheduler.next_interval` clamps each grade and then
enforces `again < hard < good < easy`, so a fully saturated card settles at
365/366/367/368 days rather than 365. Harmless, but surprising if unexplained.

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

## MCP — let the tutoring chat log problems itself

Recall is also an MCP server at `/api/mcp`. Tools: `get_next_action` (call it
first — it returns the day's plan), `add_problem`, `get_due_reviews`,
`log_review`, `get_stats`, `get_weekly_report_data`, `save_coach_report`. With
the dev server running, connect Claude Code:

```bash
claude mcp add --transport http recall http://localhost:3000/api/mcp --header "Authorization: Bearer dev"
```

(Replace `dev` if you set `MCP_TOKEN`.) Then at the end of a tutoring session,
say **"log it"** — Claude calls `add_problem` directly, zero copy-paste. For
claude.ai custom connectors the endpoint must be publicly reachable, i.e.
after deployment.

`get_next_action` omits the recommended problem's pattern from its reply on
purpose: tool results are visible to the user in most MCP clients, and the
pattern is the answer.

The tutor prompt in [docs/tutor-prompt.md](docs/tutor-prompt.md) is written to
use these tools when available and fall back to the paste template otherwise.

## Library and calendar

![The problem library with full review history per problem](docs/screenshots/library.png)

Every problem keeps its approaches, key insight and full review journal. The
detail page reuses the review player's reveal, so browsing your own notes
doesn't spoil a problem still sitting in the queue.

For the calendar, subscribe once in Google Calendar: **Other calendars → From
URL** → `http://<host>:3000/api/calendar/dev.ics` (set `CALENDAR_TOKEN` to
change the secret). Overdue reviews appear on today. Google only refreshes
subscribed feeds every 12–24h, which is fine for multi-day intervals; Apple
Calendar refreshes faster. While the app only runs on localhost the feed can't
be reached by Google's servers — use the in-app Today queue as primary (it is
anyway), or deploy first.

## Backups

```bash
npm run backup                          # verified snapshot
npm run backup:verify backups/<file>.db # re-verify an existing one
```

A snapshot is only a backup if it opens and makes sense, so the script reopens
what it wrote and checks integrity, foreign keys, exact row counts, and the
domain invariants that decide whether the data is actually restorable. Anything
that fails is renamed `*.FAILED.db` rather than kept — a backup that looks like
protection but isn't is worse than none. See
[`deploy/backup/README.md`](deploy/backup/README.md) for scheduling and the
restore drill.

## Environment (.env)

| Variable            | Default             | Purpose                                       |
| ------------------- | ------------------- | --------------------------------------------- |
| `DATABASE_PATH`     | `data/recall.db`    | SQLite location                               |
| `CALENDAR_TOKEN`    | `dev` — see below   | Secret in the ICS feed URL                    |
| `MCP_TOKEN`         | `dev` — see below   | Bearer token for the MCP endpoint             |
| `ANTHROPIC_API_KEY` | —                   | Enables AI parsing of free-form summaries     |
| `PARSE_MODEL`       | Haiku 4.5           | Model for AI parsing                          |
| `RECALL_USER_ID`    | `shreet`            | Row owner (multi-user later)                  |
| `APP_TIMEZONE`      | `America/Los_Angeles` | Timezone all day math uses (streaks, "due today") |
| `APP_URL`           | Vercel URL, else localhost | Base URL the MCP tools put in their replies |

> The `dev` fallback for `CALENDAR_TOKEN` and `MCP_TOKEN` is **local-only**. It
> is revoked the moment `APP_PASSWORD` is set or `NODE_ENV=production`, because
> those two routes are exempt from the login gate and a shared default would
> leave them open. On a gated instance, set both explicitly or the ICS feed and
> the MCP endpoint return "Not found" / 401. See `src/lib/secrets.ts`.
>
> Set `APP_TIMEZONE`, not `TZ`, to change the app's day boundary — `TZ` is
> overwritten at startup (`src/db/index.ts`) because the deploy platform
> presets it to UTC.

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

## Data and schema notes

- Every *user-owned* table carries `user_id`, so multi-user is a migration
  rather than a rewrite. The three that don't are not user-scoped:
  `list_items` (owned by its list), `problem_concepts` (a join table), and
  `problems_catalog` (a shared cache of public LeetCode metadata).
- A re-solve of an existing problem logs a review against the existing record —
  never a duplicate row. Identity resolves lcSlug → slug → number → exact bare
  slug, in one place (`findProblem` in `src/lib/data.ts`).
- Schema changes go through migration files: edit `src/db/schema.ts`, then
  `npm run db:generate` to emit reviewable SQL into `drizzle/`, then
  `npm run db:migrate` to apply it. `drizzle/0000_baseline.sql` is a baseline —
  it describes the schema as it already existed when migrations were adopted,
  and is recorded as applied, so it never re-runs against a live database.
- `npm run db:push` still exists but is for throwaway/scratch databases only.
  Against a database with real rows, push resolves a column rename or a new
  `NOT NULL` column without a default by **recreating the table**, with no SQL
  to review and nothing to roll back to. Use `db:generate` + `db:migrate`.
- Roadmap: concept-level scheduling (the `concepts` / `problem_concepts` tables
  are declared and waiting for it); sibling-problem substitution on mature cards.

## License

[MIT](LICENSE) © Shree Bohara

---

<p align="center"><sub>
Screenshots use a generated sample history so the charts are legible.
Built as a personal tool — the design decisions assume one user who is honest with themselves.
</sub></p>
