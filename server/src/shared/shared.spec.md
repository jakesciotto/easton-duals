# Shared rules
Pure modules the server, the console and the board read through: the leaderboard, team scoring, weight classes, clock arithmetic and name similarity.

## invariants
- teams rank by team points, then wins, then match points, then position, and ties share a rank
- team points come only from scoring athletes by win type
- a team over ten kids scores only with its marked kids
- a stored weight falls in one registration band
- a name resolves through one similarity module

## works when
- boundary "teams rank by team points, then wins, then match points, then position, and ties share a rank" at rankTeams via guard "rankTeams"
- boundary "team points come only from scoring athletes by win type" at teamPointsFor via guard "teamPointsFor"
- boundary "a team over ten kids scores only with its marked kids" at scoringSet via guard "scoringSet"
- boundary "a stored weight falls in one registration band" at weightClass via guard "weightClass"
- boundary "a name resolves through one similarity module" at nameScore via guard "nameScore"
- passes test "formatClock"
- passes test "roundLabel"

## why
Teams rank by, in order: team points descending, wins descending, match points descending,
then team position (creation order) ascending, which never ties. Two teams level on the first
three share a rank and the ranks they use up are skipped: a table reads 1, 1, 3, never 1, 1, 2.
One function, `rankTeams`, answers the standing for the snapshot, the console and the board.

Team points come only from scoring athletes: 3 for a submission, 2 for a points win, 1 for a
decision, a walkover or a DQ. A loss earns nothing. A team with at most ten kids scores with
every kid and ignores the flags; a team with more than ten scores only with its marked kids, at
most ten (the server refuses the eleventh with 422). A move to another team unmarks the kid.
Wins count every done match a team's kid won, scoring athlete or not. Match points are the sum
of the team's kids' match scores across the event.

Weight class derives from the stored weight through the registration sheet's ten bands (upper
bounds 39, 46, 53, 61, 70, 80, 90, 100, 110, 120, then tens). There is no weight class column.
A weight is rounded before the band is read because a sync can carry a fraction.

Name similarity: accents, hyphens, middle names and a nickname table count as exact; everything
else scores by Dice over tokens with a suggestion floor of 0.6 and a margin of 0.05. A near
match is a suggestion for a person, never a link.

## refutations
- teams rank by team points, then wins, then match points, then position, and ties share a rank: flipped the wins and match-points sort directions -> RED, "3 failed | 6 passed" in rankTeams
- team points come only from scoring athletes by win type: teamPointsFor returns 1 for every win type -> RED, "1 failed | 0 passed" in teamPointsFor
- a team over ten kids scores only with its marked kids: scoringSet no longer filters on the scoring flag -> RED, "1 failed | 1 passed" in scoringSet
- a stored weight falls in one registration band: weightClass boundary `<=` changed to `<` -> RED, "2 failed | 3 passed" in weightClass
- a name resolves through one similarity module: nameScore same-last-name bonus inverted -> RED, "2 failed | 3 passed" in nameScore
