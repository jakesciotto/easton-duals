import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { and, asc, eq, inArray, ne, or } from 'drizzle-orm'
import type { Env } from '../context.js'
import type { DbLike } from '../db/client.js'
import { events, athletes, rulesets, proposals, type AthleteRow, type ProposalRow } from '../db/schema.js'
import { validate } from '../lib/validate.js'
import { errorJson, requireAdmin } from '../auth/middleware.js'
import { assertNotCertified } from '../audit/certify.js'
import { createMatch } from '../match/create.js'
import { createDivision } from '../formats/divisions.js'
import { weightClass } from '../shared/weight-class.js'
import { busyAthlete, resolvePair } from '../match/pairs.js'
import { loadProposal, loadProposals, pairCost, pairWarnings, pairWhy, proposeMatches } from '../matchmaker/propose.js'
import type { Style } from '../shared/types.js'

const swapSchema = z.object({
  athleteAId: z.number().int().optional(),
  athleteBId: z.number().int().optional(),
}).refine(b => b.athleteAId !== undefined || b.athleteBId !== undefined, { message: 'name the kid to swap in' })

const proposeSchema = z.object({ style: z.enum(['gi', 'nogi']).default('gi') })

async function proposeStyle(c: Context<Env>): Promise<{ style: Style } | Response> {
  const type = c.req.header('content-type') ?? ''
  const raw = type.includes('application/json') ? (await c.req.text()).trim() : ''
  let body: unknown = {}
  if (raw !== '') {
    try { body = JSON.parse(raw) } catch { return errorJson(c, 422, 'validation', 'body: invalid JSON') }
  }
  const parsed = proposeSchema.safeParse(body)
  if (!parsed.success) return errorJson(c, 422, 'validation', parsed.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '))
  return parsed.data
}

const eventExists = async (db: DbLike, eventId: number) =>
  Boolean(await db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).get())

const busyMessage = (kid: AthleteRow) => `${kid.firstName} ${kid.lastName} already has a match`

const firstRuleset = (db: DbLike, eventId: number) =>
  db.select({ id: rulesets.id }).from(rulesets).where(eq(rulesets.eventId, eventId)).orderBy(asc(rulesets.id)).get()

const confirm = (db: DbLike, row: ProposalRow, rulesetId: number) =>
  createMatch(
    db,
    { eventId: row.eventId, athleteAId: row.athleteAId, athleteBId: row.athleteBId, style: row.style, rulesetId, source: 'proposed' },
    {
      guard: async tx => {
        const busy = await busyAthlete(tx, row.eventId, [row.athleteAId, row.athleteBId])
        return busy ? busyMessage(busy) : null
      },
      also: async tx => { await tx.delete(proposals).where(eq(proposals.id, row.id)).run() },
    },
  )

const confirmTrio = (db: DbLike, row: ProposalRow) =>
  db.transaction(async tx => {
    const ids = [row.athleteAId, row.athleteBId, row.athleteCId as number]
    const busy = await busyAthlete(tx, row.eventId, ids)
    if (busy) return { ok: false as const, code: 'match_state' as const, message: busyMessage(busy) }
    const kid = await tx.select({ weightLbs: athletes.weightLbs }).from(athletes).where(eq(athletes.id, row.athleteAId)).get()
    const band = kid?.weightLbs == null ? 'Round robin' : `${weightClass(kid.weightLbs).label} round robin`
    const { division, warnings } = await createDivision(tx, row.eventId, { name: band, format: 'round_robin', styles: row.style, athleteIds: ids })
    await tx.delete(proposals).where(eq(proposals.id, row.id)).run()
    return { ok: true as const, division, warnings }
  })

const refuse = (c: Parameters<typeof errorJson>[0], r: { code: 'validation' | 'match_state'; message: string }) =>
  errorJson(c, r.code === 'match_state' ? 409 : 422, r.code, r.message)

export const proposalRoutes = new Hono<Env>()

proposalRoutes.post('/events/:eventId/proposals', requireAdmin, async c => {
  const { db } = c.get('ctx')
  const eventId = Number(c.req.param('eventId'))
  await assertNotCertified(db, eventId)
  const body = await proposeStyle(c)
  if (body instanceof Response) return body
  return c.json(await proposeMatches(db, eventId, body.style))
})

proposalRoutes.get('/events/:eventId/proposals', requireAdmin, async c => {
  const { db } = c.get('ctx')
  const eventId = Number(c.req.param('eventId'))
  if (!await eventExists(db, eventId)) return errorJson(c, 404, 'not_found', 'event not found')
  return c.json(await loadProposals(db, eventId))
})

