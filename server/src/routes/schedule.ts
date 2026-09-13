import { Hono } from 'hono'
import { z } from 'zod'
import { asc, eq } from 'drizzle-orm'
import type { Env } from '../context.js'
import type { DbLike } from '../db/client.js'
import { athletes, divisionMembers, divisions, events, mats, matches, type MatchRow } from '../db/schema.js'
import { validate } from '../lib/validate.js'
import { errorJson, requireAdmin } from '../auth/middleware.js'
import { assertNotCertified } from '../audit/certify.js'
import { bumpVersion } from '../match/events.js'
import { releaseIdleMats } from '../match/mats.js'
import { recordAudit } from '../audit/log.js'
import { planSchedule, type PendingMatch, type PlanInput, type SchedulePlan } from '../schedule/plan.js'

const applySchema = z.object({ apply: z.boolean().default(false) })

// The planner refuses a set it can never lay out rather than looping. Its message names
// the match, which is the one thing the organizer can act on.
const CANNOT_PLACE = 'schedule cannot place'

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length

export interface ScheduleRequest {
  input: PlanInput
  names: (athleteId: number) => string
  /** The live and done rows, in the order they already stand in. */
  settled: MatchRow[]
}

/**
 * The event as the planner reads it. Everything the plan needs is here rather than in the
 * planner, which stays pure: the ages, the division a bracket match belongs to, and which
 * feeds are still owed a kid.
 */
export async function scheduleRequest(db: DbLike, eventId: number): Promise<ScheduleRequest> {
  const rows = await db.select().from(matches).where(eq(matches.eventId, eventId))
    .orderBy(asc(matches.orderIndex), asc(matches.id)).all()
  const kids = await db.select().from(athletes).where(eq(athletes.eventId, eventId)).all()
  const ageOf = new Map(kids.map(k => [k.id, k.age]))
  const nameOf = new Map(kids.map(k => [k.id, `${k.firstName} ${k.lastName}`]))
  const divisionRows = await db.select().from(divisions).where(eq(divisions.eventId, eventId)).all()
  const positionOf = new Map(divisionRows.map(d => [d.id, d.position]))

  // A bracket match whose sides are not filled in yet still has an age: the kids who will
  // fight it are somewhere in the division, so the set's mean is the best read there is.
  const divisionAge = new Map<number, number | null>()
  for (const d of divisionRows) {
    const memberIds = await db.select({ athleteId: divisionMembers.athleteId }).from(divisionMembers)
      .where(eq(divisionMembers.divisionId, d.id)).all()
    divisionAge.set(d.id, mean(memberIds.map(m => ageOf.get(m.athleteId) ?? null).filter((a): a is number => a !== null)))
  }

  const statusOf = new Map(rows.map(m => [m.id, m.status]))
  const ageFor = (m: MatchRow): number | null => {
    if ((m.athleteAId === null || m.athleteBId === null) && m.divisionId !== null) return divisionAge.get(m.divisionId) ?? null
    return mean([m.athleteAId, m.athleteBId]
      .map(id => id === null ? null : ageOf.get(id) ?? null)
      .filter((age): age is number => age !== null))
  }

  const pending: PendingMatch[] = rows.filter(m => m.status === 'pending').map(m => ({
    id: m.id,
    number: m.number,
    style: m.style,
    athleteIds: [m.athleteAId, m.athleteBId],
    // A feeder that has already run filled its side when it ended, so it holds nothing up.
    feeds: [m.feedAMatchId, m.feedBMatchId].filter((id): id is number => {
      const status = id === null ? undefined : statusOf.get(id)
      return status === 'pending' || status === 'live'
    }),
    age: ageFor(m),
    round: m.round,
    divisionPosition: m.divisionId === null ? null : positionOf.get(m.divisionId) ?? null,
    lengthSec: m.lengthSec,
  }))

  const settled = rows.filter(m => m.status !== 'pending')
  return {
    input: {
      mats: (await db.select().from(mats).where(eq(mats.eventId, eventId)).orderBy(asc(mats.number)).all())
        .map(m => ({ id: m.id, number: m.number })),
      live: rows.filter(m => m.status === 'live').map(m => ({
        matchId: m.id,
        athleteIds: [m.athleteAId, m.athleteBId].filter((id): id is number => id !== null),
      })),
      pending,
      firstOrderIndex: settled.length,
    },
    names: (athleteId: number) => nameOf.get(athleteId) ?? `#${athleteId}`,
    settled,
  }
}

export const scheduleRoutes = new Hono<Env>()

/**
 * One press writes the whole running order. The matches already fought or being fought
 * keep the order they stand in and go first; everything pending takes the plan's order and
 * the plan's mat, overriding any mat set by hand, because the point of the press is that
 * the day is laid out as one thing rather than row by row.
 */
scheduleRoutes.post('/events/:eventId/schedule', requireAdmin, validate('json', applySchema), async c => {
  const { db } = c.get('ctx')
  const eventId = Number(c.req.param('eventId'))
  if (!await db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).get()) return errorJson(c, 404, 'not_found', 'event not found')
  await assertNotCertified(db, eventId)
  const { apply } = c.req.valid('json')
  const { input, names, settled } = await scheduleRequest(db, eventId)

  let plan: SchedulePlan
  try {
    plan = planSchedule(input, names)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.startsWith(CANNOT_PLACE)) return errorJson(c, 409, 'match_state', message)
    throw err
  }
  if (!apply) return c.json({ ...plan, applied: false })

  await db.transaction(async tx => {
    for (const [i, m] of settled.entries()) {
      await tx.update(matches).set({ orderIndex: i }).where(eq(matches.id, m.id)).run()
    }
    for (const slot of plan.order) {
      await tx.update(matches).set({ orderIndex: slot.orderIndex, matId: slot.matId }).where(eq(matches.id, slot.matchId)).run()
    }
    await recordAudit(tx, {
      eventId, actor: 'admin', action: 'schedule',
      detail: { waves: plan.waves, minutes: plan.minutes, matches: plan.order.length },
    })
    await bumpVersion(tx, eventId)
    // A live event starts whatever the new order and the new mats let it start.
    await releaseIdleMats(tx, eventId, 'admin')
  })
  return c.json({ ...plan, applied: true })
})
