import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestApp, call } from './helpers.js'
import { seedEvent } from './fixtures.js'
import { seat, match, elimBracket } from './smoothcomp-fixtures.js'
import { fetchJson, SmoothcompTimeout } from '../src/smoothcomp/client.js'
import { events, athletes, auditLog } from '../src/db/schema.js'
import type { Db } from '../src/db/client.js'

const SMOOTHCOMP_URL = 'https://smoothcomp.com/en/event/29499'
const LIST = 'https://smoothcomp.com/en/event/29499/schedule/brackets.json?search='
const RENDER = (id: number) => `https://smoothcomp.com/en/event/29499/bracket/${id}/getRenderData`

function fakeFetch(replies: Record<string, () => { status?: number; json?: unknown }>) {
  const calls: string[] = []
  const fn = (async (url: string | URL | Request) => {
    const key = String(url)
    calls.push(key)
    const reply = replies[key]?.() ?? { status: 404 }
    return new Response(JSON.stringify(reply.json ?? null), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { fn, calls }
}

async function withUrl(db: Db, eventId: number) {
  await db.update(events).set({ smoothcompUrl: SMOOTHCOMP_URL }).where(eq(events.id, eventId)).run()
}

describe('fetchJson', () => {
  it('retries a retryable status and returns the JSON once it succeeds', async () => {
    let attempts = 0
    const { fn, calls } = fakeFetch({ [LIST]: () => (attempts++ < 2 ? { status: 503 } : { json: { ok: true } }) })
    await expect(fetchJson(LIST, { fetchFn: fn, backoffMs: 0 })).resolves.toEqual({ ok: true })
    expect(calls).toHaveLength(3)
  })

  it('throws SmoothcompError with the status after one call on a non retryable response', async () => {
    const { fn, calls } = fakeFetch({ [LIST]: () => ({ status: 404 }) })
    await expect(fetchJson(LIST, { fetchFn: fn, backoffMs: 0 })).rejects.toMatchObject({ status: 404 })
    expect(calls).toHaveLength(1)
  })

  it('throws SmoothcompTimeout before making any call when the deadline has already passed', async () => {
    const { fn, calls } = fakeFetch({ [LIST]: () => ({ json: {} }) })
    await expect(fetchJson(LIST, { fetchFn: fn, deadlineAt: Date.now() - 1 })).rejects.toBeInstanceOf(SmoothcompTimeout)
    expect(calls).toHaveLength(0)
  })
})

describe('POST /events/:eventId/smoothcomp/standings', () => {
  it('requires an admin token', async () => {
    const { app } = await createTestApp()
    expect((await call(app, 'POST', '/api/events/1/smoothcomp/standings')).status).toBe(401)
  })

  it('404s an unknown event', async () => {
    const { app, adminToken } = await createTestApp()
    expect((await call(app, 'POST', '/api/events/9999/smoothcomp/standings', undefined, adminToken)).status).toBe(404)
  })

  it('422s when the event has no Smoothcomp URL saved', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db)
    const r = await call(app, 'POST', `/api/events/${s.eventId}/smoothcomp/standings`, undefined, adminToken)
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('Save a Smoothcomp URL on the event first')
  })

  it('422s a URL that fails to parse, with the parser message', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db)
    await db.update(events).set({ smoothcompUrl: 'https://example.com/event/1' }).where(eq(events.id, s.eventId)).run()
    const r = await call(app, 'POST', `/api/events/${s.eventId}/smoothcomp/standings`, undefined, adminToken)
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('Not a smoothcomp.com URL: example.com')
  })

  it('422s a team-only event with no kids at all', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0 })
    await db.delete(athletes).where(eq(athletes.eventId, s.eventId)).run()
    await withUrl(db, s.eventId)
    const r = await call(app, 'POST', `/api/events/${s.eventId}/smoothcomp/standings`, undefined, adminToken)
    expect(r.status).toBe(422)
    expect(r.body.error.message).toBe('Paste a roster first')
  })

  it('answers 200 with the report, lists a bracket that failed after its retries, and writes one audit row', async () => {
    const { fn } = fakeFetch({
      [LIST]: () => ({ json: { brackets: [{ bracket_id: 501 }, { bracket_id: 502 }] } }),
      [RENDER(501)]: () => ({
        json: elimBracket([match({ id: 1, left: seat({ name: 'Mateo Rivera', won: true }), right: seat({ name: 'Olivia Kim', club: 'Lakeside BJJ' }), wonBy: 'submission' })]),
      }),
      [RENDER(502)]: () => ({ status: 500 }),
    })
    const { app, db, adminToken } = await createTestApp({ smoothcomp: { fetchFn: fn, backoffMs: 0 } })
    const s = await seedEvent(db)
    await withUrl(db, s.eventId)

    const r = await call(app, 'POST', `/api/events/${s.eventId}/smoothcomp/standings`, undefined, adminToken)
    expect(r.status).toBe(200)
    expect(r.body.brackets).toEqual({ read: 1, failed: [502] })
    const ridgeline = r.body.teams.find((t: { teamId: number }) => t.teamId === s.teamA)
    expect(ridgeline).toMatchObject({ rank: 1, teamPoints: 3 })

    const rows = await db.select().from(auditLog).where(eq(auditLog.eventId, s.eventId)).all()
    const row = rows.find(row => row.action === 'smoothcomp_standings')
    expect(row?.detail).toMatchObject({
      url: SMOOTHCOMP_URL,
      brackets: { read: 1, failed: [502] },
      teams: [{ teamId: s.teamA, rank: 1, teamPoints: 3 }, { teamId: s.teamB, rank: 2, teamPoints: 0 }],
    })
  })

  it('502s when the bracket list fails after its retries', async () => {
    const { fn } = fakeFetch({ [LIST]: () => ({ status: 500 }) })
    const { app, db, adminToken } = await createTestApp({ smoothcomp: { fetchFn: fn, backoffMs: 0 } })
    const s = await seedEvent(db)
    await withUrl(db, s.eventId)
    const r = await call(app, 'POST', `/api/events/${s.eventId}/smoothcomp/standings`, undefined, adminToken)
    expect(r.status).toBe(502)
    expect(r.body.error.code).toBe('smoothcomp')
    expect(r.body.error.message).toMatch(/responded 500/)
  })

  it('504s when the pull runs past the deadline', async () => {
    const slow = (async (url: string | URL | Request) => {
      await new Promise(resolve => setTimeout(resolve, 30))
      const json = String(url) === LIST ? { brackets: [{ bracket_id: 501 }] } : null
      return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const { app, db, adminToken } = await createTestApp({ smoothcomp: { fetchFn: slow, backoffMs: 0, deadlineMs: 10 } })
    const s = await seedEvent(db)
    await withUrl(db, s.eventId)
    const r = await call(app, 'POST', `/api/events/${s.eventId}/smoothcomp/standings`, undefined, adminToken)
    expect(r.status).toBe(504)
    expect(r.body.error.code).toBe('smoothcomp_timeout')
    expect(r.body.error.message).toBe('Smoothcomp took too long. Try again.')
  })

  it('follows a related bracket outside the list, and counts a match id shared by both brackets once', async () => {
    const shared = match({ id: 1, left: seat({ name: 'Mateo Rivera', won: true }), right: seat({ name: 'Olivia Kim' }), wonBy: 'submission' })
    const fresh = match({ id: 2, left: seat({ name: 'Noah Tran', won: true }), right: seat({ name: 'Ava Park' }), wonBy: 'points' })
    const bracket501 = {
      state: { matches: [shared], match_trees: [] },
      bracketInfo: {
        relatedBrackets: [{ id: 777, link: 'https://smoothcomp.com/en/event/29499/bracket/777' }],
        bracketHeaderData: { group: { name: 'Co-Ed Gi / 8 Years / 60 lbs' } },
      },
    }
    const bracket777 = elimBracket([shared, fresh])
    const { fn } = fakeFetch({
      [LIST]: () => ({ json: { brackets: [{ bracket_id: 501 }] } }),
      [RENDER(501)]: () => ({ json: bracket501 }),
      'https://smoothcomp.com/en/event/29499/bracket/777/getRenderData': () => ({ json: bracket777 }),
    })
    const { app, db, adminToken } = await createTestApp({ smoothcomp: { fetchFn: fn, backoffMs: 0 } })
    const s = await seedEvent(db)
    await withUrl(db, s.eventId)

    const r = await call(app, 'POST', `/api/events/${s.eventId}/smoothcomp/standings`, undefined, adminToken)
    expect(r.status).toBe(200)
    expect(r.body.brackets).toEqual({ read: 2, failed: [] })
    expect(r.body.matches).toMatchObject({ read: 2, counted: 2 })
  })
})
