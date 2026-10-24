import { ApiError } from '@/lib/api'
import { CERTIFIED_REFUSAL_BODY, CERTIFIED_REFUSAL_TITLE, isCertifiedRefusal } from '@/lib/eventMode'
import { athleteName, winTypeLabel } from '@/lib/format'
import type { AthleteRow, MatchRow } from '@/lib/types'
import { scoringSet, teamPointsFor } from '@shared/scoring'
import { CORRECTION_REASON_MAX, type WinType } from '@shared/types'

export const SAME_PAIR_WINDOW_MS = 60_000
export const SAVE_TIMEOUT_MS = 8_000
export const RETRY_INTERVAL_MS = 5_000
export const RETRYING_LINE = 'Retrying every 5 seconds.'
export const LEDGER_LIMIT = 200
export const SAVED_LABEL_MS = 900
export const CUE_MS = 600

export const DRAFT_VERSION = 2

export interface EntryDraft {
  v: number
  entryId: string
  aId: string
  bId: string
  pointsA: string
  pointsB: string
  winner: 'a' | 'b' | null
  winType: WinType
  editingId: number | null
  reason: string
}

const DRAFT_ROOT = 'duels:entry:'
const CORRECTION = ':match:'

export const draftKey = (eventId: number, editingId: number | null): string =>
  editingId === null ? `${DRAFT_ROOT}${eventId}` : `${DRAFT_ROOT}${eventId}${CORRECTION}${editingId}`

function readDraft(v: unknown): EntryDraft | null {
  if (!v || typeof v !== 'object') return null
  const d = v as Record<string, unknown>
  const core = typeof d.entryId === 'string' && d.entryId.length >= 8
    && typeof d.aId === 'string' && typeof d.bId === 'string'
    && typeof d.pointsA === 'string' && typeof d.pointsB === 'string'
    && (d.winner === 'a' || d.winner === 'b' || d.winner === null)
    && (d.winType === 'points' || d.winType === 'submission' || d.winType === 'decision')
    && (d.editingId === null || typeof d.editingId === 'number')
  if (!core) return null
  return {
    v: DRAFT_VERSION,
    entryId: d.entryId as string,
    aId: d.aId as string,
    bId: d.bId as string,
    pointsA: d.pointsA as string,
    pointsB: d.pointsB as string,
    winner: d.winner as 'a' | 'b' | null,
    winType: d.winType as WinType,
    editingId: d.editingId as number | null,
    reason: typeof d.reason === 'string' ? d.reason.slice(0, CORRECTION_REASON_MAX) : '',
  }
}

export function loadDraft(eventId: number, editingId: number | null = null): EntryDraft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(eventId, editingId))
    if (!raw) return null
    const draft = readDraft(JSON.parse(raw))
    return draft !== null && draft.editingId === editingId ? draft : null
  } catch {
    return null
  }
}

export function saveDraft(eventId: number, draft: EntryDraft): void {
  try {
    sessionStorage.setItem(draftKey(eventId, draft.editingId), JSON.stringify(draft))
  } catch {
  }
}

export function clearDraft(eventId: number, editingId: number | null = null): void {
  try {
    sessionStorage.removeItem(draftKey(eventId, editingId))
  } catch {
  }
}

export function restoreDraft(eventId: number): EntryDraft | null {
  const created = loadDraft(eventId)
  if (created) return created
  const prefix = `${DRAFT_ROOT}${eventId}${CORRECTION}`
  const ids: number[] = []
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (!key?.startsWith(prefix)) continue
      const id = Number(key.slice(prefix.length))
      if (Number.isInteger(id)) ids.push(id)
    }
  } catch {
    return null
  }
  for (const id of ids.sort((x, y) => x - y)) {
    const draft = loadDraft(eventId, id)
    if (draft) return draft
  }
  return null
}

export function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

export function entryShape(d: EntryDraft): string {
  const points = (v: string) => String(v === '' ? 0 : Number(v))
  return [d.editingId ?? 'new', d.aId, d.bId, points(d.pointsA), points(d.pointsB), d.winner ?? '', d.winType].join('|')
}

