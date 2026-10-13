import { describe, it, expect } from 'vitest'
import { createTestApp, call } from './helpers.js'
import { seedEvent } from './fixtures.js'

describe('the event connect route', () => {
  it('hands out the LAN url and the mat code', async () => {
    const { app, db, adminToken } = await createTestApp({ port: 8422 })
    const s = await seedEvent(db)
    const r = await call(app, 'GET', `/api/events/${s.eventId}/connect`, undefined, adminToken)
    expect(r.status).toBe(200)
    expect(r.body.url).toMatch(/^http:\/\/\d+\.\d+\.\d+\.\d+:8422$/)
    expect(r.body.matCode).toBe('0420')
  })

  it('hands out the public url instead when the context sets one', async () => {
    const { app, db, adminToken } = await createTestApp({ port: 8422, publicUrl: 'https://www.eastonduals.com' })
    const s = await seedEvent(db)
    const r = await call(app, 'GET', `/api/events/${s.eventId}/connect`, undefined, adminToken)
    expect(r.status).toBe(200)
    expect(r.body.url).toBe('https://www.eastonduals.com')
    expect(r.body.matCode).toBe('0420')
  })
})
