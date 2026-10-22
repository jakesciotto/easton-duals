# Easton Duals design

The rules live in the coherence specs, one `*.spec.md` per component. This file keeps the longer account the specs do not carry.

## Rationale by component

The coherence 0.37 specs carried this prose in a `## why` section. Coherence 1.x keeps rationale on the invariant as a `because:` line, so the longer account lives here.

### Easton Duals

Spec: `easton-duals.spec.md`.

One npm workspace: `server` (Hono, drizzle, libSQL) and `web` (React, Vite, Tailwind v4).
Production runs the server as one Vercel function on Turso at www.eastonduals.com. The LAN
entry (`server/src/index.ts`) runs the same app on a file database for a gym box with no
internet. Every screen polls a snapshot keyed by the event's `version`; a write bumps the
version inside its transaction. No sockets, no server timers: the clock expires lazily on read.

Auth: an admin PIN (six digits) mints a token for the console; a mat code binds a tablet to
one mat and its token dies when another tablet takes the mat over. Public boards need no token.

Release: feature branch to staging to main, fast-forward only. A release moves the version in
package.json, server/package.json, web/package.json (`npm version X --no-git-tag-version
--workspaces --include-workspace-root` moves all three plus the lock) AND `VERSION` in
server/src/app.ts by hand. The health test compares the served version to the package version
and fails when they differ; v0.17.2 missed the constant and CI went red four times. Run the
server tests after the release commit, before the tag. Tags follow semantic versioning. The
release chain runs one command per line with `|| exit 1`; a heredoc in the middle of an `&&`
list once split the chain and tagged one commit early (v0.8.0). The build runs before the e2e,
because the e2e spawns `node dist/index.js`.

The repository is public. No ids, URLs or keys in code; env only. Fixtures use invented
names. gitleaks runs as a pre-commit hook and in CI.

The record before 2026-10-01 (plans, mockups, the decisions log) sits in
`~/backups/claude-project-dirs/easton-duals` on vinelab. Decisions from that date on live in
the coherence journal.

### Match state machine

Spec: `server/src/match/match.spec.md`.

`match_events` is the source of truth for a match. The cache columns on `matches` (points,
clock, status, result) are rewritten in the same transaction as every event insert or undo.
Undo deletes the newest event and the audit row carries the deleted row, so the scorer's seq
contract holds. Undo is refused on a done match. A desk entry writes a `set_score` event
(absolute set) so the log stays append only.

An athlete's match score is the running total of scored actions, floored at zero. The win type
is derived: a terminal gives its own type, points ahead gives `points`, a tie needs a decision.
Win types: `submission`, `points`, `decision`, `walkover`, `dq`.

States: `pending` to `live` to `done`; `reopen` returns a done match to live and is refused
while a dependent match is live or done. A mat starts only a runnable match: both sides filled
and no kid live on another mat (busy means pending or live, reversed from pending only after a
kid went live on two mats at once). A blocked match keeps its slot. Every end, entry, skip and
fill releases the idle mats. When a match ends, the server fills every side that feeds from it,
inside the same transaction. A correction that changes the winner refills pending dependents or
refuses ("M12 already ran on this result"). A points-only correction always passes.

Matches hold two sides, a style (gi or nogi), a stable per-event number printed as M12, an order
index per mat, a ruleset and, for a bracket, a division id, a round and a feed per empty side.
Event mode: `entry` means the desk types every result (Smoothcomp runs the mats), `live` means
the mats drive it. In entry mode Start event must not advance mats and the desk entry lands on
the designed match.

### Matchmaker

Spec: `server/src/matchmaker/matchmaker.spec.md`.

Proposals are drafts in their own table; nothing reaches the board until confirmed. One
proposal set per style; a propose replaces the event's drafts of that style whole. A kid with a
match of this style already, whatever its status, is never offered a second one. A division kid
is never offered. Same-gender is a veto when the event asks for it.

Cost: a weight class is worth ten, a year of age two, a belt step a half, a rating point a
tenth. The organizer ruled weight class first, then age (2026-09-11). A pair costing more than
20 (two classes, or one class and five years) is never offered; the organizer adds it by hand
and the dialog warns.

