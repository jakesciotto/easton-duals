# Changelog

All notable changes to Easton Duals. The format follows Keep a Changelog; versions follow semantic versioning. Entries before 2026-10-01 are condensed from the archived decisions log.

## [Unreleased]

### Changed
- The proposer makes the pairing with the lowest total cost (Edmonds' blossom over the general graph) instead of taking the closest pair first. A kid without a pair costs 10.5, so a pair is made only when it beats both kids sitting out; a pair over 20 (two classes, or one class and five years) is never offered.

### Added
- coherence specs (`*.spec.md`), `coherence.config.json`, a root vitest config that runs both workspaces in one batch, CLAUDE.md and AGENTS.md, and CI gates for verify, mass, claude and hooks.

### Changed
- The gitignored `.claude/` project folder is retired; its plans and decisions are archived on vinelab and the rules live in the specs.

## [0.17.3] - 2026-09-24
### Fixed
- `VERSION` in app.ts missed the 0.17.2 bump; the health test guards it.

## [0.17.2] - 2026-09-24
### Changed
- Dependency sweep (phase 2); esbuild override under the drizzle-kit loader.

## [0.17.1] - 2026-09-21
### Changed
- Roster row: belt dot plus ERP chip, scoring in its own column; profile sheet names a value's source on hover; belt tokens in index.css.

## [0.17.0] - 2026-09-18
### Added
- Smoothcomp standings: the winner of a Smoothcomp event from the roster's names, teams and scoring marks (migration 0014, `events.smoothcomp_url`); a Scoring column in the roster paste.

## [0.16.0] - 2026-09-14
### Changed
- Renamed to Easton Duals (packages, wordmark, repository, dev switch `DUELS_DEV_REMOTE`, LAN database `duals.db`).

## [0.15.0] - 2026-09-14
### Added
- Team scoring: scoring athletes (migration 0013), team points by win type (3, 2, 1), walkover and DQ win types, the four key tiebreak; production moved to www.eastonduals.com.

## [0.14.0] - 2026-09-12
### Added
- Match progression: divisions (round robin, single and double elimination), styles, stable match numbers, bracket feeds, one static running order in waves, the match paste (migration 0012).

## [0.13.0] - 2026-09-12
### Fixed
- Roster names vanished at three columns; the setup roster count held while a dialog was open.
### Added
- Create match from the roster selection bar; roster adjustments (WellnessLiving mismatch dot, quick add, unassign, ERP chip).

## [0.12.0] - 2026-09-12
### Added
- Multi-team events (two to eight teams), proposals the organizer confirms or swaps, a team leaderboard, weight classes from the stored weight (migration 0011).

## [0.11.0] - 2026-09-12
### Changed
- The WellnessLiving sync asks for the roster's own names, every location, no picker; search by name on demand.

## [0.10.1] - 2026-09-09
### Fixed
- Pool inserts in slices of 500 rows (SQLite's bind limit).

## [0.10.0] - 2026-09-09
### Added
- Profile sync: one Sync button, live WellnessLiving data, a profile sheet per row, near matches as suggestions (migration 0010).

## [0.9.1] - 2026-09-09
### Changed
- Server tooling bumps (vitest 4, drizzle-orm 0.45, drizzle-kit 0.31); hrana client pinned to 0.7.0.

## [0.9.0] - 2026-09-08
### Added
- Roster import: flexible paste columns, delete events, WellnessLiving match inside every import.

## [0.8.1] - 2026-09-08
### Fixed
- The 0.8.0 tag landed one commit before the version bump.

## [0.8.0] - 2026-09-08
### Added
- The remaining ledger rows: the event owns `far` (migration 0009), refusal copy, per-match audit rows, CI actions off Node 20.

## [0.7.3] - 2026-09-08
### Changed
- The public snapshot carries initials; an admin token sees full names.

## [0.7.2] - 2026-09-08
### Changed
- `npm run dev` uses a local file database by default.

## [0.7.1] - 2026-09-08
### Fixed
- A boot migrates only a file database; a remote target waits for `npm run db:migrate`.

## [0.7.0] - 2026-09-08
### Added
- Record integrity: the append-only audit log (migration 0007), certify and unlock with the PIN, the history sheet, the three step setup flow; the age and weight gap caps removed (migration 0008).

## [0.6.1] - 2026-09-08
### Fixed
- `VERSION` reported 0.1.0.

## [0.6.0] - 2026-09-08
### Added
- The pilot gap batch: both event modes (entry and live), clock extend, contact on the event, mat bind epoch (migration 0006).

## [0.5.0] - 2026-09-01
### Changed
- The Caliper design rebuild: tokens, primitives, operator screens, the scorer; `events.mode` (migration 0005).

## [0.4.0] - 2026-08-31
### Added
- WellnessLiving sync as a one-time import caching the candidate pool per event; Add competitor from the pool.

## [0.3.0] - 2026-08-31
### Changed
- Re-architected for Vercel: Turso through libSQL, version polling instead of SSE, lazy clock expiry, a database rate limiter.

## [0.2.0] - 2026-08-31
### Added
- Board order by end time, double-booking warnings, the WellnessLiving kids filter, lazy routes.

## [0.1.0] - 2026-08-30
### Added
- First release: the server, the full web client, the pilot entry mode.