export function serverRefused(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  return error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429
}

export function retriesItself(error: unknown): boolean {
  return !(error instanceof ApiError)
}

export function seedPairLog(matches: MatchRow[]): Record<string, number> {
  const log: Record<string, number> = {}
  for (const m of matches) {
    if (m.status !== 'done' || !m.endedAt) continue
    const at = Date.parse(m.endedAt)
    if (Number.isNaN(at)) continue
    if (m.athleteAId === null || m.athleteBId === null) continue
    const key = pairKey(m.athleteAId, m.athleteBId)
    if (log[key] === undefined || at > log[key]) log[key] = at
  }
  return log
}

export interface EntrySide { athleteId?: number; name?: string; score?: number }
export interface EntryMatch {
  id?: number
  a?: EntrySide
  b?: EntrySide
  result?: { winnerAthleteId?: number; winType?: WinType } | null
}

export interface StoredOutcome {
  winnerAthleteId: number
  winType: WinType
  scores: Record<number, number>
  sentence: string
}

export function storedOutcome(match: EntryMatch | null | undefined): StoredOutcome | null {
  const { a, b, result } = match ?? {}
  if (!a || !b || !result) return null
  const { winnerAthleteId, winType } = result
  if (typeof winnerAthleteId !== 'number' || !winType) return null
  if (typeof a.athleteId !== 'number' || typeof b.athleteId !== 'number') return null
  const aWon = winnerAthleteId === a.athleteId
  const won = aWon ? a : b
  const lost = aWon ? b : a
  return {
    winnerAthleteId,
    winType,
    scores: { [a.athleteId]: a.score ?? 0, [b.athleteId]: b.score ?? 0 },
    sentence: `${won.name ?? 'Unknown'} beat ${lost.name ?? 'Unknown'} ${winTypeLabel(winType)}, ${a.score ?? 0} to ${b.score ?? 0}`,
  }
}

export function outcomeMatches(
  outcome: StoredOutcome,
  sent: { winnerAthleteId: number; winType: WinType; scores: Record<number, number> },
): boolean {
  if (outcome.winnerAthleteId !== sent.winnerAthleteId || outcome.winType !== sent.winType) return false
  return Object.entries(sent.scores).every(([id, points]) => outcome.scores[Number(id)] === points)
}

export function duplicateCopy(outcome: StoredOutcome | null): SaveErrorCopy {
  return {
    title: 'This entry was already saved',
    body: outcome === null
      ? 'The server had it already, so nothing was added. Check the ledger.'
      : `The result on file is ${outcome.sentence}. Edit that row in the ledger to change it.`,
  }
}

export function isRepeatPair(log: Record<string, number>, key: string, now: number): boolean {
  const at = log[key]
  return at !== undefined && now - at < SAME_PAIR_WINDOW_MS
}

export function teamWins(matches: MatchRow[], athletes: AthleteRow[]): Map<number, number> {
  const teamOf = new Map(athletes.map(a => [a.id, a.teamId]))
  const wins = new Map<number, number>()
  for (const m of matches) {
    if (m.status !== 'done' || m.winnerAthleteId === null) continue
    const teamId = teamOf.get(m.winnerAthleteId)
    if (teamId === null || teamId === undefined) continue
    wins.set(teamId, (wins.get(teamId) ?? 0) + 1)
  }
  return wins
}

export function matchPoints(matches: MatchRow[], athletes: AthleteRow[]): Map<number, number> {
  const teamOf = new Map(athletes.map(a => [a.id, a.teamId]))
  const points = new Map<number, number>()
  const add = (athleteId: number | null, scored: number) => {
    const teamId = athleteId === null ? undefined : teamOf.get(athleteId)
    if (teamId === null || teamId === undefined) return
    points.set(teamId, (points.get(teamId) ?? 0) + scored)
  }
  for (const m of matches) {
    if (m.status !== 'done') continue
    add(m.athleteAId, m.pointsA)
    add(m.athleteBId, m.pointsB)
  }
  return points
}

