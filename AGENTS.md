# easton-duels — map for agents

> Generated from the spec tree by the coherence harness. Do not edit by hand.

A team duels scoring app for a kids jiu jitsu gym: one Hono server on libSQL, one React console, a TV board, and a tablet scorer.

## Components

### Easton Duals  `.`
A team duels scoring app for a kids jiu jitsu gym: one Hono server on libSQL, one React console, a TV board, and a tablet scorer.

_why:_ One npm workspace: `server` (Hono, drizzle, libSQL) and `web` (React, Vite, Tailwind v4). Production runs the server as one Vercel function on Turso at www.eastonduals.com. The LAN entry (`server/src/index.ts`) runs the same app on a file database for a gym box with no internet. Every screen polls a snapshot keyed by the event's `version`; a write bumps the version inside its transaction. No sockets, no server timers: the clock expires lazily on read. Auth: an admin PIN (six digits) mints a token for the console; a mat code binds a tablet to one mat and its token dies when another tablet takes the mat over. Public boards need no token. Release: feature branch to staging to main, fast-forward only. A release moves the version in package.json, server/package.json, web/package.json (`npm version X --no-git-tag-version --workspaces --include-workspace-root` moves all three plus the lock) AND `VERSION` in server/src/app.ts by hand. The health test compares the served version to the package version and fails when they differ; v0.17.2 missed the constant and CI went red four times. Run the server tests after the release commit, before the tag. Tags follow semantic versioning. The release chain runs one command per line with `|| exit 1`; a heredoc in the middle of an `&&` list once split the chain and tagged one commit early (v0.8.0). The build runs before the e2e, because the e2e spawns `node dist/index.js`. The repository is public. No ids, URLs or keys in code; env only. Fixtures use invented names. gitleaks runs as a pre-commit hook and in CI. The record before 2026-10-01 (plans, mockups, the decisions log) sits in `~/backups/claude-project-dirs/easton-duals` on vinelab. Decisions from that date on live in the coherence journal.

_works when:_
- typechecks
- boundary "the served version equals the package version" at VERSION via guard "health"
- passes test "the write routes this suite covers"
- coherence.config.json exists at root
- CHANGELOG.md exists at root

_files:_ `index.ts`, `drizzle.config.ts`, `app.ts`, `context.ts`, `dev.ts`, `index.ts`, `env.ts`, `lanIp.ts`, `validate.ts`, `app.test.ts`, `athletes.test.ts`, `audit.test.ts`, `auth.test.ts`, `belts.test.ts`, `bound.test.ts`, `certify.test.ts`, `clock.test.ts`, `db.test.ts`, `derive.test.ts`, `divisions-routes.test.ts`, `divisions.test.ts`, `entry.test.ts`, `env.test.ts`, `events.test.ts`, `expiry.test.ts`, `fill.test.ts`, `fixtures.ts`, `generate.test.ts`, `health.test.ts`, `helpers.ts`, `join.test.ts`, `lan.test.ts`, `lanIp.test.ts`, `lazy-expiry.test.ts`, `leaderboard.test.ts`, `link.test.ts`, `match-events.test.ts`, `matches.test.ts`, `matchmaker.test.ts`, `mats.test.ts`, `migration-0007.test.ts`, `migration-0008.test.ts`, `migration-0009.test.ts`, `migration-0010.test.ts`, `migration-0011.test.ts`, `migration-0012.test.ts`, `migration-0013.test.ts`, `migration-0014.test.ts`, `plan.test.ts`, `proposals.test.ts`, `propose.test.ts`, `rate-limit.test.ts`, `roster.test.ts`, `round-label.test.ts`, `rulesets.test.ts`, `schedule.test.ts`, `scoring.test.ts`, `similarity.test.ts`, `smoothcomp-fixtures.ts`, `smoothcomp-parse.test.ts`, `smoothcomp-route.test.ts`, `smoothcomp-standings.test.ts`, `smoothcomp-url.test.ts`, `snapshot.test.ts`, `sync.test.ts`, `team-leaderboard.test.ts`, `team-scoring.test.ts`, `weight-class.test.ts`, `wl.test.ts`, `vitest.config.ts`, `vitest.config.ts`, `AddKidDialog.test.tsx`, `AddMatchDialog.test.tsx`, `AdminPage.test.tsx`, `AdminShell.test.tsx`, `Alert.test.tsx`, `BoardPage.test.tsx`, `Chip.test.tsx`, `Clock.test.tsx`, `CodeField.test.tsx`, `ColourSwatches.test.tsx`, `ConnectPage.test.tsx`, `DivisionsPanel.test.tsx`, `EmptyState.test.tsx`, `EntryTab.test.tsx`, `EventPage.test.tsx`, `KidPickerDialog.test.tsx`, `LiveTab.test.tsx`, `MatPickPage.test.tsx`, `MatchHistorySheet.test.tsx`, `MatchesTab.test.tsx`, `NewEventDialog.test.tsx`, `PasteMatchesDialog.test.tsx`, `PasteRosterDialog.test.tsx`, `PinGate.test.tsx`, `ProfileSheet.test.tsx`, `ProposalsPanel.test.tsx`, `ResultDialog.test.tsx`, `RosterTab.test.tsx`, `RouteFallback.test.tsx`, `RulesetDialog.test.tsx`, `RulesetsTab.test.tsx`, `ScheduleDialog.test.tsx`, `ScorerPage.test.tsx`, `Segment.test.tsx`, `SetupMatchesStep.test.tsx`, `SetupRosterStep.test.tsx`, `Skeleton.test.tsx`, `SmoothcompDialog.test.tsx`, `Spinner.test.tsx`, `SyncRosterDialog.test.tsx`, `Table.test.tsx`, `TeamList.test.tsx`, `Textarea.test.tsx`, `Toggle.test.tsx`, `api.test.ts`, `auth.test.ts`, `board-budget.test.ts`, `board-css.test.ts`, `board-format.test.ts`, `clock-input.test.ts`, `cursor-css.test.ts`, `entry-defaults.test.ts`, `entry-state.test.ts`, `eventMode.test.ts`, `fakes.ts`, `format.test.ts`, `freshness.test.ts`, `link-report.test.ts`, `match-history.test.ts`, `match-paste.test.ts`, `matchView.test.ts`, `operatorEngaged.test.ts`, `pollInterval.test.ts`, `reorder.test.ts`, `roster-paste.test.ts`, `router.test.tsx`, `scorer-model.test.ts`, `scoring.test.ts`, `setup.ts`, `shell-css.test.ts`, `similarity.test.ts`, `sounds.test.ts`, `team-guard.test.ts`, `useClock.test.tsx`, `useFar.test.tsx`, `useHeldResults.test.tsx`, `useScorer.test.tsx`, `useSettleTimer.test.tsx`, `useSnapshot.test.tsx`, `useWakeLock.test.tsx`, `useWlSearch.test.tsx`, `vite.config.ts`

