# CLAUDE.md

Context for agents working in this repository. The durable truth about the code lives in the
`*.spec.md` files and the coherence graph. This file carries the rules and the lessons the graph
cannot derive. The record before 2026-10-01 (plans, mockups, the decisions log) sits in
`~/backups/claude-project-dirs/easton-duals` on vinelab.

## Start here

1. Run `npx coherence orient` for the one next action, then `npx coherence work inspect` for the open orders.
2. Read the spec of the component you change: `easton-duals.spec.md`, then under `server/src/`: `shared/shared.spec.md`, `match/match.spec.md`, `audit/audit.spec.md`, `schedule/schedule.spec.md`, `formats/formats.spec.md`, `matchmaker/matchmaker.spec.md`, `auth/auth.spec.md`, `routes/routes.spec.md`, `roster/roster.spec.md`, `smoothcomp/smoothcomp.spec.md`, `live/live.spec.md`, `db/db.spec.md`, and `web/src/web.spec.md`.
3. Run `npx coherence verify --fast` on every save. Before you offer a branch run `npm test` (one batched run over both workspaces) and `npx coherence verify --from-report .coherence/test-report.json`.
4. Record a choice with `npx coherence decide` at the moment you make it.

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
- After a correction from Jake, record the pattern with `npx coherence decide` or `npx coherence defect`.
- Update `CHANGELOG.md` under `[Unreleased]` when work is confirmed finished.
- After any `*.spec.md` edit, run `npx coherence claude` on a clean tree and commit CLAUDE.md with the edit. CI fails `claude --check` on a stale block, and a dirty tree renders a block CI cannot reproduce.
- Run `npm run lint` at the root before every push: it runs `scripts/design-lint.mjs`, which the workspace lints skip.

## Testing

`npm test` at the root runs vitest over the `server` and `web` projects in one batch
(`server/test/**/*.test.ts`, `web/test/**/*.test.{ts,tsx}`). Coherence resolves every claim from
that run's JSON report; it never boots the pool per claim.

A test exists only as the oracle a spec names. To add one:

1. Name the invariant in the component spec's `## invariants` list.
2. Anchor it with one `boundary` claim at the real chokepoint symbol.
3. Write one oracle. A uniform domain gets one loop over the live set with a floor; a non-uniform domain gets double-entry.
4. Break the chokepoint, watch the oracle go red, restore it, and record the run under `## refutations`.

`npx coherence mass --check` pins the test-case count. A PR that grows it re-pins with
`--update-baseline` in the same PR and says why. The 136 existing test files predate the specs;
the oracle-alignment work order folds or cuts the ones no claim names.

## Environments

- Production is one Vercel function on Turso at https://www.eastonduals.com. Every push builds a preview.
- `npm run dev` uses a local file database (`data/dev.db`). `DUELS_DEV_REMOTE=1` points it at Turso; never do that with pending migration files in the tree.
- Turso is migrated on purpose with `npm run db:migrate` (`--to <tag>` for a release whose newest migration drops a column). Migration first, then deploy, always.
- The LAN entry (`server/src/index.ts`) is the gym box; it migrates its own file database at boot.
- Run `npm` under Node 22 (`/opt/homebrew/opt/node@22/bin`). npm 10 crashes resolving this tree; use npm 11 for a lock change and validate the lock with `npm ci` plus the gates.

## Lessons that cost a run

