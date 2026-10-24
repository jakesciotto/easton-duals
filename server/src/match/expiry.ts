import { LibsqlError } from '@libsql/client'
import type { DbLike } from '../db/client.js'
import type { MatchRow } from '../db/schema.js'
import { appendMatchEvent, loadMatch, MatchStateError, SeqConflict } from './events.js'

export function isBusy(e: unknown): boolean {
  return e instanceof LibsqlError && e.code === 'SQLITE_BUSY'
}

export async function expireClock(db: DbLike, matchId: number, atIso: string): Promise<MatchRow | null> {
  const match = await loadMatch(db, matchId)
  if (match.status !== 'live' || !match.clockStartedAt) return null
  try {
    const r = await appendMatchEvent(db, { id: `expiry:${matchId}:${match.lastSeq}`, matchId, type: 'clock_pause', lastSeq: match.lastSeq, at: atIso })
    return r.duplicate ? null : r.match
  } catch (e) {
    if (e instanceof SeqConflict || e instanceof MatchStateError) return null
    throw e
  }
}
