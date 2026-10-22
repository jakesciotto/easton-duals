# Smoothcomp standings
The winner of a Smoothcomp event computed from its finished matches against the roster.

## invariants
- roster kids only: A Smoothcomp match counts only when both names resolve to roster kids on teams.
  over: eight parsed matches with a bye, an unfinished match, a kid on no team, a name off the roster, a same team pair and an unknown method; a team over the cap with marked and unmarked kids; a tie that shares a rank; and seats that resolve by exact, canonical or near name, or to nothing
  via: a Smoothcomp match counts only when both names resolve to roster kids on teams
  because: computeStandings counts a finished match only when both seats resolve to one roster kid with a team, and lists every other name, so a guest or a teamless kid never moves the table
  refuted: dropped the teamId null checks from computeStandings -> the test a Smoothcomp match counts only when both names resolve to roster kids on teams went red (2026-10-22)
  kinds: none
- win methods: A Smoothcomp win method maps to a win type and an unknown method earns one point.
  over: the method Disqualification in mixed case, and the method bye
  via: a Smoothcomp win method maps to a win type and an unknown method earns one point
  because: winTypeFor reads a method case insensitively from one table and answers null for anything else, and computeStandings pays one team point for a null type and names the method
  refuted: winTypeFor falls back to points instead of null -> the test a Smoothcomp win method maps to a win type and an unknown method earns one point went red (2026-10-22)
  kinds: none
- smoothcomp host: A Smoothcomp URL parses to one event.
  over: a results URL, a promoter subdomain, an empty and a blank input, text that is no URL, a host outside smoothcomp.com and a path with no event id
  via: a Smoothcomp URL parses to one event
  because: every later request is built from the origin and event id this parse answers, so a host outside smoothcomp.com must be refused before any fetch
  refuted: removed the smoothcomp.com host check -> the test a Smoothcomp URL parses to one event went red (2026-10-22)
  kinds: output
  checklist: destination-confinement declared as smoothcomp host
  checklist: redaction dismissed: the request carries only the public event id and asks for public JSON
  checklist: commit-ordered-effects dismissed: the standings read changes nothing at Smoothcomp and nothing is stored
  checklist: circuit-breaker-policy dismissed: one request runs under a 240 second deadline and answers 504 past it, and no breaker exists
  checklist: declared-target-coverage dismissed: one URL names one event
