import type { ClockState, MatchStatus, Snapshot } from '@shared/types'
import type { EventDetail, MatchRow } from '@/lib/types'

export type MatchLane = 'live' | 'pending' | 'settled'
export type MatchState = 'pending' | 'ready' | 'live' | 'done' | 'skipped'

export interface MatchLine {
  row: MatchRow
  status: MatchStatus
  state: MatchState
  lane: MatchLane
  matNumber: number | null
  clock: ClockState | null
  endedAt: string | null
}

const byOrder = (x: MatchRow, y: MatchRow) => x.orderIndex - y.orderIndex || x.id - y.id

export function matchLines(detail: EventDetail, snapshot: Snapshot | null): MatchLine[] {
  const views = new Map((snapshot?.matches ?? []).map(m => [m.id, m]))
  const matNumbers = new Map(detail.mats.map(m => [m.id, m.number]))
  const ready = new Set((snapshot?.mats ?? []).flatMap(m => (m.onDeck.length > 0 ? [m.onDeck[0].id] : [])))

  return [...detail.matches].sort(byOrder).map(row => {
    const view = views.get(row.id)
    const status = view?.status ?? row.status
    const skipped = status === 'pending' && (view?.lastSeq ?? row.lastSeq) > 0
    const state: MatchState = status === 'live' ? 'live'
      : status === 'done' ? 'done'
        : skipped ? 'skipped'
          : ready.has(row.id) ? 'ready'
            : 'pending'
    return {
      row,
      status,
      state,
      lane: status === 'live' ? 'live' : status === 'done' ? 'settled' : 'pending',
      matNumber: row.matId === null ? null : matNumbers.get(row.matId) ?? null,
      clock: view?.clock ?? null,
      endedAt: view?.endedAt ?? row.endedAt ?? null,
    }
  })
}

export function matchLabel(number: number, nameA: string, nameB: string): string {
  return `match M${number}, ${nameA} versus ${nameB}`
}

export function liveReason(line: MatchLine): string {
  return line.matNumber === null ? 'Live, no mat' : `Live on mat ${line.matNumber}`
}

export function skipNote(line: MatchLine): string {
  const where = line.matNumber === null ? 'the queue' : `mat ${line.matNumber}`
  return `Skipped, moved to the end of ${where}`
}

export function readyNote(line: MatchLine): string | null {
  return line.matNumber === null ? null : `Next on mat ${line.matNumber}`
}

export function endedLabel(endedAt: string | null): string {
  if (!endedAt) return ''
  const at = new Date(endedAt)
  if (Number.isNaN(at.getTime())) return ''
  return `${at.getHours() % 12 || 12}:${String(at.getMinutes()).padStart(2, '0')}`
}
