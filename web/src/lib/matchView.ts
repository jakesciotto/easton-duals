import type { Feed, FeedTake, MatchSide, MatchView, Snapshot } from '@shared/types'
import { athleteName } from './format'
import type { EventDetail, MatchRow } from './types'

export function matchAthleteIds(row: Pick<MatchRow, 'athleteAId' | 'athleteBId'>): number[] {
  return [row.athleteAId, row.athleteBId].filter((id): id is number => id !== null)
}

export function feedLabel(take: FeedTake, matchNumber: number): string {
  return `${take === 'winner' ? 'Winner' : 'Loser'} of M${matchNumber}`
}

export function feedOf(row: MatchRow, side: 'a' | 'b', numberOf: (matchId: number) => number | null): Feed | null {
  const matchId = side === 'a' ? row.feedAMatchId : row.feedBMatchId
  const take = side === 'a' ? row.feedATake : row.feedBTake
  if (matchId === null || take === null) return null
  const matchNumber = numberOf(matchId)
  return matchNumber === null ? null : { matchId, matchNumber, take }
}

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
