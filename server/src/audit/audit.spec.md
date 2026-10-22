# Audit and certification
The append-only audit log and the lock a certified event puts on every write.

## invariants
- certified lock: A certified event refuses every write.
  over: every route in the certify suite's write list, sent with an admin or a mat token to a certified event, and the same list after an unlock
  via: a certified event refuses every write
  because: assertNotCertified answers 409 with one message on every write route of a certified event, because a roster edit or a reordered list changes the certified record as surely as a score does
  crossing: admin -> store
  entrances: none
  refuted: assertNotCertified compares the status with 'zzz' -> the test a certified event refuses every write went red (2026-10-22)
  kinds: state
  checklist: revalidated-permission dismissed: no work is deferred, and each write reads the event status in its own request
  checklist: separation-of-duties dismissed: one admin certifies and unlocks, both with the PIN, and no second approver exists
  checklist: legal-state-succession dismissed: the status is read before the write transaction opens, not inside it, so the lock is a request guard and not a serialized recheck
  checklist: supersession-safety dismissed: no late work publishes; a write that read the status before a certify commits as it would have before
  checklist: worker-fencing dismissed: no worker owns an event
  checklist: commit-ordered-effects dismissed: a refused write has no effect, and the guard issues none
  checklist: resumption-coverage dismissed: no work resumes after an unlock; the organizer repeats the write
- write coverage: Every write route is in the certify suite's write list or its excluded list.
  over: every non-GET route the app registers, against the write list and the seven excluded routes
  via: the write routes this suite covers
  because: a write route added without the certification guard fails this test rather than reaching the gym, and an exclusion that names no route is a stale claim
  refuted: registered a POST /api/health route that neither list names -> the test the write routes this suite covers went red (2026-10-22)
  kinds: none
- audit on write: Every write records an audit row.
  over: a score, a duplicate press, an undo, an end, an extend, a reopen and a skip, a typed result and its correction, event create, patch, far, start, finish and delete, team edits, roster writes, match create, edit, reorder and delete, ruleset writes, a bind, a takeover, an advance and an unbind, and a server expiry and reap, sent through the app with admin and mat tokens
  via: every write records an audit row
  because: recordAudit inserts one row inside the transaction its caller passes, so a write that rolls back leaves no row, and an undo row carries the match event it deleted because the match log no longer has it
  crossing: mat -> store
  entrances: none
  refuted: recordAudit returns before the insert -> the test every write records an audit row went red (2026-10-22)
  kinds: storage
  checklist: scoped-reads dismissed: this invariant writes rows and scopes no read
  checklist: encrypted-storage dismissed: an audit row holds names, scores and actions, and nothing in it is designated secret
  checklist: key-rotation-compatibility dismissed: nothing encrypted is retained
  checklist: input-validation dismissed: each route validates its body before the write, and the audit row copies the validated fields
  checklist: revision-preservation declared as audit on write
  checklist: commit-ordered-effects dismissed: the row commits with its write and no external effect follows
  checklist: durable-dispatch-intent dismissed: nothing is dispatched
  checklist: declared-target-coverage dismissed: one write records its own rows and fans out to no target
  checklist: completion-evidence dismissed: no work item waits on an observer
