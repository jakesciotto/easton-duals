# Match state machine
The event log per match, the derived caches, the mats, the bracket feeds and the lazy clock.

## invariants
- match events are the source of truth and the caches follow in the same transaction
- a score and a win type derive from the events
- a mat starts only a runnable match
- an ended feeder fills its dependents in the same transaction
- a correction that changes a winner refuses when a dependent already ran
- a reopen refuses while a dependent is live or done
- the clock expires lazily on read

## works when
- boundary "match events are the source of truth and the caches follow in the same transaction" at recompute via guard "appendMatchEvent"
- boundary "a score and a win type derive from the events" at deriveOutcome via guard "deriveOutcome"
- boundary "a mat starts only a runnable match" at advanceMat via guard "a mat only starts a match it can run"
- boundary "an ended feeder fills its dependents in the same transaction" at fillDependents via guard "fillDependents"
- boundary "a correction that changes a winner refuses when a dependent already ran" at assertDependentsPending via guard "a correction on a feeder"
- boundary "a reopen refuses while a dependent is live or done" at reopenMatch via guard "reopening a feeder"
- boundary "the clock expires lazily on read" at expireOverdue via guard "expireOverdue"
- passes test "undoLastMatchEvent"
- passes test "enterResult"
- passes test "skipMatch"

## why
`match_events` is the source of truth for a match. The cache columns on `matches` (points,
clock, status, result) are rewritten in the same transaction as every event insert or undo.
Undo deletes the newest event and the audit row carries the deleted row, so the scorer's seq
contract holds. Undo is refused on a done match. A desk entry writes a `set_score` event
(absolute set) so the log stays append only.

An athlete's match score is the running total of scored actions, floored at zero. The win type
is derived: a terminal gives its own type, points ahead gives `points`, a tie needs a decision.
Win types: `submission`, `points`, `decision`, `walkover`, `dq`.

States: `pending` to `live` to `done`; `reopen` returns a done match to live and is refused
while a dependent match is live or done. A mat starts only a runnable match: both sides filled
and no kid live on another mat (busy means pending or live, reversed from pending only after a
kid went live on two mats at once). A blocked match keeps its slot. Every end, entry, skip and
fill releases the idle mats. When a match ends, the server fills every side that feeds from it,
inside the same transaction. A correction that changes the winner refills pending dependents or
refuses ("M12 already ran on this result"). A points-only correction always passes.

Matches hold two sides, a style (gi or nogi), a stable per-event number printed as M12, an order
index per mat, a ruleset and, for a bracket, a division id, a round and a feed per empty side.
Event mode: `entry` means the desk types every result (Smoothcomp runs the mats), `live` means
the mats drive it. In entry mode Start event must not advance mats and the desk entry lands on
the designed match.

## refutations
- match events are the source of truth and the caches follow in the same transaction: recompute writes pointsA as 0 -> RED, "2 failed | 6 passed" in appendMatchEvent
- a score and a win type derive from the events: deriveOutcome decides on scoreA < scoreB -> RED, "1 failed | 2 passed" in deriveOutcome
- a mat starts only a runnable match: advanceMat takes queue[0] instead of the first runnable match -> RED, "3 failed | 1 passed" in a mat only starts a match it can run
- an ended feeder fills its dependents in the same transaction: fillDependents swaps winner and loser into the dependent sides -> RED, "3 failed | 1 passed" in fillDependents
- a correction that changes a winner refuses when a dependent already ran: assertDependentsPending never finds a ran dependent -> RED, "1 failed | 2 passed" in a correction on a feeder
- a reopen refuses while a dependent is live or done: removed the assertDependentsPending call from reopenMatch -> RED, "1 failed | 1 passed" in reopening a feeder
- the clock expires lazily on read: expireOverdue overdue test inverted -> RED, "3 failed | 1 passed" in expireOverdue
