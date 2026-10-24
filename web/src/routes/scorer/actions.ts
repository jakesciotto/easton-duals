import type { MatchView } from '@shared/types'
import { ApiError } from '@/lib/api'
import { CERTIFIED_REFUSAL, isCertifiedRefusal } from '@/lib/eventMode'

interface Recorded {
  seq: number
  at: string
}

export interface ScoreAction extends Recorded {
  kind: 'score'
  athleteId: number
  name: string
  label: string
  points: number
}

export interface ClockAction extends Recorded {
  kind: 'clock'
  label: 'Clock started' | 'Clock paused'
}

export interface ExtendAction extends Recorded {
  kind: 'extend'
  label: 'Time added'
  addMs: number
}

export type LocalAction = ScoreAction | ClockAction | ExtendAction

export const ADD_TIME_MS = 60_000

export function signed(points: number): string {
  return points >= 0 ? `+${points}` : String(points)
}

export const WRITE_DEADLINE_MS = 8_000

export class TimeoutError extends Error {
  constructor() {
    super('write deadline')
    this.name = 'TimeoutError'
  }
}

export function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms)
    work.then(
      value => { clearTimeout(timer); resolve(value) },
      error => { clearTimeout(timer); reject(error) },
    )
  })
}

export function applyScore(match: MatchView, athleteId: number, points: number): MatchView {
  const next = { ...match, lastSeq: match.lastSeq + 1 }
  if (match.a.athleteId === athleteId) next.a = { ...match.a, score: match.a.score + points }
  else next.b = { ...match.b, score: match.b.score + points }
  return next
}

export function applyClockStart(match: MatchView, atIso: string): MatchView {
  return { ...match, lastSeq: match.lastSeq + 1, clock: { ...match.clock, startedAt: atIso } }
}

export function applyClockPause(match: MatchView, nowMs: number): MatchView {
  const ran = match.clock.startedAt ? Math.max(0, nowMs - Date.parse(match.clock.startedAt)) : 0
  return {
    ...match,
    lastSeq: match.lastSeq + 1,
    clock: { ...match.clock, startedAt: null, elapsedMs: Math.min(match.clock.lengthMs, match.clock.elapsedMs + ran) },
  }
}

export function applyClockExtend(match: MatchView, addMs: number): MatchView {
  return {
    ...match,
    lastSeq: match.lastSeq + 1,
    lengthSec: match.lengthSec + addMs / 1000,
    clock: { ...match.clock, lengthMs: match.clock.lengthMs + addMs },
  }
}

export function applyUndo(match: MatchView, undone: ScoreAction | ExtendAction | null): MatchView {
  const next = { ...match, lastSeq: Math.max(0, match.lastSeq - 1) }
  if (!undone) return next
  if (undone.kind === 'extend') {
    next.lengthSec = match.lengthSec - undone.addMs / 1000
    next.clock = { ...match.clock, lengthMs: match.clock.lengthMs - undone.addMs }
    return next
  }
  if (match.a.athleteId === undone.athleteId) next.a = { ...match.a, score: match.a.score - undone.points }
  else next.b = { ...match.b, score: match.b.score - undone.points }
  return next
}

export const EVENT_FINISHED = 'This event is finished. Nothing more is scored on this iPad.'

export function errorCopy(e: unknown): string {
  if (e instanceof TimeoutError) return 'No answer from the server. Check the score before trying that again.'
  if (!(e instanceof ApiError)) return 'Could not reach the server. That did not send. Try it again.'
  if (e.code === 'sequence') return 'Another device scored this mat first. Refreshing now.'
  if (e.status === 429) return 'Too many attempts. Try again in a minute.'
  if (e.status >= 500) return 'The server had a problem. Try that again.'
  if (isCertifiedRefusal(e)) return CERTIFIED_REFUSAL
  if (e.code === 'match_state' && /\bevent is done\b/.test(e.message)) return EVENT_FINISHED
  if (e.code === 'match_state' && /\bdone\b/.test(e.message)) {
    return 'This match already ended. Reopen it from the Live tab to change the result.'
  }
  return e.message
}
