import { asc, eq, or } from 'drizzle-orm'
import type { DbLike } from '../db/client.js'
import { matches, type MatchRow } from '../db/schema.js'
import { MatchStateError } from './events.js'
import { releaseIdleMats } from './mats.js'
import { recordAudit } from '../audit/log.js'
import type { AuditActor } from '../shared/types.js'

const SIDES = ['a', 'b'] as const
type Side = typeof SIDES[number]

const feedOf = (m: MatchRow, side: Side) => side === 'a'
  ? { matchId: m.feedAMatchId, take: m.feedATake }
  : { matchId: m.feedBMatchId, take: m.feedBTake }

const sideColumn = (side: Side) => side === 'a' ? 'athleteAId' as const : 'athleteBId' as const

/** The matches whose empty sides this one fills, in the order a person reads them. */
export async function dependentsOf(db: DbLike, matchId: number): Promise<MatchRow[]> {
  return db.select().from(matches)
    .where(or(eq(matches.feedAMatchId, matchId), eq(matches.feedBMatchId, matchId)))
    .orderBy(asc(matches.number)).all()
}

/**
 * Nothing downstream may have acted on this result yet. A dependent that is live or done
 * has a kid on a mat or a score in the record, and rewriting the side it came in on would
 * make the sheet describe a match that never happened.
 */
export async function assertDependentsPending(db: DbLike, matchId: number): Promise<void> {
  const ran = (await dependentsOf(db, matchId)).find(m => m.status !== 'pending')
  if (ran) throw new MatchStateError(`M${ran.number} already ran on this result`)
}

/**
 * Writes this match's winner and loser into the sides that wait on them, inside the same
 * transaction that ended it, then gives every idle mat a chance to start what is now
 * runnable. One audit row per feeder end, naming every side it filled.
 */
export async function fillDependents(db: DbLike, match: MatchRow, actor: AuditActor): Promise<void> {
  const winner = match.winnerAthleteId
  const filled: { matchId: number; side: Side; athleteId: number }[] = []
  if (winner !== null && match.athleteAId !== null && match.athleteBId !== null) {
    const loser = winner === match.athleteAId ? match.athleteBId : match.athleteAId
    for (const dependent of await dependentsOf(db, match.id)) {
      if (dependent.status !== 'pending') continue
      const update: Partial<typeof matches.$inferInsert> = {}
      for (const side of SIDES) {
        const feed = feedOf(dependent, side)
        if (feed.matchId !== match.id || feed.take === null) continue
        const athleteId = feed.take === 'winner' ? winner : loser
        update[sideColumn(side)] = athleteId
        filled.push({ matchId: dependent.id, side, athleteId })
      }
      if (Object.keys(update).length > 0) await db.update(matches).set(update).where(eq(matches.id, dependent.id)).run()
    }
  }
  if (filled.length > 0) {
    await recordAudit(db, {
      eventId: match.eventId, matchId: match.id, actor, action: 'fill',
      detail: { fromMatchId: match.id, filled },
    })
  }
  await releaseIdleMats(db, match.eventId, actor)
}

/**
 * Empties the sides this match filled. A reopened feeder has no result to hand on, and
 * the next end fills them again.
 */
export async function clearDependents(db: DbLike, matchId: number): Promise<void> {
  for (const dependent of await dependentsOf(db, matchId)) {
    const update: Partial<typeof matches.$inferInsert> = {}
    for (const side of SIDES) {
      if (feedOf(dependent, side).matchId === matchId) update[sideColumn(side)] = null
    }
    if (Object.keys(update).length > 0) await db.update(matches).set(update).where(eq(matches.id, dependent.id)).run()
  }
}