proposalRoutes.post('/events/:eventId/proposals/confirm-all', requireAdmin, async c => {
  const { db } = c.get('ctx')
  const eventId = Number(c.req.param('eventId'))
  if (!await eventExists(db, eventId)) return errorJson(c, 404, 'not_found', 'event not found')
  await assertNotCertified(db, eventId)
  const ruleset = await firstRuleset(db, eventId)
  if (!ruleset) return errorJson(c, 409, 'match_state', 'event needs a ruleset')
  const rows = await db.select().from(proposals).where(eq(proposals.eventId, eventId))
    .orderBy(asc(proposals.cost), asc(proposals.id)).all()
  let created = 0
  for (const row of rows) {
    const result = row.athleteCId === null ? await confirm(db, row, ruleset.id) : await confirmTrio(db, row)
    if (result.ok) created++
  }
  return c.json({ created, skipped: rows.length - created }, 201)
})

proposalRoutes.post('/proposals/:proposalId/confirm', requireAdmin, async c => {
  const { db } = c.get('ctx')
  const row = await db.select().from(proposals).where(eq(proposals.id, Number(c.req.param('proposalId')))).get()
  if (!row) return errorJson(c, 404, 'not_found', 'proposal not found')
  await assertNotCertified(db, row.eventId)
  const ruleset = await firstRuleset(db, row.eventId)
  if (!ruleset) return errorJson(c, 409, 'match_state', 'event needs a ruleset')
  if (row.athleteCId !== null) {
    const result = await confirmTrio(db, row)
    if (!result.ok) return refuse(c, result)
    return c.json({ division: result.division, warnings: result.warnings }, 201)
  }
  const result = await confirm(db, row, ruleset.id)
  if (!result.ok) return refuse(c, result)
  return c.json({ match: result.match }, 201)
})

proposalRoutes.patch('/proposals/:proposalId', requireAdmin, validate('json', swapSchema), async c => {
  const { db } = c.get('ctx')
  const row = await db.select().from(proposals).where(eq(proposals.id, Number(c.req.param('proposalId')))).get()
  if (!row) return errorJson(c, 404, 'not_found', 'proposal not found')
  await assertNotCertified(db, row.eventId)
  if (row.athleteCId !== null) return errorJson(c, 422, 'validation', 'a round robin draft has no swap; remove it and add the division by hand')
  const body = c.req.valid('json')
  const incoming = [body.athleteAId, body.athleteBId]
    .filter((id): id is number => id !== undefined && id !== row.athleteAId && id !== row.athleteBId)
  const busy = await busyAthlete(db, row.eventId, incoming)
  if (busy) return errorJson(c, 409, 'match_state', busyMessage(busy))

  const pair = await resolvePair(db, row.eventId, body.athleteAId ?? row.athleteAId, body.athleteBId ?? row.athleteBId)
  if (typeof pair === 'string') return errorJson(c, 422, 'validation', pair)
  const sides = await db.select().from(athletes)
    .where(and(eq(athletes.eventId, row.eventId), inArray(athletes.id, [pair.a, pair.b]))).all()
  const a = sides.find(k => k.id === pair.a)!
  const b = sides.find(k => k.id === pair.b)!

  const clash = incoming.length === 0 ? [] : await db.select({ id: proposals.id }).from(proposals).where(and(
    eq(proposals.eventId, row.eventId),
    ne(proposals.id, row.id),
    or(inArray(proposals.athleteAId, incoming), inArray(proposals.athleteBId, incoming)),
  )).all()
  const removed = clash.map(p => p.id)
  await db.transaction(async tx => {
    if (removed.length > 0) await tx.delete(proposals).where(inArray(proposals.id, removed)).run()
    await tx.update(proposals)
      .set({ athleteAId: pair.a, athleteBId: pair.b, cost: pairCost(a, b), why: pairWhy(a, b) })
      .where(eq(proposals.id, row.id)).run()
  })
  return c.json({
    proposal: await loadProposal(db, row.id),
    removed,
    warnings: await pairWarnings(db, row.eventId, pair.a, pair.b, { style: row.style }),
  })
})

proposalRoutes.delete('/proposals/:proposalId', requireAdmin, async c => {
  const { db } = c.get('ctx')
  const row = await db.select().from(proposals).where(eq(proposals.id, Number(c.req.param('proposalId')))).get()
  if (!row) return errorJson(c, 404, 'not_found', 'proposal not found')
  await assertNotCertified(db, row.eventId)
  await db.delete(proposals).where(eq(proposals.id, row.id)).run()
  return c.body(null, 204)
})
