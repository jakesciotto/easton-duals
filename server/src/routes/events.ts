import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { and, asc, count, desc, eq, isNull, ne } from 'drizzle-orm'
import type { Env } from '../context.js'
import type { DbLike } from '../db/client.js'
import { auditLog, events, teams, athletes, rulesets, mats, matches, rosterCandidates } from '../db/schema.js'
import { validate } from '../lib/validate.js'
import { lanIp } from '../lib/lanIp.js'
import { clientIp, errorJson, requireAdmin } from '../auth/middleware.js'
import { checkLimit, recordFailure } from '../auth/dbRateLimit.js'
import { pinMatches, randomMatCode } from '../auth/pin.js'
import { advanceMat, startEvent } from '../match/mats.js'
import { MatchStateError, bumpVersion, endedAtByMatch } from '../match/events.js'
import { recordAudit, HISTORY_LIMIT } from '../audit/log.js'
import { assertNotCertified } from '../audit/certify.js'
import { eventContact } from '../live/snapshot.js'
import { loadDivisions } from '../formats/divisions.js'
import { parseSmoothcompUrl } from '../smoothcomp/url.js'
import { CORRECTION_REASON_MAX, DEFAULT_ACTIONS, DEFAULT_TERMINALS, DEFAULT_LENGTH_SEC, FAR_MIN, FAR_MAX, MIN_TEAMS, MAX_TEAMS, TEAM_COLOR_KEYS, type AuditAction, type AuditEntry, type TeamColor } from '../shared/types.js'

const colorSchema = z.enum(TEAM_COLOR_KEYS as [TeamColor, ...TeamColor[]])
export const teamSchema = z.object({ name: z.string().trim().min(1).max(40), color: colorSchema })
const DUPLICATE_COLOUR = 'each team needs its own colour'
const distinctColours = (list: { color: TeamColor }[]) => new Set(list.map(t => t.color)).size === list.length
const contactName = z.string().trim().max(60)
const contactPhone = z.string().trim().max(30)
const sameGender = z.boolean()

const createEventSchema = z.object({
  name: z.string().trim().min(1).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  matCount: z.number().int().min(1).max(8),
  mode: z.enum(['live', 'entry']).optional(),
  contactName: contactName.optional(),
  contactPhone: contactPhone.optional(),
  teams: z.array(teamSchema).min(MIN_TEAMS).max(MAX_TEAMS).refine(distinctColours, { message: DUPLICATE_COLOUR }),
  sameGender: sameGender.optional(),
})

const patchEventSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  matCount: z.number().int().min(1).max(8).optional(),
  status: z.enum(['live', 'done']).optional(),
  mode: z.enum(['live', 'entry']).optional(),
  contactName: contactName.optional(),
  contactPhone: contactPhone.optional(),
  sameGender: sameGender.optional(),
  far: z.number().min(FAR_MIN).max(FAR_MAX).nullable().optional(),
  smoothcompUrl: z.string().trim().max(300).nullable().optional(),
})

const blankToNull = (v: string | undefined) => v === undefined || v === '' ? null : v

export async function eventDetail(db: DbLike, eventId: number) {
  const ev = await db.select().from(events).where(eq(events.id, eventId)).get()
  if (!ev) return null
  const candidateRow = await db.select({ n: count() }).from(rosterCandidates).where(eq(rosterCandidates.eventId, eventId)).get()
  const matchRows = await db.select().from(matches).where(eq(matches.eventId, eventId)).orderBy(asc(matches.orderIndex), asc(matches.id)).all()
  const endedAtById = await endedAtByMatch(db, matchRows.map(m => m.id))
  return {
    event: { ...ev, contact: eventContact(ev) },
    teams: await db.select().from(teams).where(eq(teams.eventId, eventId)).orderBy(asc(teams.position)).all(),
    athletes: await db.select().from(athletes).where(eq(athletes.eventId, eventId)).orderBy(asc(athletes.lastName), asc(athletes.firstName)).all(),
    rulesets: await db.select().from(rulesets).where(eq(rulesets.eventId, eventId)).orderBy(asc(rulesets.id)).all(),
    mats: await db.select().from(mats).where(eq(mats.eventId, eventId)).orderBy(asc(mats.number)).all(),
    matches: matchRows.map(m => ({ ...m, endedAt: endedAtById.get(m.id) ?? null })),
    divisions: await loadDivisions(db, eventId),
    candidateCount: candidateRow?.n ?? 0,
  }
}

