import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { scoringSet, teamPointsFor } from '../src/shared/scoring.js'
import { buildSnapshot } from '../src/live/snapshot.js'
import { athletes, matches } from '../src/db/schema.js'
import { freshDb, seedEvent } from './fixtures.js'
import type { WinType } from '../src/shared/types.js'

const kids = (n: number, marked: number[] = []) => Array.from({ length: n }, (_, i) => ({ id: i + 1, scoring: marked.includes(i + 1) }))

describe('a team over ten kids scores only with its marked kids', () => {
  it('scores with every kid on a team inside the cap, marked or not', () => {
    expect([...scoringSet(kids(3))]).toEqual([1, 2, 3])
    expect([...scoringSet(kids(10, [4]))]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('scores only with the marked kids on a larger team', () => {
    expect([...scoringSet(kids(11, [2, 9]))]).toEqual([2, 9])
    expect(scoringSet(kids(11)).size).toBe(0)
  })
})

describe('team points come only from scoring athletes by win type', () => {
  it('pays three for a submission, two for points, one for the rest', () => {
    expect(['submission', 'points', 'decision', 'walkover', 'dq'].map(w => teamPointsFor(w as never))).toEqual([3, 2, 1, 1, 1])
  })

  it('counts every win but pays team points only for a win by a scoring kid', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { matCount: 1, matches: 0 })
    const extras = await db.insert(athletes).values(Array.from({ length: 10 }, (_, i) => ({
      eventId: s.eventId, teamId: s.teamA, firstName: `Extra${i}`, lastName: 'Kid', age: 8, weightLbs: 60, belt: 'grey', gender: 'M', source: 'manual' as const,
    }))).returning().all()
    await db.update(athletes).set({ scoring: true }).where(eq(athletes.id, s.a2)).run()
    const results: [number, number, number, WinType][] = [
      [s.a1, s.b1, s.a1, 'submission'],
      [s.a2, s.b2, s.a2, 'submission'],
      [extras[0].id, s.b1, extras[0].id, 'points'],
      [s.a1, s.b2, s.b2, 'points'],
      [s.a2, s.b1, s.b1, 'dq'],
    ]
    await db.insert(matches).values(results.map(([a, b, winner, winType], i) => ({
      eventId: s.eventId, matId: s.matIds[0], number: i + 1, orderIndex: i, rulesetId: s.rulesetId, lengthSec: 300,
      athleteAId: a, athleteBId: b, status: 'done' as const, winnerAthleteId: winner, winType,
    }))).run()
    const snap = await buildSnapshot(db, s.eventId, { names: 'full', nowMs: Date.parse('2026-08-27T18:00:00.000Z') })
    expect(snap.teams.map(t => [t.id, t.wins, t.teamPoints])).toEqual([[s.teamA, 3, 3], [s.teamB, 2, 3]])
  })
})