### Audit and certification  `server/src/audit`
The append-only audit log and the lock a certified event puts on every write.

_why:_ `audit_log` is append only and has no foreign keys: it outlives the rows it describes. One table for every write, not an actor column on match events. Certify and unlock both re-enter the PIN; unlock adds a reason. Certification locks everything on the event, all write routes, roster and match list included, because a roster edit changes what the certified record says as surely as a score does. Every recorded action is undoable, auditable and changeable after the match until the organizer certifies.

_works when:_
- boundary "a certified event refuses every write" at assertNotCertified via guard "certification locks the event"
- boundary "every write records an audit row" at recordAudit via guard "audit log, the event"
- passes test "certify and uncertify"

_files:_ `certify.ts`, `log.ts`

### Auth  `server/src/auth`
The admin PIN, the mat code, the signed tokens and the per-IP rate limit.

_why:_ `ADMIN_PIN` (six digits, env) gates every setup mutation server-side through HMAC tokens with a 24 hour life. Each event gets a mat code so parents at the tables never see the admin PIN; a tablet's token dies when another tablet takes the mat over (`bind_epoch`). Board and snapshot routes are open. The rate limit is five failures per minute per IP, stored in the database because Vercel functions share no memory. The client must not clear the admin token on any 401: a mistyped PIN on delete, certify or unlock once sent the desk back to the PIN gate.

_works when:_
- boundary "an admin route rejects a request without a valid admin token" at requireAdmin via guard "middleware"
- boundary "a token is signed and expires" at verifyToken via guard "tokens"
- boundary "a PIN or mat code check is rate limited per IP" at checkLimit via guard "checkLimit"
- passes test "POST /api/auth/admin"
- passes test "pin"

_files:_ `dbRateLimit.ts`, `middleware.ts`, `pin.ts`, `tokens.ts`

### Database  `server/src/db`
libSQL through drizzle: a file on the gym box, Turso in production, migrations on purpose.

_why:_ A boot may migrate only a `file:` database; a remote target is migrated on purpose with `npm run db:migrate`, which takes `--to <tag>`. On 2026-09-08 a dev server in the main checkout ran every pending migration against Turso and dropped two columns the live build still selected, so every event read failed for two and a half hours while health stayed green. `npm run dev` now sets `DB_PATH=./data/dev.db`; `DUELS_DEV_REMOTE=1` keeps the remote target. Migrations are additive before a deploy; a column drop lands after the deploy that stops reading it. A table rebuild never drops a table that something references, because Turso enforces foreign keys and the libsql migrator batches inside one transaction where `PRAGMA foreign_keys=OFF` is a no-op: rebuild the child without its foreign key, then the parent, then the child with the key back (migration 0012). Rehearse with `server/scripts/rehearse-migration.mjs` on a read-only copy of production first. `@libsql/hrana-client` is pinned to 0.7.0 at the root. Newer clients hand Vercel's patched fetch a request form that intermittently loses the Authorization header, and 0.8.0 ignores the guard fetch injected into createClient.

_works when:_
- boundary "a boot migrates only a file database" at autoMigrates via guard "autoMigrates"
- boundary "the database url comes from the environment with a local file default" at dbUrlFromEnv via guard "dbUrlFromEnv"
- passes test "createDb retry wiring"
- passes test "migration 0012 adds divisions, numbers, styles and feeds"

_files:_ `client.ts`, `schema.ts`

### Divisions and formats  `server/src/formats`
Round robin, single and double elimination, generated once per style with feeds between rounds.

_why:_ A division is a named set of kids across teams with one format (round robin, single or double elimination) and one styles setting (gi, nogi, both). "Pairs" is not a format. Limits: round robin 2 to 10, single elimination 2 to 16, double elimination 3 to 16. The generator builds a division's matches once per style, in dependency order: round robin as every cross-team pair; single elimination as a seeded bracket (slot order 1, 8, 4, 5, 2, 7, 3, 6 for eight) with byes to the top seeds; double elimination with a losers side and one grand final. A bracket round exists from generation as a row with empty sides that carry a feed (the winner or the loser of another match). Seeds are the listed order; "Seed by rating" is an action, never a default.

_works when:_
- boundary "a division generates its matches once per style in dependency order" at generateDivision via guard "both styles"
- boundary "seeds are the listed order and seed by rating reorders by ERP" at seedByRating via guard "seedByRating"
- boundary "a same-team round one pair is swapped away or warned" at arrangeSlots via guard "same-team pairs in round one"
- boundary "double elimination ends in one grand final with no reset" at generateDivision via guard "double elimination"
- passes test "round robin"
- passes test "single elimination"
- passes test "createDivision"
- passes test "regenerateDivision"
- passes test "deleteDivision"

_files:_ `divisions.ts`, `generate.ts`

### Live snapshot and mat binding  `server/src/live`
The one snapshot every screen polls, the public name form and the tablet binding.

