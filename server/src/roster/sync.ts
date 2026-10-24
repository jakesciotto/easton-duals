import { asc, eq } from 'drizzle-orm'
import type { DbLike } from '../db/client.js'
import { athletes, rosterCandidates, type AthleteRow } from '../db/schema.js'
import { buildCandidates } from './join.js'
import { fullName, linkUpdate } from './link.js'
import { exactName, nameScore, nameTokens, SUGGEST_FLOOR, SUGGEST_MARGIN } from '../shared/similarity.js'
import { recordAudit } from '../audit/log.js'
import { bumpVersion } from '../match/events.js'
import type { LeaderboardCompetitor, WlBeltRecord, WlNameFilter } from './types.js'
import type { SyncChanges, SyncReport, SyncSuggestion } from '../shared/types.js'

type AthleteUpdate = Partial<typeof athletes.$inferInsert>
type ProfileFields = Partial<Pick<AthleteRow, 'belt' | 'erp' | 'age' | 'weightLbs' | 'gender' | 'wlLocation' | 'promotedAt'>>

const PROFILE_FIELDS = ['belt', 'erp', 'age', 'weightLbs', 'gender', 'wlLocation', 'promotedAt'] as const

export function profileChanges(before: ProfileFields, after: ProfileFields): SyncChanges {
  const changes: SyncChanges = {}
  for (const field of PROFILE_FIELDS) {
    const to = after[field]
    if (to === undefined) continue
    const from = before[field] ?? null
    if (from !== to) changes[field] = { from, to }
  }
  return changes
}

export interface SyncMeta { locations: number; warnings: number }

export function rosterFilter(rows: { wlUid: string | null; lastName: string }[]): WlNameFilter {
  const uids = new Set<string>()
  const lastTokens = new Set<string>()
  for (const row of rows) {
    if (row.wlUid !== null) uids.add(row.wlUid)
    for (const token of nameTokens(row.lastName)) lastTokens.add(token)
  }
  return { uids: [...uids], lastTokens: [...lastTokens], firstTokens: [] }
}

export const POOL_INSERT_ROWS = 500

function chunks<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

export async function syncRoster(
  db: DbLike,
  eventId: number,
  records: WlBeltRecord[] | null,
  competitors: LeaderboardCompetitor[],
  meta: SyncMeta = { locations: 0, warnings: 0 },
): Promise<SyncReport> {
  if (records !== null) {
    const built = buildCandidates(records, competitors)
    await db.delete(rosterCandidates).where(eq(rosterCandidates.eventId, eventId)).run()
    for (const slice of chunks(built.map(cand => ({ eventId, ...cand })), POOL_INSERT_ROWS)) {
      await db.insert(rosterCandidates).values(slice).run()
    }
  }
  const pool = await db.select().from(rosterCandidates).where(eq(rosterCandidates.eventId, eventId)).all()
  const roster = await db.select().from(athletes).where(eq(athletes.eventId, eventId))
    .orderBy(asc(athletes.lastName), asc(athletes.firstName)).all()

  const poolByUid = new Map(pool.map(cand => [cand.wlUid, cand]))
  const claimed = new Set(roster.filter(a => a.wlUid !== null).map(a => a.wlUid as string))

  const linked: string[] = []
  const changed: string[] = []
  const suggested: SyncSuggestion[] = []
  const ambiguous: string[] = []
  const unmatched: string[] = []
  const gone: string[] = []
  let refreshed = 0
  let wrote = 0

  const looked = records !== null

  const at = new Date().toISOString()
  const write = async (id: number, update: AthleteUpdate, { stamp = true } = {}) => {
    await db.update(athletes).set(stamp ? { ...update, syncedAt: at } : update).where(eq(athletes.id, id)).run()
    wrote += 1
  }

  for (const athlete of roster) {
    const name = fullName(athlete)

    if (athlete.wlUid !== null) {
      const cand = poolByUid.get(athlete.wlUid)
      if (!cand) {
        gone.push(name)
        await write(athlete.id, { syncChanges: { pool: { from: 'present', to: 'missing' } } })
        continue
      }
      const update = linkUpdate(athlete, cand)
      const diff = profileChanges(athlete, update)
      await write(athlete.id, { ...update, syncChanges: diff })
      refreshed += 1
      if (Object.keys(diff).length > 0) changed.push(name)
      continue
    }

    const exact = pool.filter(cand => !claimed.has(cand.wlUid) && exactName(athlete, cand))
    if (exact.length === 1) {
      const cand = exact[0]
      const update = linkUpdate(athlete, cand)
      await write(athlete.id, { ...update, syncChanges: profileChanges(athlete, update), suggestedWlUid: null, suggestedScore: null })
      claimed.add(cand.wlUid)
      linked.push(name)
      continue
    }
    if (exact.length >= 2) {
      ambiguous.push(name)
      continue
    }

    const dismissed = new Set(athlete.dismissedWlUids)
    const scored = pool
      .filter(cand => !claimed.has(cand.wlUid) && !dismissed.has(cand.wlUid))
      .map(cand => ({ cand, score: nameScore(athlete, cand) }))
      .sort((x, y) => y.score - x.score)
    const [best, next] = scored
    const clear = best === undefined || best.score < SUGGEST_FLOOR || (next !== undefined && best.score - next.score < SUGGEST_MARGIN)

    if (clear) {
      unmatched.push(name)
      const asked = looked && nameTokens(athlete.lastName).length > 0
      const update: AthleteUpdate = asked ? { syncChanges: {} } : {}
      if (athlete.suggestedWlUid !== null) {
        update.suggestedWlUid = null
        update.suggestedScore = null
      }
      if (Object.keys(update).length > 0) await write(athlete.id, update, { stamp: asked })
      continue
    }
    suggested.push({ athleteId: athlete.id, name, candidate: fullName(best.cand), location: best.cand.wlLocation ?? '', score: best.score })
    if (athlete.suggestedWlUid !== best.cand.wlUid || athlete.suggestedScore !== best.score) {
      await write(athlete.id, { suggestedWlUid: best.cand.wlUid, suggestedScore: best.score })
    }
  }

  if (records !== null || wrote > 0) {
    await recordAudit(db, {
      eventId, actor: 'admin', action: 'roster_sync',
      detail: {
        locations: meta.locations, candidates: pool.length, warnings: meta.warnings,
        linked: linked.length, refreshed, changed: changed.length,
        suggested: suggested.length, ambiguous: ambiguous.length, unmatched: unmatched.length, gone: gone.length,
        names: { suggested: suggested.map(s => s.name), ambiguous, unmatched, gone },
      },
    })
  }
  if (wrote > 0) await bumpVersion(db, eventId)

  return { linked, refreshed, changed, suggested, ambiguous, unmatched, gone }
}
