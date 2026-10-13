import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { syncRoster, profileChanges } from '../src/roster/sync.js'
import { athletes } from '../src/db/schema.js'
import type { WlBeltRecord, LeaderboardCompetitor } from '../src/roster/types.js'
import { freshDb, seedEvent } from './fixtures.js'
import { createTestApp, call } from './helpers.js'

const candidate = {
  wlUid: 'u100', firstName: 'Zoe', lastName: 'Martin', belt: 'grey', wlLocation: 'Ridgeline',
  leaderboardId: 'zoe-martin', erp: 5.2, age: 8, weightLbs: 60, gender: 'F',
}

const rec = (o: Partial<WlBeltRecord>): WlBeltRecord => ({
  uid: 'w0', kBusiness: '100001', location: 'North', firstName: 'Jonas', lastName: 'Blake',
  rankTitle: 'Yellow Belt', categoryTitle: 'Kids IBJJF Belts', promotedAt: '2026-03-14', ...o,
})

const comp = (o: Partial<LeaderboardCompetitor>): LeaderboardCompetitor => ({
  id: 'jonas-blake', name: 'Jonas Blake', belt: 'yellow', ageGroup: '10-10', gender: 'M',
  weightClass: '-70 lbs', academy: 'Ridgeline', erp: 4.4, ...o,
})

const row = (db: Awaited<ReturnType<typeof freshDb>>, id: number) =>
  db.select().from(athletes).where(eq(athletes.id, id)).get()

describe('a hand-edited age or weight sticks through a re-sync', () => {
  it('reports only the fields the update carries and actually moves', () => {
    const before = { belt: 'grey', erp: 3.1, age: 9, weightLbs: 60, gender: 'M', wlLocation: 'North', promotedAt: null }
    expect(profileChanges(before, { belt: 'grey-white', erp: 3.4 })).toEqual({
      belt: { from: 'grey', to: 'grey-white' },
      erp: { from: 3.1, to: 3.4 },
    })
    expect(profileChanges(before, { belt: 'grey' })).toEqual({})
    expect(profileChanges(before, {})).toEqual({})
  })

  it('reads an absent value as null on both sides', () => {
    expect(profileChanges({ promotedAt: null }, { promotedAt: '2026-03-14' })).toEqual({
      promotedAt: { from: null, to: '2026-03-14' },
    })
  })

  it('refreshes a linked athlete, keeps a manual weight, and records the diff', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { matches: 0 })
    const sam = await db.insert(athletes).values({
      eventId: s.eventId, firstName: 'Sam', lastName: 'Reyes', source: 'wl', wlUid: 'w5',
      age: 9, weightLbs: 55, weightSource: 'manual', belt: 'grey', gender: 'M', erp: 3.1,
    }).returning().get()

    const report = await syncRoster(db, s.eventId, [
      rec({ uid: 'w5', firstName: 'Sam', lastName: 'Reyes', rankTitle: 'Grey/White Belt', promotedAt: '2026-05-02' }),
    ], [comp({ id: 'sam-reyes', name: 'Sam Reyes', erp: 3.4, weightClass: '-80 lbs' })])

    expect(report.refreshed).toBe(1)
    expect(report.linked).toEqual([])
    expect(report.changed).toEqual(['Sam Reyes'])
    const after = await row(db, sam.id)
    expect(after).toMatchObject({ weightLbs: 55, weightSource: 'manual', age: 10, ageSource: 'leaderboard', belt: 'grey-white', erp: 3.4 })
    expect(after!.syncChanges).toMatchObject({
      belt: { from: 'grey', to: 'grey-white' },
      erp: { from: 3.1, to: 3.4 },
      promotedAt: { from: null, to: '2026-05-02' },
    })
    expect(after!.syncChanges).not.toHaveProperty('weightLbs')
  })

  it('upserts candidates by wl uid and keeps manual age and weight', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0 })
    let r = await call(app, 'POST', `/api/events/${s.eventId}/athletes`, { candidates: [candidate] }, adminToken)
    const zoe = r.body.find((a: any) => a.wlUid === 'u100')
    expect(zoe).toMatchObject({ source: 'wl', ageSource: 'leaderboard', weightSource: 'leaderboard', erp: 5.2, age: 8 })
    await call(app, 'PATCH', `/api/athletes/${zoe.id}`, { age: 9 }, adminToken)
    r = await call(app, 'POST', `/api/events/${s.eventId}/athletes`, { candidates: [{ ...candidate, age: 10, erp: 5.9 }] }, adminToken)
    const again = r.body.filter((a: any) => a.wlUid === 'u100')
    expect(again).toHaveLength(1)
    expect(again[0]).toMatchObject({ age: 9, ageSource: 'manual', erp: 5.9 })
  })
})
