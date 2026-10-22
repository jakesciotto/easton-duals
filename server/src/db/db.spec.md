# Database
libSQL through drizzle: a file on the gym box, Turso in production, migrations on purpose.

## invariants
- file boot only: A boot migrates only a file database.
  over: a file url and an in-memory file url, against a libsql url and an https url
  via: a boot migrates only a file database
  because: autoMigrates answers true only for a file url, so the LAN entry migrates the gym box file and a dev server with Turso credentials never migrates production; on 2026-09-08 a boot migration dropped two columns the live build still read
  refuted: autoMigrates always answers true -> the test a boot migrates only a file database went red (2026-10-22)
  kinds: deploy
  checklist: graceful-drain dismissed: the predicate admits no work and drains none
  checklist: readiness-evidence dismissed: the predicate decides whether a boot migrates, not whether the server is ready
  checklist: declared-target-coverage dismissed: a boot holds one database url and fans out to no target
- url from env: The database url comes from the environment with a local file default.
  over: DB_PATH beside Turso credentials, Turso credentials alone, a DATA_DIR alone, and a DATA_DIR that holds duals.db, duels.db or neither
  via: the database url comes from the environment with a local file default
  because: an explicit DB_PATH wins over Turso so the e2e and a local run never reach the remote database, and a gym box that still holds duels.db keeps it after the rename
  refuted: removed the DB_PATH branch of dbUrlFromEnv -> the test the database url comes from the environment with a local file default went red (2026-10-22)
  kinds: deploy
  checklist: graceful-drain dismissed: the function picks a url and admits no work
  checklist: readiness-evidence dismissed: the function picks a url and reports no readiness
  checklist: declared-target-coverage dismissed: one environment names one database url
- rebuild keeps events: Migration 0012 keeps every scoring event, numbers each event's matches by order index and puts the foreign keys back.
  over: a database migrated to 0011 and seeded with two events, four matches and five scoring events, then migrated to 0012
  via: migration 0012 adds divisions, numbers, styles and feeds
  because: the libsql migrator runs inside one transaction where the foreign key pragma does nothing, so a rebuild that dropped a referenced table would cascade every scoring event away; 0012 rebuilds match_events without its key first, then matches, then restores the key
  crossing: operator -> store
  entrances: none
  refuted: the first match_events copy in 0012 keeps only seq below 4 -> the test migration 0012 adds divisions, numbers, styles and feeds went red (2026-10-22)
  kinds: storage
  checklist: scoped-reads dismissed: a migration reads every row of the tables it rebuilds, by design
  checklist: encrypted-storage dismissed: no column the migration touches holds a secret
  checklist: key-rotation-compatibility dismissed: nothing encrypted is retained
  checklist: input-validation dismissed: the migration copies rows the old schema already accepted
  checklist: revision-preservation declared as rebuild keeps events
  checklist: commit-ordered-effects dismissed: the migration has no external effect
  checklist: durable-dispatch-intent dismissed: nothing is dispatched
  checklist: declared-target-coverage dismissed: one migration runs against one database
  checklist: completion-evidence dismissed: the migrator records the applied hash and no observer is declared
