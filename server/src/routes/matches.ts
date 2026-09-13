import { Hono } from 'hono'
import { z } from 'zod'
import { and, asc, eq, inArray, or } from 'drizzle-orm'
import type { Env } from '../context.js'
import type { DbLike } from '../db/client.js'
import { auditLog, events, rulesets, mats, matches, proposals, type MatchRow } from '../db/schema.js'
import { validate } from '../lib/validate.js'
import { errorJson, requireAdmin } from '../auth/middleware.js'
import { eventDetail } from './events.js'
import { divisionSchema } from './divisions.js'
import { MatchStateError, ValidationError, bumpVersion } from '../match/events.js'
import { createMatch } from '../match/create.js'
import { createDivision } from '../formats/divisions.js'
import { resolvePair } from '../match/pairs.js'
import { dependentsOf } from '../match/fill.js'
import { pairWarnings } from '../matchmaker/propose.js'
import { recordAudit, HISTORY_LIMIT } from '../audit/log.js'
import { assertNotCertified } from '../audit/certify.js'
import type { AuditEntry, DivisionView } from '../shared/types.js'
import { advanceMat } from '../match/mats.js'

const createSchema = z.object({
  athleteAId: z.number().int(),
  athleteBId: z.number().int(),
  rulesetId: z.number().int().optional(),
  lengthSec: z.number().int().min(30).max(1800).optional(),
  matId: z.number().int().nullable().optional(),
  style: z.enum(['gi', 'nogi']).optional(),
})
const patchSchema = createSchema.partial()

// One paste. The pairs carry no length, ruleset or mat: those are the row's own controls
// once the match exists, and a paste is a list of who fights whom.
const bulkSchema = z.object({
  matches: z.array(z.object({
    athleteAId: z.number().int(),
    athleteBId: z.number().int(),
    style: z.enum(['gi', 'nogi']).optional(),
  })).default([]),
  divisions: z.array(divisionSchema).default([]),
})

// A bracket match has nothing to warn about until both of its sides are filled, and the
// pair it ends up with was never anybody's choice.
const matchWarnings = async (db: DbLike, m: MatchRow) =>
  m.athleteAId === null || m.athleteBId === null
    ? []
    : pairWarnings(db, m.eventId, m.athleteAId, m.athleteBId, { exceptMatchId: m.id, style: m.style })

// A refusal from one line of a paste, carrying the line it came from. The code decides the
// status the same way a single-match refusal does.
const labelled = (label: string, r: { code: 'validation' | 'match_state'; message: string }) =>
  r.code === 'match_state' ? new MatchStateError(`${label}: ${r.message}`) : new ValidationError(`${label}: ${r.message}`)

const relabelled = (label: string, err: unknown) => {
  if (err instanceof ValidationError) return new ValidationError(`${label}: ${err.message}`)
  if (err instanceof MatchStateError) return new MatchStateError(`${label}: ${err.message}`)
  return err
}

export const matchRoutes = new Hono<Env>()

// No existence check: the audit log outlives the rows it describes, so the history of a
// match somebody deleted is exactly the history worth reading. An unknown id has no rows
// and answers with none. Oldest first, because the sheet reads downwards.
matchRoutes.get('/matches/:matchId/history', requireAdmin, async c => {
  const { db } = c.get('ctx')
  const rows: AuditEntry[] = await db.select({
    id: auditLog.id, at: auditLog.at, actor: auditLog.actor, action: auditLog.action, detail: auditLog.detail,
  }).from(auditLog).where(eq(auditLog.matchId, Number(c.req.param('matchId')))).orderBy(asc(auditLog.id)).limit(HISTORY_LIMIT).all()
  return c.json(rows)
})

