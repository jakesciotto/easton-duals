import { describe, it, expect } from 'vitest'
import { bracketRounds, roundLabel } from '../src/shared/round-label.js'

const single = (round: number, count: number) => roundLabel('single_elim', round, count)
const double = (round: number, count: number) => roundLabel('double_elim', round, count)

describe('bracketRounds', () => {
  it('counts the rounds of the power of two the bracket is built at', () => {
    expect([2, 3, 4, 5, 8, 9, 16].map(bracketRounds)).toEqual([1, 2, 2, 3, 3, 4, 4])
  })
})

describe('roundLabel', () => {
  it('names a single elimination round by its distance from the final', () => {
    expect(single(1, 2)).toBe('Final')
    expect([single(1, 4), single(2, 4)]).toEqual(['Semifinal', 'Final'])
    expect([single(1, 5), single(2, 5), single(3, 5)]).toEqual(['Quarterfinal', 'Semifinal', 'Final'])
    expect([single(1, 8), single(2, 8), single(3, 8)]).toEqual(['Quarterfinal', 'Semifinal', 'Final'])
    expect([single(1, 16), single(2, 16), single(3, 16), single(4, 16)])
      .toEqual(['Round of 16', 'Quarterfinal', 'Semifinal', 'Final'])
  })

  it('falls back to the ordinal past the round of 16', () => {
    expect(roundLabel('single_elim', 1, 32)).toBe('Round 1')
  })

  it('names the winners side of a double elimination the same way', () => {
    expect([double(1, 8), double(2, 8), double(3, 8)]).toEqual(['Quarterfinal', 'Semifinal', 'Final'])
  })

  it('counts the losers rounds from one and ends with the grand final', () => {
    expect([double(3, 4), double(4, 4), double(5, 4)]).toEqual(['Losers round 1', 'Losers round 2', 'Grand final'])
    expect([double(4, 8), double(5, 8), double(6, 8), double(7, 8), double(8, 8)])
      .toEqual(['Losers round 1', 'Losers round 2', 'Losers round 3', 'Losers round 4', 'Grand final'])
  })

  it('gives a three kid division two losers rounds and a grand final', () => {
    expect([double(1, 3), double(2, 3), double(3, 3), double(4, 3), double(5, 3)])
      .toEqual(['Semifinal', 'Final', 'Losers round 1', 'Losers round 2', 'Grand final'])
  })

  it('prints the ordinal for round robin, which has no bracket', () => {
    expect(roundLabel('round_robin', 2, 5)).toBe('Round 2')
  })
})
