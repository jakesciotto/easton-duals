# Routes
The Hono routes: events, teams, athletes, roster, proposals, matches, divisions, mats, scoring, entries, board, Smoothcomp.

## works when
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
admin event detail returns the divisions (a web fallback once hid that it did not). A
totality oracle over every exported route method, bare, with every service mocked as a trap,
is a planned work order; until then the route suites above are the evidence.
