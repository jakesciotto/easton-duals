# Matchmaker
The proposer that drafts cross-team pairs for the organizer to confirm, swap or reject.

## invariants
- pair cost ranks class, then age, then belt, then rating
- the proposer offers each free kid at most once, across teams only, and never a division kid
- the proposer makes the pairing with the lowest total cost where a kid without a pair costs 10.5
- a hand-designed pair warns and never refuses

## works when
- boundary "pair cost ranks class, then age, then belt, then rating" at pairCost via guard "pairCost"
- boundary "the proposer offers each free kid at most once, across teams only, and never a division kid" at proposeMatches via guard "proposeMatches"
- boundary "the proposer makes the pairing with the lowest total cost where a kid without a pair costs 10.5" at proposeMatches via guard "proposeMatches, the lowest total cost"
- passes test "maximumWeightMatching"
- boundary "a hand-designed pair warns and never refuses" at pairWarnings via guard "pairWarnings"
- passes test "beltDistance"
- passes test "pairWhy"
- passes test "proposing"
- passes test "confirming"
- passes test "swapping a kid into a draft"

## why
Proposals are drafts in their own table; nothing reaches the board until confirmed. One
proposal set per style; a propose replaces the event's drafts of that style whole. A kid with a
match of this style already, whatever its status, is never offered a second one. A division kid
is never offered. Same-gender is a veto when the event asks for it.

Cost: a weight class is worth ten, a year of age two, a belt step a half, a rating point a
tenth. The organizer ruled weight class first, then age (2026-09-11). A pair costing more than
20 (two classes, or one class and five years) is never offered; the organizer adds it by hand
and the dialog warns.

The pairing is a maximum weight matching over the general graph (teams number two to eight, so
Edmonds' blossom in `blossom.ts`, not Hungarian), with each admitted pair weighing 21 minus its
cost. That is the same as charging 10.5 for every kid left without a pair: the matching makes
a pair only when it beats both kids sitting out. Measured on the four real rosters of September
2026 (40 to 56 kids, two or three teams) against the greedy pass it replaced: one to two more
pairs on the three-team rosters, the worst pair in every roster no further than a class and
five years, and the one 26.5 pair greedy made (two classes and three years) gone. Maximum
cardinality was measured and rejected: it doubles the total cost to force the last three pairs.
Team balance is moot under this format: each kid holds one match per style, so a team's match
count is its roster size. ERP is null on every real roster (the leaderboard link has filled it
for test events only), so the rating term stays a tiebreak until ratings arrive.

## refutations
- pair cost ranks class, then age, then belt, then rating: class-gap term zeroed -> RED, "1 failed | 1 passed" in pairCost
- the proposer offers each free kid at most once, across teams only, and never a division kid: dropped the division filter from the free pool -> RED, "1 failed | 19 passed" in proposeMatches; a same-team pair admitted went RED only in the lowest total cost describe, "2 failed | 18 passed"
- the proposer makes the pairing with the lowest total cost where a kid without a pair costs 10.5: weight set to the cost instead of 21 minus the cost -> RED, "2 failed | 18 passed" in proposeMatches, the lowest total cost
- a hand-designed pair warns and never refuses: removed the style scope on the Already met query -> RED, "1 failed | 0 passed" in pairWarnings; a class-gap warning replaced by a throw stayed GREEN, so the guard covers Already met only and the never-refuses half waits for the oracle alignment order
