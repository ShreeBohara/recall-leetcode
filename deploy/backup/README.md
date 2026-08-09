# Backups

The deployed Turso database is the only durable copy of a review history that
cannot be reconstructed. Turso's free plan keeps 24 hours of point-in-time
recovery. Before `scripts/backup.ts` the only other copies were two files made
by hand immediately before a risky operation, both on one laptop.

## What the script does

```bash
npm run backup                          # snapshot whatever the env points at
npm run backup:verify backups/<file>.db # re-verify an existing snapshot
```

It reads every table, rebuilds a real SQLite file using the committed
`drizzle/0000_baseline.sql` as the schema, then **reopens what it wrote and
proves it**:

- `integrity_check` and `foreign_key_check`
- table and row counts match the source exactly
- every stored `fsrs_card` is valid JSON
- no started, reviewable problem is missing its due date
- every review points at a real problem
- the JSON-in-text columns all parse

A snapshot that fails verification is renamed `*.FAILED.db` rather than deleted
or silently kept — a backup that looks fine but isn't is worse than none.

It also carries over `__drizzle_migrations`. A restored database without it
would make `drizzle-kit migrate` try to re-apply the baseline over populated
tables.

`--keep N` (default 14) prunes older snapshots. `backups/` is gitignored.

## Targeting production

Same rule as the rest of the repo: `TURSO_DATABASE_URL` set means the deployed
database, otherwise `DATABASE_PATH`. Use a **read-only** token — the script
never writes to its source, and the credential should enforce that rather than
rely on the code being correct:

```bash
turso db tokens create recall --read-only --expiration 30d
```

## Restore drill

Run this occasionally. An unrehearsed backup is a guess.

```bash
cp backups/<snapshot>.db /tmp/restored.db
DATABASE_PATH=/tmp/restored.db npx drizzle-kit migrate   # must be a no-op
DATABASE_PATH=/tmp/restored.db npm run dev               # app should look normal
```

To actually restore production from a snapshot:

```bash
turso db import --from-file backups/<snapshot>.db recall-restored
# verify the new DB, then repoint TURSO_DATABASE_URL at it
```

Restoring into a *new* database rather than over the live one is deliberate:
it keeps the damaged original around for comparison.

## Scheduling

**Today — local, no accounts needed.** `com.recall.backup.plist` runs the
snapshot nightly at 03:15 via launchd. Install instructions are in the file's
header comment.

Two things in that file are load-bearing and easy to "clean up" by mistake:

- **Credentials come from `~/.config/recall/backup.env`, not the repo's
  `.env`.** Putting `TURSO_*` in the repo would also silently retarget
  `db:migrate`, `db:push` and `import:sheet` at production, because
  `drizzle.config.ts` loads dotenv. Keeping the read-only token outside the
  repo scopes it to the backup and leaves that trap disarmed. Create it with:

  ```bash
  mkdir -p ~/.config/recall && umask 077
  printf 'TURSO_DATABASE_URL=%s\nTURSO_AUTH_TOKEN=%s\n' \
    "$(turso db show recall --url)" \
    "$(turso db tokens create recall --read-only --expiration 365d)" \
    > ~/.config/recall/backup.env
  ```

- **`nvm use 20` is required.** A launchd login shell resolves Homebrew's node
  (v25, `NODE_MODULE_VERSION` 141), while `better-sqlite3`'s native binding is
  built against nvm's v20 (ABI 115). Without the pin the job connects to Turso
  and *then* dies with "compiled against a different Node.js version" — it
  fails loudly rather than silently, but it fails.

Check it actually ran:

```bash
launchctl list | grep recall     # is it loaded
tail -20 /tmp/recall-backup.log  # what happened last night
ls -lt backups/                  # newest snapshot
```

Its limitation, stated plainly: it only fires while this Mac is awake, and the
snapshots sit on the same disk as everything else. That covers "I broke the
schema at 2am", which is the failure that has nearly happened. It does not
cover losing the laptop. Pointing `--out` at a synced folder (iCloud, Dropbox)
closes most of that gap for free.

**Off-machine.** The snapshot logic is deliberately storage-agnostic: it
produces a verified file and does not care where it goes. Any scheduled
container that can reach Turso can run it and upload the result.

Two things rule out the obvious "just use a GitHub Actions cron" for this repo
specifically, and they are worth knowing before reaching for it:

1. **This repository is public.** Workflow artifacts are downloadable by anyone
   with read access, and on a public repo that is everyone. A database dump
   published as an artifact is a public database dump.
2. **GitHub disables scheduled workflows in public repositories after 60 days
   of no commit activity.** The backup would stop exactly when the project went
   quiet — which is precisely when nobody would notice.

So an off-machine schedule needs its own compute and its own object storage
with a private credential. That is the one piece not built here, because it
requires a cloud subscription.