_why:_ Every screen polls one snapshot keyed by the event's version. `toMatchView` takes a name form: full for an admin token, public (initials) otherwise. Public is the default so a new caller must ask for the full form. The board layout is one leaderboard for every team count, two included; the event owns `far` (the viewing distance factor, 0.85 to 1.2), set from the console or `?far=` with an admin token, and a television's keys move only a board whose event carries none.

_works when:_
- boundary "a public reader sees initials and an admin token the full name" at nameFormFor via guard "names on the wire"
- boundary "every write bumps the event version in its transaction" at bumpVersion via guard "bumpVersion"
- boundary "a mat binding dies when another tablet takes the mat" at bindMat via guard "bind and heartbeat"
- passes test "buildSnapshot"
- passes test "snapshot polling"
- passes test "unbind"

_files:_ `bound.ts`, `snapshot.ts`

### Match state machine  `server/src/match`
The event log per match, the derived caches, the mats, the bracket feeds and the lazy clock.

_why:_ `match_events` is the source of truth for a match. The cache columns on `matches` (points, clock, status, result) are rewritten in the same transaction as every event insert or undo. Undo deletes the newest event and the audit row carries the deleted row, so the scorer's seq contract holds. Undo is refused on a done match. A desk entry writes a `set_score` event (absolute set) so the log stays append only. An athlete's match score is the running total of scored actions, floored at zero. The win type is derived: a terminal gives its own type, points ahead gives `points`, a tie needs a decision. Win types: `submission`, `points`, `decision`, `walkover`, `dq`. States: `pending` to `live` to `done`; `reopen` returns a done match to live and is refused while a dependent match is live or done. A mat starts only a runnable match: both sides filled and no kid live on another mat (busy means pending or live, reversed from pending only after a kid went live on two mats at once). A blocked match keeps its slot. Every end, entry, skip and fill releases the idle mats. When a match ends, the server fills every side that feeds from it, inside the same transaction. A correction that changes the winner refills pending dependents or refuses ("M12 already ran on this result"). A points-only correction always passes. Matches hold two sides, a style (gi or nogi), a stable per-event number printed as M12, an order index per mat, a ruleset and, for a bracket, a division id, a round and a feed per empty side. Event mode: `entry` means the desk types every result (Smoothcomp runs the mats), `live` means the mats drive it. In entry mode Start event must not advance mats and the desk entry lands on the designed match.

_works when:_
- boundary "match events are the source of truth and the caches follow in the same transaction" at recompute via guard "appendMatchEvent"
- boundary "a score and a win type derive from the events" at deriveOutcome via guard "deriveOutcome"
- boundary "a mat starts only a runnable match" at advanceMat via guard "a mat only starts a match it can run"
- boundary "an ended feeder fills its dependents in the same transaction" at fillDependents via guard "fillDependents"
- boundary "a correction that changes a winner refuses when a dependent already ran" at assertDependentsPending via guard "a correction on a feeder"
- boundary "a reopen refuses while a dependent is live or done" at reopenMatch via guard "reopening a feeder"
- boundary "the clock expires lazily on read" at expireOverdue via guard "expireOverdue"
- passes test "undoLastMatchEvent"
- passes test "enterResult"
- passes test "skipMatch"

_files:_ `create.ts`, `derive.ts`, `entry.ts`, `events.ts`, `expiry.ts`, `fill.ts`, `lazyExpiry.ts`, `mats.ts`, `pairs.ts`

### Matchmaker  `server/src/matchmaker`
The proposer that drafts cross-team pairs for the organizer to confirm, swap or reject.

_why:_ Proposals are drafts in their own table; nothing reaches the board until confirmed. One proposal set per style; a propose replaces the event's drafts of that style whole. A kid with a match of this style already, whatever its status, is never offered a second one. A division kid is never offered. Same-gender is a veto when the event asks for it. Pairs over two weight classes apart are not offered today; the organizer adds them by hand and the dialog warns. Cost: a weight class is worth ten, a year of age two, a belt step a half, a rating point a tenth. The organizer ruled weight class first, then age (2026-09-11). The proposer takes pairs greedily by cost, so it can strand a kid whose only near candidate went to a closer pair, and nothing levels match counts across teams. The next work order replaces the greedy pass with a minimum-cost maximum-cardinality matching over the general graph (teams number two to eight, so blossom, not Hungarian), raises ERP to a weight that breaks an age tie, and turns the hard class gate into a step penalty so a far pair wins only when the alternative is no match. The decision that the matching must never match fewer kids than the greedy pass is the invariant that work order adds.

_works when:_
- boundary "pair cost ranks class, then age, then belt, then rating" at pairCost via guard "pairCost"
- boundary "the proposer offers each free kid once, closest cross-team pair first, and never a division kid" at proposeMatches via guard "proposeMatches"
- boundary "a hand-designed pair warns and never refuses" at pairWarnings via guard "pairWarnings"
- passes test "beltDistance"
- passes test "pairWhy"
- passes test "proposing"
- passes test "confirming"
- passes test "swapping a kid into a draft"

_files:_ `cost.ts`, `propose.ts`

### Roster  `server/src/roster`
The paste, the WellnessLiving sync, the leaderboard ERP join and the link suggestions.

_why:_ Athletes are copies, never references: a roster does not change under a running event. A paste creates kids (First, Last, Age, Weight, Belt, Gender, Team, Birth, Scoring) or matches, names resolved against the roster by the shared similarity module. Birth gives the age at the event date, because WellnessLiving exposes no birth date to the app's OAuth token (the one endpoint that carries it needs the legacy signed API; the credential ask is open). The sync asks the belts report for the roster's own names, location by location, with `` lower(`o_client.text_last`) like '%token%' ``. The report's `like` is case sensitive and `ilike`, `collate nocase` and `regexp` hang it; prove any filter with a Title case name. An exact match links; a near match waits for a person (Confirm or Not them). An empty location list answers 503 rather than stamping every row "Not in WellnessLiving". Pool inserts go in slices of 500 rows because one insert once bound 60723 variables against SQLite's 32766. ERP comes from the leaderboard app. WellnessLiving and the leaderboard overwrite a paste's values at the link; an age or weight the organizer edits by hand afterwards sticks through a re-run.

