import { describe, it, expect } from 'vitest'
import { planSchedule, type PendingMatch, type PlanInput, type Style } from '../src/schedule/plan.js'

const noNames = (id: number) => `A${id}`

function pm(p: {
  id: number
  number: number
  style?: Style
  athleteIds?: (number | null)[]
  feeds?: number[]
  age?: number | null
  round?: number | null
  divisionPosition?: number | null
  lengthSec?: number
}): PendingMatch {
  return {
    id: p.id,
    number: p.number,
    style: p.style ?? 'gi',
    athleteIds: p.athleteIds ?? [],
    feeds: p.feeds ?? [],
    age: p.age ?? null,
    round: p.round ?? null,
    divisionPosition: p.divisionPosition ?? null,
    lengthSec: p.lengthSec ?? 300,
  }
}

function plan(pending: PendingMatch[], opts: Partial<Omit<PlanInput, 'pending'>> = {}, names = noNames) {
  return planSchedule({
    mats: opts.mats ?? [{ id: 10, number: 1 }],
    live: opts.live ?? [],
    pending,
    firstOrderIndex: opts.firstOrderIndex ?? 1,
  }, names)
}

const matchIds = (p: ReturnType<typeof planSchedule>) => p.order.map(o => o.matchId)
const waveOf = (p: ReturnType<typeof planSchedule>, matchId: number) => p.order.find(o => o.matchId === matchId)?.wave

describe('planSchedule: priority order', () => {
  it('places every gi match ahead of every nogi match, regardless of number', () => {
    const result = plan([
      pm({ id: 1, number: 1, style: 'nogi', athleteIds: [1, 2] }),
      pm({ id: 2, number: 2, style: 'gi', athleteIds: [3, 4] }),
    ])
    expect(matchIds(result)).toEqual([2, 1])
  })

  it('places the younger match first ahead of number', () => {
    const result = plan([
      pm({ id: 1, number: 1, age: 10, athleteIds: [1, 2] }),
      pm({ id: 2, number: 2, age: 8, athleteIds: [3, 4] }),
    ])
    expect(matchIds(result)).toEqual([2, 1])
  })

  it('sorts a match with no known age last within its style', () => {
    const result = plan([
      pm({ id: 1, number: 5, age: 5, athleteIds: [1, 2] }),
      pm({ id: 2, number: 1, age: null, athleteIds: [3, 4] }),
    ])
    expect(matchIds(result)).toEqual([1, 2])
  })

  it('sorts a null round ahead of a real one', () => {
    const result = plan([
      pm({ id: 1, number: 1, round: 3, athleteIds: [1, 2] }),
      pm({ id: 2, number: 5, round: null, athleteIds: [3, 4] }),
    ])
    expect(matchIds(result)).toEqual([2, 1])
  })

  it('sorts a null division position ahead of a real one', () => {
    const result = plan([
      pm({ id: 1, number: 1, divisionPosition: 2, athleteIds: [1, 2] }),
      pm({ id: 2, number: 5, divisionPosition: null, athleteIds: [3, 4] }),
    ])
    expect(matchIds(result)).toEqual([2, 1])
  })
})

describe('planSchedule: the style rule gaps rather than takes a runnable nogi match', () => {
  const result = plan([
    pm({ id: 1, number: 1, style: 'gi', athleteIds: [1, 2] }),
    pm({ id: 2, number: 2, style: 'gi', athleteIds: [3, 4], feeds: [1] }),
    pm({ id: 3, number: 3, style: 'nogi', athleteIds: [5, 6] }),
  ])

  it('idles the mat at wave 1 instead of running the free nogi match', () => {
    expect(result.gaps).toEqual([{ wave: 1, matId: 10, waitingOn: 2 }])
    expect(result.warnings).toEqual([])
  })

  it('still respects the feeder wait for the delayed gi match, then frees the nogi match', () => {
    expect(waveOf(result, 1)).toBe(0)
    expect(waveOf(result, 2)).toBe(2)
    expect(waveOf(result, 3)).toBe(3)
  })

  it('keeps a contiguous order index over placed matches only', () => {
    expect(result.order.map(o => o.orderIndex)).toEqual([1, 2, 3])
  })

  it('sums the longest match of every wave that ran plus a minute, gapped waves free', () => {
    expect(result.waves).toBe(4)
    expect(result.minutes).toBe(18) // (300+60)*3 placed waves / 60, wave 1 contributes nothing
  })
})

