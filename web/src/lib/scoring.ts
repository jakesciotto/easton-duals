import { api, ApiError } from './api'
import { newEventId } from './ids'
import type { MatchView, WinType } from '@shared/types'

export interface ScoreResponse { match: MatchView; version: number }

export const DECISION_TYPES = ['decision', 'dq', 'walkover'] as const
export type DecisionType = typeof DECISION_TYPES[number]
export function decisionOf(winType: WinType | null): DecisionType {
  return (DECISION_TYPES as readonly (WinType | null)[]).includes(winType) ? winType as DecisionType : 'decision'
}
export type ScoringType = 'score' | 'clock_start' | 'clock_pause' | 'terminal'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      if (e instanceof ApiError) throw e
      last = e
      await sleep(300 * (i + 1))
    }
  }
  throw last
}

export function postMatchEvent(matchId: number, token: string, input: { type: ScoringType; athleteId?: number; actionKey?: string; lastSeq: number }): Promise<ScoreResponse> {
  const id = newEventId()
  return withRetry(() => api<ScoreResponse>(`/api/matches/${matchId}/events`, { method: 'POST', body: { id, ...input }, token }))
}

export function undoLast(matchId: number, token: string, lastSeq: number): Promise<ScoreResponse> {
  return withRetry(() => api<ScoreResponse>(`/api/matches/${matchId}/events/last`, { method: 'DELETE', body: { lastSeq }, token }))
}

export function endMatch(matchId: number, token: string, input: { lastSeq: number; winnerAthleteId?: number; winType?: DecisionType }): Promise<ScoreResponse> {
  const id = newEventId()
  return withRetry(() => api<ScoreResponse>(`/api/matches/${matchId}/end`, { method: 'POST', body: { id, ...input }, token }))
}

export function heartbeat(matId: number, token: string): Promise<{ ok: boolean }> {
  return api(`/api/mats/${matId}/heartbeat`, { method: 'POST', body: {}, token })
}

export function unbind(matId: number, token: string): Promise<{ ok: boolean }> {
  return api(`/api/mats/${matId}/unbind`, { method: 'POST', body: {}, token })
}

export function extendClock(matchId: number, token: string, input: { lastSeq: number; addMs: number }): Promise<ScoreResponse> {
  const id = newEventId()
  return withRetry(() => api<ScoreResponse>(`/api/matches/${matchId}/clock/extend`, { method: 'POST', body: { id, ...input }, token }))
}
