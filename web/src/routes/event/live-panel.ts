import type { EventMode, EventStatus, MatView, MatchView } from '@shared/types'
import { DESK_MID_MATCH_NOTE, DESK_MID_MATCH_WORD, DESK_PANEL_WORD, deskMatNote } from '@/lib/eventMode'
import { timeOfDay, winTypeLabel } from '@/lib/format'

export type PanelTone = 'live' | 'attend' | 'neutral'

export type PanelAction = 'end' | 'advance' | 'result'

export interface PanelControl {
  label: string
  tone: 'attend' | 'secondary'
  disabled: boolean
  action: PanelAction | null
}

export interface PanelModel {
  tone: PanelTone
  word: string
  control: PanelControl | null
  nowNotes: string[]
  nowHint: string | null
  queueNote: string | null
}

const inert = (label: string): PanelControl => ({ label, tone: 'secondary', disabled: true, action: null })

export const NO_MATCH_NOTE = 'No match on this mat'
export const NO_SCORER_NOTE = 'No scorer'
export const NO_MATCH_WORD = 'No match'

export const ENTER_RESULT_LABEL = 'Enter the result'

export function needsDecision(match: MatchView): boolean {
  return match.pendingTerminal === null && match.a.score === match.b.score
}

export const matCompleteNote = (matNumber: number): string => `Mat ${matNumber} complete`

function everCarried(matches: MatchView[], matId: number): boolean {
  return matches.some(m => m.matId === matId)
}

export function matPanelModel(
  mat: MatView, eventStatus: EventStatus, expired: boolean, mode: EventMode, matches: MatchView[],
): PanelModel {
  const current = mat.current
  const emptyNote = everCarried(matches, mat.id) ? matCompleteNote(mat.number) : `Nothing queued on mat ${mat.number}`
  if (mode === 'entry') {
    const midMatch = current !== null && current.status !== 'done'
    return {
      tone: 'neutral',
      word: midMatch ? DESK_MID_MATCH_WORD : DESK_PANEL_WORD,
      control: null,
      nowNotes: [deskMatNote(mat.number)],
      nowHint: midMatch ? DESK_MID_MATCH_NOTE : null,
      queueNote: mat.onDeck.length > 0 ? null
        : midMatch ? `Nothing else queued on mat ${mat.number}`
        : emptyNote,
    }
  }
  if (current !== null) {
    const running = current.clock.startedAt !== null && !expired
    return {
      tone: expired || !mat.bound ? 'attend' : running ? 'live' : 'neutral',
      word: expired ? 'Time expired'
        : !mat.bound ? NO_SCORER_NOTE
        : running ? 'Live'
        : current.clock.elapsedMs > 0 ? 'Paused' : 'Ready',
      control: !mat.bound && current.status !== 'done'
        ? { label: ENTER_RESULT_LABEL, tone: 'attend', disabled: false, action: 'result' }
        : expired
          ? { label: 'Time expired. Record result', tone: 'attend', disabled: false, action: 'end' }
          : { label: 'End match', tone: 'secondary', disabled: false, action: 'end' },
      nowNotes: [],
      nowHint: null,
      queueNote: mat.onDeck.length > 0 ? null : `Nothing else queued on mat ${mat.number}`,
    }
  }
  if (eventStatus === 'setup') {
    return {
      tone: 'neutral',
      word: 'Not started',
      control: inert('Waiting for the event to start'),
      nowNotes: [NO_MATCH_NOTE],
      nowHint: null,
      queueNote: mat.onDeck.length > 0 ? null : `Nothing queued on mat ${mat.number} yet`,
    }
  }
  if (mat.onDeck.length > 0) {
    return {
      tone: 'attend',
      word: NO_MATCH_WORD,
      control: { label: 'Call the next match', tone: 'attend', disabled: false, action: 'advance' },
      nowNotes: mat.bound ? [NO_MATCH_NOTE] : [NO_MATCH_NOTE, NO_SCORER_NOTE],
      nowHint: null,
      queueNote: null,
    }
  }
  return {
    tone: 'neutral',
    word: everCarried(matches, mat.id) ? 'Complete' : 'Empty',
    control: null,
    nowNotes: [NO_MATCH_NOTE],
    nowHint: null,
    queueNote: emptyNote,
  }
}

function endedAtMs(match: MatchView): number | null {
  if (!match.endedAt) return null
  const ms = Date.parse(match.endedAt)
  return Number.isNaN(ms) ? null : ms
}

export function lastResultOf(matches: MatchView[], matId: number): MatchView | null {
  let best: MatchView | null = null
  for (const match of matches) {
    if (match.matId !== matId || match.status !== 'done' || match.result === null) continue
    if (best === null) { best = match; continue }
    const a = endedAtMs(best)
    const b = endedAtMs(match)
    if (a !== null && b !== null) best = b >= a ? match : best
    else if (b !== null) best = match
    else if (a === null && match.orderIndex >= best.orderIndex) best = match
  }
  return best
}

export function winnerAndLoser(match: MatchView): { winner: MatchView['a']; loser: MatchView['a'] } | null {
  if (!match.result) return null
  const aWon = match.result.winnerAthleteId === match.a.athleteId
  return { winner: aWon ? match.a : match.b, loser: aWon ? match.b : match.a }
}

export function resultSentence(match: MatchView): string | null {
  const sides = winnerAndLoser(match)
  if (!sides || !match.result) return null
  return `${sides.winner.name} beat ${sides.loser.name} ${winTypeLabel(match.result.winType)}`
}

export function resultScore(match: MatchView): string | null {
  const sides = winnerAndLoser(match)
  return sides === null ? null : `${sides.winner.score}-${sides.loser.score}`
}

export function resultTime(endedAt: string | null | undefined): string | null {
  return timeOfDay(endedAt)
}

export function waitingLabel(count: number): string {
  return `Paused, ${count} update${count === 1 ? '' : 's'} waiting`
}

export const NEXT_QUEUE_CAP = 4

export function pendingQueueDepth(matches: MatchView[], mat: MatView): number {
  const currentId = mat.current?.id ?? null
  return matches.filter(m => m.matId === mat.id && m.status === 'pending' && m.id !== currentId).length
}

export function queueRemainderLabel(count: number): string {
  return `and ${count} more`
}
