import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestApp, call } from './helpers.js'
import { seedEvent } from './fixtures.js'
import { divisionMembers, divisions, matches } from '../src/db/schema.js'

const NOVICE = { name: 'Novice', format: 'single_elim' as const, styles: 'gi' as const }

describe('division routes', () => {
  it('creates a division, lists it, and generates its matches', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0 })
    const created = await call(app, 'POST', `/api/events/${s.eventId}/divisions`, { ...NOVICE, athleteIds: [s.a1, s.a2, s.b1, s.b2] }, adminToken)
    expect(created.status).toBe(201)
    expect(created.body.warnings).toEqual([])
    expect(created.body.division).toMatchObject({ eventId: s.eventId, name: 'Novice', format: 'single_elim', styles: 'gi', position: 0, running: false })
    expect(created.body.division.members.map((m: { athleteId: number }) => m.athleteId)).toEqual([s.a1, s.a2, s.b1, s.b2])
    expect(created.body.division.matchIds).toHaveLength(3)

    const listed = await call(app, 'GET', `/api/events/${s.eventId}/divisions`, undefined, adminToken)
    expect(listed.status).toBe(200)
    expect(listed.body).toEqual([created.body.division])
    expect(await db.select().from(matches).where(eq(matches.eventId, s.eventId)).all()).toHaveLength(3)
  })

  it('refuses a count out of range, a kid off the event, a kid off a team, and a kid twice', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0, thirdTeam: true })
    const other = await seedEvent(db, { matches: 0 })
    const loose = await call(app, 'POST', `/api/events/${s.eventId}/athletes`, { manual: { firstName: 'Ines', lastName: 'Baptista' } }, adminToken)
    expect(loose.status).toBe(201)
    const looseId = loose.body.find((a: { lastName: string }) => a.lastName === 'Baptista').id

    const post = (athleteIds: number[], format: 'round_robin' | 'single_elim' | 'double_elim' = 'single_elim') =>
      call(app, 'POST', `/api/events/${s.eventId}/divisions`, { ...NOVICE, format, athleteIds }, adminToken)

    for (const [body, message] of [
      [await post([s.a1]), 'a single elimination takes 2 to 16 kids'],
      [await post([s.a1, s.b1], 'double_elim'), 'a double elimination takes 3 to 16 kids'],
      [await post([s.a1, other.b1]), 'every kid must be on this event'],
      [await post([s.a1, looseId]), 'every kid must be on a team'],
      [await post([s.a1, s.a1]), 'a kid can only be in a division once'],
    ] as const) {
      expect(body.status).toBe(422)
      expect(body.body.error.code).toBe('validation')
      expect(body.body.error.message).toBe(message)
    }
    expect(await db.select().from(divisions).where(eq(divisions.eventId, s.eventId)).all()).toEqual([])
    expect(await db.select().from(matches).where(eq(matches.eventId, s.eventId)).all()).toEqual([])
  })

  it('patches the name, the format and the members, and generates again', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0, divisions: true })
    const before = await db.select().from(matches).where(eq(matches.eventId, s.eventId)).all()
    const patched = await call(app, 'PATCH', `/api/divisions/${s.divisionId}`, {
      name: '47 to 53 boys', format: 'round_robin', athleteIds: [s.b1, s.a1, s.c1],
    }, adminToken)
    expect(patched.status).toBe(200)
    expect(patched.body.division).toMatchObject({ name: '47 to 53 boys', format: 'round_robin', styles: 'gi' })
    expect(patched.body.division.members.map((m: { athleteId: number; seed: number }) => [m.seed, m.athleteId]))
      .toEqual([[1, s.b1], [2, s.a1], [3, s.c1]])

    const after = await db.select().from(matches).where(eq(matches.eventId, s.eventId)).all()
    expect(after.map(m => m.id)).not.toEqual(before.map(m => m.id))
    expect(after).toHaveLength(3)
    expect(after.every(m => m.round === null)).toBe(true)
  })

  it('seeds by rating, unrated kids last, and generates from the new order', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0, divisions: true })
    const seeded = await call(app, 'POST', `/api/divisions/${s.divisionId}/seed`, undefined, adminToken)
    expect(seeded.status).toBe(200)
    // Ines 7.3, Mateo 6.1, Olivia 5.8, then Ava, who has no rating.
    expect(seeded.body.division.members.map((m: { athleteId: number }) => m.athleteId)).toEqual([s.c1, s.a1, s.b1, s.a2])
    const stored = await db.select().from(divisionMembers).where(eq(divisionMembers.divisionId, s.divisionId!)).all()
    expect(stored.find(m => m.athleteId === s.c1)?.seed).toBe(1)
    expect(stored.find(m => m.athleteId === s.a2)?.seed).toBe(4)
  })

  it('deletes a division and its matches', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0, divisions: true })
    expect((await call(app, 'DELETE', `/api/divisions/${s.divisionId}`, undefined, adminToken)).status).toBe(204)
    expect(await db.select().from(divisions).where(eq(divisions.eventId, s.eventId)).all()).toEqual([])
    expect(await db.select().from(matches).where(eq(matches.eventId, s.eventId)).all()).toEqual([])
    expect((await call(app, 'GET', `/api/events/${s.eventId}/divisions`, undefined, adminToken)).body).toEqual([])
  })

  it('refuses an edit, a seed and a delete once a match of the division has run', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0, divisions: true, live: true })
    const first = (await db.select().from(matches).where(eq(matches.eventId, s.eventId)).all())[0]
    await db.update(matches).set({ status: 'live' }).where(eq(matches.id, first.id)).run()

    for (const r of [
      await call(app, 'PATCH', `/api/divisions/${s.divisionId}`, { name: 'Renamed' }, adminToken),
      await call(app, 'POST', `/api/divisions/${s.divisionId}/seed`, undefined, adminToken),
      await call(app, 'DELETE', `/api/divisions/${s.divisionId}`, undefined, adminToken),
    ]) {
      expect(r.status).toBe(409)
      expect(r.body.error.code).toBe('match_state')
      expect(r.body.error.message).toBe('division is running')
    }
    expect(await db.select().from(matches).where(eq(matches.eventId, s.eventId)).all()).toHaveLength(3)
  })

  it('needs an admin token, and 404s an unknown event or division', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0, divisions: true })
    expect((await call(app, 'GET', `/api/events/${s.eventId}/divisions`)).status).toBe(401)
    expect((await call(app, 'DELETE', `/api/divisions/${s.divisionId}`)).status).toBe(401)
    expect((await call(app, 'GET', '/api/events/9999/divisions', undefined, adminToken)).status).toBe(404)
    expect((await call(app, 'POST', '/api/events/9999/divisions', { ...NOVICE, athleteIds: [s.a1, s.b1] }, adminToken)).status).toBe(404)
    expect((await call(app, 'PATCH', '/api/divisions/9999', { name: 'Renamed' }, adminToken)).status).toBe(404)
    expect((await call(app, 'POST', '/api/divisions/9999/seed', undefined, adminToken)).status).toBe(404)
    expect((await call(app, 'DELETE', '/api/divisions/9999', undefined, adminToken)).status).toBe(404)
  })
})
