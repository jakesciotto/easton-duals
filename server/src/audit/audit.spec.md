# Audit and certification
The append-only audit log and the lock a certified event puts on every write.

## invariants
- a certified event refuses every write
- every write records an audit row

## works when
- boundary "a certified event refuses every write" at assertNotCertified via guard "certification locks the event"
- boundary "every write records an audit row" at recordAudit via guard "audit log, the event"
- passes test "certify and uncertify"

## why
`audit_log` is append only and has no foreign keys: it outlives the rows it describes. One
table for every write, not an actor column on match events. Certify and unlock both re-enter
the PIN; unlock adds a reason. Certification locks everything on the event, all write routes,
roster and match list included, because a roster edit changes what the certified record says
as surely as a score does. Every recorded action is undoable, auditable and changeable after
the match until the organizer certifies.

## refutations
- a certified event refuses every write: assertNotCertified compares status to 'zzz' -> RED, "35 failed | 52 passed" in certification locks the event
- every write records an audit row: recordAudit returns before the insert -> RED, "4 failed | 0 passed" in audit log, the event
