import type { EventMode, EventStatus, Snapshot } from '@shared/types'
import { ApiError } from '@/lib/api'
import type { SegmentOption } from '@/components/ui/segment'

export const MODE_ORDER: readonly EventMode[] = ['live', 'entry']

export const MODE_LABEL: Record<EventMode, string> = {
  live: 'Scored on mats',
  entry: 'Runs from the desk',
}

export const MODE_HELP: Record<EventMode, string> = {
  live: 'A tablet on each mat scores every match. The desk corrects mistakes.',
  entry: 'The desk types every result by hand. No tablet scores a mat.',
}

export const MODE_GROUP_LABEL = 'How this event runs'

export const MODE_OPTIONS: SegmentOption[] = MODE_ORDER.map(value => ({ value, label: MODE_LABEL[value] }))

export const DESK_LEAD = 'This event runs from the desk'

export const DESK_NOTE = `${DESK_LEAD}, so no iPad scores a mat.`
export const DESK_NOTE_DETAIL =
  `Every result goes in on the Entry tab. Set this event to ${MODE_LABEL.live} to hand out a mat code.`

export const DESK_BIND_REFUSAL =
  `${DESK_LEAD}. Every result is typed on the Entry tab, so there is no mat for this iPad to score.`

export function toMode(value: string): EventMode {
  return value === 'entry' ? 'entry' : 'live'
}

export function modeOf(snapshot: Snapshot | null, fallback: EventMode): EventMode {
  return snapshot?.event.mode ?? fallback
}

function matList(numbers: number[]): string {
  if (numbers.length === 1) return `mat ${numbers[0]}`
  return `mats ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`
}

function asSentence(clause: string): string {
  return `${clause[0].toUpperCase()}${clause.slice(1)}`
}

export function deskSwitchRefusal(snapshot: Snapshot | null): string | null {
  if (snapshot === null) return 'Waiting for the first update from the server.'
  const running = snapshot.mats.flatMap(m => (m.current !== null && m.current.clock.startedAt !== null ? [m.number] : []))
  if (running.length === 0) return null
  const said = asSentence(`${matList(running)} ${running.length === 1 ? 'has' : 'have'} a clock running`)
  return `${said}. The board drops the mat rack as soon as the desk takes over.`
}

export interface MidMatchMat { number: number; pair: string }

export function deskSwitchMidMatch(snapshot: Snapshot | null): MidMatchMat[] {
  if (snapshot === null) return []
  return snapshot.mats
    .flatMap(m => {
      const current = m.current
      if (current === null || current.status === 'done' || current.clock.startedAt !== null) return []
      return [{ number: m.number, pair: `${current.a.name} vs ${current.b.name}` }]
    })
    .sort((x, y) => x.number - y.number)
}

export function deskSwitchConsequence(mats: MidMatchMat[]): string {
  const numbers = mats.map(m => m.number)
  const said = asSentence(`${matList(numbers)} ${numbers.length === 1 ? 'is' : 'are'} mid-match`)
  const rest = numbers.length === 1
    ? 'Its result will have to be typed at the desk.'
    : 'Their results will have to be typed at the desk.'
  return `${said}. ${rest}`
}

export const MAT_NOTE = 'The mats own the results in this event. Type a result here only when a tablet has failed.'

export const deskMatNote = (matNumber: number): string => `${DESK_LEAD}, so nothing scores mat ${matNumber}.`

export function statusOf(live: Snapshot | null, fallback: EventStatus): EventStatus {
  return live?.event.status ?? fallback
}

export function isFinished(status: EventStatus): boolean {
  return status === 'done' || status === 'certified'
}

export const FINISHED_LINE = 'This event is finished. Results can still be corrected until an admin certifies them.'

export const CERTIFIED_ENTRY_LINE = 'This event is certified. No result can change until an admin unlocks it.'

export const CERTIFIED_REFUSAL_TITLE = 'This event is certified'
export const CERTIFIED_REFUSAL_BODY = 'Unlock it from the Live tab to change anything.'
export const CERTIFIED_REFUSAL = `${CERTIFIED_REFUSAL_TITLE}. ${CERTIFIED_REFUSAL_BODY}`

export function isCertifiedRefusal(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'match_state' && /event is certified/i.test(error.message)
}

export function writeErrorMessage(error: Error): string {
  return isCertifiedRefusal(error) ? CERTIFIED_REFUSAL : error.message
}

export const DESK_PANEL_WORD = 'From the desk'

export const DESK_MID_MATCH_WORD = 'Mid-match'
export const DESK_MID_MATCH_NOTE = 'Type this result on the Entry tab.'

export const DESK_RULESET_NOTE = 'Rulesets apply when tablets score the mats, and this event runs from the desk.'
