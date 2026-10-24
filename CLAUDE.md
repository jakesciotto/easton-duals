# CLAUDE.md

Context for agents working in this repository. The durable truth about the code lives in the
`*.spec.md` files. This file carries the rules and the lessons the specs cannot hold. The record before 2026-10-01 (plans, mockups, the decisions log) sits in
`~/backups/claude-project-dirs/easton-duals` on vinelab.

## Start here

1. Run `npx --no -- coherence query status` for the structural defects and open requirements, then `npx --no -- coherence work inspect` for the open orders.
2. Read the spec of the component you change: `easton-duals.spec.md`, then under `server/src/`: `shared/shared.spec.md`, `match/match.spec.md`, `audit/audit.spec.md`, `schedule/schedule.spec.md`, `formats/formats.spec.md`, `matchmaker/matchmaker.spec.md`, `auth/auth.spec.md`, `routes/routes.spec.md`, `roster/roster.spec.md`, `smoothcomp/smoothcomp.spec.md`, `live/live.spec.md`, `db/db.spec.md`, and `web/src/web.spec.md`.
3. Before you offer a branch run `npm test` (one batched run over both workspaces), `npx --no -- coherence spec --check` and `npx --no -- coherence run`.
4. Record a choice with `npx --no -- coherence decide` at the moment you make it.

## Repository rules

1. Never publish a password, an API key or a token to git, npm or Docker. The repository is public.
2. Never commit without Jake's explicit approval. Verify that no secret is included. gitleaks runs as the pre-commit hook and in CI.
3. Never commit `.env`, `data/` or a database file. All stay untracked.
4. The integration branch is `staging`. Branch from `staging` and target `staging`. `main` moves only by a fast-forward release on Jake's word.
5. Read the specs and `CHANGELOG.md` before you read the whole codebase.
6. No emoji in a commit message, a comment or a document. No en dash or em dash.
7. Release tags use semantic versioning. A release moves four version fields: the three package.json files (`npm version X --no-git-tag-version --workspaces --include-workspace-root`) and `VERSION` in `server/src/app.ts`. CI fails when they disagree.
8. TypeScript in `server/src` and `web/src`. Minimal comments; code reads without them.
9. Do not create files in temporary directories for scripting or testing without approval.

## Workflow

- Propose before you build anything with three or more steps. Write the design in chat and wait for a yes.
- Never mark a task complete without proof. Run the tests, the typecheck, the build and the e2e, and read the output. The build runs before the e2e, because the e2e spawns `node dist/index.js`.
- A per-task review only for a task that touches data integrity or the match state machine (a migration, a fill or advance path, scoring). Everything else merges on green gates. One scoped whole-branch review on Sonnet at the end.
- After a correction from Jake, record the pattern with `npx --no -- coherence decide`.
- Update `CHANGELOG.md` under `[Unreleased]` when work is confirmed finished.
- Run `npm run lint` at the root before every push: it runs `scripts/design-lint.mjs`, which the workspace lints skip.

## Testing

`npm test` at the root runs vitest over the `server` and `web` projects in one batch
(`server/test/**/*.test.ts`, `web/test/**/*.test.{ts,tsx}`). `npx --no -- coherence run` runs every
totality oracle the specs name in one batched vitest invocation.

A spec names an oracle by its describe title. An unnamed describe is kept until it is promoted to a bullet or retired by decision. To add an oracle:

1. Write the invariant as a bullet in the component spec's `## invariants` list.
2. Write one oracle whose `describe` title is the bullet's `via:` line. A uniform domain gets one loop over the live set with a floor; a non-uniform domain gets double-entry.
3. Break the source, run `npx --no -- coherence refute`, restore the source, and add the `refuted:` line.

## Environments

- Production is one Vercel function on Turso at https://www.eastonduals.com. Every push builds a preview.
- `npm run dev` uses a local file database (`data/dev.db`). `DUALS_DEV_REMOTE=1` points it at Turso (the old spelling `DUELS_DEV_REMOTE` still works); never do that with pending migration files in the tree.
- Turso is migrated on purpose with `npm run db:migrate` (`--to <tag>` for a release whose newest migration drops a column). Migration first, then deploy, always.
- The LAN entry (`server/src/index.ts`) is the gym box; it migrates its own file database at boot.
- Run `npm` under Node 22 (`/opt/homebrew/opt/node@22/bin`). npm 10 crashes resolving this tree; use npm 11 for a lock change and validate the lock with `npm ci` plus the gates.

## Lessons that cost a run

