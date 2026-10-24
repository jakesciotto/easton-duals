# Smoothcomp standings
The winner of a Smoothcomp event computed from its finished matches against the roster.

## invariants
- roster kids only: A Smoothcomp match counts only when both names resolve to roster kids on teams.
  over: eight parsed matches with a bye, an unfinished match, a kid on no team, a name off the roster, a same team pair and an unknown method; a team over the cap with marked and unmarked kids; a tie that shares a rank; and seats that resolve by exact, canonical or near name, or to nothing
  via: a Smoothcomp match counts only when both names resolve to roster kids on teams
  because: computeStandings counts a finished match only when both seats resolve to one roster kid with a team, and lists every other name, so a guest or a teamless kid never moves the table; an elimination bracket carries state.matches and a round robin or best-of-three bracket carries state.rounds instead, and allMatches reads both
  refuted: dropped the teamId null checks from computeStandings -> the test a Smoothcomp match counts only when both names resolve to roster kids on teams went red (2026-10-22)
  kinds: none
- win methods: A Smoothcomp win method maps to a win type and an unknown method earns one point.
  over: every method of the table in lower case and padded upper case, five methods outside it, and one computeStandings run per method for five known and two unknown methods with a scoring winner
  via: a Smoothcomp win method maps to a win type and an unknown method earns one point
  because: winTypeFor reads a trimmed method case insensitively from one table and answers null for anything else, and computeStandings pays a scoring winner the TEAM_POINTS of a known type, one team point for a null type, and names the unknown method
  refuted: computeStandings pays zero team points for an unknown method -> the test a Smoothcomp win method maps to a win type and an unknown method earns one point went red, 1 of 4 (2026-10-24)
  kinds: none
- smoothcomp host: A Smoothcomp URL parses to one event.
  over: a results URL, a promoter subdomain, an empty and a blank input, text that is no URL, a host outside smoothcomp.com, six look-alike hosts and a path with no event id; six related bracket links on the origin host, off it, protocol relative, on another subdomain and on two look-alike hosts; and a redirect that stays on smoothcomp.com beside three that leave it
  via: a Smoothcomp URL parses to one event
  because: parseSmoothcompUrl refuses a host outside smoothcomp.com before the first fetch and keeps the origin and the event id; the bracket list and the render data come from that origin, a related bracket link in a payload is fetched from its own link only when its host equals the origin host, and fetchJson follows a redirect by hand only while isSmoothcompHost holds for its target, so no request leaves smoothcomp.com; the JSON endpoints answer a plain server request with a browser User-Agent while the HTML pages sit behind a Cloudflare challenge, and no code here solves that challenge
  crossing: admin -> smoothcomp
  entrances: none
  refuted: fetchJson follows a redirect without the smoothcomp.com host check -> the test a Smoothcomp URL parses to one event went red, 1 of 9 (2026-10-24)
  kinds: output
  checklist: destination-confinement declared as smoothcomp host
  checklist: redaction dismissed: the request carries only the public event id and asks for public JSON
  checklist: commit-ordered-effects dismissed: the standings read changes nothing at Smoothcomp and nothing is stored
  checklist: circuit-breaker-policy dismissed: one request runs under a 240 second deadline and answers 504 past it, and no breaker exists
  checklist: declared-target-coverage dismissed: one URL names one event
