import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { DbLike } from '../db/client.js'
import { rulesets, mats, matches, type MatchRow } from '../db/schema.js'
import { resolvePair, checkSides, leastLoadedMat } from './pairs.js'
import { advanceMat } from './mats.js'
import { bumpVersion } from './events.js'
import { recordAudit } from '../audit/log.js'
import type { FeedTake, MatchSource, Style } from '../shared/types.js'

export interface CreateMatchInput {
  eventId: number
  athleteAId: number | null
  athleteBId: number | null
  feedA?: { matchId: number; take: FeedTake } | null
  feedB?: { matchId: number; take: FeedTake } | null
  style?: Style
  divisionId?: number | null
  round?: number | null
  why?: string | null
  rulesetId?: number
  lengthSec?: number
  matId?: number | null
  source: MatchSource
}

export type CreateMatchResult =
  | { ok: true; match: MatchRow }
  | { ok: false; code: 'validation' | 'match_state'; message: string }

export interface CreateMatchHooks {
  guard?: (tx: DbLike) => Promise<string | null>
  also?: (tx: DbLike, match: MatchRow) => Promise<void>
}

class GuardRefused extends Error {}

async function sidesFor(db: DbLike, input: CreateMatchInput): Promise<{ a: number | null; b: number | null } | string> {
  const { eventId, athleteAId, athleteBId } = input
  if (athleteAId === null && !input.feedA) return 'a side needs a kid or a feed'
  if (athleteBId === null && !input.feedB) return 'a side needs a kid or a feed'
  if (athleteAId !== null && athleteBId !== null && input.source !== 'generated') {
    return resolvePair(db, eventId, athleteAId, athleteBId)
  }
  const ids = [athleteAId, athleteBId].filter((id): id is number => id !== null)
  return await checkSides(db, eventId, ids) ?? { a: athleteAId, b: athleteBId }
}

async function feedsOnEvent(db: DbLike, eventId: number, input: CreateMatchInput): Promise<boolean> {
  const ids = [input.feedA, input.feedB].flatMap(f => f ? [f.matchId] : [])
  if (ids.length === 0) return true
  const found = await db.select({ id: matches.id }).from(matches)
    .where(and(eq(matches.eventId, eventId), inArray(matches.id, ids))).all()
  return found.length === new Set(ids).size
}

export async function createMatch(
  db: DbLike,
  input: CreateMatchInput,
  hooks: CreateMatchHooks = {},
): Promise<CreateMatchResult> {
  const { eventId } = input
  const pair = await sidesFor(db, input)
  if (typeof pair === 'string') return { ok: false, code: 'validation', message: pair }
  if (!await feedsOnEvent(db, eventId, input)) return { ok: false, code: 'validation', message: 'a feed must name a match on this event' }
  const ruleset = input.rulesetId !== undefined
    ? await db.select().from(rulesets).where(and(eq(rulesets.id, input.rulesetId), eq(rulesets.eventId, eventId))).get()
    : await db.select().from(rulesets).where(eq(rulesets.eventId, eventId)).orderBy(asc(rulesets.id)).get()
  if (!ruleset) return { ok: false, code: 'validation', message: 'ruleset is not on this event' }
  if (input.matId !== undefined && input.matId !== null
    && !await db.select({ id: mats.id }).from(mats).where(and(eq(mats.id, input.matId), eq(mats.eventId, eventId))).get()) {
    return { ok: false, code: 'validation', message: 'mat is not on this event' }
  }
  const matId = input.matId === undefined ? await leastLoadedMat(db, eventId) : input.matId
  try {
    const match = await db.transaction(async tx => {
      const refusal = await hooks.guard?.(tx)
      if (refusal) throw new GuardRefused(refusal)
      const max = await tx.select({
        order: sql<number>`coalesce(max(${matches.orderIndex}), -1)`,
        number: sql<number>`coalesce(max(${matches.number}), 0)`,
      }).from(matches).where(eq(matches.eventId, eventId)).get()
      const inserted = await tx.insert(matches).values({
        eventId, athleteAId: pair.a, athleteBId: pair.b, rulesetId: ruleset.id,
        lengthSec: input.lengthSec ?? ruleset.defaultLengthSec,
        matId,
        number: (max?.number ?? 0) + 1,
        orderIndex: (max?.order ?? -1) + 1,
        feedAMatchId: input.feedA?.matchId ?? null,
        feedATake: input.feedA?.take ?? null,
        feedBMatchId: input.feedB?.matchId ?? null,
        feedBTake: input.feedB?.take ?? null,
        style: input.style ?? 'gi',
        divisionId: input.divisionId ?? null,
        round: input.round ?? null,
        why: input.why ?? null,
        source: input.source,
      }).returning().get()
      if (matId !== null) await advanceMat(tx, matId, 'admin')
      await recordAudit(tx, {
        eventId, matchId: inserted.id, actor: 'admin', action: 'match_create',
        detail: {
          number: inserted.number, style: inserted.style,
          athleteAId: inserted.athleteAId, athleteBId: inserted.athleteBId,
          matId: inserted.matId, orderIndex: inserted.orderIndex, source: inserted.source,
        },
      })
      await hooks.also?.(tx, inserted)
      await bumpVersion(tx, eventId)
      return inserted
    })
    return { ok: true, match }
  } catch (err) {
    if (err instanceof GuardRefused) return { ok: false, code: 'match_state', message: err.message }
    throw err
  }
}
