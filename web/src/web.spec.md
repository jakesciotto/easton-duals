# Console, scorer and board
The React client: the admin console, the tablet scorer, the TV board, the pastes and the polling.

## invariants
- roster paste columns: A roster paste maps columns by header or by position.
  over: a tab separated sheet with a header, split first and last name columns, header aliases such as Weight (lbs) and Rank, an unknown column, two columns for one field, a header with no name column, a team column, positional lines with optional fields, bad and out of range lines, the boundary values, one cell lines, a bare number line and the Scoring column in header and positional pastes
  via: a roster paste maps columns by header or by position
  because: parseRosterPaste reads a detected header through its mapped columns and every other paste through the fixed positional columns, so a cell lands in the field the organizer meant; a one cell line is a header only on an exact field name, because a names-only paste can open with a surname that resembles an alias and a header read there drops that competitor without a word
  refuted: header rows read their cells by the positional columns -> the test a roster paste maps columns by header or by position went red (2026-10-22)
  kinds: encoding
  checklist: key-rotation-compatibility dismissed: nothing is encrypted
  checklist: semantic-preservation declared as roster paste columns
  checklist: canonical-encoding dismissed: a paste row is a new kid, not an identity the parse must keep stable
- match paste lines: A match paste creates pairs and division lines.
  over: an empty paste, comma and tab cells, vs and v separators, four name cells, style tokens, refused lines (one name, one kid twice, a kid on no team, an unknown or shared name), same team and already met warnings, exact and near names, a double surname, division lines with format, style, member limits and near notes, a paste with a problem and a paste of both kinds
  via: a match paste creates pairs and division lines
  because: parseMatchPaste turns each line into a pair or a division through the shared similarity rules, and creates nothing while any line carries a problem; a name the roster does not carry is a problem on its line, never a competitor added quietly, and the paste's own earlier lines count as already met
  refuted: the pair branch requires three names -> the test a match paste creates pairs and division lines went red (2026-10-22)
  kinds: encoding
  checklist: key-rotation-compatibility dismissed: nothing is encrypted
  checklist: semantic-preservation declared as match paste lines
  checklist: canonical-encoding dismissed: a name resolves to one roster kid through the similarity module, which the shared spec owns
- scoring cap before send: The scoring cap is checked before the paste is sent.
  over: a paste whose marks plus the team's existing marks pass ten, marked rows with no team, and a paste with no marks
  via: the scoring cap is checked before the paste is sent
  because: scoringCapProblems counts the existing marks and the paste's marks per team against SCORING_CAP, so the dialog names the problem before the server refuses the eleventh with 422; a marked row with no effective team cannot be counted against any team, so it is named on its own rather than dropped
  refuted: the cap threshold is raised by 100 -> the test the scoring cap is checked before the paste is sent went red (2026-10-22)
  kinds: none
- open dialog hold: An open dialog holds the snapshot unless it opts out by name.
  over: a free pass through, a hold and release on the first free recheck, a change of subject, the first arrival, an unmount, the engaged signals (an open dialog, a drag, a focused field, an open listbox, a dialog that opts out) and the field grant the app focuses
  via: an open dialog holds the snapshot unless it opts out by name
  because: useHeldWhileEngaged commits a new snapshot only while operatorEngaged answers false and then commits the newest arrival, so a poll never replaces state under the operator's hand; only an open listbox counts, because a closed base-ui popup stays in the portal carrying data-closed and matching it left the screen engaged for good; the field the app focuses after a save is granted until the operator's first touch, or the refetch carrying the saved row is held; the scorer's confirm sheet opts out because its content is the live match, and its confirm refuses a result that moved after the sheet was raised; every snapshot request carries a deadline, because a dropped access point otherwise leaves the await unsettled forever while the screen still reads connected
  refuted: useHeldWhileEngaged commits the incoming value while the operator is engaged -> the test an open dialog holds the snapshot unless it opts out by name went red (2026-10-22)
  kinds: state
  checklist: revalidated-permission dismissed: the hold carries no permission
  checklist: separation-of-duties dismissed: no approval policy exists in the client
  checklist: legal-state-succession dismissed: the hold moves a value forward only, it has no state machine
  checklist: supersession-safety declared as open dialog hold
  checklist: worker-fencing dismissed: no worker owns the snapshot
  checklist: commit-ordered-effects dismissed: the hold issues no external effect
  checklist: resumption-coverage dismissed: the next poll replaces any snapshot lost on unmount
- engaged check through the hold: The engaged check is read only by the snapshot hold.
  protects: operatorEngaged
  chokepoint: useHeldWhileEngaged
  from: anywhere
  because: one mechanism decides when a polled value may replace what the operator works on, so no screen can commit under a dialog by its own rule; the snapshot poll and the event detail query both pass through it, because a detail refetch mid drag once re-indexed the list the gesture pointed at
  kinds: state
  checklist: revalidated-permission dismissed: the hold carries no permission
  checklist: separation-of-duties dismissed: no approval policy exists in the client
  checklist: legal-state-succession dismissed: the hold moves a value forward only, it has no state machine
  checklist: supersession-safety declared as open dialog hold
  checklist: worker-fencing dismissed: no worker owns the snapshot
  checklist: commit-ordered-effects dismissed: the hold issues no external effect
  checklist: resumption-coverage dismissed: the next poll replaces any snapshot lost on unmount
- token stored by the gate: An admin token is stored only by the PIN gate.
  protects: setAdminToken
  chokepoint: PinGate
  from: anywhere
  because: the console holds an admin token only after the PIN route answered one, so no screen can sign itself in; PinGate reads the token's own unsigned exp to tell a genuine expiry from a deliberate Sign out, since both clear the token the same way
  kinds: credential
  checklist: capability-authorization dismissed: the server verifies the token on every request, and the client only stores what the PIN route answered
  checklist: revalidated-permission dismissed: the server checks the token signature and expiry on every request
  checklist: message-authenticity dismissed: the client never verifies the token and keeps it as an opaque string
  checklist: encrypted-storage dismissed: the token sits in the browser's localStorage in plain text for its 24 hour life, as the console session
  checklist: key-rotation-compatibility dismissed: nothing is encrypted
  checklist: separation-of-duties dismissed: one admin role exists and no approval policy