- A gate chain runs one command per line with `|| exit 1`. A heredoc inside an `&&` list once tagged a release one commit early.
- WellnessLiving's report `like` is case sensitive; only `` lower(`col`) like '%x%' `` works, and `ilike`, `collate nocase` and `regexp` hang the report. Prove a filter with a Title case name.
- A table rebuild never drops a table that something references (Turso enforces foreign keys; the pragma is a no-op inside the migrator's transaction). Rehearse on a copy of production first.
- A dialog whose content is the live state opts out of the snapshot hold with `data-poll-through`.
- A grid column minimum must exceed the row's fixed tracks.
- The client never clears the admin token on a 401 `bad_pin`: certify, unlock and delete re-check the PIN and a mistyped PIN must not sign the desk out. Any other 401 means the session is gone, and clearing the token sends the desk to the PIN gate on purpose.
- `vercel ls` prints to stderr; a piped command reports the last command's exit code.
- The fetch wrapper in `server/src/db/client.ts` rebuilds every libSQL request from primitives and retries a 401, because libsql intermittently drops the Authorization header on Vercel (Turso answers "empty JWT token"). Do not simplify it to pass Request objects through.
- SQLite binds at most 32766 variables in one statement, so bulk inserts go in slices.
- `server/src/roster/slug.ts` is a byte-for-byte copy of easton-leaderboard's `makeCompetitorId`; the ERP join depends on byte equality, so never change one without the other.
- `TEAM_COLORS` keys are stored in `teams.color`; renaming one needs a data migration. `TEAM_COLOR_LABELS` is what people see.
- The snapshot queue depth serves the deepest consumer (the board's one-mat view); a shallower cap starves a line the board reserved room for.
- `lanIp` ranks a Tailscale address below every private LAN address, because an iPad on the gym wifi cannot reach it.
- A test database is a unique temp file per `freshDb`, because libsql opens a fresh connection after each transaction and `:memory:` gives that connection an empty database.
- `overflow-x: auto` makes `overflow-y` compute to `auto`, so a table wrapper nested in a caller's scroll box makes the sticky head stick to the inner container; fold the caller's scroll into Table's `wrapperClassName`.
- tailwind-merge does not group the plain `.label` and t1, t2, t3 utility classes, so a consumer's className cannot override them; components spell those out or take a size prop.
- iOS Safari zooms on focus of any control under 16px and never zooms back; never fix it with `user-scalable=no`.
- Safari refuses `navigator.wakeLock.request()` and iOS refuses audio outside a user gesture; request both from the first tap, never from an effect.
- A disabled button has `pointer-events: none`, so a reason in its own title is unreachable; put the title on the cell and the reason in text named by aria-describedby.
- A closed base-ui popup stays in the portal with `data-closed`; a `[role=listbox]` query must exclude it.
- The Entry tab holds one entryId through every retry and a reload so the server dedupes a resend; a new id is minted only after a failure the server definitely refused. After a timeout, a dropped connection, a 5xx, 408 or 429 the first write may be on file and a new id would count the win twice.
- Arm an automatic retry with a rising number, not a boolean: React batches the stop and the restart into one render and a boolean stops the loop after one retry.
- A numeric track in `ch` resolves against the element's own font, so the grid that declares it carries the mono face.
- Every focus ring carries an outline beside its box-shadow, because forced-colors mode drops box-shadow.
- The scorer writes through one serial chain that reads the seq at execution time and takes a returned seq verbatim in both directions, because another device's undo lowers it.
- No comments in code, at all, tests and SQL included. `scripts/design-lint.mjs` fails on any. A fact worth keeping lives in the component spec or here.
- Treat Jake as a competent engineer. Start with the non-obvious cause.

## Coherence

The project runs `@posthog/coherence` 1.x. The grammar is in `node_modules/@posthog/coherence/docs/spec.md` and the config keys are in `docs/config.md` beside it.

1. Every spec bullet is one invariant. A totality oracle names a vitest `describe` title in `via:`. A chokepoint names the protected symbol in `protects:` and the one symbol every reference passes through in `chokepoint:`.
2. Append a whole bullet after another bullet's last line. A bullet inserted between a bullet and its `refuted:`, `kinds:` or `checklist:` lines takes them.
3. Witness a totality oracle with `npx --no -- coherence refute <folder>/<name> --broke "<what you changed>"` while the break is staged. Then restore the code with the inverse edit and run `npx --no -- coherence run`.
4. Record a choice with `npx --no -- coherence decide "<chose>" --over "<rejected>" --because "<why>" --session <id> --agent <name>`. A session id holds letters, digits, dots, dashes and underscores only.
5. The rationale that the 0.37 specs carried in prose lives in `docs/design.md` under Rationale by component.
6. The 0.37 journal, work orders and defects are kept under `.coherence/archive-0.37` as history. Coherence 1.x does not read them.
