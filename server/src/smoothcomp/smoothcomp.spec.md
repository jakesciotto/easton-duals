# Smoothcomp standings
The winner of a Smoothcomp event computed from its finished matches against the roster.

## invariants
- a Smoothcomp match counts only when both names resolve to roster kids on teams
- a Smoothcomp win method maps to a win type and an unknown method earns one point
- a Smoothcomp URL parses to one event

## works when
- boundary "a Smoothcomp match counts only when both names resolve to roster kids on teams" at computeStandings via guard "a Smoothcomp match counts only when both names resolve to roster kids on teams"
- boundary "a Smoothcomp win method maps to a win type and an unknown method earns one point" at winTypeFor via guard "a Smoothcomp win method maps to a win type and an unknown method earns one point"
- boundary "a Smoothcomp URL parses to one event" at parseSmoothcompUrl via guard "a Smoothcomp URL parses to one event"
- passes test "parseBracket"
- passes test "the Smoothcomp standings route"

## why
Four public JSON endpoints, a pure parser, fixtures. The calculation joins the event roster
(names, teams, scoring marks) to Smoothcomp's finished matches through the shared scoring
rules. A match counts only when both names resolve to a roster kid on a team; the rest are
listed. Same-team pairs count and are listed. Matches dedupe by Smoothcomp id. One request
under a 240 s deadline; past it, 504 and no table. The report is never stored and never
reaches the board. The URL lives on the event.

## refutations
- a Smoothcomp match counts only when both names resolve to roster kids on teams: dropped the teamId === null checks -> RED, "1 failed | 2 passed" in a Smoothcomp match counts only when both names resolve to roster kids on teams
- a Smoothcomp win method maps to a win type and an unknown method earns one point: winTypeFor falls back to 'points' instead of null -> RED, "1 failed | 1 passed" in a Smoothcomp win method maps to a win type and an unknown method earns one point
- a Smoothcomp URL parses to one event: removed the smoothcomp.com host check -> RED, "1 failed | 5 passed" in a Smoothcomp URL parses to one event
