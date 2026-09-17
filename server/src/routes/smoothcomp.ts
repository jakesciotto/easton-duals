import { Hono } from 'hono'
import { asc, eq } from 'drizzle-orm'
import type { Env } from '../context.js'
import { athletes, events, teams } from '../db/schema.js'
import { errorJson, requireAdmin } from '../auth/middleware.js'
import { recordAudit } from '../audit/log.js'
import { parseSmoothcompUrl } from '../smoothcomp/url.js'
import { SmoothcompError, SmoothcompTimeout } from '../smoothcomp/client.js'
import { fetchEventMatches } from '../smoothcomp/brackets.js'
import { computeStandings } from '../smoothcomp/standings.js'
import type { TeamColor } from '../shared/types.js'

const DEFAULTS = { concurrency: 4, deadlineMs: 240_000, backoffMs: 1000 }

export const smoothcompRoutes = new Hono<Env>()

// Reads Smoothcomp and writes only the audit row: the report is not stored, and the
// version is not bumped.
smoothcompRoutes.post('/events/:eventId/smoothcomp/standings', requireAdmin, async c => {
  const { db, smoothcomp } = c.get('ctx')
  const eventId = Number(c.req.param('eventId'))
  const ev = await db.select().from(events).where(eq(events.id, eventId)).get()
  if (!ev) return errorJson(c, 404, 'not_found', 'event not found')
  if (ev.smoothcompUrl === null) return errorJson(c, 422, 'validation', 'Save a Smoothcomp URL on the event first')
  const target = parseSmoothcompUrl(ev.smoothcompUrl)
  if (!target.ok) return errorJson(c, 422, 'validation', target.message)
  const teamRows = await db.select().from(teams).where(eq(teams.eventId, eventId)).orderBy(asc(teams.position)).all()
  const kids = await db.select().from(athletes).where(eq(athletes.eventId, eventId)).all()
  if (!kids.some(k => k.teamId !== null)) return errorJson(c, 422, 'validation', 'Paste a roster first')
  const cfg = { ...DEFAULTS, ...smoothcomp }
  let pulled
  try {
    pulled = await fetchEventMatches(target, { fetchFn: cfg.fetchFn, concurrency: cfg.concurrency, backoffMs: cfg.backoffMs, deadlineAt: Date.now() + cfg.deadlineMs })
  } catch (err) {
    if (err instanceof SmoothcompTimeout) return errorJson(c, 504, 'smoothcomp_timeout', err.message)
    if (err instanceof SmoothcompError) return errorJson(c, 502, 'smoothcomp', err.message)
    throw err
  }
  const report = computeStandings({
    teams: teamRows.map(t => ({ id: t.id, name: t.name, color: t.color as TeamColor, position: t.position })),
    kids: kids.map(k => ({ id: k.id, firstName: k.firstName, lastName: k.lastName, teamId: k.teamId, scoring: k.scoring })),
    matches: pulled.matches, brackets: pulled.brackets, url: ev.smoothcompUrl, fetchedAt: new Date().toISOString(),
  })
  await recordAudit(db, {
    eventId, actor: 'admin', action: 'smoothcomp_standings',
    detail: { url: report.url, brackets: report.brackets, matches: report.matches, teams: report.teams.map(t => ({ teamId: t.teamId, rank: t.rank, teamPoints: t.teamPoints })) },
  })
  return c.json(report)
})
