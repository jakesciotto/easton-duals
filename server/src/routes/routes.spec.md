# Routes
The Hono routes: events, teams, athletes, roster, proposals, matches, divisions, mats, scoring, entries, board, Smoothcomp.

## invariants
- every protected route rejects a request without a valid token

## works when
- boundary "every protected route rejects a request without a valid token" at requireAdmin via guard "every protected route rejects a request without a valid token"
- passes test "match routes"
- passes test "the sync asks WellnessLiving for the roster's own names only"
- passes test "entry routes"
- passes test "division routes"
- passes test "the delete and patch guards"
- passes test "the scoring cap at the routes"
- passes test "the scoring cap on a move"
- passes test "the event connect route"

## why
Every write route calls the certification lock first and records an audit row. An event that
is not certified can be deleted; the PIN is re-entered once the event left setup; a certified
event must be unlocked first. While the event is in setup, scoring routes answer 409. The
admin event detail returns the divisions (a web fallback once hid that it did not). One
oracle walks every route the app registers under /api, bare, and holds a double-entry list of
the five open by design: health, lan, the PIN check, the public snapshot, and the mat bind
(gated by the mat code and the rate limit). Everything else must answer 401.

## refutations
- every protected route rejects a request without a valid token: attachAuth resolves a missing header as an admin -> RED, "1 failed | 0 passed" in every protected route rejects a request without a valid token
