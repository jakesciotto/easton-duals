# Matchmaker
The proposer that drafts cross-team pairs for the organizer to confirm, swap or reject.

## invariants
- pair cost ranks class, then age, then belt, then rating
- the proposer offers each free kid once, closest cross-team pair first, and never a division kid
- a hand-designed pair warns and never refuses

## works when
- boundary "pair cost ranks class, then age, then belt, then rating" at pairCost via guard "pairCost"
- boundary "the proposer offers each free kid once, closest cross-team pair first, and never a division kid" at proposeMatches via guard "proposeMatches"
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
is never offered. Same-gender is a veto when the event asks for it. Pairs over two weight
classes apart are not offered today; the organizer adds them by hand and the dialog warns.

Cost: a weight class is worth ten, a year of age two, a belt step a half, a rating point a
tenth. The organizer ruled weight class first, then age (2026-09-11). The proposer takes pairs
greedily by cost, so it can strand a kid whose only near candidate went to a closer pair, and
nothing levels match counts across teams. The next work order replaces the greedy pass with a
minimum-cost maximum-cardinality matching over the general graph (teams number two to eight,
so blossom, not Hungarian), raises ERP to a weight that breaks an age tie, and turns the hard
class gate into a step penalty so a far pair wins only when the alternative is no match. The
decision that the matching must never match fewer kids than the greedy pass is the invariant
that work order adds.

## refutations
- pair cost ranks class, then age, then belt, then rating: class-gap term zeroed -> RED, "1 failed | 1 passed" in pairCost
- the proposer offers each free kid once, closest cross-team pair first, and never a division kid: candidate sort flipped to highest cost first -> RED, "1 failed | 12 passed" in proposeMatches
- a hand-designed pair warns and never refuses: removed the style scope on the Already met query -> RED, "1 failed | 0 passed" in pairWarnings; a class-gap warning replaced by a throw stayed GREEN, so the guard covers Already met only and the never-refuses half waits for the oracle alignment order
