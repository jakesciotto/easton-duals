# Shared rules
Pure modules the server, the console and the board read through: the leaderboard, team scoring, weight classes, clock arithmetic and name similarity.

## invariants
- team ranking: Teams rank by team points, then wins, then match points, then position, and ties share a rank.
  over: an order decided by each key alone, a tie on the first three keys at the top and lower in the table, an event with no teams, and the input list left unchanged
  via: teams rank by team points, then wins, then match points, then position, and ties share a rank
  because: rankTeams is the one standing the snapshot, the console and the board show, and teams level on the first three keys share a rank and skip the ranks they use
  refuted: flipped the wins and match points sort directions -> the test teams rank by team points, then wins, then match points, then position, and ties share a rank went red (2026-10-22)
  kinds: none
- team points: Team points come only from scoring athletes by win type.
  over: the team points of each of the five win types; and a snapshot of five done matches where a team over the cap wins with a marked kid, an unmarked kid and a second unmarked kid, and a team inside the cap wins by points and by DQ
  via: team points come only from scoring athletes by win type
  because: teamPointsFor reads the points from the TEAM_POINTS table, three for a submission, two for points and one for a decision, a walkover or a DQ, and buildSnapshot counts every win but adds team points only when the winner is in the scoring set of their team
  refuted: buildSnapshot pays team points for every win of a kid on a team, marked or not -> the test team points come only from scoring athletes by win type went red, 1 of 2 (2026-10-24)
  kinds: none
- scoring cap: A team over ten kids scores only with its marked kids.
  over: teams of three, ten and eleven kids, with and without marked kids
  via: a team over ten kids scores only with its marked kids
  because: scoringSet returns every kid of a team inside the cap and only the marked kids of a larger team
  refuted: scoringSet no longer filters on the scoring flag -> the test a team over ten kids scores only with its marked kids went red (2026-10-22)
  kinds: none
- weight band: A stored weight falls in one registration band.
  over: every band edge, each band label, the bands above 120 pounds, fractional weights and a zero weight
  via: a stored weight falls in one registration band
  because: weightClass rounds a weight to the pound and reads the first band whose upper bound holds it, so a kid falls in exactly one band of the registration sheet
  refuted: the weightClass band bound is strict -> the test a stored weight falls in one registration band went red (2026-10-22)
  kinds: none
- name similarity: A name resolves through one similarity module.
  over: a hyphenated surname, the exact last name bonus, the cap at 1, a near and a far candidate, the floor and margin constants, and eight exact name cases
  via: a name resolves through one similarity module
  because: exactName and nameScore are the one rule the roster sync, the Smoothcomp standings and the match paste use to compare names, so an accent, a hyphen, a middle name or a nickname never splits one kid in two
  refuted: the same last name bonus of nameScore is inverted -> the test a name resolves through one similarity module went red (2026-10-22)
  kinds: identity
  checklist: capability-authorization dismissed: a name comparison grants no credential and authorizes nothing
  checklist: canonical-encoding declared as name similarity
  checklist: identity-continuity dismissed: the module compares names and writes no link, the roster sync owns every link