The pairing is a maximum weight matching over the general graph (teams number two to eight, so
Edmonds' blossom in `blossom.ts`, not Hungarian), with each admitted pair weighing 21 minus its
cost. That is the same as charging 10.5 for every kid left without a pair: the matching makes
a pair only when it beats both kids sitting out. Measured on the four real rosters of September
2026 (40 to 56 kids, two or three teams) against the greedy pass it replaced: one to two more
pairs on the three-team rosters, the worst pair in every roster no further than a class and
five years, and the one 26.5 pair greedy made (two classes and three years) gone. Maximum
cardinality was measured and rejected: it doubles the total cost to force the last three pairs.
Team balance is moot under this format: each kid holds one match per style, so a team's match
count is its roster size. ERP is null on every real roster (the leaderboard link has filled it
for test events only), so the rating term stays a tiebreak until ratings arrive.

### Divisions and formats

Spec: `server/src/formats/formats.spec.md`.

A division is a named set of kids across teams with one format (round robin, single or
double elimination) and one styles setting (gi, nogi, both). "Pairs" is not a format. Limits:
round robin 2 to 10, single elimination 2 to 16, double elimination 3 to 16. The generator
builds a division's matches once per style, in dependency order: round robin as every
cross-team pair; single elimination as a seeded bracket (slot order 1, 8, 4, 5, 2, 7, 3, 6 for
eight) with byes to the top seeds; double elimination with a losers side and one grand final.
A bracket round exists from generation as a row with empty sides that carry a feed (the
winner or the loser of another match). Seeds are the listed order; "Seed by rating" is an
action, never a default.

### Running order

Spec: `server/src/schedule/schedule.spec.md`.

"Order matches" plans every pending match in waves, one slot per mat: every gi match before
any nogi match (hard), younger first, a feeder at least two waves before its dependent, no kid
in two adjacent waves (relaxed with a warning when nothing else fits), gaps recorded. The
order index is wave-major, mat-minor. The estimate is the longest match per wave plus a
minute. A live kid is fixed at wave -1. The pilot notes asked for gi first, younger first, one
match of rest, nogi at the end; the planner factors in the number of mats.

### Shared rules

Spec: `server/src/shared/shared.spec.md`.

Teams rank by, in order: team points descending, wins descending, match points descending,
then team position (creation order) ascending, which never ties. Two teams level on the first
three share a rank and the ranks they use up are skipped: a table reads 1, 1, 3, never 1, 1, 2.
One function, `rankTeams`, answers the standing for the snapshot, the console and the board.

Team points come only from scoring athletes: 3 for a submission, 2 for a points win, 1 for a
decision, a walkover or a DQ. A loss earns nothing. A team with at most ten kids scores with
every kid and ignores the flags; a team with more than ten scores only with its marked kids, at
most ten (the server refuses the eleventh with 422). A move to another team unmarks the kid.
Wins count every done match a team's kid won, scoring athlete or not. Match points are the sum
of the team's kids' match scores across the event.

Weight class derives from the stored weight through the registration sheet's ten bands (upper
bounds 39, 46, 53, 61, 70, 80, 90, 100, 110, 120, then tens). There is no weight class column.
A weight is rounded before the band is read because a sync can carry a fraction.

Name similarity: accents, hyphens, middle names and a nickname table count as exact; everything
else scores by Dice over tokens with a suggestion floor of 0.6 and a margin of 0.05. A near
match is a suggestion for a person, never a link.

### Audit and certification

Spec: `server/src/audit/audit.spec.md`.

`audit_log` is append only and has no foreign keys: it outlives the rows it describes. One
table for every write, not an actor column on match events. Certify and unlock both re-enter
the PIN; unlock adds a reason. Certification locks everything on the event, all write routes,
roster and match list included, because a roster edit changes what the certified record says
as surely as a score does. Every recorded action is undoable, auditable and changeable after
the match until the organizer certifies.

### Auth

Spec: `server/src/auth/auth.spec.md`.

`ADMIN_PIN` (six digits, env) gates every setup mutation server-side through HMAC tokens with
a 24 hour life. Each event gets a mat code so parents at the tables never see the admin PIN; a
tablet's token dies when another tablet takes the mat over (`bind_epoch`). Board and snapshot
routes are open. The rate limit is ten PIN failures, twenty mat code failures or ten certify failures per hour
per IP, stored in the database because Vercel functions share no memory. The client must not clear the admin token on any
401: a mistyped PIN on delete, certify or unlock once sent the desk back to the PIN gate.

