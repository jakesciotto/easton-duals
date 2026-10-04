# Roster
The paste, the WellnessLiving sync, the leaderboard ERP join and the link suggestions.

## invariants
- a hand-edited age or weight sticks through a re-sync
- the sync asks WellnessLiving for the roster's own names only

## works when
- boundary "a hand-edited age or weight sticks through a re-sync" at profileChanges via guard "profileChanges"
- boundary "the sync asks WellnessLiving for the roster's own names only" at rosterFilter via guard "roster routes"
- passes test "the bulk paste"
- passes test "the WellnessLiving search"
- passes test "linkUpdate"

## why
Athletes are copies, never references: a roster does not change under a running event. A
paste creates kids (First, Last, Age, Weight, Belt, Gender, Team, Birth, Scoring) or matches,
names resolved against the roster by the shared similarity module. Birth gives the age at the
event date, because WellnessLiving exposes no birth date to the app's OAuth token (the one
endpoint that carries it needs the legacy signed API; the credential ask is open).

The sync asks the belts report for the roster's own names, location by location, with
`` lower(`o_client.text_last`) like '%token%' ``. The report's `like` is case sensitive and
`ilike`, `collate nocase` and `regexp` hang it; prove any filter with a Title case name. An
exact match links; a near match waits for a person (Confirm or Not them). An empty location
list answers 503 rather than stamping every row "Not in WellnessLiving". Pool inserts go in
slices of 500 rows because one insert once bound 60723 variables against SQLite's 32766. ERP
comes from the leaderboard app. WellnessLiving and the leaderboard overwrite a paste's values at
the link; an age or weight the organizer edits by hand afterwards sticks through a re-run.

## refutations
- a hand-edited age or weight sticks through a re-sync: profileChanges no longer skips fields the update leaves undefined -> RED, "2 failed | 0 passed" in profileChanges
- the sync asks WellnessLiving for the roster's own names only: rosterFilter fills firstTokens with the roster last-name tokens -> RED, "1 failed | 10 passed" in roster routes; the syncRoster describe stayed GREEN under two mutations because it never reaches rosterFilter, so the claim moved to roster routes
