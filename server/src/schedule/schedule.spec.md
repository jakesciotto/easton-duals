# Running order
One static plan in waves across the mats, built on demand from every pending match.

## invariants
- gi first: Every gi match runs before any nogi match.
  over: a gi match delayed by its feeder beside a free nogi match, and an all nogi list
  via: every gi match runs before any nogi match
  because: planSchedule sorts gi first and stops at the first nogi match while a gi match is unplaced, so a mat idles rather than run nogi early
  refuted: the nogi break never fires while gi matches wait -> the test every gi match runs before any nogi match went red (2026-10-22)
  kinds: none
- feeder spacing: A feeder runs at least two waves before its dependent.
  over: a final fed by two feeders on two mats, a feed that names neither a pending nor a live match, a feed that names a live match, and a feed that can never clear
  via: a feeder runs at least two waves before its dependent
  because: planSchedule places a match only when every feeder sits at least two waves earlier, counts a live feeder at wave -1, treats an unknown feeder as done, and throws on a feed that never clears
  refuted: the feeder gap is one wave instead of two -> the test a feeder runs at least two waves before its dependent went red (2026-10-22)
  kinds: none
- rest between waves: A kid never fights in two adjacent waves unless nothing else fits.
  over: a kid with a filler match available, a three way round robin with nothing else to run, a simple back to back pair, and a kid live at the start
  via: a kid never fights in two adjacent waves unless nothing else fits
  because: planSchedule first refuses a kid in the wave after their last one and relaxes that only when no match fits, and then it names the kid and both matches in a warning
  refuted: the strict rest check drops the previous wave -> the test a kid never fights in two adjacent waves unless nothing else fits went red (2026-10-22)
  kinds: none
- deterministic plan: The plan is deterministic for the same input.
  over: six matches with equal priority on three mats given in a shuffled mat order, planned twice
  via: the plan is deterministic for the same input
  because: comparePriority ends on the match number and the mats sort by number, so the same pending set always gives the same order and the console can show a stable plan
  refuted: the final priority tiebreak is Math.random -> the test the plan is deterministic for the same input went red (2026-10-22)
  kinds: none
