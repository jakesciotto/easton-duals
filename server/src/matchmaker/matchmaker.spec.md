# Matchmaker
The proposer that drafts cross-team pairs for the organizer to confirm, swap or reject.

## invariants
- pair cost: Pair cost weighs a weight class at ten, a year of age at two, a belt step at a half and a rating point at a tenth.
  over: a pair with no gap, a gap on each axis alone, a gap on every axis at once, a side without a rating, and a side without an age, a weight or a belt
  via: pair cost ranks class, then age, then belt, then rating
  because: pairCost weighs a weight class ten, a year of age two, a belt step a half and a rating point a tenth, so a class costs ten, as much as five years of age, with the weights the organizer ruled on 2026-09-11
  refuted: the class gap term of pairCost is zero -> the test pair cost ranks class, then age, then belt, then rating went red (2026-10-22)
  kinds: none
- free kids: The proposer offers each free kid at most once, across teams only, and never a division kid.
  over: pools of two and three teams with a cost tie, a pair past two classes and one at two, the same-gender veto, a kid who holds a live, pending or done match of the style, a kid in a division, a pair who already met in the style, a kid without a team, an age or a weight, and a repeat propose of each style
  via: the proposer offers each free kid at most once, across teams only, and never a division kid
  because: proposeMatches builds the free pool without a kid who holds a match of the style or sits in a division, admits only cross-team pairs, and replaces the drafts of that style whole, so a fresh draft never offers a kid a second match of one style; the confirm and swap guards in busyAthlete refuse a draft that went stale
  refuted: dropped the division filter from the free pool -> the test the proposer offers each free kid at most once, across teams only, and never a division kid went red (2026-10-22)
  kinds: none
- lowest total cost: The proposer makes the pairing with the lowest total cost where a kid without a pair costs 10.5.
  over: a four kid pool where the closest pair first strands two kids, and twelve seeded random pools of five to nine kids checked against a brute force optimum
  via: the proposer makes the pairing with the lowest total cost where a kid without a pair costs 10.5
  because: proposeMatches runs the blossom maximum weight matching with each admitted pair weighing 21 minus its cost, so a pair forms only when it beats both kids sitting out at 10.5 each; the weights are integers scaled so no sum of tie-break terms outweighs a thousandth of cost, which keeps the matching exact and lets the same roster propose the same rows
  refuted: the edge weight is the cost instead of 21 minus the cost -> the test the proposer makes the pairing with the lowest total cost where a kid without a pair costs 10.5 went red (2026-10-22)
  kinds: none
- hand-designed pairs: A hand-designed pair warns on class, age and rematch, and refuses only a same-team, an off-event and a teamless pair.
  over: a done gi match read as Already met for gi and not for nogi; a create and a patch through the match routes that answer with an Already met warning for the style; and six creates across three teams at two, three and six classes apart and at three, four and six years apart, a repeat pair, three refusals (same team, off the event, no team) that write nothing, and a patch that gathers all three warnings
  via: a hand-designed pair warns and never refuses
  because: pairWarnings only returns warning strings, warns past two weight classes and past three years, and scopes Already met to the style, and resolvePair alone refuses a same-team, an off-event or a teamless pair with 422, so a far pair is created with its warnings and the organizer decides
  refuted: resolvePair refuses a pair more than three years apart -> the test a hand-designed pair warns and never refuses went red, 1 of 3 (2026-10-24)
  kinds: none
- three in a class: Three kids alone in a weight class from three teams become one round robin draft.
  over: three identical kids from three teams; a third kid in another class, on a side's team, past the cost cap or behind the gender veto; and a four kid pool where the fourth sits two classes off
  via: three kids alone in a class from three teams become a round robin draft
  because: after the matching, proposeMatches joins each kid left without a pair to one chosen pair of the same weight class whose sides are on other teams, within the cost cap, the gender veto and the rematch rule, taking the pair with the lowest worst cost; the row carries the third kid in athlete_c_id (migration 0015) and the pair leaves the pair list
  refuted: the trio pass skips every stranded kid -> the test three kids alone in a class from three teams become a round robin draft went red, 2 of 2 (2026-10-24)
  kinds: none
- round robin confirm: Confirming a round robin draft creates a round robin division of the three and refuses a swap.
  over: a confirm that answers the division with three matches and no draft left, a swap that answers 422, and a confirm all that counts the draft
  via: confirming a round robin draft creates a division
  because: the confirm route runs createDivision inside one transaction with the busy guard and the draft delete, names the division after the weight class, and the swap route refuses a draft that carries a third kid because a swap of one side would change a set, not a pair
  refuted: the swap route no longer refuses a draft with a third kid -> the test confirming a round robin draft creates a division went red, 1 of 2 (2026-10-24)
  kinds: state
  checklist: revalidated-permission dismissed: the busy guard reads the matches at confirm time
  checklist: separation-of-duties dismissed: no approval policy exists on a confirm
  checklist: legal-state-succession declared as round robin confirm
  checklist: supersession-safety declared as round robin confirm
  checklist: worker-fencing dismissed: no worker owns a draft
  checklist: commit-ordered-effects dismissed: the division, its matches and the draft delete are rows in one transaction
  checklist: resumption-coverage dismissed: a refused confirm leaves the draft, and the organizer presses Confirm again
- busy guard on confirm: Confirming a draft refuses a kid who already holds an unfought match.
  over: a draft whose kid went live on another mat after the draft was written, one confirm that answers 409, and a confirm all that skips the stale draft and keeps it
  via: confirming
  because: confirm passes busyAthlete as the guard of createMatch, so the check runs inside the transaction that inserts the match and deletes the draft
  refuted: the confirm guard asks busyAthlete about no kids -> the test confirming went red (2026-10-22)
  kinds: state
  checklist: revalidated-permission dismissed: the guard reads the matches at confirm time and acts on no earlier grant
  checklist: separation-of-duties dismissed: no approval policy exists on a confirm
  checklist: legal-state-succession declared as busy guard on confirm
  checklist: supersession-safety declared as busy guard on confirm
  checklist: worker-fencing dismissed: no worker owns a draft
  checklist: commit-ordered-effects dismissed: the new match and the draft delete are rows in one transaction, and nothing leaves the process
  checklist: resumption-coverage dismissed: a confirm is one transaction, and a stale draft stays for the organizer to fix
- busy guard on swap: Swapping a kid into a draft refuses a kid who already holds an unfought match.
  over: a kid with a pending match and a kid live on a mat, each refused with 409 and the draft left as the proposer wrote it
  via: swapping a kid into a draft
  because: the swap route runs busyAthlete over the kids coming in before it resolves the pair, so a kid already in the draft never blocks the fix
  refuted: the swap route asks busyAthlete about no incoming kids -> the test swapping a kid into a draft went red (2026-10-22)
  kinds: state
  checklist: revalidated-permission dismissed: the guard reads the matches at swap time and acts on no earlier grant
  checklist: separation-of-duties dismissed: no approval policy exists on a swap
  checklist: legal-state-succession declared as busy guard on swap
  checklist: supersession-safety declared as busy guard on swap
  checklist: worker-fencing dismissed: no worker owns a draft
  checklist: commit-ordered-effects dismissed: the draft update is rows in one transaction, and nothing leaves the process
  checklist: resumption-coverage dismissed: a swap is one request, and a refused swap changes nothing
