import { describe, it, expect } from 'vitest'
import { generateDivision, seedByRating, slotOrder, type GenerateMember, type GeneratedMatch, type Slot } from '../src/formats/generate.js'
import type { DivisionFormat, DivisionStyles } from '../src/shared/types.js'

// Ids run 101 up so a member id can never be mistaken for a seed or a feed index.
const NAMES = ['Mateo', 'Olivia', 'Noah', 'Ava', 'Liam', 'Sofia', 'Ethan', 'Maya', 'Jonas', 'Priya']

function members(count: number, teams: number[] = []): GenerateMember[] {
  return Array.from({ length: count }, (_, i) => ({
    athleteId: 101 + i,
    teamId: teams[i] ?? (i % 3) + 1,
    seed: i + 1,
    name: NAMES[i],
  }))
}

function generate(format: DivisionFormat, count: number, opts: { teams?: number[]; styles?: DivisionStyles; name?: string } = {}) {
  return generateDivision({
    name: opts.name ?? '47 to 53 boys',
    format,
    styles: opts.styles ?? 'gi',
    members: members(count, opts.teams),
  })
}

const kid = (slot: Slot) => slot.kind === 'kid' ? slot.athleteId : null
const pairs = (matches: GeneratedMatch[]) => matches.map(m => [kid(m.a), kid(m.b)])
const shape = (m: GeneratedMatch) => [m.round, slotText(m.a), slotText(m.b)].join(' ')
const slotText = (slot: Slot) => slot.kind === 'kid' ? String(slot.athleteId) : `${slot.take[0].toUpperCase()}${slot.index}`

describe('round robin', () => {
  it('runs every cross-team pair in seed order', () => {
    const { matches, warnings } = generate('round_robin', 3, { teams: [1, 2, 3] })
    expect(pairs(matches)).toEqual([[101, 102], [101, 103], [102, 103]])
    expect(matches.every(m => m.round === null && m.why === '47 to 53 boys')).toBe(true)
    expect(warnings).toEqual([])
  })

  it('skips the same-team pairs and keeps the rest in seed order', () => {
    const { matches, warnings } = generate('round_robin', 5, { teams: [1, 1, 2, 2, 3] })
    expect(pairs(matches)).toEqual([
      [101, 103], [101, 104], [101, 105],
      [102, 103], [102, 104], [102, 105],
      [103, 105], [104, 105],
    ])
    expect(warnings).toEqual([])
  })
})

