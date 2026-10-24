import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { signToken, verifyToken, tokenExpiry, type TokenPayload } from '../src/auth/tokens.js'
import { pinMatches, validateAdminPin, randomMatCode } from '../src/auth/pin.js'
import { attachAuth, requireAdmin, requireMatOrAdmin } from '../src/auth/middleware.js'
import type { Env, AppContext } from '../src/context.js'
import { eq } from 'drizzle-orm'
import { freshDb, seedEvent } from './fixtures.js'
import { createTestApp, TEST_SECRET } from './helpers.js'
import { mats } from '../src/db/schema.js'

const SECRET = 'test-secret'

describe('a token is signed and expires', () => {
  it('round-trips a payload', () => {
    const t = signToken({ role: 'admin', exp: tokenExpiry(0) }, SECRET)
    expect(verifyToken(t, SECRET, 0)).toEqual({ role: 'admin', exp: 86_400 })
  })
  it('rejects a bad signature, a wrong secret, and garbage', () => {
    const t = signToken({ role: 'admin', exp: tokenExpiry(0) }, SECRET)
    expect(verifyToken(t.slice(0, -2) + 'xx', SECRET, 0)).toBeNull()
    expect(verifyToken(t, 'other', 0)).toBeNull()
    expect(verifyToken('nope', SECRET, 0)).toBeNull()
  })
  it('rejects an expired token', () => {
    const t = signToken({ role: 'mat', eventId: 1, matId: 2, epoch: 1, exp: 100 }, SECRET)
    expect(verifyToken(t, SECRET, 99_000)).not.toBeNull()
    expect(verifyToken(t, SECRET, 101_000)).toBeNull()
  })
  it('reads a mat token minted before the epoch existed as epoch zero', () => {
    const legacy = signToken({ role: 'mat', eventId: 1, matId: 2, exp: tokenExpiry(0) } as unknown as TokenPayload, SECRET)
    expect(verifyToken(legacy, SECRET, 0)).toMatchObject({ role: 'mat', epoch: 0 })
  })
})

describe('PIN and mat code shapes', () => {
  it('compares in constant time and validates the shape', () => {
    expect(pinMatches('123456', '123456')).toBe(true)
    expect(pinMatches('123457', '123456')).toBe(false)
    expect(pinMatches('12345', '123456')).toBe(false)
    expect(validateAdminPin('123456')).toBe('123456')
    expect(() => validateAdminPin('12345')).toThrow(/6 digits/)
    expect(() => validateAdminPin(undefined)).toThrow(/6 digits/)
  })
  it('makes 4-digit mat codes', () => {
    for (let i = 0; i < 20; i++) expect(randomMatCode()).toMatch(/^\d{4}$/)
  })
})

describe('an admin route rejects a request without a valid admin token', () => {
  async function build() {
    const db = await freshDb()
    const app = new Hono<Env>()
    app.use('*', async (c, next) => {
      c.set('ctx', { port: 0, db, secret: SECRET, adminPin: '123456' } as unknown as AppContext)
      await next()
    })
    app.use('*', attachAuth)
    app.get('/admin', requireAdmin, c => c.json({ ok: true }))
    app.get('/mat/:matId', requireMatOrAdmin(c => Number(c.req.param('matId'))), c => c.json({ ok: true }))
    return app
  }
  const admin = signToken({ role: 'admin', exp: tokenExpiry() }, SECRET)
  const mat2 = signToken({ role: 'mat', eventId: 1, matId: 2, epoch: 0, exp: tokenExpiry() }, SECRET)

  it('401s without a token and 403s with the wrong role', async () => {
    const app = await build()
    expect((await app.request('/admin')).status).toBe(401)
    expect((await app.request('/admin', { headers: { authorization: `Bearer ${mat2}` } })).status).toBe(403)
    expect((await app.request('/admin', { headers: { authorization: `Bearer ${admin}` } })).status).toBe(200)
  })
  it('lets a mat token through only for its own mat', async () => {
    const app = await build()
    expect((await app.request('/mat/2', { headers: { authorization: `Bearer ${mat2}` } })).status).toBe(200)
    expect((await app.request('/mat/3', { headers: { authorization: `Bearer ${mat2}` } })).status).toBe(403)
    expect((await app.request('/mat/3', { headers: { authorization: `Bearer ${admin}` } })).status).toBe(200)
  })

  const OPEN_ROUTES = new Set([
    'GET /api/health', 'GET /api/lan', 'POST /api/auth/admin',
    'GET /api/events/:eventId/snapshot', 'POST /api/events/:eventId/mats/:matId/bind',
  ])
  const MAT_ROUTES = new Set([
    'POST /api/mats/:matId/unbind', 'POST /api/mats/:matId/heartbeat',
    'POST /api/matches/:matchId/events', 'DELETE /api/matches/:matchId/events/last',
    'POST /api/matches/:matchId/end', 'POST /api/matches/:matchId/clock/extend',
  ])

  it('walks every real route with a mat token, a stale mat token and a token for another mat', async () => {
    const { app, db } = await createTestApp()
    const s = await seedEvent(db, { live: true, matCount: 2 })
    const [own, otherMat] = s.matIds
    const epochOf = async (matId: number) => (await db.select({ e: mats.bindEpoch }).from(mats).where(eq(mats.id, matId)).get())!.e
    const token = (matId: number, epoch: number) => signToken({ role: 'mat', eventId: s.eventId, matId, epoch, exp: tokenExpiry() }, TEST_SECRET)
    const ids: Record<string, number> = { eventId: s.eventId, matId: own, matchId: s.matchIds[0] }
    const status = (method: string, path: string, bearer: string) => app.request(path, {
      method, headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` }, body: method === 'GET' ? undefined : '{}',
    })

    const seen = new Set<string>()
    const admitted: string[] = []
    for (const route of app.routes) {
      if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(route.method) || !route.path.startsWith('/api/') || route.path.includes('*')) continue
      const key = `${route.method} ${route.path}`
      if (seen.has(key) || OPEN_ROUTES.has(key)) continue
      seen.add(key)
      const path = route.path.replace(/:([A-Za-z]+)/g, (_, name: string) => String(ids[name] ?? 1))

      const stale = await status(route.method, path, token(own, (await epochOf(own)) + 1))
      const foreign = await status(route.method, path, token(otherMat, await epochOf(otherMat)))
      const fresh = await status(route.method, path, token(own, await epochOf(own)))
      if (MAT_ROUTES.has(key)) {
        expect([key, stale.status, (await stale.json()).error.code]).toEqual([key, 401, 'token_stale'])
        expect([key, foreign.status]).toEqual([key, 403])
      } else {
        expect([key, stale.status, foreign.status, fresh.status]).toEqual([key, 403, 403, 403])
      }
      if (fresh.status !== 401 && fresh.status !== 403) admitted.push(key)
    }
    expect(seen.size).toBeGreaterThan(40)
    expect(admitted.sort()).toEqual([...MAT_ROUTES].sort())
  })
})