async function setMatCount(tx: DbLike, eventId: number, matCount: number) {
  const rows = await tx.select().from(mats).where(eq(mats.eventId, eventId)).orderBy(asc(mats.number)).all()
  if (matCount > rows.length) {
    await tx.insert(mats).values(Array.from({ length: matCount - rows.length }, (_, i) => ({ eventId, number: rows.length + i + 1 }))).run()
  } else {
    for (const mat of rows.filter(m => m.number > matCount)) {
      const used = await tx.select({ id: matches.id }).from(matches).where(eq(matches.matId, mat.id)).get()
      if (used) throw new MatchStateError(`mat ${mat.number} has matches; move them first`)
      await tx.delete(mats).where(eq(mats.id, mat.id)).run()
    }
  }
  await tx.update(events).set({ matCount }).where(eq(events.id, eventId)).run()
}

export const eventRoutes = new Hono<Env>()

eventRoutes.get('/events', requireAdmin, async c => {
  const db = c.get('ctx').db
  const rows = await db.select().from(events).orderBy(desc(events.date), desc(events.id)).all()
  const teamRows = await db.select().from(teams).orderBy(asc(teams.position)).all()
  return c.json(rows.map(ev => ({ ...ev, teams: teamRows.filter(t => t.eventId === ev.id) })))
})

eventRoutes.post('/events', requireAdmin, validate('json', createEventSchema), async c => {
  const { db } = c.get('ctx')
  const body = c.req.valid('json')
  const detail = await db.transaction(async tx => {
    const ev = await tx.insert(events).values({
      name: body.name, date: body.date, matCount: body.matCount, matCode: randomMatCode(),
      mode: body.mode ?? 'live',
      contactName: blankToNull(body.contactName), contactPhone: blankToNull(body.contactPhone),
      sameGender: body.sameGender ?? false,
      createdAt: new Date().toISOString(),
    }).returning().get()
    await tx.insert(teams).values(body.teams.map((t, i) => ({ eventId: ev.id, name: t.name, color: t.color, position: i }))).run()
    await tx.insert(mats).values(Array.from({ length: body.matCount }, (_, i) => ({ eventId: ev.id, number: i + 1 }))).run()
    await tx.insert(rulesets).values({ eventId: ev.id, name: 'Default', defaultLengthSec: DEFAULT_LENGTH_SEC, actions: DEFAULT_ACTIONS, terminals: DEFAULT_TERMINALS }).run()
    await recordAudit(tx, {
      eventId: ev.id, actor: 'admin', action: 'create',
      detail: { name: ev.name, date: ev.date, matCount: ev.matCount, mode: ev.mode, teams: body.teams.map(t => t.name) },
    })
    await bumpVersion(tx, ev.id)
    return eventDetail(tx, ev.id)
  })
  return c.json(detail, 201)
})

eventRoutes.get('/events/:eventId', requireAdmin, async c => {
  const detail = await eventDetail(c.get('ctx').db, Number(c.req.param('eventId')))
  if (!detail) return errorJson(c, 404, 'not_found', 'event not found')
  return c.json(detail)
})

