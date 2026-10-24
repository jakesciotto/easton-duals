# Roster
The paste, the WellnessLiving sync, the leaderboard ERP join and the link suggestions.

## invariants
- manual values stick: A hand-edited age or weight sticks through a re-sync.
  over: profileChanges on an update that carries some fields, on an empty update and on an absent value; a syncRoster of a linked kid whose weight was set by hand, of one whose age was set by hand beside a leaderboard weight it still moves, and two syncRoster passes after an age and a weight typed through the athletes route; a candidate upsert after a hand edit of the age
  via: a hand-edited age or weight sticks through a re-sync
  because: the sync overwrites a field only when the update carries it, and linkUpdate skips an age or weight whose source is manual, so the organizer's edit wins over WellnessLiving and the leaderboard on every syncRoster pass
  crossing: leaderboard -> store
  entrances: none
  refuted: linkUpdate overwrites an age whose source is manual -> the test a hand-edited age or weight sticks through a re-sync went red, 3 of 6 (2026-10-24)
  kinds: state
  checklist: revalidated-permission dismissed: the sync runs inside the admin request that asked for it and defers no work
  checklist: separation-of-duties dismissed: no approval policy exists on a sync
  checklist: legal-state-succession declared as manual values stick
  checklist: supersession-safety declared as manual values stick
  checklist: worker-fencing dismissed: no worker owns a roster row
  checklist: commit-ordered-effects dismissed: the WellnessLiving and leaderboard reads come before the transaction and change nothing outside it
  checklist: resumption-coverage dismissed: a sync that runs out of budget answers 503 and writes nothing, and a person runs it again whole
- roster names only: The sync asks WellnessLiving for the roster's own names only.
  over: a sync with WellnessLiving not configured, with two locations, with a name typed in capitals, with a body that names other businesses, with no location, with a spent budget and with an unknown event; and the report query built from a filter of uids and tokens, from a title case token and from an empty filter
  via: the sync asks WellnessLiving for the roster's own names only
  because: rosterFilter builds the filter from the uids and last name tokens of the event's own rows, and searchQuery compares them through lower() because the report's like is case sensitive, so the report never lists the whole gym
  crossing: store -> wellnessliving
  entrances: none
  refuted: rosterFilter fills firstTokens with the roster last name tokens -> the test the sync asks WellnessLiving for the roster's own names only went red (2026-10-22)
  kinds: output, read
  checklist: destination-confinement declared as roster names only
  checklist: redaction dismissed: the filter carries only the uids and last name tokens the report needs to find the roster's kids
  checklist: commit-ordered-effects dismissed: the report read changes nothing at WellnessLiving
  checklist: circuit-breaker-policy dismissed: a failed or slow location answers 503 under the sync budget and opens no breaker
  checklist: declared-target-coverage declared as roster names only
  checklist: scoped-reads declared as roster names only
