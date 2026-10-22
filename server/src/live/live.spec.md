# Live snapshot and mat binding
The one snapshot every screen polls, the public name form and the tablet binding.

## invariants
- public names: A public reader sees initials and an admin token the full name.
  over: the snapshot read with no token and with an admin token, a mat write answered to the tablet, a snapshot built with no name form, and publicName on a full name, an empty surname and padded names
  via: a public reader sees initials and an admin token the full name
  because: nameFormFor answers the full form only for an admin bearer and the public form is the default, so the board and the tablets, which parents can read, never show a kid's surname
  crossing: store -> internet
  entrances: routes board, routes scoring, routes auth
  refuted: nameFormFor always answers full -> the test a public reader sees initials and an admin token the full name went red (2026-10-22)
  kinds: read
  checklist: scoped-reads dismissed: every reader gets the whole event snapshot, and only the name form changes
  checklist: redaction declared as public names
- version bump: Every write bumps the event version in its transaction.
  over: two direct bumps from zero, a first and a second heartbeat, a reap after the window and a second reap, and two concurrent reaps of one stale mat
  via: every write bumps the event version in its transaction
  because: every screen polls one snapshot keyed by the event version, so a write that does not bump it stays unseen, and a heartbeat or a reap that changes nothing does not bump it
  refuted: bumpVersion adds 0 instead of 1 -> the test every write bumps the event version in its transaction went red (2026-10-22)
  kinds: state
  checklist: revalidated-permission dismissed: a heartbeat or a reap carries no permission, and the reap runs as the system on a read
  checklist: separation-of-duties dismissed: no approval policy exists
  checklist: legal-state-succession dismissed: the version only counts up by one inside each write and has no predecessor rule
  checklist: supersession-safety declared as version bump
  checklist: worker-fencing dismissed: no worker owns an event, and every bump is one SQL increment
  checklist: commit-ordered-effects dismissed: the bump commits with its write and no external effect follows
  checklist: resumption-coverage dismissed: no work resumes, and the next poll repeats a sweep that lost the write lock
- mat takeover: A mat binding dies when another tablet takes the mat.
  over: a bind on a desk event after the code check, a right code then twenty wrong codes, a second tablet on a held mat with and without a takeover and the first tablet's token after it, a mat whose scorer stopped answering, and an unknown event or mat
  via: a mat binding dies when another tablet takes the mat
  because: bindMat mints the next bind epoch inside one transaction and requireMatOrAdmin refuses a token whose epoch is not the mat's current one, so two tablets never score one match
  crossing: internet -> mat
  entrances: routes scoring, routes board
  refuted: bindMat never refuses a held mat -> the test a mat binding dies when another tablet takes the mat went red (2026-10-22)
  kinds: credential
  checklist: capability-authorization declared as mat takeover
  checklist: revalidated-permission declared as mat takeover
  checklist: message-authenticity dismissed: the mat token is an HMAC token, and the signature check is the auth component's signed tokens invariant
  checklist: encrypted-storage dismissed: the server stores the bind epoch, never the token
  checklist: key-rotation-compatibility dismissed: nothing encrypted is retained
  checklist: separation-of-duties dismissed: one tablet holds a mat and no approval policy exists
