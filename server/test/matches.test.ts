import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestApp, call } from './helpers.js'
import { freshDb, seedEvent } from './fixtures.js'
import { athletes, mats, matches, proposals } from '../src/db/schema.js'
import { createMatch } from '../src/match/create.js'

describe('match routes', () => {
  it('creates by hand with team order fixed, patches, deletes, reorders', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db)
    const manual = await call(app, 'POST', `/api/events/${s.eventId}/matches`, { athleteAId: s.b2, athleteBId: s.a1, lengthSec: 120 }, adminToken)
    expect(manual.status).toBe(201)
    expect(manual.body).toMatchObject({ athleteAId: s.a1, athleteBId: s.b2, lengthSec: 120, orderIndex: 2, source: 'designed', warnings: [] })
    expect(manual.body.matId).not.toBeNull()
    const patched = await call(app, 'PATCH', `/api/matches/${manual.body.id}`, { lengthSec: 90, matId: s.matIds[1] }, adminToken)
    expect(patched.body).toMatchObject({ lengthSec: 90, matId: s.matIds[1] })
    const detail = await call(app, 'GET', `/api/events/${s.eventId}`, undefined, adminToken)
    const ids = detail.body.matches.map((m: any) => m.id)
    const reordered = await call(app, 'POST', `/api/events/${s.eventId}/matches/reorder`, { ids: [...ids].reverse() }, adminToken)
    expect(reordered.body.map((m: any) => m.id)).toEqual([...ids].reverse())
    expect((await call(app, 'POST', `/api/events/${s.eventId}/matches/reorder`, { ids: ids.slice(1) }, adminToken)).status).toBe(422)
    expect((await call(app, 'DELETE', `/api/matches/${manual.body.id}`, undefined, adminToken)).status).toBe(204)
  })

  it('starts a new match on an idle mat and on a mat added after Start', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matCount: 1, live: true, matches: 0 })
    const created = await call(app, 'POST', `/api/events/${s.eventId}/matches`, { athleteAId: s.a1, athleteBId: s.b1, matId: s.matIds[0] }, adminToken)
    expect(created.status).toBe(201)
    expect((await db.select().from(matches).where(eq(matches.id, created.body.id)).get())?.status).toBe('live')
    expect((await db.select().from(mats).where(eq(mats.id, s.matIds[0])).get())?.currentMatchId).toBe(created.body.id)

    const grown = await call(app, 'PATCH', `/api/events/${s.eventId}`, { matCount: 2 }, adminToken)
    expect(grown.status).toBe(200)
    const addedMat = grown.body.mats.find((m: any) => m.number === 2)
    const second = await call(app, 'POST', `/api/events/${s.eventId}/matches`, { athleteAId: s.a2, athleteBId: s.b2, matId: null }, adminToken)
    const moved = await call(app, 'PATCH', `/api/matches/${second.body.id}`, { matId: addedMat.id }, adminToken)
    expect(moved.status).toBe(200)
    expect((await db.select().from(matches).where(eq(matches.id, second.body.id)).get())?.status).toBe('live')
    expect((await db.select().from(mats).where(eq(mats.id, addedMat.id)).get())?.currentMatchId).toBe(second.body.id)
  })

  it('leaves a match added or moved on a live desk event pending, with the mat idle', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matCount: 2, live: true, matches: 0, mode: 'entry' })
    const created = await call(app, 'POST', `/api/events/${s.eventId}/matches`, { athleteAId: s.a1, athleteBId: s.b1, matId: s.matIds[0] }, adminToken)
    expect(created.status).toBe(201)
    expect((await db.select().from(matches).where(eq(matches.id, created.body.id)).get())?.status).toBe('pending')
    expect((await db.select().from(mats).where(eq(mats.id, s.matIds[0])).get())?.currentMatchId).toBeNull()

    const moved = await call(app, 'PATCH', `/api/matches/${created.body.id}`, { matId: s.matIds[1] }, adminToken)
    expect(moved.status).toBe(200)
    expect((await db.select().from(matches).where(eq(matches.id, created.body.id)).get())?.status).toBe('pending')
    expect((await db.select().from(mats).where(eq(mats.id, s.matIds[1])).get())?.currentMatchId).toBeNull()
  })

  it('advances an idle mat on request and refuses while one is showing a match', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matCount: 1, live: true })
    const busy = await call(app, 'POST', `/api/mats/${s.matIds[0]}/advance`, undefined, adminToken)
    expect(busy.status).toBe(409)
    expect(busy.body.error.code).toBe('match_state')

    await db.update(matches).set({ status: 'done' }).where(eq(matches.id, s.matchIds[0])).run()
    const advanced = await call(app, 'POST', `/api/mats/${s.matIds[0]}/advance`, undefined, adminToken)
    expect(advanced.status).toBe(200)
    expect(advanced.body.match.id).toBe(s.matchIds[1])
    expect(advanced.body.version).toBeGreaterThan(0)
    expect((await db.select().from(mats).where(eq(mats.id, s.matIds[0])).get())?.currentMatchId).toBe(s.matchIds[1])

    await db.update(matches).set({ status: 'done' }).where(eq(matches.id, s.matchIds[1])).run()
    const empty = await call(app, 'POST', `/api/mats/${s.matIds[0]}/advance`, undefined, adminToken)
    expect(empty.status).toBe(200)
    expect(empty.body.match).toBeNull()
    expect((await call(app, 'POST', '/api/mats/9999/advance', undefined, adminToken)).status).toBe(404)
    expect((await call(app, 'POST', `/api/mats/${s.matIds[0]}/advance`)).status).toBe(401)
  })

  it('clears a mat pointer at the deleted match', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db)
    await db.update(mats).set({ currentMatchId: s.matchIds[0] }).where(eq(mats.id, s.matIds[0])).run()
    expect((await call(app, 'DELETE', `/api/matches/${s.matchIds[0]}`, undefined, adminToken)).status).toBe(204)
    expect((await db.select().from(mats).where(eq(mats.id, s.matIds[0])).get())?.currentMatchId).toBeNull()
  })

  it('warns about a pair a person picked, and refuses none of them', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0 })
    await db.update(athletes).set({ weightLbs: 130, age: 14 }).where(eq(athletes.id, s.b1)).run()
    const pair = { athleteAId: s.a1, athleteBId: s.b1 }

    const first = await call(app, 'POST', `/api/events/${s.eventId}/matches`, pair, adminToken)
    expect(first.status).toBe(201)
    expect(first.body.source).toBe('designed')
    expect(first.body.warnings).toEqual(['6 weight classes apart', '6 years apart'])

    const second = await call(app, 'POST', `/api/events/${s.eventId}/matches`, pair, adminToken)
    expect(second.status).toBe(201)
    expect(second.body.warnings).toEqual(['6 weight classes apart', '6 years apart', 'Already met'])

    // A match is not its own earlier meeting, but the other one still is.
    const kept = await call(app, 'PATCH', `/api/matches/${second.body.id}`, { lengthSec: 240 }, adminToken)
    expect(kept.status).toBe(200)
    expect(kept.body.warnings).toEqual(['6 weight classes apart', '6 years apart', 'Already met'])
    expect((await call(app, 'DELETE', `/api/matches/${first.body.id}`, undefined, adminToken)).status).toBe(204)
    const alone = await call(app, 'PATCH', `/api/matches/${second.body.id}`, { lengthSec: 250 }, adminToken)
    expect(alone.body.warnings).toEqual(['6 weight classes apart', '6 years apart'])

    const moved = await call(app, 'PATCH', `/api/matches/${second.body.id}`, { athleteBId: s.b2 }, adminToken)
    expect(moved.status).toBe(200)
    expect(moved.body).toMatchObject({ athleteAId: s.a1, athleteBId: s.b2, source: 'designed', warnings: [] })
  })

  it('rejects same-team pairs, foreign athletes, and edits to live matches', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { live: true })
    expect((await call(app, 'POST', `/api/events/${s.eventId}/matches`, { athleteAId: s.a1, athleteBId: s.a2 }, adminToken)).status).toBe(422)
    expect((await call(app, 'POST', `/api/events/${s.eventId}/matches`, { athleteAId: s.a1, athleteBId: 999 }, adminToken)).status).toBe(422)
    const patched = await call(app, 'PATCH', `/api/matches/${s.matchIds[0]}`, { lengthSec: 90 }, adminToken)
    expect(patched.status).toBe(409)
    expect(patched.body.error.message).toBe('only a pending match can be edited. End it from the Live tab, then edit the result.')
    const deleted = await call(app, 'DELETE', `/api/matches/${s.matchIds[0]}`, undefined, adminToken)
    expect(deleted.status).toBe(409)
    expect(deleted.body.error.message).toBe('only a pending match can be deleted. End it from the Live tab, then edit the result.')
  })

  it('drops both drafts a hand-designed match makes stale, and reports the count', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0 })
    await db.insert(proposals).values([
      { eventId: s.eventId, athleteAId: s.a1, athleteBId: s.b1, cost: 0, why: 'same class', createdAt: '2026-08-27T00:00:00.000Z' },
      { eventId: s.eventId, athleteAId: s.a2, athleteBId: s.b2, cost: 0, why: 'same class', createdAt: '2026-08-27T00:00:00.000Z' },
    ]).run()
    // a1 sits in the first draft and b2 sits in the second, so pairing them by hand
    // makes both drafts stale at once.
    const created = await call(app, 'POST', `/api/events/${s.eventId}/matches`, { athleteAId: s.a1, athleteBId: s.b2 }, adminToken)
    expect(created.status).toBe(201)
    expect(created.body.removedProposals).toBe(2)
    expect(await db.select().from(proposals).where(eq(proposals.eventId, s.eventId)).all()).toEqual([])
  })

  it('leaves other drafts alone when neither hand-designed competitor is drafted', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0 })
    const untouched = await db.insert(proposals).values({
      eventId: s.eventId, athleteAId: s.a1, athleteBId: s.b1, cost: 0, why: 'same class', createdAt: '2026-08-27T00:00:00.000Z',
    }).returning().get()
    const created = await call(app, 'POST', `/api/events/${s.eventId}/matches`, { athleteAId: s.a2, athleteBId: s.b2 }, adminToken)
    expect(created.status).toBe(201)
    expect(created.body.removedProposals).toBe(0)
    expect(await db.select().from(proposals).where(eq(proposals.id, untouched.id)).get()).toBeDefined()
  })
})