_works when:_
- boundary "a hand-edited age or weight sticks through a re-sync" at profileChanges via guard "profileChanges"
- boundary "the sync asks WellnessLiving for the roster's own names only" at rosterFilter via guard "roster routes"
- passes test "the bulk paste"
- passes test "the WellnessLiving search"
- passes test "linkUpdate"

_files:_ `belts.ts`, `config.ts`, `join.ts`, `leaderboard.ts`, `link.ts`, `parse.ts`, `slug.ts`, `sync.ts`, `types.ts`, `wl.ts`

### Routes  `server/src/routes`
The Hono routes: events, teams, athletes, roster, proposals, matches, divisions, mats, scoring, entries, board, Smoothcomp.

_why:_ Every write route calls the certification lock first and records an audit row. An event that is not certified can be deleted; the PIN is re-entered once the event left setup; a certified event must be unlocked first. While the event is in setup, scoring routes answer 409. The admin event detail returns the divisions (a web fallback once hid that it did not). A totality oracle over every exported route method, bare, with every service mocked as a trap, is a planned work order; until then the route suites above are the evidence.

_works when:_
- passes test "match routes"
- passes test "roster routes"
- passes test "entry routes"
- passes test "division routes"
- passes test "the delete and patch guards"
- passes test "GET /api/events/:eventId/connect"

_files:_ `athletes.ts`, `auth.ts`, `board.ts`, `divisions.ts`, `entries.ts`, `events.ts`, `matches.ts`, `proposals.ts`, `roster.ts`, `rulesets.ts`, `schedule.ts`, `scoring.ts`, `smoothcomp.ts`

### Running order  `server/src/schedule`
One static plan in waves across the mats, built on demand from every pending match.

_why:_ "Order matches" plans every pending match in waves, one slot per mat: every gi match before any nogi match (hard), younger first, a feeder at least two waves before its dependent, no kid in two adjacent waves (relaxed with a warning when nothing else fits), gaps recorded. The order index is wave-major, mat-minor. The estimate is the longest match per wave plus a minute. A live kid is fixed at wave -1. The pilot notes asked for gi first, younger first, one match of rest, nogi at the end; the planner factors in the number of mats.

_works when:_
- boundary "every gi match runs before any nogi match" at planSchedule via guard "planSchedule: the style rule gaps rather than takes a runnable nogi match"
- boundary "a feeder runs at least two waves before its dependent" at planSchedule via guard "planSchedule: the feeder rule holds a match two waves behind its feeders"
- boundary "a kid never fights in two adjacent waves unless nothing else fits" at planSchedule via guard "planSchedule: the rest rule keeps a kid out of the immediately adjacent wave"
- boundary "the plan is deterministic for the same input" at planSchedule via guard "planSchedule: determinism"
- passes test "planSchedule: priority order"
- passes test "planSchedule: the estimate"
- passes test "the schedule route"

_files:_ `plan.ts`

### Shared rules  `server/src/shared`
Pure modules the server, the console and the board read through: the leaderboard, team scoring, weight classes, clock arithmetic and name similarity.

_why:_ Teams rank by, in order: team points descending, wins descending, match points descending, then team position (creation order) ascending, which never ties. Two teams level on the first three share a rank and the ranks they use up are skipped: a table reads 1, 1, 3, never 1, 1, 2. One function, `rankTeams`, answers the standing for the snapshot, the console and the board. Team points come only from scoring athletes: 3 for a submission, 2 for a points win, 1 for a decision, a walkover or a DQ. A loss earns nothing. A team with at most ten kids scores with every kid and ignores the flags; a team with more than ten scores only with its marked kids, at most ten (the server refuses the eleventh with 422). A move to another team unmarks the kid. Wins count every done match a team's kid won, scoring athlete or not. Match points are the sum of the team's kids' match scores across the event. Weight class derives from the stored weight through the registration sheet's ten bands (upper bounds 39, 46, 53, 61, 70, 80, 90, 100, 110, 120, then tens). There is no weight class column. A weight is rounded before the band is read because a sync can carry a fraction. Name similarity: accents, hyphens, middle names and a nickname table count as exact; everything else scores by Dice over tokens with a suggestion floor of 0.6 and a margin of 0.05. A near match is a suggestion for a person, never a link.

_works when:_
- boundary "teams rank by team points, then wins, then match points, then position, and ties share a rank" at rankTeams via guard "rankTeams"
- boundary "team points come only from scoring athletes by win type" at teamPointsFor via guard "teamPointsFor"
- boundary "a team over ten kids scores only with its marked kids" at scoringSet via guard "scoringSet"
- boundary "a stored weight falls in one registration band" at weightClass via guard "weightClass"
- boundary "a name resolves through one similarity module" at nameScore via guard "nameScore"
- passes test "formatClock"
- passes test "roundLabel"

_files:_ `clock.ts`, `leaderboard.ts`, `round-label.ts`, `scoring.ts`, `similarity.ts`, `types.ts`, `weight-class.ts`

### Smoothcomp standings  `server/src/smoothcomp`
The winner of a Smoothcomp event computed from its finished matches against the roster.

_why:_ Four public JSON endpoints, a pure parser, fixtures. The calculation joins the event roster (names, teams, scoring marks) to Smoothcomp's finished matches through the shared scoring rules. A match counts only when both names resolve to a roster kid on a team; the rest are listed. Same-team pairs count and are listed. Matches dedupe by Smoothcomp id. One request under a 240 s deadline; past it, 504 and no table. The report is never stored and never reaches the board. The URL lives on the event.

