import { SCORING_CAP, TEAM_POINTS, type WinType } from './types.js'

/**
 * The kids whose wins earn team points. A team that fits inside the cap scores with every
 * kid, whatever the flags say; a larger team scores only with the kids an admin marked.
 */
export function scoringSet(kids: { id: number; scoring: boolean }[]): Set<number> {
  return new Set(kids.length <= SCORING_CAP ? kids.map(k => k.id) : kids.filter(k => k.scoring).map(k => k.id))
}

export function teamPointsFor(winType: WinType): number {
  return TEAM_POINTS[winType]
}
