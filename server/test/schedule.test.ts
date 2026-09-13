import { describe, it, expect } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import { createTestApp, call, TEST_PIN } from './helpers.js'
import { seedEvent } from './fixtures.js'
import { auditLog, events, matches } from '../src/db/schema.js'
import { createDivision } from '../src/formats/divisions.js'
import type { Db } from '../src/db/client.js'

const rowsOf = (db: Db, eventId: number) =>
  db.select().from(matches).where(eq(matches.eventId, eventId)).orderBy(asc(matches.number)).all()

const versionOf = async (db: Db, eventId: number) =>
  (await db.select({ version: events.version }).from(events).where(eq(events.id, eventId)).get())?.version

// A settled match, a live one, and a bracket of four still to run: the state an event is
// in when somebody presses Order matches halfway through the afternoon.
async function midEvent() {
  const { app, db, adminToken } = await createTestApp()
  const s = await seedEvent(db, { matCount: 2, live: true })
  expect((await call(app, 'POST', `/api/matches/${s.matchIds[0]}/end`, { id: 'end-0001', lastSeq: 0, winnerAthleteId: s.a1 }, adminToken)).status).toBe(200)
  await createDivision(db, s.eventId, {
    name: 'Novice', format: 'single_elim', styles: 'gi', athleteIds: [s.a1, s.a2, s.b1, s.b2],
  })
  return { app, db, adminToken, s }
}