### Routes

Spec: `server/src/routes/routes.spec.md`.

Every write route calls the certification lock first and records an audit row. An event that
is not certified can be deleted; the PIN is re-entered once the event left setup; a certified
event must be unlocked first. While the event is in setup, scoring routes answer 409. The
admin event detail returns the divisions (a web fallback once hid that it did not). One
oracle walks every route the app registers under /api, bare, and holds a double-entry list of
the five open by design: health, lan, the PIN check, the public snapshot, and the mat bind
(gated by the mat code and the rate limit). Everything else must answer 401.

### Live snapshot and mat binding

Spec: `server/src/live/live.spec.md`.

Every screen polls one snapshot keyed by the event's version. `toMatchView` takes a name form:
full for an admin token, public (initials) otherwise. Public is the default so a new caller
must ask for the full form. The board layout is one leaderboard for every team count, two
included; the event owns `far` (the viewing distance factor, 0.85 to 1.2), set from the console
or `?far=` with an admin token, and a television's keys move only a board whose event carries
none.

### Roster

Spec: `server/src/roster/roster.spec.md`.

Athletes are copies, never references: a roster does not change under a running event. A
paste creates kids (First, Last, Age, Weight, Belt, Gender, Team, Birth, Scoring) or matches,
names resolved against the roster by the shared similarity module. Birth gives the age at the
event date, because WellnessLiving exposes no birth date to the app's OAuth token (the one
endpoint that carries it needs the legacy signed API; the credential ask is open).

The sync asks the belts report for the roster's own names, location by location, with
`` lower(`o_client.text_last`) like '%token%' ``. The report's `like` is case sensitive and
`ilike`, `collate nocase` and `regexp` hang it; prove any filter with a Title case name. An
exact match links; a near match waits for a person (Confirm or Not them). An empty location
list answers 503 rather than stamping every row "Not in WellnessLiving". Pool inserts go in
slices of 500 rows because one insert once bound 60723 variables against SQLite's 32766. ERP
comes from the leaderboard app. WellnessLiving and the leaderboard overwrite a paste's values at
the link; an age or weight the organizer edits by hand afterwards sticks through a re-run.

### Smoothcomp standings

Spec: `server/src/smoothcomp/smoothcomp.spec.md`.

Four public JSON endpoints, a pure parser, fixtures. The calculation joins the event roster
(names, teams, scoring marks) to Smoothcomp's finished matches through the shared scoring
rules. A match counts only when both names resolve to a roster kid on a team; the rest are
listed. Same-team pairs count and are listed. Matches dedupe by Smoothcomp id. One request
under a 240 s deadline; past it, 504 and no table. The report is never stored and never
reaches the board. The URL lives on the event.

### Database

Spec: `server/src/db/db.spec.md`.

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

### Console, scorer and board

Spec: `web/src/web.spec.md`.

Design: one language, two dialects, and the dialect is chosen by viewing distance. The console
refuses to shout; the board raises its voice only through geometry and size. Black ground,
near-black surfaces with hairlines, a twelve step neutral ramp, 6px controls and 8px cards, a
4px spacing grid, Geist for text and Geist Mono for numbers, three weights (400, 500, 600) and
nothing above. Exactly three state accents: `--live` (running now), `--attend` (a person is
needed), `--fault` (failed, refused or ran out). Team colour appears only as dots, rules,
plates and tinted names. The console is authored in CSS pixels; the board in `cqh` on a 16:9
stage, no `px` font size on the board and no `cqh` anywhere else; no hex literal in the app
except the QR code's white tile; no forbidden grey token on the board. `scripts/design-lint.mjs`
enforces those greps at the root lint and CI. The full brief (the Caliper rebuild, v0.5.0) is
archived with the project folder on vinelab. Jake rejected the default shadcn dark look,
brutalist, glow and glass, and gradients on the way to this.

Polling: one poll per event; the snapshot commit is suspended while the operator is engaged
(any open dialog), and a dialog whose content is the live state opts out by name with
`data-poll-through`. The client never clears the admin token on a 401. A grid column minimum
must exceed the row's fixed tracks (the roster name column once collapsed to zero). Buttons
step 36, 40, 44, and the scorer's 64. Board rules: the leaderboard for every team count, far
clamped by team count, no plate and no "Wins" word on leaderboard rows.
