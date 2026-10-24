import { describe, it, expect } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { createTestApp, call } from './helpers.js'
import { seedEvent } from './fixtures.js'
import { athletes, auditLog } from '../src/db/schema.js'

const extraKids = (eventId: number, teamId: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ eventId, teamId, firstName: `Extra${i}`, lastName: 'Kid', source: 'manual' as const }))

describe('the scoring cap at the routes', () => {
    it('marks up to the cap through PATCH, then refuses the eleventh with the message verbatim', async () => {
      const { app, db, adminToken } = await createTestApp()
      const s = await seedEvent(db, { matches: 0 })
      const extra = await db.insert(athletes).values(extraKids(s.eventId, s.teamA, 9)).returning().all()
      const eleven = [s.a1, s.a2, ...extra.map(a => a.id)]
      for (const id of eleven.slice(0, 10)) {
        expect((await call(app, 'PATCH', `/api/athletes/${id}`, { scoring: true }, adminToken)).status).toBe(200)
      }
      const refused = await call(app, 'PATCH', `/api/athletes/${eleven[10]}`, { scoring: true }, adminToken)
      expect(refused.status).toBe(422)
      expect(refused.body.error.message).toBe('a team scores with at most ten athletes')
    })

    it('always lets an unmark through, even on a team already at the cap', async () => {
      const { app, db, adminToken } = await createTestApp()
      const s = await seedEvent(db, { matches: 0 })
      const extra = await db.insert(athletes).values(extraKids(s.eventId, s.teamA, 9).map(k => ({ ...k, scoring: true }))).returning().all()
      await db.update(athletes).set({ scoring: true }).where(eq(athletes.id, s.a2)).run()
      const r = await call(app, 'PATCH', `/api/athletes/${extra[0].id}`, { scoring: false }, adminToken)
      expect(r.status).toBe(200)
      expect(r.body.scoring).toBe(false)
    })

    it('refuses to mark a kid with no team', async () => {
      const { app, db, adminToken } = await createTestApp()
      const s = await seedEvent(db, { matches: 0 })
      await call(app, 'PATCH', `/api/athletes/${s.a1}`, { teamId: null }, adminToken)
      const r = await call(app, 'PATCH', `/api/athletes/${s.a1}`, { scoring: true }, adminToken)
      expect(r.status).toBe(422)
      expect(r.body.error.message).toBe('a kid needs a team to score')
    })

    it('records the flag on the roster_edit row like any other patched field', async () => {
      const { app, db, adminToken } = await createTestApp()
      const s = await seedEvent(db, { matches: 0 })
      await call(app, 'PATCH', `/api/athletes/${s.a1}`, { scoring: true }, adminToken)
      const rows = await db.select().from(auditLog).where(eq(auditLog.eventId, s.eventId)).all()
      const row = rows.find(r => r.action === 'roster_edit' && (r.detail as { athleteId?: number }).athleteId === s.a1)
      expect(row?.detail).toMatchObject({ fields: ['scoring'] })
    })

    it('sets scoring false on every moved kid, including a move to Unassigned', async () => {
      const { app, db, adminToken } = await createTestApp()
      const s = await seedEvent(db, { matches: 0 })
      await call(app, 'PATCH', `/api/athletes/${s.a1}`, { scoring: true }, adminToken)
      const moved = await call(app, 'POST', `/api/events/${s.eventId}/athletes/assign`, { ids: [s.a1], teamId: s.teamB }, adminToken)
      expect(moved.body.find((a: any) => a.id === s.a1)).toMatchObject({ teamId: s.teamB, scoring: false })

      await call(app, 'PATCH', `/api/athletes/${s.a1}`, { scoring: true }, adminToken)
      const unassigned = await call(app, 'POST', `/api/events/${s.eventId}/athletes/assign`, { ids: [s.a1], teamId: null }, adminToken)
      expect(unassigned.body.find((a: any) => a.id === s.a1)).toMatchObject({ teamId: null, scoring: false })
    })

    describe('bulk route', () => {
      it('marks eight kids across two teams in one call', async () => {
        const { app, db, adminToken } = await createTestApp()
        const s = await seedEvent(db, { matches: 0 })
        const extra = await db.insert(athletes).values(extraKids(s.eventId, s.teamA, 4)).returning().all()
        const ids = [s.a1, s.a2, s.b1, s.b2, ...extra.map(a => a.id)]
        expect(ids).toHaveLength(8)
        const r = await call(app, 'POST', `/api/events/${s.eventId}/athletes/scoring`, { ids, scoring: true }, adminToken)
        expect(r.status).toBe(200)
        expect(r.body.map((a: any) => a.id)).toEqual(ids)
        expect(r.body.every((a: any) => a.scoring === true)).toBe(true)
      })

      it('refuses the whole body when one team would pass ten, and writes nothing', async () => {
        const { app, db, adminToken } = await createTestApp()
        const s = await seedEvent(db, { matches: 0 })
        const extra = await db.insert(athletes).values(extraKids(s.eventId, s.teamA, 9)).returning().all()
        const ids = [s.a1, s.a2, ...extra.map(a => a.id), s.b1]
        expect(ids).toHaveLength(12)
        const r = await call(app, 'POST', `/api/events/${s.eventId}/athletes/scoring`, { ids, scoring: true }, adminToken)
        expect(r.status).toBe(422)
        expect(r.body.error.message).toBe('a team scores with at most ten athletes')
        const rows = await db.select().from(athletes).where(inArray(athletes.id, ids)).all()
        expect(rows.every(a => a.scoring === false)).toBe(true)
      })

      it('unmarks in bulk', async () => {
        const { app, db, adminToken } = await createTestApp()
        const s = await seedEvent(db, { matches: 0 })
        await call(app, 'POST', `/api/events/${s.eventId}/athletes/scoring`, { ids: [s.a1, s.a2], scoring: true }, adminToken)
        const r = await call(app, 'POST', `/api/events/${s.eventId}/athletes/scoring`, { ids: [s.a1, s.a2], scoring: false }, adminToken)
        expect(r.status).toBe(200)
        expect(r.body.every((a: any) => a.scoring === false)).toBe(true)
      })

      it('refuses when marking a kid with no team', async () => {
        const { app, db, adminToken } = await createTestApp()
        const s = await seedEvent(db, { matches: 0 })
        await call(app, 'PATCH', `/api/athletes/${s.a1}`, { teamId: null }, adminToken)
        const r = await call(app, 'POST', `/api/events/${s.eventId}/athletes/scoring`, { ids: [s.a1], scoring: true }, adminToken)
        expect(r.status).toBe(422)
        expect(r.body.error.message).toBe('a kid needs a team to score')
      })

      it('404s when an id is not on this event, naming nothing', async () => {
        const { app, db, adminToken } = await createTestApp()
        const s = await seedEvent(db, { matches: 0 })
        const other = await seedEvent(db, { matches: 0 })
        const r = await call(app, 'POST', `/api/events/${s.eventId}/athletes/scoring`, { ids: [s.a1, other.a1], scoring: true }, adminToken)
        expect(r.status).toBe(404)
        expect(r.body.error.code).toBe('not_found')
      })

      it('writes one roster_edit row per kid, each carrying the scoring value', async () => {
        const { app, db, adminToken } = await createTestApp()
        const s = await seedEvent(db, { matches: 0 })
        await call(app, 'POST', `/api/events/${s.eventId}/athletes/scoring`, { ids: [s.a1, s.a2], scoring: true }, adminToken)
        const rows = await db.select().from(auditLog).where(eq(auditLog.eventId, s.eventId)).all()
        const edits = rows.filter(r => r.action === 'roster_edit' && [s.a1, s.a2].includes((r.detail as { athleteId?: number }).athleteId ?? -1))
        expect(edits).toHaveLength(2)
        expect(edits.every(r => (r.detail as { scoring?: boolean }).scoring === true)).toBe(true)
      })
    })
  })