describe('the schedule route', () => {
  it('previews without writing anything', async () => {
    const { app, db, adminToken, s } = await midEvent()
    const before = await rowsOf(db, s.eventId)
    const version = await versionOf(db, s.eventId)

    const preview = await call(app, 'POST', `/api/events/${s.eventId}/schedule`, { apply: false }, adminToken)
    expect(preview.status).toBe(200)
    expect(preview.body.applied).toBe(false)
    expect(preview.body.order).toHaveLength(3)
    expect(preview.body.waves).toBeGreaterThan(0)
    expect(preview.body.minutes).toBeGreaterThan(0)
    expect(preview.body.perMat.map((p: { count: number }) => p.count).reduce((a: number, b: number) => a + b, 0)).toBe(3)

    const after = await rowsOf(db, s.eventId)
    expect(after.map(m => [m.orderIndex, m.matId])).toEqual(before.map(m => [m.orderIndex, m.matId]))
    expect(await versionOf(db, s.eventId)).toBe(version)
    expect(await db.select().from(auditLog).where(eq(auditLog.action, 'schedule')).all()).toEqual([])
  })

  it('applies the plan, keeps the settled rows first, and writes every mat', async () => {
    const { app, db, adminToken, s } = await midEvent()
    const version = await versionOf(db, s.eventId)
    const applied = await call(app, 'POST', `/api/events/${s.eventId}/schedule`, { apply: true }, adminToken)
    expect(applied.status).toBe(200)
    expect(applied.body.applied).toBe(true)

    const after = await rowsOf(db, s.eventId)
    const settled = after.filter(m => m.status !== 'pending')
    expect(settled.map(m => m.orderIndex).sort((a, b) => a - b)).toEqual([0, 1])
    const pending = after.filter(m => m.status === 'pending')
    expect(pending.map(m => m.orderIndex).sort((a, b) => a - b)).toEqual([2, 3, 4])
    expect(pending.every(m => m.matId !== null)).toBe(true)
    for (const slot of applied.body.order) {
      const row = after.find(m => m.id === slot.matchId)!
      expect([row.orderIndex, row.matId]).toEqual([slot.orderIndex, slot.matId])
    }
    // A feeder is laid out at least two waves ahead of the match it fills.
    const waveOf = new Map<number, number>(applied.body.order.map((o: { matchId: number; wave: number }) => [o.matchId, o.wave]))
    const final = after.find(m => m.feedAMatchId !== null)!
    expect(waveOf.get(final.id)!).toBeGreaterThanOrEqual(waveOf.get(final.feedAMatchId!)! + 2)

    expect(await versionOf(db, s.eventId)).toBeGreaterThan(version!)
    const row = await db.select().from(auditLog).where(eq(auditLog.action, 'schedule')).get()
    expect(row?.detail).toEqual({ waves: applied.body.waves, minutes: applied.body.minutes, matches: 3 })
    expect(row?.actor).toBe('admin')
  })

  it('overrides a mat set by hand', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matCount: 2, matches: 0 })
    await createDivision(db, s.eventId, {
      name: 'Novice', format: 'single_elim', styles: 'gi', athleteIds: [s.a1, s.a2, s.b1, s.b2],
    })
    const first = (await rowsOf(db, s.eventId))[0]
    const slotFor = (r: { body: { order: { matchId: number; matId: number }[] } }) =>
      r.body.order.find(o => o.matchId === first.id)!.matId
    // The mat the plan wants for this match, then the other one set by hand, so the apply
    // has something to override rather than agreeing with by luck.
    const planned = slotFor(await call(app, 'POST', `/api/events/${s.eventId}/schedule`, { apply: false }, adminToken))
    const byHand = s.matIds.find(id => id !== planned)!
    expect((await call(app, 'PATCH', `/api/matches/${first.id}`, { matId: byHand }, adminToken)).status).toBe(200)
    const applied = await call(app, 'POST', `/api/events/${s.eventId}/schedule`, { apply: true }, adminToken)
    expect(applied.status).toBe(200)
    expect(slotFor(applied)).toBe(planned)
    expect((await db.select().from(matches).where(eq(matches.id, first.id)).get())?.matId).toBe(planned)
  })

  it('starts what the new order lets a live event start', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matCount: 1, matches: 0, live: true })
    await createDivision(db, s.eventId, {
      name: 'Novice', format: 'single_elim', styles: 'gi', athleteIds: [s.a1, s.a2, s.b1, s.b2],
    })
    expect((await rowsOf(db, s.eventId)).every(m => m.status === 'pending')).toBe(true)
    expect((await call(app, 'POST', `/api/events/${s.eventId}/schedule`, { apply: true }, adminToken)).status).toBe(200)
    const after = await rowsOf(db, s.eventId)
    expect(after.filter(m => m.status === 'live')).toHaveLength(1)
    expect(after.find(m => m.status === 'live')?.orderIndex).toBe(0)
  })

  it('refuses a set it can never lay out', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matCount: 1, matches: 0 })
    await createDivision(db, s.eventId, {
      name: 'Novice', format: 'single_elim', styles: 'gi', athleteIds: [s.a1, s.a2, s.b1, s.b2],
    })
    const rows = await rowsOf(db, s.eventId)
    // The final already feeds from this semifinal; pointing the semifinal back at the final
    // makes a pair of matches neither of which can ever go first.
    await db.update(matches)
      .set({ athleteAId: null, feedAMatchId: rows[2].id, feedATake: 'winner' })
      .where(eq(matches.id, rows[0].id)).run()
    const refused = await call(app, 'POST', `/api/events/${s.eventId}/schedule`, { apply: false }, adminToken)
    expect(refused.status).toBe(409)
    expect(refused.body.error.code).toBe('match_state')
    expect(refused.body.error.message).toBe(`schedule cannot place M${rows[0].number}`)
  })

  it('plans an event with nothing left to run', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matCount: 1, matches: 0 })
    const empty = await call(app, 'POST', `/api/events/${s.eventId}/schedule`, { apply: true }, adminToken)
    expect(empty.status).toBe(200)
    expect(empty.body).toMatchObject({ order: [], waves: 0, minutes: 0, warnings: [], gaps: [] })
    expect(empty.body.perMat).toEqual([{ matId: s.matIds[0], number: 1, count: 0 }])
  })

  it('needs an admin token, 404s an unknown event, and a certified event refuses', async () => {
    const { app, db, adminToken, s } = await midEvent()
    expect((await call(app, 'POST', `/api/events/${s.eventId}/schedule`, { apply: false })).status).toBe(401)
    expect((await call(app, 'POST', '/api/events/9999/schedule', { apply: false }, adminToken)).status).toBe(404)

    for (const id of s.matchIds.slice(1)) {
      await db.update(matches).set({ status: 'done' }).where(eq(matches.id, id)).run()
    }
    expect((await call(app, 'PATCH', `/api/events/${s.eventId}`, { status: 'done' }, adminToken)).status).toBe(200)
    expect((await call(app, 'POST', `/api/events/${s.eventId}/certify`, { pin: TEST_PIN }, adminToken)).status).toBe(200)
    const refused = await call(app, 'POST', `/api/events/${s.eventId}/schedule`, { apply: true }, adminToken)
    expect(refused.status).toBe(409)
    expect(refused.body.error.message).toBe('event is certified')
  })
})
