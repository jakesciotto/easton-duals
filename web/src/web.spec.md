# Console, scorer and board
The React client: the admin console, the tablet scorer, the TV board, the pastes and the polling.

## invariants
- a roster paste maps columns by header or by position
- a match paste creates pairs and division lines
- the scoring cap is checked before the paste is sent
- an open dialog holds the snapshot unless it opts out by name

## works when
- boundary "a roster paste maps columns by header or by position" at parseRosterPaste via guard "parseRosterPaste, header row"
- boundary "a match paste creates pairs and division lines" at parseMatchPaste via guard "parseMatchPaste"
- boundary "the scoring cap is checked before the paste is sent" at scoringCapProblems via guard "scoringCapProblems"
- boundary "an open dialog holds the snapshot unless it opts out by name" at useHeldWhileEngaged via guard "useHeldWhileEngaged"
- passes test "EventPage, 6.4: one poll for the whole event"
- passes test "the board greps in 5.1"
- passes test "team colour guards"
- passes test "useSnapshot"

## why
Design: one language, two dialects, and the dialect is chosen by viewing distance. The console
refuses to shout; the board raises its voice only through geometry and size. Black ground,
near-black surfaces with hairlines, a twelve step neutral ramp, 6px controls and 8px cards, a
4px spacing grid, Geist for text and Geist Mono for numbers, three weights (400, 500, 600) and
nothing above. Exactly three state accents: `--live` (running now), `--attend` (a person is
needed), `--fault` (failed, refused or ran out). Team colour appears only as dots, rules,
plates and tinted names. The console is authored in CSS pixels; the board in `cqh` on a 16:9
stage, no `px` font size on the board and no `cqh` anywhere else; no hex literal in the app
except the QR code's white tile; no forbidden grey token on the board. `scripts/design-lint.mjs`
enforces those greps at the root lint and CI. The full brief (the Caliper rebuild, v0.5.0) is
archived with the project folder on vinelab. Jake rejected the default shadcn dark look,
brutalist, glow and glass, and gradients on the way to this.

Polling: one poll per event; the snapshot commit is suspended while the operator is engaged
(any open dialog), and a dialog whose content is the live state opts out by name with
`data-poll-through`. The client never clears the admin token on a 401. A grid column minimum
must exceed the row's fixed tracks (the roster name column once collapsed to zero). Buttons
step 36, 40, 44, and the scorer's 64. Board rules: the leaderboard for every team count, far
clamped by team count, no plate and no "Wins" word on leaderboard rows.

## refutations
- a roster paste maps columns by header or by position: header rows read cells by the positional columns -> RED, "6 failed | 3 passed" in parseRosterPaste, header row
- a match paste creates pairs and division lines: pair branch requires 3 names instead of 2 -> RED, "16 failed | 11 passed" in parseMatchPaste
- the scoring cap is checked before the paste is sent: cap threshold raised by 100 -> RED, "1 failed | 2 passed" in scoringCapProblems
- an open dialog holds the snapshot unless it opts out by name: useHeldWhileEngaged commits the incoming value while the operator is engaged -> RED, "2 failed | 3 passed" in useHeldWhileEngaged
