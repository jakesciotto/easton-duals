# Live snapshot and mat binding
The one snapshot every screen polls, the public name form and the tablet binding.

## invariants
- a public reader sees initials and an admin token the full name
- every write bumps the event version in its transaction
- a mat binding dies when another tablet takes the mat

## works when
- boundary "a public reader sees initials and an admin token the full name" at nameFormFor via guard "names on the wire"
- boundary "every write bumps the event version in its transaction" at bumpVersion via guard "bumpVersion"
- boundary "a mat binding dies when another tablet takes the mat" at bindMat via guard "bind and heartbeat"
- passes test "buildSnapshot"
- passes test "snapshot polling"
- passes test "unbind"

## why
Every screen polls one snapshot keyed by the event's version. `toMatchView` takes a name form:
full for an admin token, public (initials) otherwise. Public is the default so a new caller
must ask for the full form. The board layout is one leaderboard for every team count, two
included; the event owns `far` (the viewing distance factor, 0.85 to 1.2), set from the console
or `?far=` with an admin token, and a television's keys move only a board whose event carries
none.

## refutations
- a public reader sees initials and an admin token the full name: nameFormFor always returns 'full' -> RED, "1 failed | 0 passed" in names on the wire; the public names describe stayed GREEN under two mutations because it never calls nameFormFor, so the claim moved
- every write bumps the event version in its transaction: bumpVersion adds 0 instead of 1 -> RED, "1 failed | 0 passed" in bumpVersion
- a mat binding dies when another tablet takes the mat: bindMat never refuses a held mat -> RED, "1 failed | 4 passed" in bind and heartbeat