eventRoutes.patch('/events/:eventId', requireAdmin, validate('json', patchEventSchema), async c => {
  const { db } = c.get('ctx')
  const eventId = Number(c.req.param('eventId'))
  const ev = await db.select().from(events).where(eq(events.id, eventId)).get()
  if (!ev) return errorJson(c, 404, 'not_found', 'event not found')
  await assertNotCertified(db, eventId)
  const { status, matCount, contactName: name, contactPhone: phone, mode, far, smoothcompUrl, ...rest } = c.req.valid('json')
  const changed: Record<string, unknown> = Object.fromEntries(
    Object.entries(rest).filter(([key, value]) => value !== ev[key as keyof typeof ev]),
  )
  const fields: Partial<typeof events.$inferInsert> = { ...rest }
  if (mode !== undefined) fields.mode = mode
  if (name !== undefined) fields.contactName = blankToNull(name)
  if (phone !== undefined) fields.contactPhone = blankToNull(phone)
  if (far !== undefined) fields.far = far
  if (smoothcompUrl !== undefined) {
    const url = blankToNull(smoothcompUrl ?? '')
    if (url !== null) {
      const parsed = parseSmoothcompUrl(url)
      if (!parsed.ok) return errorJson(c, 422, 'validation', parsed.message)
    }
    fields.smoothcompUrl = url
    if (url !== ev.smoothcompUrl) changed.smoothcompUrl = url
  }
  await db.transaction(async tx => {
    const audit = (action: AuditAction, detail: Record<string, unknown>) => recordAudit(tx, { eventId, actor: 'admin', action, detail })
    if (Object.keys(fields).length > 0) await tx.update(events).set(fields).where(eq(events.id, eventId)).run()
    if (matCount !== undefined && matCount !== ev.matCount) {
      await setMatCount(tx, eventId, matCount)
      await audit('mat_count', { from: ev.matCount, to: matCount })
    }
    if (Object.keys(changed).length > 0) await audit('event_edit', changed)
    if (mode !== undefined && mode !== ev.mode) await audit('mode', { from: ev.mode, to: mode })
    if (name !== undefined || phone !== undefined) await audit('contact', { name: fields.contactName ?? ev.contactName, phone: fields.contactPhone ?? ev.contactPhone })
    if (far !== undefined && far !== ev.far) await audit('far', { far })
    if (mode === 'live' && ev.mode !== 'live' && ev.status === 'live') {
      for (const mat of await tx.select({ id: mats.id }).from(mats).where(eq(mats.eventId, eventId)).all()) await advanceMat(tx, mat.id, 'admin')
    }
    if (status === 'live') {
      await startEvent(tx, eventId)
      await audit('start', { mode: mode ?? ev.mode })
    }
    if (status === 'done') {
      if (ev.status !== 'live') throw new MatchStateError('only a live event can finish')
      await tx.update(events).set({ status: 'done' }).where(eq(events.id, eventId)).run()
      await audit('finish', {})
    }
    await bumpVersion(tx, eventId)
  })
  return c.json(await eventDetail(db, eventId))
})

const deleteEventSchema = z.object({ pin: z.string().optional() })

eventRoutes.delete('/events/:eventId', requireAdmin, validate('json', deleteEventSchema), async c => {
  const { db } = c.get('ctx')
  const eventId = Number(c.req.param('eventId'))
  const ev = await db.select().from(events).where(eq(events.id, eventId)).get()
  if (!ev) return errorJson(c, 404, 'not_found', 'event not found')
  if (ev.status === 'certified') return errorJson(c, 409, 'match_state', 'unlock the results first')
  const { pin } = c.req.valid('json')
  if (ev.status !== 'setup') {
    if (pin === undefined) return errorJson(c, 422, 'pin_required', 'This event has results. Enter the PIN to delete it.')
    const refused = await withPin(c, pin)
    if (refused) return refused
  }
  const athleteCount = await db.select({ n: count() }).from(athletes).where(eq(athletes.eventId, eventId)).get()
  const matchRows = await db.select({ status: matches.status }).from(matches).where(eq(matches.eventId, eventId)).all()
  const results = matchRows.filter(m => m.status === 'done').length
  await db.transaction(async tx => {
    await tx.delete(events).where(eq(events.id, eventId)).run()
    await recordAudit(tx, {
      eventId, actor: 'admin', action: 'delete',
      detail: { name: ev.name, date: ev.date, status: ev.status, athletes: athleteCount?.n ?? 0, matches: matchRows.length, results },
    })
  })
  return c.body(null, 204)
})