- A gate chain runs one command per line with `|| exit 1`. A heredoc inside an `&&` list once tagged a release one commit early.
- WellnessLiving's report `like` is case sensitive; only `` lower(`col`) like '%x%' `` works, and `ilike`, `collate nocase` and `regexp` hang the report. Prove a filter with a Title case name.
- A table rebuild never drops a table that something references (Turso enforces foreign keys; the pragma is a no-op inside the migrator's transaction). Rehearse on a copy of production first.
- A dialog whose content is the live state opts out of the snapshot hold with `data-poll-through`.
- A grid column minimum must exceed the row's fixed tracks.
- The client never clears the admin token on a 401.
- `vercel ls` prints to stderr; a piped command reports the last command's exit code.
- Treat Jake as a competent engineer. Start with the non-obvious cause.

## Coherence

The block below is owned by `npx coherence claude`. Do not edit it by hand.

<!-- coherence:begin -->
<!-- GENERATED by `coherence claude` from the spec+code graph. Do not edit by hand —
     edit the *.spec.md files and re-run. Everything OUTSIDE these markers is authored prose. -->

_Derived from 14 components · 259 files · 735 symbols · 44 boundary claims._

## Component map (derived)

> Each component directory, its spec intent (one line), and its files. Per-file
> roles are authored elsewhere — the graph only knows component-level intent.

### Easton Duals `/`
A team duels scoring app for a kids jiu jitsu gym: one Hono server on libSQL, one React console, a TV board, and a tablet scorer.

_files:_
- `index.ts`
- `drizzle.config.ts`
- `app.ts`
- `context.ts`
- `dev.ts`
- `index.ts`
- `env.ts`
- `lanIp.ts`
- `validate.ts`
- `app.test.ts`
- `audit.test.ts`
- `auth.test.ts`
- `blossom.test.ts`
- `certify.test.ts`
- `clock.test.ts`
- `db.test.ts`
- `derive.test.ts`
- `divisions-routes.test.ts`
- `divisions.test.ts`
- `entry.test.ts`
- `fill.test.ts`
- `fixtures.ts`
- `generate.test.ts`
- `health.test.ts`
- `helpers.ts`
- `lan.test.ts`
- `lazy-expiry.test.ts`
- `link.test.ts`
- `match-events.test.ts`
- `matches.test.ts`
- `matchmaker.test.ts`
- `mats.test.ts`
- `migration-0012.test.ts`
- `plan.test.ts`
- `proposals.test.ts`
- `propose.test.ts`
- `rate-limit.test.ts`
- `roster.test.ts`
- `round-label.test.ts`
- `schedule.test.ts`
- `scoring-cap.test.ts`
- `scoring.test.ts`
- `similarity.test.ts`
- `smoothcomp-fixtures.ts` — Builders for synthetic Smoothcomp payloads. Every name here is invented: never a real
- `smoothcomp-parse.test.ts`
- `smoothcomp-route.test.ts`
- `smoothcomp-standings.test.ts`
- `smoothcomp-url.test.ts`
- `snapshot.test.ts`
- `sync.test.ts`
- `team-leaderboard.test.ts`
- `team-scoring.test.ts`
- `weight-class.test.ts`
- `vitest.config.ts`
- `vitest.config.ts`
- `EventPage.test.tsx`
- `board-css.test.ts`
- `fakes.ts`
- `match-paste.test.ts`
- `operatorEngaged.test.ts`
- `roster-paste.test.ts`
- `setup.ts`
- `team-guard.test.ts`
- `useSnapshot.test.tsx`
- `vite.config.ts`

### Audit and certification `server/src/audit`
The append-only audit log and the lock a certified event puts on every write.

_files:_ `certify.ts`, `log.ts`

### Auth `server/src/auth`
The admin PIN, the mat code, the signed tokens and the per-IP rate limit.

_files:_ `dbRateLimit.ts`, `middleware.ts`, `pin.ts`, `tokens.ts`

### Database `server/src/db`
libSQL through drizzle: a file on the gym box, Turso in production, migrations on purpose.

_files:_ `client.ts`, `schema.ts`

### Divisions and formats `server/src/formats`
Round robin, single and double elimination, generated once per style with feeds between rounds.

_files:_ `divisions.ts`, `generate.ts`

### Live snapshot and mat binding `server/src/live`
The one snapshot every screen polls, the public name form and the tablet binding.

_files:_ `bound.ts`, `snapshot.ts`

### Match state machine `server/src/match`
The event log per match, the derived caches, the mats, the bracket feeds and the lazy clock.

_files:_ `create.ts`, `derive.ts`, `entry.ts`, `events.ts`, `expiry.ts`, `fill.ts`, `lazyExpiry.ts`, `mats.ts`, `pairs.ts`

### Matchmaker `server/src/matchmaker`
The proposer that drafts cross-team pairs for the organizer to confirm, swap or reject.

_files:_ `blossom.ts`, `cost.ts`, `propose.ts`

### Roster `server/src/roster`
The paste, the WellnessLiving sync, the leaderboard ERP join and the link suggestions.

_files:_
- `belts.ts`
- `config.ts`
- `join.ts`
- `leaderboard.ts`
- `link.ts`
- `parse.ts`
- `slug.ts` — Copied from easton-leaderboard lib/data/transform.js makeCompetitorId. Do not change: the join depends on byte equality.
- `sync.ts`
- `types.ts`
- `wl.ts`

### Routes `server/src/routes`
The Hono routes: events, teams, athletes, roster, proposals, matches, divisions, mats, scoring, entries, board, Smoothcomp.

_files:_ `athletes.ts`, `auth.ts`, `board.ts`, `divisions.ts`, `entries.ts`, `events.ts`, `matches.ts`, `proposals.ts`, `roster.ts`, `rulesets.ts`, `schedule.ts`, `scoring.ts`, `smoothcomp.ts`

### Running order `server/src/schedule`
One static plan in waves across the mats, built on demand from every pending match.

_files:_ `plan.ts`

### Shared rules `server/src/shared`
Pure modules the server, the console and the board read through: the leaderboard, team scoring, weight classes, clock arithmetic and name similarity.

_files:_
- `clock.ts`
- `leaderboard.ts`
- `round-label.ts`
- `scoring.ts`
- `similarity.ts` — Lowercase, letters and digits only, with accents folded away. The common ground every
- `types.ts`
- `weight-class.ts`

### Smoothcomp standings `server/src/smoothcomp`
The winner of a Smoothcomp event computed from its finished matches against the roster.

_files:_
- `brackets.ts`
- `client.ts` — Smoothcomp serves its HTML pages behind a Cloudflare challenge, but answers its JSON
- `parse.ts` — Pure. JSON in, rows out. No network, no I/O, so smoothcomp-fixtures.ts can pin the
- `standings.ts`
- `url.ts` — Smoothcomp runs one host per promoter: smoothcomp.com, naga.smoothcomp.com,

### Console, scorer and board `web/src`
The React client: the admin console, the tablet scorer, the TV board, the pastes and the polling.

_files:_
- `AdminShell.tsx`
- `BeltDot.tsx`
- `Clock.tsx`
- `CodeField.tsx`
- `ColourSwatches.tsx`
- `Connecting.tsx`
- `OverflowMenu.tsx`
- `PinGate.tsx`
- `QrCode.tsx`
- `RouteFallback.tsx`
- `SetupSteps.tsx`
- `TeamCard.tsx`
- `TeamDot.tsx`
- `TeamPlate.tsx`
- `Wordmark.tsx`
- `dialog-frame.ts`
- `alert.tsx`
- `badge.tsx`
- `button.tsx`
- `card.tsx`
- `checkbox.tsx`
- `chip.tsx`
- `dialog.tsx`
- `empty-state.tsx`
- `field-set.tsx`
- `input.tsx`
- `label.tsx`
- `list.tsx`
- `segment.tsx`
- `select.tsx`
- `sheet.tsx`
- `skeleton.tsx`
- `spinner.tsx`
- `table.tsx`
- `tabs.tsx`
- `textarea.tsx`
- `toggle.tsx`
- `api.ts`
- `auth.ts`
- `doubleBooking.ts`
- `eventMode.ts`
- `format.ts`
- `freshness.ts`
- `ids.ts`
- `matBinding.ts`
- `match-paste.ts`
- `matchOrder.ts` — Newest finish first. A match without an endedAt (finished before the field existed)
- `matchView.ts`
- `operatorEngaged.ts`
- `pollInterval.ts`
- `queries.ts`
- `reorder.ts`
- `roster-paste.ts`
- `scoring.ts`
- `setupFlow.ts` — The three step setup lives in the URL rather than in a page state, so a reload on the
- `sounds.ts` — 4.1: exactly three tones exist, one meaning each, and none may repeat internally --
- `team-guard.ts`
- `types.ts`
- `useAdminToken.ts`
- `useClock.ts`
- `useSnapshot.ts`
- `useWakeLock.ts`
- `utils.ts`
- `main.tsx`
- `router.tsx`
- `AdminPage.tsx`
- `BoardPage.tsx`
- `ConnectPage.tsx`
- `EventPage.tsx`
- `MatPickPage.tsx`
- `ScorerPage.tsx`
- `NewEventDialog.tsx`
- `Board.tsx`
- `DoneBand.tsx`
- `Hero.tsx`
- `MatBand.tsx`
- `MatRow.tsx`
- `ResultsBand.tsx`
- `SetupBand.tsx`
- `budget.ts`
- `names.ts`
- `plan.ts`
- `useFar.ts`
- `useHeldResults.ts`
- `useSettleTimer.ts`
- `AddKidDialog.tsx`
- `AddMatchDialog.tsx`
- `CandidateRow.tsx`
- `ContactDialog.tsx`
- `DeleteEventDialog.tsx`
- `DivisionsPanel.tsx`
- `EntryTab.tsx`
- `FinishEventDialog.tsx`
- `KidPickerDialog.tsx`
- `LinkCandidateDialog.tsx`
- `LiveTab.tsx`
- `MatchHistorySheet.tsx`
- `MatchesTab.tsx`
- `PasteMatchesDialog.tsx`
- `PasteRosterDialog.tsx`
- `ProfileSheet.tsx`
- `ProposalsPanel.tsx`
- `RegenerateConfirmDialog.tsx`
- `ResultDialog.tsx`
- `RosterTab.tsx`
- `RulesetDialog.tsx`
- `RulesetsTab.tsx`
- `ScheduleDialog.tsx`
- `SetupMatchesStep.tsx`
- `SetupRosterStep.tsx`
- `SmoothcompDialog.tsx`
- `SyncRosterDialog.tsx`
- `TeamList.tsx`
- `TeamsDialog.tsx`
- `clock-input.ts`
- `entry-defaults.ts`
- `entry-state.ts`
- `link-report.ts`
- `live-panel.ts`
- `match-history.ts`
- `matches-view.ts`
- `roster-drag.ts`
- `roster-group.tsx`
- `roster-row.tsx`
- `useWlSearch.ts`
- `CenterColumn.tsx`
- `ConfirmSheet.tsx`
- `ScoreSide.tsx`
- `actions.ts`
- `budget.ts` — 6.16 sizes every commit control in millimetres and fixes the centre column at 320px, and
- `ledger.ts`
- `refusals.ts`
- `useScorer.ts`
- `viewport.ts`

## Invariants → chokepoint → oracle (derived)

> Each named invariant, the chokepoint symbol that enforces it, and the oracle
> (test or guard) that asserts it holds. Parsed from the `boundary` claims in the specs.

| Invariant | Component | Chokepoint | Oracle | Refuted? |
| --- | --- | --- | --- | --- |
| the served version equals the package version | Easton Duals | `VERSION` | `the served version equals the package version` | observed |
| a certified event refuses every write | Audit and certification | `assertNotCertified` | `a certified event refuses every write` | observed |
| every write records an audit row | Audit and certification | `recordAudit` | `every write records an audit row` | observed |
| an admin route rejects a request without a valid admin token | Auth | `requireAdmin` | `an admin route rejects a request without a valid admin token` | observed |
| a token is signed and expires | Auth | `verifyToken` | `a token is signed and expires` | observed |
| a PIN or mat code check is rate limited per IP | Auth | `checkLimit` | `a PIN or mat code check is rate limited per IP` | observed |
| a boot migrates only a file database | Database | `autoMigrates` | `a boot migrates only a file database` | observed |
| the database url comes from the environment with a local file default | Database | `dbUrlFromEnv` | `the database url comes from the environment with a local file default` | observed |
| a division generates its matches once per style in dependency order | Divisions and formats | `generateDivision` | `a division generates its matches once per style in dependency order` | observed |
| seeds are the listed order and seed by rating reorders by ERP | Divisions and formats | `seedByRating` | `seeds are the listed order and seed by rating reorders by ERP` | observed |
| a same-team round one pair is swapped away or warned | Divisions and formats | `arrangeSlots` | `a same-team round one pair is swapped away or warned` | observed |
| double elimination ends in one grand final with no reset | Divisions and formats | `generateDivision` | `double elimination ends in one grand final with no reset` | observed |
| a public reader sees initials and an admin token the full name | Live snapshot and mat binding | `nameFormFor` | `a public reader sees initials and an admin token the full name` | observed |
| every write bumps the event version in its transaction | Live snapshot and mat binding | `bumpVersion` | `every write bumps the event version in its transaction` | observed |
| a mat binding dies when another tablet takes the mat | Live snapshot and mat binding | `bindMat` | `a mat binding dies when another tablet takes the mat` | observed |
| match events are the source of truth and the caches follow in the same transaction | Match state machine | `recompute` | `match events are the source of truth and the caches follow in the same transaction` | observed |
| a score and a win type derive from the events | Match state machine | `deriveOutcome` | `a score and a win type derive from the events` | observed |
| a mat starts only a runnable match | Match state machine | `advanceMat` | `a mat starts only a runnable match` | observed |
| an ended feeder fills its dependents in the same transaction | Match state machine | `fillDependents` | `an ended feeder fills its dependents in the same transaction` | observed |
| a correction that changes a winner refuses when a dependent already ran | Match state machine | `assertDependentsPending` | `a correction that changes a winner refuses when a dependent already ran` | observed |
| a reopen refuses while a dependent is live or done | Match state machine | `reopenMatch` | `a reopen refuses while a dependent is live or done` | observed |
| the clock expires lazily on read | Match state machine | `expireOverdue` | `the clock expires lazily on read` | observed |
| pair cost ranks class, then age, then belt, then rating | Matchmaker | `pairCost` | `pair cost ranks class, then age, then belt, then rating` | observed |
| the proposer offers each free kid at most once, across teams only, and never a division kid | Matchmaker | `proposeMatches` | `the proposer offers each free kid at most once, across teams only, and never a division kid` | observed |
| the proposer makes the pairing with the lowest total cost where a kid without a pair costs 10.5 | Matchmaker | `proposeMatches` | `the proposer makes the pairing with the lowest total cost where a kid without a pair costs 10.5` | observed |
| a hand-designed pair warns and never refuses | Matchmaker | `pairWarnings` | `a hand-designed pair warns and never refuses` | observed |
| a hand-edited age or weight sticks through a re-sync | Roster | `profileChanges` | `a hand-edited age or weight sticks through a re-sync` | observed |
| the sync asks WellnessLiving for the roster's own names only | Roster | `rosterFilter` | `the sync asks WellnessLiving for the roster's own names only` | observed |
| every gi match runs before any nogi match | Running order | `planSchedule` | `every gi match runs before any nogi match` | observed |
| a feeder runs at least two waves before its dependent | Running order | `planSchedule` | `a feeder runs at least two waves before its dependent` | observed |
| a kid never fights in two adjacent waves unless nothing else fits | Running order | `planSchedule` | `a kid never fights in two adjacent waves unless nothing else fits` | observed |
| the plan is deterministic for the same input | Running order | `planSchedule` | `the plan is deterministic for the same input` | observed |
| teams rank by team points, then wins, then match points, then position, and ties share a rank | Shared rules | `rankTeams` | `teams rank by team points, then wins, then match points, then position, and ties share a rank` | observed |
| team points come only from scoring athletes by win type | Shared rules | `teamPointsFor` | `team points come only from scoring athletes by win type` | observed |
| a team over ten kids scores only with its marked kids | Shared rules | `scoringSet` | `a team over ten kids scores only with its marked kids` | observed |
| a stored weight falls in one registration band | Shared rules | `weightClass` | `a stored weight falls in one registration band` | observed |
| a name resolves through one similarity module | Shared rules | `nameScore` | `a name resolves through one similarity module` | observed |
| a Smoothcomp match counts only when both names resolve to roster kids on teams | Smoothcomp standings | `computeStandings` | `a Smoothcomp match counts only when both names resolve to roster kids on teams` | observed |
| a Smoothcomp win method maps to a win type and an unknown method earns one point | Smoothcomp standings | `winTypeFor` | `a Smoothcomp win method maps to a win type and an unknown method earns one point` | observed |
| a Smoothcomp URL parses to one event | Smoothcomp standings | `parseSmoothcompUrl` | `a Smoothcomp URL parses to one event` | observed |
| a roster paste maps columns by header or by position | Console, scorer and board | `parseRosterPaste` | `a roster paste maps columns by header or by position` | observed |
| a match paste creates pairs and division lines | Console, scorer and board | `parseMatchPaste` | `a match paste creates pairs and division lines` | observed |
| the scoring cap is checked before the paste is sent | Console, scorer and board | `scoringCapProblems` | `the scoring cap is checked before the paste is sent` | observed |
| an open dialog holds the snapshot unless it opts out by name | Console, scorer and board | `useHeldWhileEngaged` | `an open dialog holds the snapshot unless it opts out by name` | observed |

_"Refuted?" = someone broke the chokepoint and watched this oracle go red. A `—` is a to-do, not an accusation._

<sub>Generated at 2026-10-13 11:19Z.</sub>
<!-- coherence:end -->
