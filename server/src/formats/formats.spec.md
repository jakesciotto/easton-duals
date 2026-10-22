# Divisions and formats
Round robin, single and double elimination, generated once per style with feeds between rounds.

## invariants
- once per style: A division generates its matches once per style in dependency order.
  over: a single elimination of both styles, its shared same-team warning, and a nogi round robin
  via: a division generates its matches once per style in dependency order
  because: generateDivision emits the gi set and then the nogi set, and shifts each feed by the set's offset, so every feed points at an earlier match of its own style
  refuted: styles both generates gi only -> the test a division generates its matches once per style in dependency order went red (2026-10-22)
  kinds: none
- seed order: Seeds are the listed order and seed by rating reorders by ERP.
  over: seedByRating over a set of rated and unrated kids with a rating tie, and over a wholly unrated set
  via: seeds are the listed order and seed by rating reorders by ERP
  because: seedByRating puts the rated kids first by ERP descending, breaks a tie on the listed seed, and keeps the unrated kids after them in listed order
  refuted: seedByRating sorts ERP ascending -> the test seeds are the listed order and seed by rating reorders by ERP went red (2026-10-22)
  kinds: none
- same-team split: A same-team round one pair is swapped away or warned.
  over: a four kid bracket with one pair to split, one already cross-team, one with every kid on one team, and a three kid bracket with a bye
  via: a same-team round one pair is swapped away or warned
  because: arrangeSlots moves the lower seed of a same-team pair to the nearest seed that splits both pairs, and warns when no swap splits it, so the division still exists
  refuted: arrangeSlots skips every pair -> the test a same-team round one pair is swapped away or warned went red (2026-10-22)
  kinds: none
- one grand final: Double elimination ends in one grand final with no reset.
  over: double elimination brackets of three, four, five and eight members
  via: double elimination ends in one grand final with no reset
  because: generateStyle resolves the winners champion against the losers champion once and emits no reset match
  refuted: emitted the grand final twice -> the test double elimination ends in one grand final with no reset went red (2026-10-22)
  kinds: none