matchRoutes.post('/events/:eventId/matches', requireAdmin, validate('json', createSchema), async c => {
  const { db } = c.get('ctx')
  const eventId = Number(c.req.param('eventId'))
  if (!await db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).get()) return errorJson(c, 404, 'not_found', 'event not found')
  await assertNotCertified(db, eventId)
  const body = c.req.valid('json')
  // A hand-designed pair can make an existing draft stale on either side, the way
  // confirming a proposal drops its own draft. Left alone, the draft would sit in the
  // table looking live until somebody tried to confirm it and was refused.
  let removedProposals = 0
  const created = await createMatch(db, { eventId, ...body, source: 'designed' }, {
    also: async (tx, match) => {
      const sides = [match.athleteAId, match.athleteBId].filter((id): id is number => id !== null)
      const stale = await tx.select({ id: proposals.id }).from(proposals).where(and(
        eq(proposals.eventId, eventId),
        or(inArray(proposals.athleteAId, sides), inArray(proposals.athleteBId, sides)),
      )).all()
      if (stale.length > 0) await tx.delete(proposals).where(inArray(proposals.id, stale.map(p => p.id))).run()
      removedProposals = stale.length
    },
  })
  if (!created.ok) return errorJson(c, created.code === 'match_state' ? 409 : 422, created.code, created.message)
  // A pair a person picked is never refused for being odd, only reported back, because the
  // organizer knows things the roster does not.
  const warnings = await matchWarnings(db, created.match)
  return c.json({ ...created.match, warnings, removedProposals }, 201)
})

/**
 * The whole paste in one transaction. A line the server cannot make sense of takes the
 * body back out with it, because half a pasted sheet is worse than none: the organizer
 * would have to work out which lines landed before pasting the rest.
 *
 * The refusal names the line by its index in the array it came from, which is what the
 * dialog needs to point at the row that has to change.
 */
matchRoutes.post('/events/:eventId/matches/bulk', requireAdmin, validate('json', bulkSchema), async c => {
  const { db } = c.get('ctx')
  const eventId = Number(c.req.param('eventId'))
  if (!await db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).get()) return errorJson(c, 404, 'not_found', 'event not found')
  await assertNotCertified(db, eventId)
  const body = c.req.valid('json')
  const created = await db.transaction(async tx => {
    const made: MatchRow[] = []
    const built: DivisionView[] = []
    const warnings: string[] = []
    for (const [i, pair] of body.matches.entries()) {
      const r = await createMatch(tx, { eventId, ...pair, source: 'designed' })
      if (!r.ok) throw labelled(`matches[${i}]`, r)
      made.push(r.match)
      warnings.push(...await matchWarnings(tx, r.match))
    }
    for (const [i, input] of body.divisions.entries()) {
      try {
        const r = await createDivision(tx, eventId, input)
        built.push(r.division)
        warnings.push(...r.warnings)
      } catch (err) {
        throw relabelled(`divisions[${i}]`, err)
      }
    }
    return { matches: made, divisions: built, warnings }
  })
  return c.json(created, 201)
})

