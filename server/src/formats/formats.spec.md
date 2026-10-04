# Divisions and formats
Round robin, single and double elimination, generated once per style with feeds between rounds.

## invariants
- a division generates its matches once per style in dependency order
- seeds are the listed order and seed by rating reorders by ERP
- a same-team round one pair is swapped away or warned
- double elimination ends in one grand final with no reset

## works when
- boundary "a division generates its matches once per style in dependency order" at generateDivision via guard "both styles"
- boundary "seeds are the listed order and seed by rating reorders by ERP" at seedByRating via guard "seedByRating"
- boundary "a same-team round one pair is swapped away or warned" at arrangeSlots via guard "same-team pairs in round one"
- boundary "double elimination ends in one grand final with no reset" at generateDivision via guard "double elimination"
- passes test "round robin"
- passes test "single elimination"
- passes test "createDivision"
- passes test "regenerateDivision"
- passes test "deleteDivision"

## why
A division is a named set of kids across teams with one format (round robin, single or
double elimination) and one styles setting (gi, nogi, both). "Pairs" is not a format. Limits:
round robin 2 to 10, single elimination 2 to 16, double elimination 3 to 16. The generator
builds a division's matches once per style, in dependency order: round robin as every
cross-team pair; single elimination as a seeded bracket (slot order 1, 8, 4, 5, 2, 7, 3, 6 for
eight) with byes to the top seeds; double elimination with a losers side and one grand final.
A bracket round exists from generation as a row with empty sides that carry a feed (the
winner or the loser of another match). Seeds are the listed order; "Seed by rating" is an
action, never a default.

## refutations
- a division generates its matches once per style in dependency order: styles 'both' generates gi only -> RED, "1 failed | 2 passed" in both styles
- seeds are the listed order and seed by rating reorders by ERP: seedByRating sorts ERP ascending -> RED, "1 failed | 1 passed" in seedByRating
- a same-team round one pair is swapped away or warned: arrangeSlots skips every pair -> RED, "3 failed | 0 passed" in same-team pairs in round one
- double elimination ends in one grand final with no reset: emitted the grand final twice -> RED, "4 failed | 0 passed" in double elimination