eventRoutes.post('/events/:eventId/teams', requireAdmin, validate('json', teamSchema), async c => {
  const { db } = c.get('ctx')
  const eventId = Number(c.req.param('eventId'))
  if (!await db.select({ id: events.id }).from(events).where(eq(events.id, eventId)).get()) return errorJson(c, 404, 'not_found', 'event not found')
  await assertNotCertified(db, eventId)
  const body = c.req.valid('json')
  const rows = await db.select().from(teams).where(eq(teams.eventId, eventId)).orderBy(asc(teams.position)).all()
  if (rows.length >= MAX_TEAMS) return errorJson(c, 422, 'validation', 'an event holds at most eight teams')
  if (rows.some(t => t.color === body.color)) return errorJson(c, 422, 'validation', DUPLICATE_COLOUR)
  const position = rows.reduce((max, t) => Math.max(max, t.position), -1) + 1
  const team = await db.transaction(async tx => {
    const inserted = await tx.insert(teams).values({ eventId, name: body.name, color: body.color, position }).returning().get()
    await recordAudit(tx, { eventId, actor: 'admin', action: 'team_add', detail: { teamId: inserted.id, name: inserted.name, color: inserted.color } })
    await bumpVersion(tx, eventId)
    return inserted
  })
  return c.json(team, 201)
})

eventRoutes.delete('/events/:eventId/teams/:teamId', requireAdmin, async c => {
  const { db } = c.get('ctx')
  const eventId = Number(c.req.param('eventId'))
  const teamId = Number(c.req.param('teamId'))
  const team = await db.select().from(teams).where(eq(teams.id, teamId)).get()
  if (!team || team.eventId !== eventId) return errorJson(c, 404, 'not_found', 'team not found')
  await assertNotCertified(db, eventId)
  const rows = await db.select({ id: teams.id }).from(teams).where(eq(teams.eventId, eventId)).all()
  if (rows.length <= MIN_TEAMS) return errorJson(c, 422, 'validation', 'an event needs at least two teams')
  if (await db.select({ id: athletes.id }).from(athletes).where(eq(athletes.teamId, teamId)).get()) {
    return errorJson(c, 409, 'team_in_use', 'the team has competitors on it; move them first')
  }
  await db.transaction(async tx => {
    await tx.delete(teams).where(eq(teams.id, teamId)).run()
    await recordAudit(tx, { eventId, actor: 'admin', action: 'team_remove', detail: { teamId, name: team.name, color: team.color } })
    await bumpVersion(tx, eventId)
  })
  return c.body(null, 204)
})

eventRoutes.patch('/events/:eventId/teams/:teamId', requireAdmin, validate('json', teamSchema.partial()), async c => {
  const { db } = c.get('ctx')
  const eventId = Number(c.req.param('eventId'))
  const teamId = Number(c.req.param('teamId'))
  const team = await db.select().from(teams).where(eq(teams.id, teamId)).get()
  if (!team || team.eventId !== eventId) return errorJson(c, 404, 'not_found', 'team not found')
  await assertNotCertified(db, eventId)
  const fields = c.req.valid('json')
  if (fields.color !== undefined) {
    const taken = await db.select({ id: teams.id }).from(teams)
      .where(and(eq(teams.eventId, eventId), eq(teams.color, fields.color), ne(teams.id, teamId))).get()
    if (taken) return errorJson(c, 422, 'validation', DUPLICATE_COLOUR)
  }
  await db.transaction(async tx => {
    if (Object.keys(fields).length > 0) await tx.update(teams).set(fields).where(eq(teams.id, teamId)).run()
    await recordAudit(tx, {
      eventId, actor: 'admin', action: 'team_edit',
      detail: { teamId, before: { name: team.name, color: team.color }, after: { name: fields.name ?? team.name, color: fields.color ?? team.color } },
    })
    await bumpVersion(tx, eventId)
  })
  return c.json(await eventDetail(db, eventId))
})