_works when:_
- boundary "a Smoothcomp match counts only when both names resolve to roster kids on teams" at computeStandings via guard "computeStandings"
- boundary "a Smoothcomp win method maps to a win type and an unknown method earns one point" at winTypeFor via guard "winTypeFor"
- boundary "a Smoothcomp URL parses to one event" at parseSmoothcompUrl via guard "parseSmoothcompUrl"
- passes test "parseBracket"
- passes test "POST /events/:eventId/smoothcomp/standings"

_files:_ `brackets.ts`, `client.ts`, `parse.ts`, `standings.ts`, `url.ts`

### Console, scorer and board  `web/src`
The React client: the admin console, the tablet scorer, the TV board, the pastes and the polling.

_why:_ Design: one language, two dialects, and the dialect is chosen by viewing distance. The console refuses to shout; the board raises its voice only through geometry and size. Black ground, near-black surfaces with hairlines, a twelve step neutral ramp, 6px controls and 8px cards, a 4px spacing grid, Geist for text and Geist Mono for numbers, three weights (400, 500, 600) and nothing above. Exactly three state accents: `--live` (running now), `--attend` (a person is needed), `--fault` (failed, refused or ran out). Team colour appears only as dots, rules, plates and tinted names. The console is authored in CSS pixels; the board in `cqh` on a 16:9 stage, no `px` font size on the board and no `cqh` anywhere else; no hex literal in the app except the QR code's white tile; no forbidden grey token on the board. `scripts/design-lint.mjs` enforces those greps at the root lint and CI. The full brief (the Caliper rebuild, v0.5.0) is archived with the project folder on vinelab. Jake rejected the default shadcn dark look, brutalist, glow and glass, and gradients on the way to this. Polling: one poll per event; the snapshot commit is suspended while the operator is engaged (any open dialog), and a dialog whose content is the live state opts out by name with `data-poll-through`. The client never clears the admin token on a 401. A grid column minimum must exceed the row's fixed tracks (the roster name column once collapsed to zero). Buttons step 36, 40, 44, and the scorer's 64. Board rules: the leaderboard for every team count, far clamped by team count, no plate and no "Wins" word on leaderboard rows.

_works when:_
- boundary "a roster paste maps columns by header or by position" at parseRosterPaste via guard "parseRosterPaste, header row"
- boundary "a match paste creates pairs and division lines" at parseMatchPaste via guard "parseMatchPaste"
- boundary "the scoring cap is checked before the paste is sent" at scoringCapProblems via guard "scoringCapProblems"
- boundary "an open dialog holds the snapshot unless it opts out by name" at useHeldWhileEngaged via guard "useHeldWhileEngaged"
- passes test "EventPage, 6.4: one poll for the whole event"
- passes test "the board greps in 5.1"
- passes test "team colour guards"
- passes test "useSnapshot"

_files:_ `AdminShell.tsx`, `BeltDot.tsx`, `Clock.tsx`, `CodeField.tsx`, `ColourSwatches.tsx`, `Connecting.tsx`, `OverflowMenu.tsx`, `PinGate.tsx`, `QrCode.tsx`, `RouteFallback.tsx`, `SetupSteps.tsx`, `TeamCard.tsx`, `TeamDot.tsx`, `TeamPlate.tsx`, `Wordmark.tsx`, `dialog-frame.ts`, `alert.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`, `checkbox.tsx`, `chip.tsx`, `dialog.tsx`, `empty-state.tsx`, `field-set.tsx`, `input.tsx`, `label.tsx`, `list.tsx`, `segment.tsx`, `select.tsx`, `sheet.tsx`, `skeleton.tsx`, `spinner.tsx`, `table.tsx`, `tabs.tsx`, `textarea.tsx`, `toggle.tsx`, `api.ts`, `auth.ts`, `doubleBooking.ts`, `eventMode.ts`, `format.ts`, `freshness.ts`, `ids.ts`, `matBinding.ts`, `match-paste.ts`, `matchOrder.ts`, `matchView.ts`, `operatorEngaged.ts`, `pollInterval.ts`, `queries.ts`, `reorder.ts`, `roster-paste.ts`, `scoring.ts`, `setupFlow.ts`, `sounds.ts`, `team-guard.ts`, `types.ts`, `useAdminToken.ts`, `useClock.ts`, `useSnapshot.ts`, `useWakeLock.ts`, `utils.ts`, `main.tsx`, `router.tsx`, `AdminPage.tsx`, `BoardPage.tsx`, `ConnectPage.tsx`, `EventPage.tsx`, `MatPickPage.tsx`, `ScorerPage.tsx`, `NewEventDialog.tsx`, `Board.tsx`, `DoneBand.tsx`, `Hero.tsx`, `MatBand.tsx`, `MatRow.tsx`, `ResultsBand.tsx`, `SetupBand.tsx`, `budget.ts`, `names.ts`, `plan.ts`, `useFar.ts`, `useHeldResults.ts`, `useSettleTimer.ts`, `AddKidDialog.tsx`, `AddMatchDialog.tsx`, `CandidateRow.tsx`, `ContactDialog.tsx`, `DeleteEventDialog.tsx`, `DivisionsPanel.tsx`, `EntryTab.tsx`, `FinishEventDialog.tsx`, `KidPickerDialog.tsx`, `LinkCandidateDialog.tsx`, `LiveTab.tsx`, `MatchHistorySheet.tsx`, `MatchesTab.tsx`, `PasteMatchesDialog.tsx`, `PasteRosterDialog.tsx`, `ProfileSheet.tsx`, `ProposalsPanel.tsx`, `RegenerateConfirmDialog.tsx`, `ResultDialog.tsx`, `RosterTab.tsx`, `RulesetDialog.tsx`, `RulesetsTab.tsx`, `ScheduleDialog.tsx`, `SetupMatchesStep.tsx`, `SetupRosterStep.tsx`, `SmoothcompDialog.tsx`, `SyncRosterDialog.tsx`, `TeamList.tsx`, `TeamsDialog.tsx`, `clock-input.ts`, `entry-defaults.ts`, `entry-state.ts`, `link-report.ts`, `live-panel.ts`, `match-history.ts`, `matches-view.ts`, `roster-drag.ts`, `roster-group.tsx`, `roster-row.tsx`, `useWlSearch.ts`, `CenterColumn.tsx`, `ConfirmSheet.tsx`, `ScoreSide.tsx`, `actions.ts`, `budget.ts`, `ledger.ts`, `refusals.ts`, `useScorer.ts`, `viewport.ts`