describe('the scoring cap on a move', () => {
  it('unmarks a kid a PATCH moves to another team, so a stale flag never carries a team past the cap', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0 })
    await call(app, 'PATCH', `/api/athletes/${s.a1}`, { scoring: true }, adminToken)
    const moved = await call(app, 'PATCH', `/api/athletes/${s.a1}`, { teamId: s.teamB }, adminToken)
    expect(moved.status).toBe(200)
    expect(moved.body).toMatchObject({ teamId: s.teamB, scoring: false })
    const same = await call(app, 'PATCH', `/api/athletes/${s.a2}`, { teamId: s.teamA, scoring: true }, adminToken)
    expect(same.body).toMatchObject({ teamId: s.teamA, scoring: true })
  })

  it('checks the cap of the destination team when a move and a mark travel together', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0 })
    await db.insert(athletes).values(extraKids(s.eventId, s.teamB, 8).map(k => ({ ...k, scoring: true }))).returning().all()
    await db.update(athletes).set({ scoring: true }).where(eq(athletes.id, s.b1)).run()
    await db.update(athletes).set({ scoring: true }).where(eq(athletes.id, s.b2)).run()
    const refused = await call(app, 'PATCH', `/api/athletes/${s.a1}`, { teamId: s.teamB, scoring: true }, adminToken)
    expect(refused.status).toBe(422)
    expect(refused.body.error.message).toBe('a team scores with at most ten athletes')
    expect((await db.select().from(athletes).where(eq(athletes.id, s.a1)).get())?.teamId).toBe(s.teamA)
  })

  it('takes a duplicate id in the bulk body as one kid', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0 })
    const r = await call(app, 'POST', `/api/events/${s.eventId}/athletes/scoring`, { ids: [s.a1, s.a1], scoring: true }, adminToken)
    expect(r.status).toBe(200)
    expect(r.body.map((a: any) => [a.id, a.scoring])).toEqual([[s.a1, true]])
  })
})
