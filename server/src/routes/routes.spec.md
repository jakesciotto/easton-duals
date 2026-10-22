# Routes
The Hono routes: events, teams, athletes, roster, proposals, matches, divisions, mats, scoring, entries, board, Smoothcomp.

## entrances
- routes auth: the PIN check that mints an admin token, from the console
  handler: authRoutes in auth.ts
  trust: internet
- routes board: the public snapshot every board, tablet and console polls
  handler: boardRoutes in board.ts
  trust: internet
- routes events: event and team setup, certify, unlock, history and the connect page, from the console
  handler: eventRoutes in events.ts
  trust: internet
- routes athletes: roster edits, links, team moves and scoring marks, from the console
  handler: athleteRoutes in athletes.ts
  trust: internet
- routes divisions: division create, edit, seed and delete, from the console
  handler: divisionRoutes in divisions.ts
  trust: internet
- routes entries: results the desk types for a match or a pair, from the console
  handler: entryRoutes in entries.ts
  trust: internet
- routes matches: match create, paste, edit, reorder, delete and history, from the console
  handler: matchRoutes in matches.ts
  trust: internet
- routes proposals: the proposer's drafts and their confirm, swap and delete, from the console
  handler: proposalRoutes in proposals.ts
  trust: internet
- routes rulesets: ruleset create, edit and delete, from the console
  handler: rulesetRoutes in rulesets.ts
  trust: internet
- routes roster: the WellnessLiving sync, the paste match, the candidate pool and the search, from the console
  handler: rosterRoutes in roster.ts
  trust: internet
- routes schedule: the running order plan and its apply, from the console
  handler: scheduleRoutes in schedule.ts
  trust: internet
- routes scoring: the mat bind and the tablet's scoring writes, heartbeats and advances
  handler: scoringRoutes in scoring.ts
  trust: internet
- routes smoothcomp: the Smoothcomp standings for an event, from the console
  handler: smoothcompRoutes in smoothcomp.ts
  trust: internet

## invariants
- route auth totality: Every route the app registers under /api answers 401 without a token, except the five open by design.
  over: every GET, POST, PATCH, PUT and DELETE route the app registers under /api, sent with no token, against a double entry list of the five open routes
  via: every protected route rejects a request without a valid token
  because: a route added without requireAdmin or requireMatOrAdmin fails this walk, and a listed open route that starts to answer 401 fails it too, so the open set is health, lan, the PIN check, the public snapshot and the mat bind and nothing else
  crossing: internet -> admin
  entrances: routes auth, routes board, routes events, routes athletes, routes divisions, routes entries, routes matches, routes proposals, routes rulesets, routes roster, routes schedule, routes scoring, routes smoothcomp, route GET /api/health, route GET /api/lan
  refuted: attachAuth resolves a missing header as an admin -> the test every protected route rejects a request without a valid token went red (2026-10-22)
  kinds: credential
  checklist: capability-authorization declared as route auth totality
  checklist: revalidated-permission dismissed: every request verifies its bearer again and no work is deferred
  checklist: message-authenticity dismissed: the token signature is the auth component's signed tokens invariant
  checklist: encrypted-storage dismissed: the server never stores a token
  checklist: key-rotation-compatibility dismissed: nothing encrypted is retained
  checklist: separation-of-duties dismissed: one admin role holds every setup route and no approval policy exists
