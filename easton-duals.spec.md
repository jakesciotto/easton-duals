# Easton Duals
A team duels scoring app for a kids jiu jitsu gym: one Hono server on libSQL, one React console, a TV board, and a tablet scorer.

## trust levels
- internet: a browser, a television or a tablet on the internet or the gym LAN, before a bearer verifies
- admin: a request whose bearer verifies as an admin token minted from the PIN
- mat: a request whose bearer verifies as a mat token for one mat at its current bind epoch
- store: the libSQL rows, a file on the gym box or Turso in production
- operator: a developer or the CI runner at a shell, with the database credentials in env
- wellnessliving: the WellnessLiving belts report the roster sync reads with the gym's client credentials
- leaderboard: the easton-leaderboard rows the ERP join reads
- smoothcomp: the public Smoothcomp JSON endpoints the standings read

## entrances
- route GET /api/health: the served version, for anyone
  handler: createApp in server/src/app.ts
  trust: internet
- route GET /api/lan: the address a tablet types to reach the server, for anyone
  handler: createApp in server/src/app.ts
  trust: internet
- function api/index: the Vercel function that serves every api request in production
  handler: handler in api/index.ts
  trust: internet
- script start: the LAN entry on the gym box, which serves the app and the built console
  handler: server/src/index.ts
  trust: internet
- script db:migrate: an operator applies the pending migrations to a remote database on purpose
  handler: server/scripts/migrate.mjs
  trust: operator
- script e2e: an operator runs the built server against a browser flow
  handler: scripts/e2e.mjs
  trust: operator
- script smoke cloud: an operator probes a deployed build
  handler: scripts/smoke-cloud.mjs
  trust: operator
- script smoke proposals: an operator probes the proposer against a running server
  handler: scripts/smoke-proposals.mjs
  trust: operator
- script smoke sync: an operator probes the roster sync against a running server
  handler: scripts/smoke-sync.mjs
  trust: operator
- script design lint: the root lint greps the web sources for the design rules
  handler: scripts/design-lint.mjs
  trust: operator

## invariants
- version parity: The served version equals the package version.
  over: the version field of the health answer against the root package.json version
  via: the served version equals the package version
  because: a release moves the three package files and the VERSION constant together, so a deployed build can be matched to its tag; v0.17.2 missed the constant
  refuted: set VERSION to '0.0.0' -> the test the served version equals the package version went red (2026-10-22)
  kinds: none
