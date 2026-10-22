# Match state machine
The event log per match, the derived caches, the mats, the bracket feeds and the lazy clock.

## invariants
- source of truth: Match events are the source of truth and the caches follow in the same transaction.
  over: a score, a duplicate event id, a stale lastSeq, an unknown action and an outside athlete, a write on a pending match and in setup, a clock start and pause, a terminal, an end with a running clock, and an undo of added time
  via: match events are the source of truth and the caches follow in the same transaction
  because: appendMatchEvent, endMatch, extendClock and undoLastMatchEvent write the event rows and call recompute in one transaction, so the points, clock, status and result on the match row never disagree with the log
  refuted: recompute writes pointsA as 0 -> the test match events are the source of truth and the caches follow in the same transaction went red (2026-10-22)
  kinds: state
  checklist: revalidated-permission dismissed: a scoring write runs inside the request that carries the token, and no work is deferred or resumed
  checklist: separation-of-duties dismissed: no approval policy exists on a scoring write
  checklist: legal-state-succession declared as source of truth
  checklist: supersession-safety declared as source of truth
  checklist: worker-fencing dismissed: no worker claims a match here, and the mat bind epoch is checked by the mat route guard before this code runs
  checklist: commit-ordered-effects dismissed: every effect is a row in the same transaction, and nothing leaves the process
  checklist: resumption-coverage dismissed: a write is one transaction, and no batch resumes after an interruption
- derived outcome: A score and a win type derive from the events.
  over: a pending terminal against a higher score, a points lead, a tie, running totals with a negative score clamped at zero, set_score events, an end then a reopen then an edited result, a tie ended with and without a winner, a tie ended with a chosen win type, and a client win type sent after a terminal or a points lead decided the match
  via: a score and a win type derive from the events
  because: deriveMatch sums the scored actions per athlete, floored at zero, and deriveOutcome picks a terminal, then the points lead, then asks for a decision, so a client cannot choose a win type the events already decided; enterResult takes the win type the desk types and derives none
  refuted: deriveOutcome decides on scoreA below scoreB -> the test a score and a win type derive from the events went red (2026-10-22)
  kinds: state
  checklist: revalidated-permission dismissed: a derivation reads the events in the request that asks, and no work is deferred
  checklist: separation-of-duties dismissed: no approval policy exists on a derivation
  checklist: legal-state-succession dismissed: deriveMatch and deriveOutcome are pure functions of the events and commit no state; the guard on an end is source of truth's
  checklist: supersession-safety dismissed: no late work publishes; a derivation reads the events it is given
  checklist: worker-fencing dismissed: no worker claims a match here
  checklist: commit-ordered-effects dismissed: a derivation writes nothing, and the caller's transaction commits the rows
  checklist: resumption-coverage dismissed: a derivation is a pure function and resumes nothing
- runnable only: A mat starts only a runnable match.
  over: a match waiting on a feeder ahead of a runnable one, a match whose kid is live on another mat, a bracket match its feeder fills, a skip that frees the kids of a live match, entry mode and live mode at the event start, an advance after an end, an advance while the current match is live, desk mode, an empty queue and an event in setup
  via: a mat starts only a runnable match
  because: advanceMat takes the first pending match in order whose two sides are filled and whose kids are not live on another mat, so a blocked match keeps its slot and a kid never runs on two mats at once
  refuted: advanceMat takes the first queued match instead of the first runnable one -> the test a mat starts only a runnable match went red (2026-10-22)
  kinds: state
  checklist: revalidated-permission dismissed: advanceMat reads the event status and the live kids inside its own transaction and acts on no earlier grant
  checklist: separation-of-duties dismissed: no approval policy exists on a mat advance
  checklist: legal-state-succession declared as runnable only
  checklist: supersession-safety dismissed: advanceMat returns the current match while it is live and never displaces it
  checklist: worker-fencing dismissed: no worker claims a mat here, and the mat bind epoch is checked by the mat route guard
  checklist: commit-ordered-effects dismissed: the status change, the mat pointer and the audit row are rows in one transaction, and nothing leaves the process
  checklist: resumption-coverage dismissed: each advance is one transaction, and releaseIdleMats looks at every idle mat again after each end, entry, skip and fill
- feeder fills: An ended feeder fills its dependents in the same transaction.
  over: a double elimination semifinal that fills the winners final and the losers round, a single elimination chain of two rounds, the one fill audit row per feeder end, and a match nothing feeds from
  via: an ended feeder fills its dependents in the same transaction
  because: fillDependents writes the winner and the loser into the pending sides that feed from the match inside the transaction that ended it, and records one fill row naming every side it filled
  refuted: fillDependents swaps the winner and the loser into the dependent sides -> the test an ended feeder fills its dependents in the same transaction went red (2026-10-22)
  kinds: state
  checklist: revalidated-permission dismissed: the fill runs inside the transaction of the end, and no work is deferred
  checklist: separation-of-duties dismissed: no approval policy exists on a fill
  checklist: legal-state-succession declared as feeder fills
  checklist: supersession-safety declared as correction refusal
  checklist: worker-fencing dismissed: no worker claims a match here
  checklist: commit-ordered-effects dismissed: the side writes and the audit row are rows in the same transaction, and nothing leaves the process
  checklist: resumption-coverage dismissed: the fill is part of one transaction, so an interruption rolls back the end as well
