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
  /** Null only with a feed on that side: a bracket slot waiting on its feeder. */
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
  /**
   * Runs inside the insert's own transaction, before anything is written. A string is a
   * refusal: nothing is written and the caller gets a match_state result. It belongs
   * inside the transaction so two callers racing over the same kid cannot both pass it.
   */
  guard?: (tx: DbLike) => Promise<string | null>
  /** Runs inside the same transaction, after the insert. */
  also?: (tx: DbLike, match: MatchRow) => Promise<void>
}

// Thrown by the guard to roll the transaction back, caught at the edge of this module.
class GuardRefused extends Error {}

/**
 * Which kid goes on which side. A pair a person or the proposer chose reads in team
 * order, whichever way round the console sent it. A generated pair is left as the format
 * put it: the slot order is the bracket, and a round one pair the generator could not
 * split is a same team pair the division has already warned about, which resolvePair
 * would refuse outright.
 */
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

/** A feed names a match this event already holds, or the row would point at nothing. */
async function feedsOnEvent(db: DbLike, eventId: number, input: CreateMatchInput): Promise<boolean> {
  const ids = [input.feedA, input.feedB].flatMap(f => f ? [f.matchId] : [])
  if (ids.length === 0) return true
  const found = await db.select({ id: matches.id }).from(matches)
    .where(and(eq(matches.eventId, eventId), inArray(matches.id, ids))).all()
  return found.length === new Set(ids).size
}

/**
 * The one path a match comes into being on. The Add match dialog, a confirmed proposal and
 * a division's generator all run it, so the side check, the least loaded mat, the stable
 * number, the next order slot, the ruleset's length and the match_create row are written
 * in one place rather than three.
 *
 * `also` runs inside the same transaction as the insert, which is how a confirm deletes
 * its proposal with no moment where the draft and the match both exist.
 */
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
      // An idle mat has nothing to advance it, so on a live event scored on the mats the
      // new match starts there. advanceMat is a no-op in setup, in desk mode, and on a mat
      // that already has a live match.
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
