# Database
libSQL through drizzle: a file on the gym box, Turso in production, migrations on purpose.

## invariants
- a boot migrates only a file database
- the database url comes from the environment with a local file default

## works when
- boundary "a boot migrates only a file database" at autoMigrates via guard "autoMigrates"
- boundary "the database url comes from the environment with a local file default" at dbUrlFromEnv via guard "dbUrlFromEnv"
- passes test "createDb retry wiring"
- passes test "migration 0012 adds divisions, numbers, styles and feeds"

## why
A boot may migrate only a `file:` database; a remote target is migrated on purpose with `npm
run db:migrate`, which takes `--to <tag>`. On 2026-09-08 a dev server in the main checkout ran
every pending migration against Turso and dropped two columns the live build still selected,
so every event read failed for two and a half hours while health stayed green. `npm run dev`
now sets `DB_PATH=./data/dev.db`; `DUELS_DEV_REMOTE=1` keeps the remote target.

Migrations are additive before a deploy; a column drop lands after the deploy that stops
reading it. A table rebuild never drops a table that something references, because Turso
enforces foreign keys and the libsql migrator batches inside one transaction where `PRAGMA
foreign_keys=OFF` is a no-op: rebuild the child without its foreign key, then the parent, then
the child with the key back (migration 0012). Rehearse with
`server/scripts/rehearse-migration.mjs` on a read-only copy of production first.

`@libsql/hrana-client` is pinned to 0.7.0 at the root. Newer clients hand Vercel's patched
fetch a request form that intermittently loses the Authorization header, and 0.8.0 ignores the
guard fetch injected into createClient.

## refutations
- a boot migrates only a file database: autoMigrates always returns true -> RED, "1 failed | 1 passed" in autoMigrates
- the database url comes from the environment with a local file default: removed the DB_PATH branch of dbUrlFromEnv -> RED, "1 failed | 2 passed" in dbUrlFromEnv
