# Easton Duals
A team duels scoring app for a kids jiu jitsu gym: one Hono server on libSQL, one React console, a TV board, and a tablet scorer.

## invariants
- the served version equals the package version

## works when
- typechecks
- boundary "the served version equals the package version" at VERSION via guard "health"
- passes test "the write routes this suite covers"
- coherence.config.json exists at root
- CHANGELOG.md exists at root

## why
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

## refutations
- the served version equals the package version: set VERSION to '0.0.0' -> RED, "1 failed | 0 passed" in health
