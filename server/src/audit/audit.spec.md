# Audit and certification
The append-only audit log and the lock a certified event puts on every write.

## invariants
- certified lock: A certified event refuses the writes the certify suite lists.
  over: every route in the certify suite's write list, sent with an admin or a mat token to a certified event, and the same list after an unlock
  via: a certified event refuses every write
  because: assertNotCertified answers 409 with one message on each write route in the certify suite's list, and event delete answers "unlock the results first"; heartbeat, unbind, smoothcomp standings, event create, PIN sign-in, certify and uncertify are excluded by name; a roster edit or a reordered list is in the list because it changes the certified record as surely as a score does
  crossing: admin -> store
  entrances: none
  refuted: assertNotCertified compares the status with 'zzz' -> the test a certified event refuses every write went red (2026-10-22)
  kinds: state
  checklist: revalidated-permission dismissed: no work is deferred, and each write reads the event status in its own request
  checklist: separation-of-duties dismissed: one admin certifies and unlocks, both with the PIN, and no second approver exists
  checklist: legal-state-succession declared as lock inside the transaction
  checklist: supersession-safety dismissed: no late work publishes; a write that read the status before a certify commits as it would have before
  checklist: worker-fencing dismissed: no worker owns an event
  checklist: commit-ordered-effects dismissed: a refused write has no effect, and the guard issues none
  checklist: resumption-coverage dismissed: no work resumes after an unlock; the organizer repeats the write
- lock inside the transaction: Every audited write rechecks the certified lock inside its own transaction.
  over: a write whose event is certified between the request guard and the transaction, and the four actions that stay open on a certified event (certify, uncertify, unbind, smoothcomp_standings) beside one that does not
  via: the certified lock holds inside the write transaction
  because: recordAudit reads the event status on the transaction handle it is given and throws CERTIFIED_MESSAGE before it inserts, so a certify that lands after the request guard read the status still refuses the write and rolls it back; certify, uncertify, unbind and smoothcomp_standings are the four actions a certified event accepts, the same four the certify suite excludes by name
  refuted: recordAudit skips the status read -> the test the certified lock holds inside the write transaction went red, 2 of 2 (2026-10-24)
  kinds: state
  checklist: revalidated-permission declared as lock inside the transaction
  checklist: separation-of-duties dismissed: one admin certifies and unlocks
  checklist: legal-state-succession declared as lock inside the transaction
  checklist: supersession-safety declared as lock inside the transaction
  checklist: worker-fencing dismissed: no worker owns an event
  checklist: commit-ordered-effects dismissed: the recheck and the row are in one transaction
  checklist: resumption-coverage dismissed: the organizer repeats a refused write
- write coverage: Every write route is in the certify suite's write list or its excluded list.
  over: every non-GET route the app registers, against the write list and the seven excluded routes
  via: the write routes this suite covers
  because: a write route added without the certification guard fails this test rather than reaching the gym, and an exclusion that names no route is a stale claim
  refuted: registered a POST /api/health route that neither list names -> the test the write routes this suite covers went red (2026-10-22)
  kinds: none
- audit on write: Each write route in the audit list records an audit row.
  over: a score, a duplicate press, an undo, an end, an extend, a reopen and a skip, a typed result and its correction, event create, patch, far, start, finish and delete, team edits, roster writes, match create, edit, reorder and delete, ruleset writes, a bind, a takeover, an advance and an unbind, a server expiry and reap, a propose and a confirm, a division create, edit and delete, a schedule apply, an athlete link and a dismiss, the smoothcomp standings, a certify and an uncertify, sent through the app with admin and mat tokens; and a score, a schedule apply, a link and a roster edit whose version bump fails after the audit row, each leaving no row
  via: every write records an audit row
  because: recordAudit inserts one row inside the transaction its caller passes, so a write that rolls back takes its row with it, and an undo row carries the match event it deleted because the match log no longer has it; a draft swap and a draft reject write only the proposals table and record no row by decision
  crossing: mat -> store
  entrances: none
  refuted: the schedule apply records its audit row before its transaction instead of inside it -> the test every write records an audit row went red, 1 of 23 (2026-10-24)
  kinds: storage
  checklist: scoped-reads dismissed: this invariant writes rows and scopes no read
  checklist: encrypted-storage dismissed: an audit row holds names, scores and actions, and nothing in it is designated secret
  checklist: key-rotation-compatibility dismissed: nothing encrypted is retained
  checklist: input-validation dismissed: each route validates its body before the write, and the audit row copies the validated fields
  checklist: revision-preservation dismissed: the log keeps no revision history; an undo row copies the event it deleted, and no test checks that a stored row is never rewritten
  checklist: commit-ordered-effects dismissed: the row commits with its write and no external effect follows
  checklist: durable-dispatch-intent dismissed: nothing is dispatched
  checklist: declared-target-coverage dismissed: one write records its own rows and fans out to no target
  checklist: completion-evidence dismissed: no work item waits on an observer