describe('planSchedule: the feeder rule holds a match two waves behind its feeders', () => {
  const mats = [{ id: 10, number: 1 }, { id: 20, number: 2 }]
  const result = plan([
    pm({ id: 1, number: 1, athleteIds: [1, 2] }),
    pm({ id: 2, number: 2, athleteIds: [3, 4] }),
    pm({ id: 3, number: 3, athleteIds: [null, null], feeds: [1, 2] }),
  ], { mats })

  it('runs both feeders at wave 0, one per mat', () => {
    expect(waveOf(result, 1)).toBe(0)
    expect(waveOf(result, 2)).toBe(0)
  })

  it('gaps both mats at wave 1, waiting on the final', () => {
    expect(result.gaps).toEqual([
      { wave: 1, matId: 10, waitingOn: 3 },
      { wave: 1, matId: 20, waitingOn: 3 },
    ])
  })

  it('runs the final at wave 2, two waves after its feeders', () => {
    expect(waveOf(result, 3)).toBe(2)
    expect(result.waves).toBe(3)
  })

  it('counts each mat and the minutes for the waves that actually ran', () => {
    expect(result.perMat).toEqual([
      { matId: 10, number: 1, count: 2 },
      { matId: 20, number: 2, count: 1 },
    ])
    expect(result.minutes).toBe(12) // (300+60) at wave 0, (300+60) at wave 2
  })

  it('treats an id that names neither a pending nor a live match as already done', () => {
    const done = plan([pm({ id: 1, number: 1, athleteIds: [1, 2], feeds: [9999] })])
    expect(waveOf(done, 1)).toBe(0)
    expect(done.gaps).toEqual([])
  })

  it('counts a feeder that names a live match as wave -1, so its dependent waits for wave 1', () => {
    const result2 = plan(
      [pm({ id: 1, number: 1, athleteIds: [null, null], feeds: [99] })],
      { live: [{ matchId: 99, athleteIds: [901] }] },
    )
    expect(result2.gaps).toEqual([{ wave: 0, matId: 10, waitingOn: 1 }])
    expect(waveOf(result2, 1)).toBe(1)
  })
})

describe('planSchedule: the rest rule keeps a kid out of the immediately adjacent wave', () => {
  it('spaces a kid\'s two matches by at least two waves when a filler is available', () => {
    const result = plan([
      pm({ id: 1, number: 1, athleteIds: [1, 2] }),
      pm({ id: 2, number: 2, athleteIds: [3, 4] }),
      pm({ id: 3, number: 3, athleteIds: [1, 5] }),
    ])
    expect(result.warnings).toEqual([])
    expect(result.gaps).toEqual([])
    expect(waveOf(result, 3)! - waveOf(result, 1)!).toBe(2)
  })

  it('relaxes to back-to-back with a warning when a three-way round robin has nothing else to run', () => {
    const names: Record<number, string> = { 1: 'Priya', 2: 'Jonah', 3: 'Mika' }
    const result = plan([
      pm({ id: 1, number: 1, athleteIds: [1, 2] }), // Priya v Jonah
      pm({ id: 2, number: 2, athleteIds: [1, 3] }), // Priya v Mika
      pm({ id: 3, number: 3, athleteIds: [2, 3] }), // Jonah v Mika
    ], {}, id => names[id])

    expect(matchIds(result)).toEqual([1, 2, 3])
    expect(waveOf(result, 1)).toBe(0)
    expect(waveOf(result, 2)).toBe(1)
    expect(waveOf(result, 3)).toBe(2)
    expect(result.gaps).toEqual([])
    expect(result.warnings).toEqual([
      'Priya: M1 and M2 back to back',
      'Mika: M2 and M3 back to back',
    ])
  })

  it('names the kid and both match numbers, earlier first, for a simple back-to-back', () => {
    const names: Record<number, string> = { 1: 'Wren', 2: 'Otis', 3: 'Nadia' }
    const result = plan([
      pm({ id: 1, number: 1, athleteIds: [1, 2] }),
      pm({ id: 2, number: 2, athleteIds: [1, 3] }),
    ], {}, id => names[id])
    expect(result.warnings).toEqual(['Wren: M1 and M2 back to back'])
    expect(result.gaps).toEqual([])
  })
})

describe('planSchedule: a live kid is fixed at wave -1', () => {
  it('blocks the kid\'s own next match at wave 0 and frees it at wave 1', () => {
    const result = plan(
      [pm({ id: 1, number: 1, athleteIds: [901, 902] })],
      { live: [{ matchId: 99, athleteIds: [901] }] },
    )
    expect(result.gaps).toEqual([{ wave: 0, matId: 10, waitingOn: 1 }])
    expect(waveOf(result, 1)).toBe(1)
    expect(result.warnings).toEqual([])
  })
})