## Structure

```
easton-duels/
├─ api/
│  └─ index.ts
├─ server/
│  ├─ src/
│  │  ├─ audit/  ●
│  │  │  ├─ certify.ts
│  │  │  └─ log.ts
│  │  ├─ auth/  ●
│  │  │  ├─ dbRateLimit.ts
│  │  │  ├─ middleware.ts
│  │  │  ├─ pin.ts
│  │  │  └─ tokens.ts
│  │  ├─ db/  ●
│  │  │  ├─ client.ts
│  │  │  └─ schema.ts
│  │  ├─ formats/  ●
│  │  │  ├─ divisions.ts
│  │  │  └─ generate.ts
│  │  ├─ lib/
│  │  │  ├─ env.ts
│  │  │  ├─ lanIp.ts
│  │  │  └─ validate.ts
│  │  ├─ live/  ●
│  │  │  ├─ bound.ts
│  │  │  └─ snapshot.ts
│  │  ├─ match/  ●
│  │  │  ├─ create.ts
│  │  │  ├─ derive.ts
│  │  │  ├─ entry.ts
│  │  │  ├─ events.ts
│  │  │  ├─ expiry.ts
│  │  │  ├─ fill.ts
│  │  │  ├─ lazyExpiry.ts
│  │  │  ├─ mats.ts
│  │  │  └─ pairs.ts
│  │  ├─ matchmaker/  ●
│  │  │  ├─ cost.ts
│  │  │  └─ propose.ts
│  │  ├─ roster/  ●
│  │  │  ├─ belts.ts
│  │  │  ├─ config.ts
│  │  │  ├─ join.ts
│  │  │  ├─ leaderboard.ts
│  │  │  ├─ link.ts
│  │  │  ├─ parse.ts
│  │  │  ├─ slug.ts
│  │  │  ├─ sync.ts
│  │  │  ├─ types.ts
│  │  │  └─ wl.ts
│  │  ├─ routes/  ●
│  │  │  ├─ athletes.ts
│  │  │  ├─ auth.ts
│  │  │  ├─ board.ts
│  │  │  ├─ divisions.ts
│  │  │  ├─ entries.ts
│  │  │  ├─ events.ts
│  │  │  ├─ matches.ts
│  │  │  ├─ proposals.ts
│  │  │  ├─ roster.ts
│  │  │  ├─ rulesets.ts
│  │  │  ├─ schedule.ts
│  │  │  ├─ scoring.ts
│  │  │  └─ smoothcomp.ts
│  │  ├─ schedule/  ●
│  │  │  └─ plan.ts
│  │  ├─ shared/  ●
│  │  │  ├─ clock.ts
│  │  │  ├─ leaderboard.ts
│  │  │  ├─ round-label.ts
│  │  │  ├─ scoring.ts
│  │  │  ├─ similarity.ts
│  │  │  ├─ types.ts
│  │  │  └─ weight-class.ts
│  │  ├─ smoothcomp/  ●
│  │  │  ├─ brackets.ts
│  │  │  ├─ client.ts
│  │  │  ├─ parse.ts
│  │  │  ├─ standings.ts
│  │  │  └─ url.ts
│  │  ├─ app.ts
│  │  ├─ context.ts
│  │  ├─ dev.ts
│  │  └─ index.ts
│  ├─ test/
│  │  ├─ app.test.ts
│  │  ├─ athletes.test.ts
│  │  ├─ audit.test.ts
│  │  ├─ auth.test.ts
│  │  ├─ belts.test.ts
│  │  ├─ bound.test.ts
│  │  ├─ certify.test.ts
│  │  ├─ clock.test.ts
│  │  ├─ db.test.ts
│  │  ├─ derive.test.ts
│  │  ├─ divisions-routes.test.ts
│  │  ├─ divisions.test.ts
│  │  ├─ entry.test.ts
│  │  ├─ env.test.ts
│  │  ├─ events.test.ts
│  │  ├─ expiry.test.ts
│  │  ├─ fill.test.ts
│  │  ├─ fixtures.ts
│  │  ├─ generate.test.ts
│  │  ├─ health.test.ts
│  │  ├─ helpers.ts
│  │  ├─ join.test.ts
│  │  ├─ lan.test.ts
│  │  ├─ lanIp.test.ts
│  │  ├─ lazy-expiry.test.ts
│  │  ├─ leaderboard.test.ts
│  │  ├─ link.test.ts
│  │  ├─ match-events.test.ts
│  │  ├─ matches.test.ts
│  │  ├─ matchmaker.test.ts
│  │  ├─ mats.test.ts
│  │  ├─ migration-0007.test.ts
│  │  ├─ migration-0008.test.ts
│  │  ├─ migration-0009.test.ts
│  │  ├─ migration-0010.test.ts
│  │  ├─ migration-0011.test.ts
│  │  ├─ migration-0012.test.ts
│  │  ├─ migration-0013.test.ts
│  │  ├─ migration-0014.test.ts
│  │  ├─ plan.test.ts
│  │  ├─ proposals.test.ts
│  │  ├─ propose.test.ts
│  │  ├─ rate-limit.test.ts
│  │  ├─ roster.test.ts
│  │  ├─ round-label.test.ts
│  │  ├─ rulesets.test.ts
│  │  ├─ schedule.test.ts
│  │  ├─ scoring.test.ts
│  │  ├─ similarity.test.ts
│  │  ├─ smoothcomp-fixtures.ts
│  │  ├─ smoothcomp-parse.test.ts
│  │  ├─ smoothcomp-route.test.ts
│  │  ├─ smoothcomp-standings.test.ts
│  │  ├─ smoothcomp-url.test.ts
│  │  ├─ snapshot.test.ts
│  │  ├─ sync.test.ts
│  │  ├─ team-leaderboard.test.ts
│  │  ├─ team-scoring.test.ts
│  │  ├─ weight-class.test.ts
│  │  └─ wl.test.ts
│  ├─ drizzle.config.ts
│  └─ vitest.config.ts
├─ web/
│  ├─ src/  ●
│  │  ├─ components/
│  │  │  ├─ ui/
│  │  │  │  ├─ alert.tsx
│  │  │  │  ├─ badge.tsx
│  │  │  │  ├─ button.tsx
│  │  │  │  ├─ card.tsx
│  │  │  │  ├─ checkbox.tsx
│  │  │  │  ├─ chip.tsx
│  │  │  │  ├─ dialog.tsx
│  │  │  │  ├─ empty-state.tsx
│  │  │  │  ├─ field-set.tsx
│  │  │  │  ├─ input.tsx
│  │  │  │  ├─ label.tsx
│  │  │  │  ├─ list.tsx
│  │  │  │  ├─ segment.tsx
│  │  │  │  ├─ select.tsx
│  │  │  │  ├─ sheet.tsx
│  │  │  │  ├─ skeleton.tsx
│  │  │  │  ├─ spinner.tsx
│  │  │  │  ├─ table.tsx
│  │  │  │  ├─ tabs.tsx
│  │  │  │  ├─ textarea.tsx
│  │  │  │  └─ toggle.tsx
│  │  │  ├─ AdminShell.tsx
│  │  │  ├─ BeltDot.tsx
│  │  │  ├─ Clock.tsx
│  │  │  ├─ CodeField.tsx
│  │  │  ├─ ColourSwatches.tsx
│  │  │  ├─ Connecting.tsx
│  │  │  ├─ OverflowMenu.tsx
│  │  │  ├─ PinGate.tsx
│  │  │  ├─ QrCode.tsx
│  │  │  ├─ RouteFallback.tsx
│  │  │  ├─ SetupSteps.tsx
│  │  │  ├─ TeamCard.tsx
│  │  │  ├─ TeamDot.tsx
│  │  │  ├─ TeamPlate.tsx
│  │  │  ├─ Wordmark.tsx
│  │  │  └─ dialog-frame.ts
│  │  ├─ lib/
│  │  │  ├─ api.ts
│  │  │  ├─ auth.ts
│  │  │  ├─ doubleBooking.ts
│  │  │  ├─ eventMode.ts
│  │  │  ├─ format.ts
│  │  │  ├─ freshness.ts
│  │  │  ├─ ids.ts
│  │  │  ├─ matBinding.ts
│  │  │  ├─ match-paste.ts
│  │  │  ├─ matchOrder.ts
│  │  │  ├─ matchView.ts
│  │  │  ├─ operatorEngaged.ts
│  │  │  ├─ pollInterval.ts
│  │  │  ├─ queries.ts
│  │  │  ├─ reorder.ts
│  │  │  ├─ roster-paste.ts
│  │  │  ├─ scoring.ts
│  │  │  ├─ setupFlow.ts
│  │  │  ├─ sounds.ts
│  │  │  ├─ team-guard.ts
│  │  │  ├─ types.ts
│  │  │  ├─ useAdminToken.ts
│  │  │  ├─ useClock.ts
│  │  │  ├─ useSnapshot.ts
│  │  │  ├─ useWakeLock.ts
│  │  │  └─ utils.ts
│  │  ├─ routes/
│  │  │  ├─ admin/
│  │  │  │  └─ NewEventDialog.tsx
│  │  │  ├─ board/
│  │  │  │  ├─ Board.tsx
│  │  │  │  ├─ DoneBand.tsx
│  │  │  │  ├─ Hero.tsx
│  │  │  │  ├─ MatBand.tsx
│  │  │  │  ├─ MatRow.tsx
│  │  │  │  ├─ ResultsBand.tsx
│  │  │  │  ├─ SetupBand.tsx
│  │  │  │  ├─ budget.ts
│  │  │  │  ├─ names.ts
│  │  │  │  ├─ plan.ts
│  │  │  │  ├─ useFar.ts
│  │  │  │  ├─ useHeldResults.ts
│  │  │  │  └─ useSettleTimer.ts
│  │  │  ├─ event/
│  │  │  │  ├─ AddKidDialog.tsx
│  │  │  │  ├─ AddMatchDialog.tsx
│  │  │  │  ├─ CandidateRow.tsx
│  │  │  │  ├─ ContactDialog.tsx
│  │  │  │  ├─ DeleteEventDialog.tsx
│  │  │  │  ├─ DivisionsPanel.tsx
│  │  │  │  ├─ EntryTab.tsx
│  │  │  │  ├─ FinishEventDialog.tsx
│  │  │  │  ├─ KidPickerDialog.tsx
│  │  │  │  ├─ LinkCandidateDialog.tsx
│  │  │  │  ├─ LiveTab.tsx
│  │  │  │  ├─ MatchHistorySheet.tsx
│  │  │  │  ├─ MatchesTab.tsx
│  │  │  │  ├─ PasteMatchesDialog.tsx
│  │  │  │  ├─ PasteRosterDialog.tsx
│  │  │  │  ├─ ProfileSheet.tsx
│  │  │  │  ├─ ProposalsPanel.tsx
│  │  │  │  ├─ RegenerateConfirmDialog.tsx
│  │  │  │  ├─ ResultDialog.tsx
│  │  │  │  ├─ RosterTab.tsx
│  │  │  │  ├─ RulesetDialog.tsx
│  │  │  │  ├─ RulesetsTab.tsx
│  │  │  │  ├─ ScheduleDialog.tsx
│  │  │  │  ├─ SetupMatchesStep.tsx
│  │  │  │  ├─ SetupRosterStep.tsx
│  │  │  │  ├─ SmoothcompDialog.tsx
│  │  │  │  ├─ SyncRosterDialog.tsx
│  │  │  │  ├─ TeamList.tsx
│  │  │  │  ├─ TeamsDialog.tsx
│  │  │  │  ├─ clock-input.ts
│  │  │  │  ├─ entry-defaults.ts
│  │  │  │  ├─ entry-state.ts
│  │  │  │  ├─ link-report.ts
│  │  │  │  ├─ live-panel.ts
│  │  │  │  ├─ match-history.ts
│  │  │  │  ├─ matches-view.ts
│  │  │  │  ├─ roster-drag.ts
│  │  │  │  ├─ roster-group.tsx
│  │  │  │  ├─ roster-row.tsx
│  │  │  │  └─ useWlSearch.ts
│  │  │  ├─ scorer/
│  │  │  │  ├─ CenterColumn.tsx
│  │  │  │  ├─ ConfirmSheet.tsx
│  │  │  │  ├─ ScoreSide.tsx
│  │  │  │  ├─ actions.ts
│  │  │  │  ├─ budget.ts
│  │  │  │  ├─ ledger.ts
│  │  │  │  ├─ refusals.ts
│  │  │  │  ├─ useScorer.ts
│  │  │  │  └─ viewport.ts
│  │  │  ├─ AdminPage.tsx
│  │  │  ├─ BoardPage.tsx
│  │  │  ├─ ConnectPage.tsx
│  │  │  ├─ EventPage.tsx
│  │  │  ├─ MatPickPage.tsx
│  │  │  └─ ScorerPage.tsx
│  │  ├─ main.tsx
│  │  └─ router.tsx
│  ├─ test/
│  │  ├─ AddKidDialog.test.tsx
│  │  ├─ AddMatchDialog.test.tsx
│  │  ├─ AdminPage.test.tsx
│  │  ├─ AdminShell.test.tsx
│  │  ├─ Alert.test.tsx
│  │  ├─ BoardPage.test.tsx
│  │  ├─ Chip.test.tsx
│  │  ├─ Clock.test.tsx
│  │  ├─ CodeField.test.tsx
│  │  ├─ ColourSwatches.test.tsx
│  │  ├─ ConnectPage.test.tsx
│  │  ├─ DivisionsPanel.test.tsx
│  │  ├─ EmptyState.test.tsx
│  │  ├─ EntryTab.test.tsx
│  │  ├─ EventPage.test.tsx
│  │  ├─ KidPickerDialog.test.tsx
│  │  ├─ LiveTab.test.tsx
│  │  ├─ MatPickPage.test.tsx
│  │  ├─ MatchHistorySheet.test.tsx
│  │  ├─ MatchesTab.test.tsx
│  │  ├─ NewEventDialog.test.tsx
│  │  ├─ PasteMatchesDialog.test.tsx
│  │  ├─ PasteRosterDialog.test.tsx
│  │  ├─ PinGate.test.tsx
│  │  ├─ ProfileSheet.test.tsx
│  │  ├─ ProposalsPanel.test.tsx
│  │  ├─ ResultDialog.test.tsx
│  │  ├─ RosterTab.test.tsx
│  │  ├─ RouteFallback.test.tsx
│  │  ├─ RulesetDialog.test.tsx
│  │  ├─ RulesetsTab.test.tsx
│  │  ├─ ScheduleDialog.test.tsx
│  │  ├─ ScorerPage.test.tsx
│  │  ├─ Segment.test.tsx
│  │  ├─ SetupMatchesStep.test.tsx
│  │  ├─ SetupRosterStep.test.tsx
│  │  ├─ Skeleton.test.tsx
│  │  ├─ SmoothcompDialog.test.tsx
│  │  ├─ Spinner.test.tsx
│  │  ├─ SyncRosterDialog.test.tsx
│  │  ├─ Table.test.tsx
│  │  ├─ TeamList.test.tsx
│  │  ├─ Textarea.test.tsx
│  │  ├─ Toggle.test.tsx
│  │  ├─ api.test.ts
│  │  ├─ auth.test.ts
│  │  ├─ board-budget.test.ts
│  │  ├─ board-css.test.ts
│  │  ├─ board-format.test.ts
│  │  ├─ clock-input.test.ts
│  │  ├─ cursor-css.test.ts
│  │  ├─ entry-defaults.test.ts
│  │  ├─ entry-state.test.ts
│  │  ├─ eventMode.test.ts
│  │  ├─ fakes.ts
│  │  ├─ format.test.ts
│  │  ├─ freshness.test.ts
│  │  ├─ link-report.test.ts
│  │  ├─ match-history.test.ts
│  │  ├─ match-paste.test.ts
│  │  ├─ matchView.test.ts
│  │  ├─ operatorEngaged.test.ts
│  │  ├─ pollInterval.test.ts
│  │  ├─ reorder.test.ts
│  │  ├─ roster-paste.test.ts
│  │  ├─ router.test.tsx
│  │  ├─ scorer-model.test.ts
│  │  ├─ scoring.test.ts
│  │  ├─ setup.ts
│  │  ├─ shell-css.test.ts
│  │  ├─ similarity.test.ts
│  │  ├─ sounds.test.ts
│  │  ├─ team-guard.test.ts
│  │  ├─ useClock.test.tsx
│  │  ├─ useFar.test.tsx
│  │  ├─ useHeldResults.test.tsx
│  │  ├─ useScorer.test.tsx
│  │  ├─ useSettleTimer.test.tsx
│  │  ├─ useSnapshot.test.tsx
│  │  ├─ useWakeLock.test.tsx
│  │  └─ useWlSearch.test.tsx
│  └─ vite.config.ts
└─ vitest.config.ts
```

