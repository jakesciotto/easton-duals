import type { Snapshot } from '@shared/types'
import { isFinished } from '@/lib/eventMode'

export type Composition = 'cold' | 'setup' | 'mats' | 'entry' | 'done'

export interface BoardPlan {
  comp: Composition
  mats: number
  teams: number
}

export function boardPlan(snapshot: Snapshot | null): BoardPlan {
  if (!snapshot || snapshot.teams.length < 2) return { comp: 'cold', mats: 1, teams: 2 }
  const teams = snapshot.teams.length
  if (isFinished(snapshot.event.status)) return { comp: 'done', mats: 1, teams }

  const mats = Math.max(1, snapshot.mats.length)
  const results = snapshot.matches.some(m => m.status === 'done')

  if (snapshot.event.status === 'setup' && !results) return { comp: 'setup', mats, teams }

  return snapshot.event.mode === 'entry' ? { comp: 'entry', mats: 1, teams } : { comp: 'mats', mats, teams }
}