- correction refusal: A correction that changes a winner refuses when a dependent already ran.
  over: a winner correction while every dependent is pending, a winner correction after a dependent went live, and a points only correction after a dependent went live
  via: a correction that changes a winner refuses when a dependent already ran
  because: assertDependentsPending refuses a winner change once a dependent is live or done and the refused write leaves every row as it was, so a sheet never shows a match on a kid who did not reach it
  refuted: assertDependentsPending never finds a dependent that ran -> the test a correction that changes a winner refuses when a dependent already ran went red (2026-10-22)
  kinds: state
  checklist: revalidated-permission dismissed: the dependents are read inside the transaction of the correction
  checklist: separation-of-duties dismissed: no approval policy exists on a correction
  checklist: legal-state-succession declared as correction refusal
  checklist: supersession-safety declared as correction refusal
  checklist: worker-fencing dismissed: no worker claims a match here
  checklist: commit-ordered-effects dismissed: the correction is rows in one transaction, and nothing leaves the process
  checklist: resumption-coverage dismissed: a correction is one transaction
- reopen refusal: A reopen refuses while a dependent is live or done.
  over: a reopen that empties the filled sides and a later end that fills them again, a reopen while a dependent is live, a reopen that pulls back an untouched next match, a reopen after the next match scored, a reopen in setup and after the event is done, and a reopen of a match that is not done
  via: a reopen refuses while a dependent is live or done
  because: reopenMatch accepts only a done match outside setup, calls assertDependentsPending, refuses when the next match on the mat has scored, and then clears the sides the match filled
  refuted: removed the assertDependentsPending call from reopenMatch -> the test a reopen refuses while a dependent is live or done went red (2026-10-22)
  kinds: state
  checklist: revalidated-permission dismissed: the reopen reads every state it checks inside its own transaction
  checklist: separation-of-duties dismissed: no approval policy exists on a reopen
  checklist: legal-state-succession declared as reopen refusal
  checklist: supersession-safety declared as reopen refusal
  checklist: worker-fencing dismissed: no worker claims a match here
  checklist: commit-ordered-effects dismissed: the reopen is rows in one transaction, and nothing leaves the process
  checklist: resumption-coverage dismissed: a reopen is one transaction
- lazy clock: The clock expires lazily on read.
  over: a snapshot poll after the clock elapsed, a clock re-armed at a new length after added time, two immediate polls at the same instant, a poll with no elapsed clock, a pause stamped at the poll instant with elapsed capped at the length, and an expiry call on a paused clock
  via: the clock expires lazily on read
  because: expireOverdue runs before a snapshot read and writes one pause stamped at the poll instant, its audit row and one version bump in one transaction, and deriveMatch caps elapsed at the length, so no server timer exists and two pollers write one pause
  refuted: expireOverdue inverts the overdue test -> the test the clock expires lazily on read went red (2026-10-22)
  kinds: state
  checklist: revalidated-permission dismissed: the expiry reads the running clocks at the poll and acts on no earlier grant
  checklist: separation-of-duties dismissed: no approval policy exists on an expiry
  checklist: legal-state-succession declared as lazy clock
  checklist: supersession-safety declared as lazy clock
  checklist: worker-fencing dismissed: no background worker exists, and a poller that loses the write lock drops out
  checklist: commit-ordered-effects dismissed: the pause, the audit row and the bump are rows in one transaction, and nothing leaves the process
  checklist: resumption-coverage dismissed: the next poll finds every clock still overdue, so an interrupted expiry needs no plan
- outcome at the end: deriveOutcome is called only by endMatch; the desk types its result.
  protects: deriveOutcome
  chokepoint: endMatch in server/src/match/events.ts
  from: anywhere
  because: endMatch derives the outcome inside the transaction that writes the end event, after the guard checks the event, the match status and the sequence; enterResult stores the win type the desk typed, so no other path derives a winner from the events
  kinds: state
  checklist: revalidated-permission dismissed: the outcome is derived inside the request transaction, and no work is deferred
  checklist: separation-of-duties dismissed: no approval policy exists on an end
  checklist: legal-state-succession declared as source of truth
  checklist: supersession-safety declared as source of truth
  checklist: worker-fencing dismissed: no worker claims a match here
  checklist: commit-ordered-effects dismissed: the end event, the recompute and the fill are rows in one transaction
  checklist: resumption-coverage dismissed: an end is one transaction