export function teamPoints(matches: MatchRow[], athletes: AthleteRow[]): Map<number, number> {
  const teamOf = new Map(athletes.map(a => [a.id, a.teamId]))
  const kidsByTeam = new Map<number, AthleteRow[]>()
  for (const a of athletes) {
    if (a.teamId === null) continue
    const kids = kidsByTeam.get(a.teamId)
    if (kids) kids.push(a)
    else kidsByTeam.set(a.teamId, [a])
  }
  const scorers = new Map([...kidsByTeam].map(([teamId, kids]) => [teamId, scoringSet(kids)]))
  const earned = new Map<number, number>()
  for (const m of matches) {
    if (m.status !== 'done' || m.winnerAthleteId === null || m.winType === null) continue
    const teamId = teamOf.get(m.winnerAthleteId)
    if (teamId === null || teamId === undefined) continue
    if (!scorers.get(teamId)?.has(m.winnerAthleteId)) continue
    earned.set(teamId, (earned.get(teamId) ?? 0) + teamPointsFor(m.winType))
  }
  return earned
}

export interface SaveErrorCopy { title: string; body: string }

export const RESTORED_NEW_ENTRY: SaveErrorCopy = { title: 'This entry never sent', body: 'It was kept on this device. Check it, then press Save.' }

export function restoredBannerCopy(draft: EntryDraft, matches: MatchRow[], athletes: AthleteRow[]): SaveErrorCopy {
  if (draft.editingId === null) return RESTORED_NEW_ENTRY
  const byId = new Map(athletes.map(a => [a.id, a]))
  const nameOf = (id: number | null) => { const a = id === null ? undefined : byId.get(id); return a ? athleteName(a) : 'Unknown' }
  const m = matches.find(x => x.id === draft.editingId)
  const label = m ? `${nameOf(m.athleteAId)} vs ${nameOf(m.athleteBId)}` : `match ${draft.editingId}`
  return { title: `This correction to ${label} never sent`, body: 'It was kept on this device. Check it, then press Save.' }
}

export const EVENT_DONE: SaveErrorCopy = {
  title: 'This event is finished',
  body: 'No result can be entered now, and the results here are the record.',
}

export const EVENT_CERTIFIED: SaveErrorCopy = {
  title: CERTIFIED_REFUSAL_TITLE,
  body: CERTIFIED_REFUSAL_BODY,
}

export function saveErrorCopy(error: unknown): SaveErrorCopy {
  if (!(error instanceof ApiError)) {
    return { title: 'Could not reach the server', body: `Your entry is kept on this device. ${RETRYING_LINE}` }
  }
  if (error.status === 429) return { title: 'Too many attempts', body: 'Wait a minute, then press Save again.' }
  if (error.status === 401 || error.status === 403) return { title: 'The desk session expired', body: 'Enter the event PIN again, then press Save.' }
  if (error.status === 404) return { title: 'That match is no longer here', body: 'Reload the page, then enter the result again.' }
  if (error.status === 422) return { title: 'That result cannot be saved', body: error.message }
  if (error.code === 'sequence') return { title: 'Another device scored this mat first', body: 'The result on screen refreshes. Check it, then save again.' }
  if (isCertifiedRefusal(error)) return EVENT_CERTIFIED
  if (error.code === 'match_state' && /event is done/i.test(error.message)) return EVENT_DONE
  if (error.code === 'match_state') return { title: 'This match already ended', body: 'Reopen it from the Live tab to change the result.' }
  if (error.status >= 500) return { title: 'The server had a problem', body: 'Press Save to try again.' }
  return { title: 'That result was not saved', body: error.message }
}

export function clockLabel(at: Date): string {
  const hour = at.getHours() % 12 || 12
  return `${hour}:${String(at.getMinutes()).padStart(2, '0')}`
}

export function ledgerTime(endedAt: string | null | undefined, savedAt: number | undefined): Date | null {
  if (endedAt) {
    const at = new Date(endedAt)
    if (!Number.isNaN(at.getTime())) return at
  }
  return savedAt === undefined ? null : new Date(savedAt)
}