describe('single elimination', () => {
  it('lays the slots out in the standard seeded order', () => {
    expect(slotOrder(2)).toEqual([1, 2])
    expect(slotOrder(4)).toEqual([1, 4, 2, 3])
    expect(slotOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })

  it('runs one match for two members', () => {
    const { matches } = generate('single_elim', 2, { teams: [1, 2] })
    expect(matches.map(shape)).toEqual(['1 101 102'])
    expect(matches[0].why).toBe('47 to 53 boys, final')
  })

  it('gives the bye to the top seed with three members', () => {
    const { matches } = generate('single_elim', 3, { teams: [1, 2, 3] })
    expect(matches.map(shape)).toEqual(['1 102 103', '2 101 W0'])
    expect(matches.map(m => m.why)).toEqual(['47 to 53 boys, semifinal', '47 to 53 boys, final'])
  })

  it('runs three matches for four members, the final fed by both', () => {
    const { matches } = generate('single_elim', 4, { teams: [1, 2, 3, 2] })
    expect(matches.map(shape)).toEqual(['1 101 104', '1 102 103', '2 W0 W1'])
    expect(matches.map(m => m.why)).toEqual([
      '47 to 53 boys, semifinal', '47 to 53 boys, semifinal', '47 to 53 boys, final',
    ])
  })

  it('gives five members four matches with the final at round three', () => {
    const { matches } = generate('single_elim', 5, { teams: [1, 2, 3, 1, 2] })
    expect(matches.map(shape)).toEqual(['1 104 105', '2 101 W0', '2 102 103', '3 W1 W2'])
    expect(matches.map(m => m.round)).toEqual([1, 2, 2, 3])
  })

  it('runs seven matches for eight members in slot order', () => {
    const { matches } = generate('single_elim', 8, { teams: [1, 1, 1, 1, 2, 2, 2, 2] })
    expect(matches.map(shape)).toEqual([
      '1 101 108', '1 104 105', '1 102 107', '1 103 106',
      '2 W0 W1', '2 W2 W3',
      '3 W4 W5',
    ])
  })

  it('points every feed at an earlier match', () => {
    const { matches } = generate('single_elim', 16)
    expect(matches).toHaveLength(15)
    for (const [i, m] of matches.entries()) {
      for (const slot of [m.a, m.b]) if (slot.kind === 'feed') expect(slot.index).toBeLessThan(i)
    }
  })
})

describe('double elimination', () => {
  it('gives four members six matches, one grand final', () => {
    const { matches } = generate('double_elim', 4, { teams: [1, 2, 3, 2] })
    expect(matches.map(shape)).toEqual([
      '1 101 104', '1 102 103',
      '2 W0 W1',
      '3 L0 L1',
      '4 W3 L2',
      '5 W2 W4',
    ])
    expect(matches[5].why).toBe('47 to 53 boys, grand final')
  })

  it('gives three members four matches', () => {
    const { matches } = generate('double_elim', 3, { teams: [1, 2, 3] })
    expect(matches.map(shape)).toEqual(['1 102 103', '2 101 W0', '4 L0 L1', '5 W1 W2'])
    expect(matches.map(m => m.why)).toEqual([
      '47 to 53 boys, semifinal', '47 to 53 boys, final',
      '47 to 53 boys, losers round 2', '47 to 53 boys, grand final',
    ])
  })

  it('drops each winners round into the losers side in reverse order', () => {
    const { matches } = generate('double_elim', 8, { teams: [1, 1, 1, 1, 2, 2, 2, 2] })
    expect(matches).toHaveLength(14)
    expect(matches.slice(7).map(shape)).toEqual([
      '4 L0 L1', '4 L2 L3',
      '5 W7 L5', '5 W8 L4',
      '6 W9 W10',
      '7 W11 L6',
      '8 W6 W12',
    ])
  })

  it('gives five members eight matches and one losers champion', () => {
    const { matches } = generate('double_elim', 5, { teams: [1, 2, 3, 1, 2] })
    expect(matches).toHaveLength(8)
    expect(matches.map(shape)).toEqual([
      '1 104 105', '2 101 W0', '2 102 103', '3 W1 W2',
      '5 L0 L2', '6 W4 L1', '7 W5 L3', '8 W3 W6',
    ])
  })
})

describe('same-team pairs in round one', () => {
  it('swaps the lower seed with the nearest seed that splits both pairs', () => {
    // Slot order 1, 4, 2, 3 puts seeds 1 and 4 together, both on team 1. Seed 4 is the
    // lower of the two, and the nearest seed whose swap splits both pairs is seed 3.
    const { matches, warnings } = generate('single_elim', 4, { teams: [1, 2, 3, 1] })
    expect(pairs(matches).slice(0, 2)).toEqual([[101, 103], [102, 104]])
    expect(warnings).toEqual([])

    // Nothing to split here: both round one pairs are already cross-team.
    const left = generate('single_elim', 4, { teams: [1, 2, 3, 2] })
    expect(pairs(left.matches).slice(0, 2)).toEqual([[101, 104], [102, 103]])
    expect(left.warnings).toEqual([])
  })

  it('keeps the pair and warns when no swap splits it', () => {
    const { matches, warnings } = generate('single_elim', 4, { teams: [1, 1, 1, 1] })
    expect(pairs(matches).slice(0, 2)).toEqual([[101, 104], [102, 103]])
    expect(warnings).toEqual(['Same team: Mateo and Ava', 'Same team: Olivia and Noah'])
  })

  it('leaves a pair holding a bye out of the same-team check', () => {
    const { warnings } = generate('single_elim', 3, { teams: [1, 1, 1] })
    expect(warnings).toEqual(['Same team: Olivia and Noah'])
  })
})

describe('both styles', () => {
  it('runs the nogi set after the gi set with its feeds pointing inside itself', () => {
    const { matches } = generate('single_elim', 4, { teams: [1, 2, 3, 2], styles: 'both' })
    expect(matches.map(m => m.style)).toEqual(['gi', 'gi', 'gi', 'nogi', 'nogi', 'nogi'])
    expect(matches.map(shape)).toEqual([
      '1 101 104', '1 102 103', '2 W0 W1',
      '1 101 104', '1 102 103', '2 W3 W4',
    ])
  })

  it('warns once for a pair both styles share', () => {
    const { warnings } = generate('single_elim', 4, { teams: [1, 1, 1, 1], styles: 'both' })
    expect(warnings).toEqual(['Same team: Mateo and Ava', 'Same team: Olivia and Noah'])
  })

  it('doubles a round robin without any feed to shift', () => {
    const { matches } = generate('round_robin', 3, { teams: [1, 2, 3], styles: 'nogi' })
    expect(matches.map(m => m.style)).toEqual(['nogi', 'nogi', 'nogi'])
  })
})

describe('seedByRating', () => {
  it('sorts by rating, unrated last in the listed order', () => {
    expect(seedByRating([
      { athleteId: 1, erp: 5.4, seed: 1 },
      { athleteId: 2, erp: null, seed: 2 },
      { athleteId: 3, erp: 7.2, seed: 3 },
      { athleteId: 4, erp: null, seed: 4 },
      { athleteId: 5, erp: 5.4, seed: 5 },
    ])).toEqual([3, 1, 5, 2, 4])
  })

  it('leaves a wholly unrated set in its listed order', () => {
    expect(seedByRating([
      { athleteId: 9, erp: null, seed: 2 },
      { athleteId: 8, erp: null, seed: 1 },
    ])).toEqual([8, 9])
  })
})

describe('determinism', () => {
  it('gives the same matches and warnings every run', () => {
    const once = generate('double_elim', 7, { teams: [1, 1, 2, 2, 3, 3, 1], styles: 'both' })
    const twice = generate('double_elim', 7, { teams: [1, 1, 2, 2, 3, 3, 1], styles: 'both' })
    expect(twice).toEqual(once)
  })
})
