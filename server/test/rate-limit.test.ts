import { describe, it, expect } from 'vitest'
import { checkLimit, recordFailure } from '../src/auth/dbRateLimit.js'
import { eq } from 'drizzle-orm'
import { freshDb, seedEvent } from './fixtures.js'
import { createTestApp, TEST_PIN } from './helpers.js'
import { events } from '../src/db/schema.js'

const HOUR_MS = 60 * 60 * 1000

describe('a PIN or mat code check is rate limited per IP', () => {
  it('allows through ten pin failures and refuses the next attempt with a positive retryAfterSec', async () => {
    const db = await freshDb()
    for (let i = 0; i < 10; i++) {
      expect((await checkLimit(db, 'pin', 'ip-1', i * 1000)).allowed).toBe(true)
      await recordFailure(db, 'pin', 'ip-1', i * 1000)
    }
    const eleventh = await checkLimit(db, 'pin', 'ip-1', 10_000)
    expect(eleventh.allowed).toBe(false)
    expect(eleventh.retryAfterSec).toBeGreaterThan(0)
  })

  it('allows through twenty bind failures and refuses the next attempt', async () => {
    const db = await freshDb()
    for (let i = 0; i < 20; i++) {
      expect((await checkLimit(db, 'bind', 'ip-2', i * 1000)).allowed).toBe(true)
      await recordFailure(db, 'bind', 'ip-2', i * 1000)
    }
    expect((await checkLimit(db, 'bind', 'ip-2', 20_000)).allowed).toBe(false)
  })

  it('never spends the budget on attempts that are not recorded as failures', async () => {
    const db = await freshDb()
    for (let i = 0; i < 50; i++) expect((await checkLimit(db, 'pin', 'ip-ok', i)).allowed).toBe(true)
    expect((await checkLimit(db, 'pin', 'ip-ok', 50)).retryAfterSec).toBe(0)
  })

  it('resets the window once window_start is more than an hour old', async () => {
    const db = await freshDb()
    for (let i = 0; i < 10; i++) await recordFailure(db, 'pin', 'ip-3', 0)
    expect((await checkLimit(db, 'pin', 'ip-3', 0)).allowed).toBe(false)
    const afterWindow = await checkLimit(db, 'pin', 'ip-3', HOUR_MS + 1)
    expect(afterWindow.allowed).toBe(true)
    expect(afterWindow.retryAfterSec).toBe(0)
    await recordFailure(db, 'pin', 'ip-3', HOUR_MS + 1)
    expect((await checkLimit(db, 'pin', 'ip-3', HOUR_MS + 2)).allowed).toBe(true)
  })

  it('keeps scopes independent for the same key', async () => {
    const db = await freshDb()
    for (let i = 0; i < 10; i++) await recordFailure(db, 'pin', 'shared-ip', i)
    expect((await checkLimit(db, 'pin', 'shared-ip', 10)).allowed).toBe(false)
    expect((await checkLimit(db, 'bind', 'shared-ip', 10)).allowed).toBe(true)
  })

  it('keeps different keys independent within the same scope', async () => {
    const db = await freshDb()
    for (let i = 0; i < 10; i++) await recordFailure(db, 'pin', 'ip-a', i)
    expect((await checkLimit(db, 'pin', 'ip-a', 10)).allowed).toBe(false)
    expect((await checkLimit(db, 'pin', 'ip-b', 10)).allowed).toBe(true)
  })

  it('allows through ten certify failures and refuses the next, apart from the pin scope', async () => {
    const db = await freshDb()
    for (let i = 0; i < 10; i++) {
      expect((await checkLimit(db, 'certify', 'ip-c', i)).allowed).toBe(true)
      await recordFailure(db, 'certify', 'ip-c', i)
    }
    expect((await checkLimit(db, 'certify', 'ip-c', 10)).allowed).toBe(false)
    expect((await checkLimit(db, 'pin', 'ip-c', 10)).allowed).toBe(true)
    expect((await checkLimit(db, 'bind', 'ip-c', 10)).allowed).toBe(true)
  })

  it('answers 429 on the PIN, bind and certify routes once one forwarded IP spends its budget, and serves another IP', async () => {
    const { app, db, adminToken } = await createTestApp({ publicUrl: 'https://duals.example' })
    const s = await seedEvent(db, { matches: 0 })
    await db.update(events).set({ status: 'done' }).where(eq(events.id, s.eventId)).run()
    const post = async (path: string, body: unknown, ip: string, token?: string) => {
      const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` }
      if (token) headers.authorization = `Bearer ${token}`
      const res = await app.request(path, { method: 'POST', headers, body: JSON.stringify(body) })
      return { status: res.status, code: (await res.json() as { error?: { code: string } }).error?.code ?? null }
    }
    const routes = [
      { scope: 'pin', budget: 10, path: '/api/auth/admin', bad: { pin: '000000' }, good: { pin: TEST_PIN }, badCode: 'bad_pin', token: undefined },
      { scope: 'bind', budget: 20, path: `/api/events/${s.eventId}/mats/${s.matIds[0]}/bind`, bad: { code: '9999' }, good: { code: '0420' }, badCode: 'bad_code', token: undefined },
      { scope: 'certify', budget: 10, path: `/api/events/${s.eventId}/certify`, bad: { pin: '000000' }, good: { pin: TEST_PIN }, badCode: 'bad_pin', token: adminToken },
    ]
    for (const [n, r] of routes.entries()) {
      const spent = `203.0.113.${n + 1}`
      for (let i = 0; i < r.budget; i++) expect([r.scope, i, await post(r.path, r.bad, spent, r.token)]).toEqual([r.scope, i, { status: 401, code: r.badCode }])
      expect([r.scope, await post(r.path, r.good, spent, r.token)]).toEqual([r.scope, { status: 429, code: 'rate_limited' }])
      const fresh = await post(r.path, r.good, `198.51.100.${n + 1}`, r.token)
      expect([r.scope, fresh.status]).toEqual([r.scope, 200])
    }
  })

  it('keys a LAN request on the connection, not on a forwarded header the caller can change', async () => {
    const { app } = await createTestApp()
    const attempt = async (ip: string) => (await app.request('/api/auth/admin', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ pin: '000000' }),
    })).status
    for (let i = 0; i < 10; i++) expect(await attempt(`192.0.2.${i}`)).toBe(401)
    expect(await attempt('192.0.2.99')).toBe(429)
  })
})
