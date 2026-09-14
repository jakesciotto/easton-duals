import { describe, it, expect } from 'vitest'
import { scoringSet, teamPointsFor } from '../src/shared/scoring.js'

const kids = (n: number, marked: number[] = []) => Array.from({ length: n }, (_, i) => ({ id: i + 1, scoring: marked.includes(i + 1) }))

describe('scoringSet', () => {
  it('scores with every kid on a team inside the cap, marked or not', () => {
    expect([...scoringSet(kids(3))]).toEqual([1, 2, 3])
    expect([...scoringSet(kids(10, [4]))]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('scores only with the marked kids on a larger team', () => {
    expect([...scoringSet(kids(11, [2, 9]))]).toEqual([2, 9])
    expect(scoringSet(kids(11)).size).toBe(0)
  })
})

describe('teamPointsFor', () => {
  it('pays three for a submission, two for points, one for the rest', () => {
    expect(['submission', 'points', 'decision', 'walkover', 'dq'].map(w => teamPointsFor(w as never))).toEqual([3, 2, 1, 1, 1])
  })
})
