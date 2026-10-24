import { describe, it, expect } from 'vitest'
import { createTestApp } from './helpers.js'

const METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE'])

const OPEN_BY_DESIGN = new Set<string>([
  'GET /api/health',
  'GET /api/lan',
  'POST /api/auth/admin',
  'GET /api/events/:eventId/snapshot',
  'POST /api/events/:eventId/mats/:matId/bind',
])

describe('every protected route rejects a request without a valid token', () => {
  it('walks every registered route bare', async () => {
    const { app } = await createTestApp()
    const seen = new Set<string>()
    const open: string[] = []
    const protectedRoutes: string[] = []
    for (const route of app.routes) {
      if (!METHODS.has(route.method) || !route.path.startsWith('/api/') || route.path.includes('*')) continue
      const key = `${route.method} ${route.path}`
      if (seen.has(key)) continue
      seen.add(key)
      const path = route.path.replace(/:[A-Za-z]+/g, '1')
      const res = await app.request(path, { method: route.method, headers: { 'content-type': 'application/json' }, body: route.method === 'GET' ? undefined : '{}' })
      if (res.status === 401) protectedRoutes.push(key)
      else open.push(`${key} -> ${res.status}`)
    }
    expect(seen.size).toBeGreaterThan(40)
    expect(open.map(o => o.split(' -> ')[0]).sort()).toEqual([...OPEN_BY_DESIGN].sort())
    for (const key of OPEN_BY_DESIGN) expect(protectedRoutes, `${key} is listed open but answers 401`).not.toContain(key)
  })
})
