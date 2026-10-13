import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestApp, call } from './helpers.js'
import { freshDb, seedEvent } from './fixtures.js'
import { buildSnapshot, publicName } from '../src/live/snapshot.js'
import { events, mats } from '../src/db/schema.js'

describe('a mat binding dies when another tablet takes the mat', () => {
  // A mat token is a write credential. In a desk event the desk is already typing the
  // results, so a second writer would fight it over the same matches. The tablet refuses
  // too, but that guard is advisory: a stale tab or a bookmarked link reaches the endpoint
  // without it.
  it('refuses a bind on an event that runs from the desk, after checking the code', async () => {
    const { app, db } = await createTestApp()
    const s = await seedEvent(db)
    await db.update(events).set({ mode: 'entry' }).where(eq(events.id, s.eventId)).run()

    // A wrong code still fails as a wrong code, so an unauthenticated caller learns nothing
    // about how the event is run.
    const bad = await call(app, 'POST', `/api/events/${s.eventId}/mats/${s.matIds[0]}/bind`, { code: '9999' })
    expect(bad.status).toBe(401)

    const refused = await call(app, 'POST', `/api/events/${s.eventId}/mats/${s.matIds[0]}/bind`, { code: '0420' })
    expect(refused.status).toBe(409)
    expect(refused.body.error.code).toBe('desk_mode')
    expect(refused.body.error.message).toMatch(/runs from the desk/)

    // Switching back hands out a token again, because the desk path is a fallback rather
    // than a one way door.
    await db.update(events).set({ mode: 'live' }).where(eq(events.id, s.eventId)).run()
    expect((await call(app, 'POST', `/api/events/${s.eventId}/mats/${s.matIds[0]}/bind`, { code: '0420' })).status).toBe(200)
  })

  it('issues a mat token for the right code and locks after twenty failed codes', async () => {
    const { app, db } = await createTestApp()
    const s = await seedEvent(db)
    const bad = await call(app, 'POST', `/api/events/${s.eventId}/mats/${s.matIds[0]}/bind`, { code: '9999' })
    expect(bad.status).toBe(401)
    const ok = await call(app, 'POST', `/api/events/${s.eventId}/mats/${s.matIds[0]}/bind`, { code: '0420' })
    expect(ok.status).toBe(200)
    expect(ok.body.mat).toEqual({ id: s.matIds[0], number: 1 })
    const hb = await call(app, 'POST', `/api/mats/${s.matIds[0]}/heartbeat`, {}, ok.body.token)
    expect(hb.status).toBe(200)
    expect((await call(app, 'POST', `/api/mats/${s.matIds[1]}/heartbeat`, {}, ok.body.token)).status).toBe(403)
    expect((await call(app, 'GET', `/api/events/${s.eventId}/snapshot`)).body.snapshot.mats[0].bound).toBe(true)
    for (let i = 0; i < 18; i++) await call(app, 'POST', `/api/events/${s.eventId}/mats/${s.matIds[0]}/bind`, { code: '9999' })
    // Nineteen wrong codes so far, and the correct ones in between never spent the budget.
    expect((await call(app, 'POST', `/api/events/${s.eventId}/mats/${s.matIds[0]}/bind`, { code: '0420', takeOver: true })).status).toBe(200)
    await call(app, 'POST', `/api/events/${s.eventId}/mats/${s.matIds[0]}/bind`, { code: '9999' })
    expect((await call(app, 'POST', `/api/events/${s.eventId}/mats/${s.matIds[0]}/bind`, { code: '0420' })).status).toBe(429)
  })

  it('refuses a second tablet on a bound mat and hands the mat over on request', async () => {
    const { app, db } = await createTestApp()
    const s = await seedEvent(db, { live: true })
    const bind = `/api/events/${s.eventId}/mats/${s.matIds[0]}/bind`
    const first = await call(app, 'POST', bind, { code: '0420' })
    expect(first.status).toBe(200)
    expect((await call(app, 'GET', `/api/events/${s.eventId}/snapshot`)).body.snapshot.mats[0].bound).toBe(true)

    const second = await call(app, 'POST', bind, { code: '0420' })
    expect(second.status).toBe(409)
    expect(second.body.error.code).toBe('mat_bound')
    expect(second.body.error.message).toMatch(/already has an iPad/)

    const taken = await call(app, 'POST', bind, { code: '0420', takeOver: true })
    expect(taken.status).toBe(200)
    expect(taken.body.token).not.toBe(first.body.token)

    const stale = await call(app, 'POST', `/api/matches/${s.matchIds[0]}/events`, { id: 'stale-0001', type: 'clock_start', lastSeq: 0 }, first.body.token)
    expect(stale.status).toBe(401)
    expect(stale.body.error.code).toBe('token_stale')
    expect((await call(app, 'POST', `/api/mats/${s.matIds[0]}/heartbeat`, {}, first.body.token)).status).toBe(401)

    const fresh = await call(app, 'POST', `/api/matches/${s.matchIds[0]}/events`, { id: 'fresh-0001', type: 'clock_start', lastSeq: 0 }, taken.body.token)
    expect(fresh.status).toBe(200)
  })

  it('lets a tablet bind a mat whose scorer stopped answering', async () => {
    const { app, db } = await createTestApp()
    const s = await seedEvent(db, { live: true })
    const bind = `/api/events/${s.eventId}/mats/${s.matIds[0]}/bind`
    expect((await call(app, 'POST', bind, { code: '0420' })).status).toBe(200)
    await db.update(mats).set({ lastHeartbeatAt: new Date(Date.now() - 120_000).toISOString() }).where(eq(mats.id, s.matIds[0])).run()
    expect((await call(app, 'POST', bind, { code: '0420' })).status).toBe(200)
  })

  it('answers 404 for an unknown event or an unknown mat', async () => {
    const { app, db } = await createTestApp()
    const s = await seedEvent(db)
    const noEvent = await call(app, 'POST', `/api/events/999/mats/${s.matIds[0]}/bind`, { code: '0420' })
    expect(noEvent.status).toBe(404)
    expect(noEvent.body.error.code).toBe('not_found')
    const noMat = await call(app, 'POST', `/api/events/${s.eventId}/mats/999/bind`, { code: '0420' })
    expect(noMat.status).toBe(404)
    expect(noMat.body.error.code).toBe('not_found')
  })
})

