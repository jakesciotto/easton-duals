# Matchmaker
The proposer that drafts cross-team pairs for the organizer to confirm, swap or reject.

## invariants
- pair cost: Pair cost ranks class, then age, then belt, then rating.
  over: a pair with no gap, a gap on each axis alone, a gap on every axis at once, a side without a rating, and a side without an age, a weight or a belt
  via: pair cost ranks class, then age, then belt, then rating
  because: pairCost weighs a weight class ten, a year of age two, a belt step a half and a rating point a tenth, so a class gap always outranks the other terms, as the organizer ruled on 2026-09-11
  refuted: the class gap term of pairCost is zero -> the test pair cost ranks class, then age, then belt, then rating went red (2026-10-22)
  kinds: none
- free kids: The proposer offers each free kid at most once, across teams only, and never a division kid.
  over: pools of two and three teams with a cost tie, a pair past two classes and one at two, the same-gender veto, a kid who holds a live, pending or done match of the style, a kid in a division, a pair who already met in the style, a kid without a team, an age or a weight, and a repeat propose of each style
  via: the proposer offers each free kid at most once, across teams only, and never a division kid
  because: proposeMatches builds the free pool without a kid who holds a match of the style or sits in a division, admits only cross-team pairs, and replaces the drafts of that style whole, so a confirmed draft never gives a kid a second match of one style
  refuted: dropped the division filter from the free pool -> the test the proposer offers each free kid at most once, across teams only, and never a division kid went red (2026-10-22)
  kinds: none
- lowest total cost: The proposer makes the pairing with the lowest total cost where a kid without a pair costs 10.5.
  over: a four kid pool where the closest pair first strands two kids, and twelve seeded random pools of five to nine kids checked against a brute force optimum
  via: the proposer makes the pairing with the lowest total cost where a kid without a pair costs 10.5
  because: proposeMatches runs the blossom maximum weight matching with each admitted pair weighing 21 minus its cost, so a pair forms only when it beats both kids sitting out at 10.5 each
  refuted: the edge weight is the cost instead of 21 minus the cost -> the test the proposer makes the pairing with the lowest total cost where a kid without a pair costs 10.5 went red (2026-10-22)
  kinds: none
- hand-designed pairs: A hand-designed pair warns and never refuses.
  over: a done gi match read as Already met for gi and not for nogi, and a create and a patch through the match routes that answer with an Already met warning
  via: a hand-designed pair warns and never refuses
  because: pairWarnings only returns warning strings and scopes Already met to the style, so the organizer can add a pair the proposer would never offer
  refuted: removed the style scope from the Already met query -> the test a hand-designed pair warns and never refuses went red (2026-10-22)
  kinds: none