matchRoutes.patch('/matches/:matchId', requireAdmin, validate('json', patchSchema), async c => {
  const { db } = c.get('ctx')
  const id = Number(c.req.param('matchId'))
  const existing = await db.select().from(matches).where(eq(matches.id, id)).get()
  if (!existing) return errorJson(c, 404, 'not_found', 'match not found')
  await assertNotCertified(db, existing.eventId)
  if (existing.status !== 'pending') return errorJson(c, 409, 'match_state', 'only a pending match can be edited. End it from the Live tab, then edit the result.')
  const body = c.req.valid('json')
  const update: Partial<typeof matches.$inferInsert> = {}
  if (body.athleteAId !== undefined || body.athleteBId !== undefined) {
    // A division decides its own pairs, so a kid is changed by editing the division and
    // generating it again. The mat, the order, the length and the style stay editable.
    if (existing.divisionId !== null) return errorJson(c, 409, 'match_state', 'edit the division')
    const aId = body.athleteAId ?? existing.athleteAId
    const bId = body.athleteBId ?? existing.athleteBId
    if (aId === null || bId === null) return errorJson(c, 422, 'validation', 'a bracket side is filled by the match that feeds it')
    const pair = await resolvePair(db, existing.eventId, aId, bId)
    if (typeof pair === 'string') return errorJson(c, 422, 'validation', pair)
    update.athleteAId = pair.a
    update.athleteBId = pair.b
    update.why = null
  }
  if (body.rulesetId !== undefined) {
    if (!await db.select({ id: rulesets.id }).from(rulesets).where(and(eq(rulesets.id, body.rulesetId), eq(rulesets.eventId, existing.eventId))).get()) return errorJson(c, 422, 'validation', 'ruleset is not on this event')
    update.rulesetId = body.rulesetId
  }
  if (body.lengthSec !== undefined) update.lengthSec = body.lengthSec
  if (body.style !== undefined) update.style = body.style
  if (body.matId !== undefined) {
    if (body.matId !== null && !await db.select({ id: mats.id }).from(mats).where(and(eq(mats.id, body.matId), eq(mats.eventId, existing.eventId))).get()) return errorJson(c, 422, 'validation', 'mat is not on this event')
    update.matId = body.matId
  }
  await db.transaction(async tx => {
    if (Object.keys(update).length > 0) await tx.update(matches).set(update).where(eq(matches.id, id)).run()
    if (update.matId !== undefined && update.matId !== null) await advanceMat(tx, update.matId, 'admin')
    await recordAudit(tx, { eventId: existing.eventId, matchId: id, actor: 'admin', action: 'match_edit', detail: { fields: Object.keys(update), ...update } })
    await bumpVersion(tx, existing.eventId)
  })
  const row = (await db.select().from(matches).where(eq(matches.id, id)).get())!
  return c.json({ ...row, warnings: await matchWarnings(db, row) })
})

matchRoutes.delete('/matches/:matchId', requireAdmin, async c => {
  const { db } = c.get('ctx')
  const id = Number(c.req.param('matchId'))
  const existing = await db.select().from(matches).where(eq(matches.id, id)).get()
  if (!existing) return errorJson(c, 404, 'not_found', 'match not found')
  await assertNotCertified(db, existing.eventId)
  if (existing.status !== 'pending') return errorJson(c, 409, 'match_state', 'only a pending match can be deleted. End it from the Live tab, then edit the result.')
  if (existing.divisionId !== null) return errorJson(c, 409, 'match_state', 'delete the division')
  const dependents = await dependentsOf(db, id)
  if (dependents.length > 0) return errorJson(c, 409, 'match_state', `M${dependents[0].number} feeds from this match`)
  await db.transaction(async tx => {
    await tx.update(mats).set({ currentMatchId: null }).where(eq(mats.currentMatchId, id)).run()
    await tx.delete(matches).where(eq(matches.id, id)).run()
    await recordAudit(tx, {
      eventId: existing.eventId, matchId: id, actor: 'admin', action: 'match_delete',
      detail: { athleteAId: existing.athleteAId, athleteBId: existing.athleteBId, matId: existing.matId },
    })
    await bumpVersion(tx, existing.eventId)
  })
  return c.body(null, 204)
})

matchRoutes.post('/events/:eventId/matches/reorder', requireAdmin, validate('json', z.object({ ids: z.array(z.number().int()).min(1) })), async c => {
  const { db } = c.get('ctx')
  const eventId = Number(c.req.param('eventId'))
  const { ids } = c.req.valid('json')
  await assertNotCertified(db, eventId)
  const current = (await db.select({ id: matches.id }).from(matches).where(eq(matches.eventId, eventId)).all()).map(m => m.id)
  const same = current.length === ids.length && current.every(id => ids.includes(id))
  if (!same) return errorJson(c, 422, 'validation', 'ids must be every match of the event exactly once')
  await db.transaction(async tx => {
    for (const [i, id] of ids.entries()) await tx.update(matches).set({ orderIndex: i }).where(eq(matches.id, id)).run()
    await recordAudit(tx, { eventId, actor: 'admin', action: 'reorder', detail: { count: ids.length, ids } })
    await bumpVersion(tx, eventId)
  })
  return c.json((await eventDetail(db, eventId))!.matches)
})
