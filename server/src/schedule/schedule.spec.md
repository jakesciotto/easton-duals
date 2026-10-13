# Running order
One static plan in waves across the mats, built on demand from every pending match.

## invariants
- every gi match runs before any nogi match
- a feeder runs at least two waves before its dependent
- a kid never fights in two adjacent waves unless nothing else fits
- the plan is deterministic for the same input

## works when
- boundary "every gi match runs before any nogi match" at planSchedule via guard "every gi match runs before any nogi match"
- boundary "a feeder runs at least two waves before its dependent" at planSchedule via guard "a feeder runs at least two waves before its dependent"
- boundary "a kid never fights in two adjacent waves unless nothing else fits" at planSchedule via guard "a kid never fights in two adjacent waves unless nothing else fits"
- boundary "the plan is deterministic for the same input" at planSchedule via guard "the plan is deterministic for the same input"
- passes test "planSchedule priority order"
- passes test "planSchedule estimate"
- passes test "the schedule route"

## why
"Order matches" plans every pending match in waves, one slot per mat: every gi match before
any nogi match (hard), younger first, a feeder at least two waves before its dependent, no kid
in two adjacent waves (relaxed with a warning when nothing else fits), gaps recorded. The
order index is wave-major, mat-minor. The estimate is the longest match per wave plus a
minute. A live kid is fixed at wave -1. The pilot notes asked for gi first, younger first, one
match of rest, nogi at the end; the planner factors in the number of mats.

## refutations
- every gi match runs before any nogi match: removed the unplacedGi > 0 break in findCandidate -> RED, "3 failed | 1 passed" in every gi match runs before any nogi match
- a feeder runs at least two waves before its dependent: feeder gap wave - 2 changed to wave - 1 -> RED, "3 failed | 3 passed" in a feeder runs at least two waves before its dependent
- a kid never fights in two adjacent waves unless nothing else fits: strict rest check drops the wave - 1 exclusion -> RED, "2 failed | 1 passed" in a kid never fights in two adjacent waves unless nothing else fits
- the plan is deterministic for the same input: final priority tiebreak replaced with Math.random() -> RED, "1 failed | 0 passed" in the plan is deterministic for the same input
