import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm'
import type { DbLike } from '../db/client.js'
import { events, mats, matches, matchEvents, type MatchRow, type MatRow } from '../db/schema.js'
import { loadMatch, recompute, MatchStateError } from './events.js'
import { assertDependentsPending, clearDependents } from './fill.js'
import { recordAudit } from '../audit/log.js'
import type { AuditActor } from '../shared/types.js'

async function loadMat(db: DbLike, matId: number): Promise<MatRow> {
  const row = await db.select().from(mats).where(eq(mats.id, matId)).get()
  if (!row) throw new MatchStateError('mat not found')
  return row
}

async function liveAthleteIds(db: DbLike, eventId: number): Promise<Set<number>> {
  const rows = await db.select({ a: matches.athleteAId, b: matches.athleteBId }).from(matches)
    .where(and(eq(matches.eventId, eventId), eq(matches.status, 'live'))).all()
  return new Set(rows.flatMap(m => [m.a, m.b]).filter((id): id is number => id !== null))
}

const runnable = (m: MatchRow, live: Set<number>) =>
  m.athleteAId !== null && m.athleteBId !== null && !live.has(m.athleteAId) && !live.has(m.athleteBId)

async function hasScoringEvents(db: DbLike, matchId: number): Promise<boolean> {
  return await db.select({ id: matchEvents.id }).from(matchEvents)
    .where(and(eq(matchEvents.matchId, matchId), ne(matchEvents.type, 'admin'), ne(matchEvents.type, 'end'))).get() !== undefined
}

function adminEventId(matchId: number, seq: number): string {
  return `admin:${matchId}:${seq}`
}

function clientAdminEventId(id: string): string {
  return `admin:${id}`
}

export interface AdminWriteResult { duplicate: boolean; match: MatchRow }

async function replayedAdmin(db: DbLike, id: string | undefined): Promise<AdminWriteResult | null> {
  if (id === undefined) return null
  const row = await db.select({ matchId: matchEvents.matchId }).from(matchEvents).where(eq(matchEvents.id, clientAdminEventId(id))).get()
  return row ? { duplicate: true, match: await loadMatch(db, row.matchId) } : null
}

export async function startEvent(db: DbLike, eventId: number): Promise<void> {
  await db.transaction(async tx => {
    const ev = await tx.select().from(events).where(eq(events.id, eventId)).get()
    if (!ev) throw new MatchStateError('event not found')
    if (ev.status !== 'setup') throw new MatchStateError(`event is ${ev.status}`)
    await tx.update(events).set({ status: 'live' }).where(eq(events.id, eventId)).run()
    if (ev.mode !== 'live') return
    for (const mat of await tx.select().from(mats).where(eq(mats.eventId, eventId)).all()) await advanceMat(tx, mat.id, 'system')
  })
}

export async function advanceMat(db: DbLike, matId: number, actor: AuditActor): Promise<MatchRow | null> {
  return db.transaction(async tx => {
    const mat = await loadMat(tx, matId)
    const ev = await tx.select().from(events).where(eq(events.id, mat.eventId)).get()
    if (!ev || ev.status !== 'live') return null
    const current = mat.currentMatchId === null
      ? undefined
      : await tx.select().from(matches).where(eq(matches.id, mat.currentMatchId)).get()
    if (ev.mode !== 'live') {
      if (mat.currentMatchId !== null && current?.status !== 'live') {
        await tx.update(mats).set({ currentMatchId: null }).where(eq(mats.id, matId)).run()
      }
      return null
    }
    if (current && current.status === 'live') return current
    const queue = await tx.select().from(matches)
      .where(and(eq(matches.matId, matId), eq(matches.status, 'pending')))
      .orderBy(asc(matches.orderIndex), asc(matches.id)).all()
    const live = await liveAthleteIds(tx, mat.eventId)
    const next = queue.find(m => runnable(m, live))
    if (!next) {
      await tx.update(mats).set({ currentMatchId: null }).where(eq(mats.id, matId)).run()
      return null
    }
    await tx.update(matches).set({ status: 'live' }).where(eq(matches.id, next.id)).run()
    await tx.update(mats).set({ currentMatchId: next.id }).where(eq(mats.id, matId)).run()
    await recordAudit(tx, { eventId: mat.eventId, matchId: next.id, actor, action: 'advance', detail: { matId, matNumber: mat.number } })
    return loadMatch(tx, next.id)
  })
}

export async function releaseIdleMats(db: DbLike, eventId: number, actor: AuditActor): Promise<void> {
  const idle = await db.select({ id: mats.id }).from(mats)
    .where(and(eq(mats.eventId, eventId), isNull(mats.currentMatchId))).all()
  for (const mat of idle) await advanceMat(db, mat.id, actor)
}

export async function reopenMatch(db: DbLike, matchId: number): Promise<MatchRow> {
  return db.transaction(async tx => {
    const match = await loadMatch(tx, matchId)
    const ev = await tx.select({ status: events.status }).from(events).where(eq(events.id, match.eventId)).get()
    if (!ev) throw new MatchStateError('event not found')
    if (ev.status === 'setup') throw new MatchStateError('start the event before reopening a match')
    if (match.status !== 'done') throw new MatchStateError('only a done match can be reopened')
    await assertDependentsPending(tx, match.id)
    if (match.matId !== null) {
      const mat = await loadMat(tx, match.matId)
      if (mat.currentMatchId !== null && mat.currentMatchId !== match.id) {
        const current = await loadMatch(tx, mat.currentMatchId)
        if (current.status === 'live') {
          if (await hasScoringEvents(tx, current.id)) throw new MatchStateError('the next match on this mat already started; edit the result instead')
          await tx.update(matches).set({ status: 'pending' }).where(eq(matches.id, current.id)).run()
        }
      }
      await tx.update(mats).set({ currentMatchId: match.id }).where(eq(mats.id, mat.id)).run()
    }
    const seq = match.lastSeq + 1
    await tx.insert(matchEvents).values({ id: adminEventId(match.id, seq), matchId: match.id, seq, type: 'admin', payload: { kind: 'reopen' }, at: new Date().toISOString() }).run()
    await clearDependents(tx, match.id)
    return recompute(tx, match.id)
  })
}

export async function skipMatch(db: DbLike, matchId: number, id?: string): Promise<AdminWriteResult> {
  return db.transaction(async tx => {
    const replay = await replayedAdmin(tx, id)
    if (replay) return replay
    const match = await loadMatch(tx, matchId)
    if (match.status === 'done') throw new MatchStateError('cannot skip a done match')
    if (await hasScoringEvents(tx, match.id)) throw new MatchStateError('match has events; undo them before skipping. End it from the Live tab, then edit the result.')
    const max = await tx.select({ m: sql<number>`coalesce(max(${matches.orderIndex}), 0)` }).from(matches).where(eq(matches.eventId, match.eventId)).get()
    const seq = match.lastSeq + 1
    await tx.insert(matchEvents).values({ id: id === undefined ? adminEventId(match.id, seq) : clientAdminEventId(id), matchId: match.id, seq, type: 'admin', payload: { kind: 'skip' }, at: new Date().toISOString() }).run()
    await tx.update(matches).set({ status: 'pending', orderIndex: (max?.m ?? 0) + 1, lastSeq: seq }).where(eq(matches.id, match.id)).run()
    if (match.matId !== null) {
      const mat = await loadMat(tx, match.matId)
      if (mat.currentMatchId === match.id) await advanceMat(tx, mat.id, 'admin')
    }
    await releaseIdleMats(tx, match.eventId, 'admin')
    return { duplicate: false, match: await loadMatch(tx, match.id) }
  })
}
