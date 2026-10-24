import type { EventStatus, MatchView } from '@shared/types'
import { isFinished } from '@/lib/eventMode'
import type { LocalAction } from './actions'

export const OFFLINE = 'Not connected. Nothing will send.'
export const PENDING = 'A result is waiting. Record it.'
export const NOTHING = 'Nothing to take back yet.'
export const NO_MATCH = 'No match on this mat.'
export const ENDED = 'This match has ended.'
export const NOT_STARTED = 'This match has not started.'
export const TIME_UP = 'Time is up. Add time or end the match.'
export const CLOCK_EVENT = 'Undo does not reach the clock.'
export const ELSEWHERE = 'The newest action came from elsewhere.'
export const EXTEND_EVENT = 'The newest action added time.'
export const CLOCK_RUNNING = 'Add time while the clock is stopped.'
export const CLOCK_UNSTARTED = 'Start the clock before adding time.'
export const EVENT_DONE = 'This event is finished.'

export const REASONS = [
  OFFLINE, PENDING, NOTHING, NO_MATCH, ENDED, NOT_STARTED, TIME_UP, CLOCK_EVENT, ELSEWHERE,
  EXTEND_EVENT, CLOCK_RUNNING, CLOCK_UNSTARTED, EVENT_DONE,
]

function unavailable(connected: boolean, match: MatchView | null): string | null {
  if (!connected) return OFFLINE
  if (!match) return NO_MATCH
  if (match.status === 'done') return ENDED
  if (match.status !== 'live') return NOT_STARTED
  return null
}

export function scoreRefusal(connected: boolean, match: MatchView | null): string | null {
  const gone = unavailable(connected, match)
  if (gone) return gone
  return match!.pendingTerminal ? PENDING : null
}

export function clockRefusal(connected: boolean, match: MatchView | null, expired: boolean): string | null {
  const gone = unavailable(connected, match)
  if (gone) return gone
  if (match!.pendingTerminal) return PENDING
  if (expired) return TIME_UP
  return null
}

export function addTimeRefusal(connected: boolean, match: MatchView | null, expired: boolean): string | null {
  const gone = unavailable(connected, match)
  if (gone) return gone
  if (match!.pendingTerminal) return PENDING
  if (match!.clock.startedAt !== null) return CLOCK_RUNNING
  if (match!.clock.elapsedMs === 0 && !expired) return CLOCK_UNSTARTED
  return null
}

export function undoRefusal(
  connected: boolean,
  match: MatchView | null,
  last: LocalAction | null,
  _expired: boolean,
): string | null {
  const gone = unavailable(connected, match)
  if (gone) return gone
  if (match!.lastSeq === 0) return NOTHING
  if (!last || last.seq !== match!.lastSeq) return ELSEWHERE
  if (last.kind === 'clock') return CLOCK_EVENT
  return null
}

export function minusRefusal(
  connected: boolean,
  match: MatchView | null,
  last: LocalAction | null,
  athleteId: number | null,
): string | null {
  const gone = unavailable(connected, match)
  if (gone) return gone
  if (athleteId === null) return NOTHING
  if (match!.lastSeq === 0) return NOTHING
  if (!last || last.seq !== match!.lastSeq) return ELSEWHERE
  if (last.kind === 'clock') return CLOCK_EVENT
  if (last.kind === 'extend') return EXTEND_EVENT
  if (last.athleteId !== athleteId) return `The newest action was ${last.name}'s.`
  return null
}

export interface ScorerRefusals {
  half: string | null
  clock: string | null
  addTime: string | null
  undo: string | null
  minusA: string | null
  minusB: string | null
}

export function scorerRefusals(input: {
  connected: boolean
  eventStatus: EventStatus | null
  match: MatchView | null
  last: LocalAction | null
  expired: boolean
}): ScorerRefusals {
  const { connected, eventStatus, match, last, expired } = input
  const done = eventStatus !== null && isFinished(eventStatus) ? EVENT_DONE : null
  return {
    half: done ?? scoreRefusal(connected, match),
    clock: done ?? clockRefusal(connected, match, expired),
    addTime: done ?? addTimeRefusal(connected, match, expired),
    undo: done ?? undoRefusal(connected, match, last, expired),
    minusA: done ?? (match ? minusRefusal(connected, match, last, match.a.athleteId) : null),
    minusB: done ?? (match ? minusRefusal(connected, match, last, match.b.athleteId) : null),
  }
}