describe('createMatch', () => {
  const made = (r: Awaited<ReturnType<typeof createMatch>>) => {
    if (!r.ok) throw new Error(r.message)
    return r.match
  }

  it('numbers the matches of each event from one', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { matches: 0 })
    const other = await seedEvent(db, { matches: 0 })
    const numbers: number[] = []
    for (const [a, b] of [[s.a1, s.b1], [s.a2, s.b2], [s.a1, s.b2]]) {
      numbers.push(made(await createMatch(db, { eventId: s.eventId, athleteAId: a, athleteBId: b, source: 'designed' })).number)
    }
    expect(numbers).toEqual([1, 2, 3])
    const first = made(await createMatch(db, { eventId: other.eventId, athleteAId: other.a1, athleteBId: other.b1, source: 'designed' }))
    expect(first.number).toBe(1)
  })

  it('takes a bracket side with no kid, carrying the style, the round and the feed', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { matches: 0 })
    const feeder = made(await createMatch(db, { eventId: s.eventId, athleteAId: s.a1, athleteBId: s.b1, style: 'nogi', source: 'generated' }))
    const bracket = made(await createMatch(db, {
      eventId: s.eventId, athleteAId: null, athleteBId: s.a2,
      feedA: { matchId: feeder.id, take: 'winner' },
      style: 'nogi', round: 2, why: '47 to 53 boys, final', matId: null, source: 'generated',
    }))
    expect(bracket).toMatchObject({
      number: 2, athleteAId: null, athleteBId: s.a2, feedAMatchId: feeder.id, feedATake: 'winner',
      feedBMatchId: null, style: 'nogi', round: 2, why: '47 to 53 boys, final', source: 'generated', matId: null,
    })
  })

  it('refuses a feed to another event and a side with neither a kid nor a feed', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { matches: 0 })
    const other = await seedEvent(db, { matches: 0 })
    const foreign = made(await createMatch(db, { eventId: other.eventId, athleteAId: other.a1, athleteBId: other.b1, source: 'designed' }))
    expect(await createMatch(db, {
      eventId: s.eventId, athleteAId: null, athleteBId: s.a2,
      feedA: { matchId: foreign.id, take: 'winner' }, source: 'generated',
    })).toEqual({ ok: false, code: 'validation', message: 'a feed must name a match on this event' })
    expect(await createMatch(db, { eventId: s.eventId, athleteAId: null, athleteBId: s.a2, source: 'generated' }))
      .toEqual({ ok: false, code: 'validation', message: 'a side needs a kid or a feed' })
  })

  it('leaves a generated pair as the format put it, same team included', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { matches: 0 })
    const generated = made(await createMatch(db, { eventId: s.eventId, athleteAId: s.a2, athleteBId: s.a1, source: 'generated' }))
    expect(generated).toMatchObject({ athleteAId: s.a2, athleteBId: s.a1 })
    expect(await createMatch(db, { eventId: s.eventId, athleteAId: s.a2, athleteBId: s.a1, source: 'designed' }))
      .toEqual({ ok: false, code: 'validation', message: 'athletes must be on different teams' })
    // A pair a person picked still reads in team order whichever way round it arrived.
    expect(made(await createMatch(db, { eventId: s.eventId, athleteAId: s.b1, athleteBId: s.a1, source: 'designed' })))
      .toMatchObject({ athleteAId: s.a1, athleteBId: s.b1 })
  })
})