const pinBody = z.object({ pin: z.string() })
const unlockBody = pinBody.extend({ reason: z.string().trim().min(1).max(CORRECTION_REASON_MAX) })

async function withPin(c: Context<Env>, pin: string): Promise<Response | null> {
  const ctx = c.get('ctx')
  const ip = clientIp(c)
  const limit = await checkLimit(ctx.db, 'certify', ip, Date.now())
  if (!limit.allowed) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterSec / 60))
    return errorJson(c, 429, 'rate_limited', `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`)
  }
  if (pinMatches(pin, ctx.adminPin)) return null
  await recordFailure(ctx.db, 'certify', ip, Date.now())
  return errorJson(c, 401, 'bad_pin', 'wrong PIN')
}

eventRoutes.post('/events/:eventId/certify', requireAdmin, validate('json', pinBody), async c => {
  const { db } = c.get('ctx')
  const eventId = Number(c.req.param('eventId'))
  const ev = await db.select().from(events).where(eq(events.id, eventId)).get()
  if (!ev) return errorJson(c, 404, 'not_found', 'event not found')
  const refused = await withPin(c, c.req.valid('json').pin)
  if (refused) return refused
  if (ev.status !== 'done') return errorJson(c, 409, 'match_state', 'only a finished event can be certified')
  const at = new Date().toISOString()
  await db.transaction(async tx => {
    await tx.update(events).set({ status: 'certified', certifiedAt: at }).where(eq(events.id, eventId)).run()
    await recordAudit(tx, { eventId, actor: 'admin', action: 'certify', detail: { certifiedAt: at }, at })
    await bumpVersion(tx, eventId)
  })
  return c.json(await eventDetail(db, eventId))
})

eventRoutes.post('/events/:eventId/uncertify', requireAdmin, validate('json', unlockBody), async c => {
  const { db } = c.get('ctx')
  const eventId = Number(c.req.param('eventId'))
  const ev = await db.select().from(events).where(eq(events.id, eventId)).get()
  if (!ev) return errorJson(c, 404, 'not_found', 'event not found')
  const body = c.req.valid('json')
  const refused = await withPin(c, body.pin)
  if (refused) return refused
  if (ev.status !== 'certified') return errorJson(c, 409, 'match_state', 'only a certified event can be unlocked')
  await db.transaction(async tx => {
    await tx.update(events).set({ status: 'done', certifiedAt: null }).where(eq(events.id, eventId)).run()
    await recordAudit(tx, { eventId, actor: 'admin', action: 'uncertify', detail: { reason: body.reason, certifiedAt: ev.certifiedAt } })
    await bumpVersion(tx, eventId)
  })
  return c.json(await eventDetail(db, eventId))
})

eventRoutes.get('/events/:eventId/history', requireAdmin, async c => {
  const { db } = c.get('ctx')
  const rows = await db.select({
    id: auditLog.id, at: auditLog.at, actor: auditLog.actor, action: auditLog.action, detail: auditLog.detail,
  }).from(auditLog).where(and(
    eq(auditLog.eventId, Number(c.req.param('eventId'))),
    isNull(auditLog.matchId),
  )).orderBy(desc(auditLog.id)).limit(HISTORY_LIMIT).all()
  const body: AuditEntry[] = rows.reverse()
  return c.json(body)
})

eventRoutes.get('/events/:eventId/connect', requireAdmin, async c => {
  const ctx = c.get('ctx')
  const ev = await ctx.db.select().from(events).where(eq(events.id, Number(c.req.param('eventId')))).get()
  if (!ev) return errorJson(c, 404, 'not_found', 'event not found')
  return c.json({ url: ctx.publicUrl ?? `http://${lanIp()}:${ctx.port}`, matCode: ev.matCode })
})
