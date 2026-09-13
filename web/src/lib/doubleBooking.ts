import { matchAthleteIds } from './matchView'
import type { MatchRow } from './types'

// The server allows a competitor to sit in two pending matches at once (uneven rosters
// make it a legitimate organizer choice); the designer only warns.
export function isDoubleBooked(athleteId: number, matches: MatchRow[], excludeMatchId?: number): boolean {
  return matches.some(m => m.status === 'pending' && m.id !== excludeMatchId && (m.athleteAId === athleteId || m.athleteBId === athleteId))
}

export function doubleBookedMatchIds(matches: MatchRow[]): Set<number> {
  const pending = matches.filter(m => m.status === 'pending')
  const counts = new Map<number, number>()
  for (const m of pending) {
    for (const id of matchAthleteIds(m)) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const ids = new Set<number>()
  for (const m of pending) {
    if (matchAthleteIds(m).some(id => (counts.get(id) ?? 0) > 1)) ids.add(m.id)
  }
  return ids
}
