import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { Env } from '../context.js'
import type { DbLike } from '../db/client.js'
import { divisions, events } from '../db/schema.js'
import { validate } from '../lib/validate.js'
import { errorJson, requireAdmin } from '../auth/middleware.js'
import { assertNotCertified, assertNotCertifiedVia } from '../audit/certify.js'
import { createDivision, deleteDivision, loadDivision, loadDivisions, regenerateDivision } from '../formats/divisions.js'
import { seedByRating } from '../formats/generate.js'

// The member count is left to DIVISION_LIMITS rather than checked here, so a list of one
// kid is refused with the format's own sentence instead of a schema message naming a
// minimum the organizer never set.
export const divisionSchema = z.object({
  name: z.string().trim().min(1).max(60),
  format: z.enum(['round_robin', 'single_elim', 'double_elim']),
  styles: z.enum(['gi', 'nogi', 'both']),
  athleteIds: z.array(z.number().int()),
})

const patchSchema = divisionSchema.partial()

const eventExists = async (db: DbLike, eventId: number) =>
  Boolean(await db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).get())

const divisionExists = async (db: DbLike, divisionId: number) =>
  Boolean(await db.select({ id: divisions.id }).from(divisions).where(eq(divisions.id, divisionId)).get())

export const divisionRoutes = new Hono<Env>()

divisionRoutes.post('/events/:eventId/divisions', requireAdmin, validate('json', divisionSchema), async c => {
  const { db } = c.get('ctx')
  const eventId = Number(c.req.param('eventId'))
  if (!await eventExists(db, eventId)) return errorJson(c, 404, 'not_found', 'event not found')
  await assertNotCertified(db, eventId)
  return c.json(await createDivision(db, eventId, c.req.valid('json')), 201)
})

divisionRoutes.get('/events/:eventId/divisions', requireAdmin, async c => {
  const { db } = c.get('ctx')
  const eventId = Number(c.req.param('eventId'))
  if (!await eventExists(db, eventId)) return errorJson(c, 404, 'not_found', 'event not found')
  return c.json(await loadDivisions(db, eventId))
})

divisionRoutes.patch('/divisions/:divisionId', requireAdmin, validate('json', patchSchema), async c => {
  const { db } = c.get('ctx')
  const divisionId = Number(c.req.param('divisionId'))
  if (!await divisionExists(db, divisionId)) return errorJson(c, 404, 'not_found', 'division not found')
  await assertNotCertifiedVia(db, 'division', divisionId)
  return c.json(await regenerateDivision(db, divisionId, c.req.valid('json')))
})

// Seeding is the listed order, so ordering by rating is an edit to that order and nothing
// else: the division generates again from the seeds it now has.
divisionRoutes.post('/divisions/:divisionId/seed', requireAdmin, async c => {
  const { db } = c.get('ctx')
  const divisionId = Number(c.req.param('divisionId'))
  if (!await divisionExists(db, divisionId)) return errorJson(c, 404, 'not_found', 'division not found')
  await assertNotCertifiedVia(db, 'division', divisionId)
  const { members } = await loadDivision(db, divisionId)
  return c.json(await regenerateDivision(db, divisionId, { athleteIds: seedByRating(members) }))
})

divisionRoutes.delete('/divisions/:divisionId', requireAdmin, async c => {
  const { db } = c.get('ctx')
  const divisionId = Number(c.req.param('divisionId'))
  if (!await divisionExists(db, divisionId)) return errorJson(c, 404, 'not_found', 'division not found')
  await assertNotCertifiedVia(db, 'division', divisionId)
  await deleteDivision(db, divisionId)
  return c.body(null, 204)
})
