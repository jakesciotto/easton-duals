import type { Feed, FeedTake, MatchSide, MatchView, Snapshot } from '@shared/types'
import { athleteName } from './format'
import type { EventDetail, MatchRow } from './types'

/** The sides of a row that hold a competitor. A bracket side waiting on a feeder holds none. */
export function matchAthleteIds(row: Pick<MatchRow, 'athleteAId' | 'athleteBId'>): number[] {
  return [row.athleteAId, row.athleteBId].filter((id): id is number => id !== null)
}

/** "Winner of M7" or "Loser of M7", which is all an empty side has to print. */
export function feedLabel(take: FeedTake, matchNumber: number): string {
  return `${take === 'winner' ? 'Winner' : 'Loser'} of M${matchNumber}`
}

/**
 * The feeder one side of a row waits on, or null on a side that holds a competitor.
 *
 * A row carries the feeder's id and every surface prints its number, so the caller hands
 * over the lookup. One it cannot resolve answers null and the side falls back to the
 * unknown competitor rather than naming a match nobody can find.
 */
export function feedOf(row: MatchRow, side: 'a' | 'b', numberOf: (matchId: number) => number | null): Feed | null {
  const matchId = side === 'a' ? row.feedAMatchId : row.feedBMatchId
  const take = side === 'a' ? row.feedATake : row.feedBTake
  if (matchId === null || take === null) return null
  const matchNumber = numberOf(matchId)
  return matchNumber === null ? null : { matchId, matchNumber, take }
}

/**
 * The one dialog that corrects a result takes a MatchView, and two of the three screens
 * that reach it hold MatchRows, because the event detail is what the operator edits and
 * the snapshot is what the event is doing.
 *
 * The snapshot's own row is preferred wherever there is one: it carries the live score
 * and the server's endedAt. The row is the fallback for the moments before the first
 * snapshot lands, so the control never has to be disabled on a screen that already has
 * everything it needs to state what is being corrected.
 */
export function matchViewOf(row: MatchRow, detail: EventDetail, snapshot: Snapshot | null): MatchView {
  const live = snapshot?.matches.find(m => m.id === row.id)
  if (live) return live
  const numberOf = (matchId: number) => detail.matches.find(m => m.id === matchId)?.number ?? null
  const side = (athleteId: number | null, score: number, feed: Feed | null): MatchSide => {
    const kid = athleteId === null ? undefined : detail.athletes.find(a => a.id === athleteId)
    return {
      athleteId,
      name: kid ? athleteName(kid) : feed && athleteId === null ? feedLabel(feed.take, feed.matchNumber) : 'Unknown',
      teamId: kid?.teamId ?? null,
      belt: kid?.belt ?? null,
      weightLbs: kid?.weightLbs ?? null,
      score,
      feed,
    }
  }
  return {
    id: row.id,
    number: row.number,
    orderIndex: row.orderIndex,
    matId: row.matId,
    status: row.status,
    rulesetId: row.rulesetId,
    lengthSec: row.lengthSec,
    why: row.why,
    source: row.source,
    style: row.style,
    divisionId: row.divisionId,
    round: row.round,
    a: side(row.athleteAId, row.pointsA, feedOf(row, 'a', numberOf)),
    b: side(row.athleteBId, row.pointsB, feedOf(row, 'b', numberOf)),
    clock: { elapsedMs: row.clockElapsedMs, startedAt: row.clockStartedAt, lengthMs: row.lengthSec * 1000 },
    result: row.winnerAthleteId === null || row.winType === null
      ? null
      : { winnerAthleteId: row.winnerAthleteId, winType: row.winType },
    pendingTerminal: null,
    endedAt: row.endedAt ?? null,
    lastSeq: row.lastSeq,
  }
}