describe('unbind', () => {
  it('frees the mat at once so the same iPad can bind again without a takeover', async () => {
    const { app, db } = await createTestApp()
    const s = await seedEvent(db, { live: true })
    const bind = `/api/events/${s.eventId}/mats/${s.matIds[0]}/bind`
    const first = await call(app, 'POST', bind, { code: '0420' })
    expect(first.status).toBe(200)
    expect((await call(app, 'POST', `/api/mats/${s.matIds[0]}/unbind`, {}, first.body.token)).status).toBe(200)
    expect((await call(app, 'GET', `/api/events/${s.eventId}/snapshot`)).body.snapshot.mats[0].bound).toBe(false)
    // No takeover needed: the mat is free, not held by a silent tablet.
    const again = await call(app, 'POST', bind, { code: '0420' })
    expect(again.status).toBe(200)
    expect(again.body.token).not.toBe(first.body.token)
    // The token the tablet dropped is dead too.
    const stale = await call(app, 'POST', `/api/mats/${s.matIds[0]}/heartbeat`, {}, first.body.token)
    expect(stale.status).toBe(401)
    expect(stale.body.error.code).toBe('token_stale')
  })
})

describe('a public reader sees initials and an admin token the full name', () => {
  it('serves initials on the public snapshot and full names to the console', async () => {
    const { app, db } = await createTestApp()
    const s = await seedEvent(db, { live: true })
    const pub = await call(app, 'GET', `/api/events/${s.eventId}/snapshot`)
    expect(pub.body.snapshot.matches[0].a.name).toBe('Mateo R.')
    const admin = (await call(app, 'POST', '/api/auth/admin', { pin: '123456' })).body.token
    const full = await call(app, 'GET', `/api/events/${s.eventId}/snapshot`, undefined, admin)
    expect(full.body.snapshot.matches[0].a.name).toBe('Mateo Rivera')
    const mat = (await call(app, 'POST', `/api/events/${s.eventId}/mats/${s.matIds[0]}/bind`, { code: '0420' })).body.token
    const write = await call(app, 'POST', `/api/matches/${s.matchIds[0]}/events`, { id: 'names-0001', type: 'clock_start', lastSeq: 0 }, mat)
    expect(write.status).toBe(200)
    expect(write.body.match.a.name).toBe('Mateo R.')
  })
  it('shortens to a last initial by default', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { live: true })
    const snap = await buildSnapshot(db, s.eventId, { nowMs: Date.now() })
    expect(snap.matches[0].a.name).toBe('Mateo R.')
  })
  it('formats a single name and an empty surname without a stray dot', () => {
    expect(publicName('Mateo', 'Rivera')).toBe('Mateo R.')
    expect(publicName('Mateo', '')).toBe('Mateo')
    expect(publicName(' Ava ', ' park')).toBe('Ava P.')
  })
})