describe('the style of a hand-designed match', () => {
  it('defaults to gi, takes nogi on create, changes on patch, and warns per style', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0 })
    const gi = await call(app, 'POST', `/api/events/${s.eventId}/matches`, { athleteAId: s.a1, athleteBId: s.b1 }, adminToken)
    expect(gi.status).toBe(201)
    expect(gi.body).toMatchObject({ style: 'gi', warnings: [] })
    const nogi = await call(app, 'POST', `/api/events/${s.eventId}/matches`, { athleteAId: s.a1, athleteBId: s.b1, style: 'nogi' }, adminToken)
    expect(nogi.status).toBe(201)
    expect(nogi.body).toMatchObject({ style: 'nogi', warnings: [] })
    const again = await call(app, 'POST', `/api/events/${s.eventId}/matches`, { athleteAId: s.a1, athleteBId: s.b1, style: 'nogi' }, adminToken)
    expect(again.body.warnings).toEqual(['Already met'])
    const patched = await call(app, 'PATCH', `/api/matches/${again.body.id}`, { style: 'gi' }, adminToken)
    expect(patched.status).toBe(200)
    expect(patched.body).toMatchObject({ style: 'gi', warnings: ['Already met'] })
    expect((await db.select().from(matches).where(eq(matches.id, again.body.id)).get())?.style).toBe('gi')
  })
})