describe('planSchedule: lanes', () => {
  it('fills every one of three mats every wave, in mat number order', () => {
    const mats = [{ id: 30, number: 3 }, { id: 10, number: 1 }, { id: 20, number: 2 }]
    const pending = Array.from({ length: 6 }, (_, i) => pm({
      id: i + 1, number: i + 1, athleteIds: [1000 + i * 2, 1001 + i * 2],
    }))
    const result = plan(pending, { mats, firstOrderIndex: 7 })

    expect(result.gaps).toEqual([])
    expect(result.waves).toBe(2)
    expect(result.order).toEqual([
      { matchId: 1, matId: 10, orderIndex: 7, wave: 0 },
      { matchId: 2, matId: 20, orderIndex: 8, wave: 0 },
      { matchId: 3, matId: 30, orderIndex: 9, wave: 0 },
      { matchId: 4, matId: 10, orderIndex: 10, wave: 1 },
      { matchId: 5, matId: 20, orderIndex: 11, wave: 1 },
      { matchId: 6, matId: 30, orderIndex: 12, wave: 1 },
    ])
    expect(result.perMat).toEqual([
      { matId: 10, number: 1, count: 2 },
      { matId: 20, number: 2, count: 2 },
      { matId: 30, number: 3, count: 2 },
    ])
  })

  it('gives one lane with a null mat id when there are no mats', () => {
    const result = plan([
      pm({ id: 1, number: 1, athleteIds: [1, 2] }),
      pm({ id: 2, number: 2, athleteIds: [3, 4] }),
    ], { mats: [] })

    expect(result.order.every(o => o.matId === null)).toBe(true)
    expect(result.perMat).toEqual([{ matId: null, number: 1, count: 2 }])
    expect(result.waves).toBe(2)
  })
})

describe('planSchedule: the estimate', () => {
  it('sums the longest match per wave plus a minute, rounded up', () => {
    const result = plan([
      pm({ id: 1, number: 1, athleteIds: [1, 2], lengthSec: 300 }),
      pm({ id: 2, number: 2, athleteIds: [3, 4], lengthSec: 240 }),
    ])
    expect(result.waves).toBe(2)
    expect(result.minutes).toBe(11) // (300+60) + (240+60) = 660s = 11m exactly
  })
})

describe('planSchedule: determinism', () => {
  it('gives the same plan for the same input', () => {
    const mats = [{ id: 30, number: 3 }, { id: 10, number: 1 }, { id: 20, number: 2 }]
    const pending = Array.from({ length: 6 }, (_, i) => pm({
      id: i + 1, number: i + 1, athleteIds: [1000 + i * 2, 1001 + i * 2],
    }))
    const input: PlanInput = { mats, live: [], pending, firstOrderIndex: 1 }
    expect(planSchedule(input, noNames)).toEqual(planSchedule(input, noNames))
  })
})

describe('planSchedule: performance', () => {
  it('plans two hundred matches on four mats in under 200 ms', () => {
    const mats = [1, 2, 3, 4].map(n => ({ id: n, number: n }))
    const pending = Array.from({ length: 200 }, (_, i) => pm({
      id: i + 1, number: i + 1, athleteIds: [i * 2 + 1000, i * 2 + 1001],
    }))
    const start = Date.now()
    const result = plan(pending, { mats })
    const elapsed = Date.now() - start
    expect(result.order).toHaveLength(200)
    expect(result.gaps).toEqual([])
    expect(elapsed).toBeLessThan(200)
  })
})

describe('planSchedule: edges', () => {
  it('plans nothing when nothing is pending', () => {
    const result = plan([], { mats: [{ id: 10, number: 1 }, { id: 20, number: 2 }] })
    expect(result).toEqual({
      order: [], waves: 0, minutes: 0, warnings: [], gaps: [],
      perMat: [{ matId: 10, number: 1, count: 0 }, { matId: 20, number: 2, count: 0 }],
    })
  })

  it('places an all-nogi list in priority order with no gap', () => {
    const result = plan([
      pm({ id: 1, number: 1, style: 'nogi', age: 12, athleteIds: [1, 2] }),
      pm({ id: 2, number: 2, style: 'nogi', age: 9, athleteIds: [3, 4] }),
    ])
    expect(matchIds(result)).toEqual([2, 1])
    expect(result.gaps).toEqual([])
    expect(result.waves).toBe(2)
  })

  it('leaves the idle lanes of a short final wave without a gap', () => {
    const mats = [1, 2, 3].map(n => ({ id: n, number: n }))
    const pending = Array.from({ length: 4 }, (_, i) => pm({ id: i + 1, number: i + 1, athleteIds: [i * 2 + 1, i * 2 + 2] }))
    const result = plan(pending, { mats })
    expect(result.waves).toBe(2)
    expect(result.gaps).toEqual([])
    expect(result.perMat.map(m => m.count)).toEqual([2, 1, 1])
    expect(result.order.map(o => o.orderIndex)).toEqual([1, 2, 3, 4])
  })

  it('throws instead of looping when a feed can never clear', () => {
    expect(() => plan([
      pm({ id: 1, number: 1, athleteIds: [null, null], feeds: [1] }),
    ])).toThrow('schedule cannot place M1')
  })
})
