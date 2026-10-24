import type { AuditEntry, MatchView, RulesetAction, RulesetTerminal, WinType } from '@shared/types'
import { formatClock } from '@shared/clock'
import { athleteName, winTypeLabel } from '@/lib/format'
import type { EventDetail } from '@/lib/types'

export interface HistoryContext {
  nameOf: (athleteId: number) => string
  athleteAId: number | null
  athleteBId: number | null
  actions: RulesetAction[]
  terminals: RulesetTerminal[]
}

export interface HistorySource {
  path: string
  title: string
  number: number | null
  context: HistoryContext
}

export interface HistoryRow {
  id: number
  time: string
  who: string
  fromMat: boolean
  what: string
  detail: string | null
  undone: string | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

function detailOf(entry: AuditEntry): Record<string, unknown> {
  return entry.detail ?? {}
}

export function historyTime(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const hour = at.getHours() % 12 || 12
  return `${hour}:${String(at.getMinutes()).padStart(2, '0')}:${String(at.getSeconds()).padStart(2, '0')}`
}

export function actorWord(actor: string): string {
  return actor.startsWith('mat:') ? `mat ${actor.slice(4)}` : actor
}

const signed = (points: number): string => (points < 0 ? String(points) : `+${points}`)

interface Outcome { pointsA: number; pointsB: number; winnerAthleteId: number | null; winType: WinType | null }

function outcomeOf(raw: unknown): Outcome | null {
  if (raw === null || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const a = num(o.pointsA)
  const b = num(o.pointsB)
  if (a === null || b === null) return null
  const winType = str(o.winType)
  return {
    pointsA: a,
    pointsB: b,
    winnerAthleteId: num(o.winnerAthleteId),
    winType: winType === 'submission' || winType === 'points' || winType === 'decision' ? winType : null,
  }
}

function resultLine(ctx: HistoryContext, outcome: Outcome, verb: 'beat' | null): string {
  const score = `${outcome.pointsA} to ${outcome.pointsB}`
  const win = outcome.winType === null ? null : winTypeLabel(outcome.winType)
  if (outcome.winnerAthleteId === null) return `No winner recorded, ${score}`
  const winner = ctx.nameOf(outcome.winnerAthleteId)
  if (verb === null) return [winner, win].filter(v => v !== null).join(' ') + `, ${score}`
  const loserId = outcome.winnerAthleteId === ctx.athleteAId ? ctx.athleteBId : ctx.athleteAId
  const loser = loserId === null ? null : ctx.nameOf(loserId)
  const head = loser === null ? `${winner} won` : `${winner} beat ${loser}`
  return [head, win].filter(v => v !== null).join(' ') + `, ${score}`
}

const PLAIN: Record<string, string> = {
  clock_start: 'Clock started',
  clock_pause: 'Clock stopped',
  clock_extend: 'Time added',
  end: 'Match ended',
  skip: 'Match skipped',
  reopen: 'Match reopened',
  entry: 'Result entered',
  correction: 'Result edited',
  bind: 'Scorer connected',
  takeover: 'Scorer taken over',
  unbind: 'Scorer disconnected',
  create: 'Event created',
  event_edit: 'Event settings changed',
  mode: 'How the event runs changed',
  contact: 'Desk contact changed',
  mat_count: 'Mat count changed',
  start: 'Event started',
  finish: 'Event finished',
  delete: 'Event deleted',
  certify: 'Results certified',
  uncertify: 'Results unlocked',
  team_edit: 'Team changed',
  team_add: 'Team added',
  team_remove: 'Team removed',
  roster_add: 'Competitors added',
  roster_edit: 'Competitor changed',
  roster_assign: 'Competitors assigned to a team',
  roster_remove: 'Competitor removed',
  roster_sync: 'Roster imported',
  roster_link: 'Linked to WellnessLiving',
  match_create: 'Match added',
  match_edit: 'Match changed',
  match_delete: 'Match deleted',
  generate: 'Matchups generated',
  propose: 'Matches proposed',
  reorder: 'Running order changed',
  ruleset_create: 'Ruleset added',
  ruleset_edit: 'Ruleset changed',
  ruleset_delete: 'Ruleset deleted',
  score: 'Point scored',
  set_score: 'Score set',
  admin: 'Admin action',
  undo: 'An action was taken back',
  advance: 'Called onto the mat',
}

function fallbackWhat(action: string): string {
  const words = action.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

interface Line { what: string; detail: string | null }

type Score = { a: number; b: number }

function scored(ctx: HistoryContext): boolean {
  return ctx.athleteAId !== null && ctx.athleteBId !== null
}

function lineFor(entry: AuditEntry, ctx: HistoryContext, score: Score): Line {
  const d = detailOf(entry)
  const plain = PLAIN[entry.action] ?? fallbackWhat(entry.action)

  if (entry.action === 'score') {
    const key = str(d.actionKey)
    const athleteId = num(d.athleteId)
    const stored = num(d.points)
    const fallback = key === null ? undefined : ctx.actions.find(a => a.key === key)
    const points = stored ?? fallback?.points ?? null
    const label = str(d.label) ?? fallback?.label ?? null
    if (points === null || label === null || athleteId === null) return { what: plain, detail: null }
    if (athleteId === ctx.athleteAId) score.a += points
    else if (athleteId === ctx.athleteBId) score.b += points
    return {
      what: `${label} ${signed(points)} ${ctx.nameOf(athleteId)}`,
      detail: scored(ctx) ? `Score ${score.a} to ${score.b}` : null,
    }
  }

  if (entry.action === 'terminal') {
    const key = str(d.actionKey)
    const athleteId = num(d.athleteId)
    const terminal = key === null ? undefined : ctx.terminals.find(t => t.key === key)
    if (terminal === undefined || athleteId === null) return { what: 'Match stopped', detail: null }
    return { what: `${terminal.label}, ${ctx.nameOf(athleteId)}`, detail: null }
  }

  if (entry.action === 'clock_extend') {
    const addMs = num(d.addMs)
    return { what: plain, detail: addMs === null ? null : `Added ${formatClock(addMs)}` }
  }

  if (entry.action === 'end') {
    const winnerAthleteId = num(d.winnerAthleteId)
    const winType = str(d.winType)
    const outcome = outcomeOf({ pointsA: score.a, pointsB: score.b, winnerAthleteId, winType })
    return { what: plain, detail: outcome === null || !scored(ctx) ? null : resultLine(ctx, outcome, 'beat') }
  }

  if (entry.action === 'entry') {
    const outcome = outcomeOf(d)
    if (outcome === null) return { what: plain, detail: null }
    score.a = outcome.pointsA
    score.b = outcome.pointsB
    const reason = str(d.reason)
    const created = d.created === true
    const line = resultLine(ctx, outcome, 'beat')
    return { what: created ? 'Match added and result entered' : plain, detail: reason === null ? line : `${line}. Reason: ${reason}` }
  }

  if (entry.action === 'correction') {
    const after = outcomeOf(d.after)
    const before = outcomeOf(d.before)
    if (after === null) return { what: plain, detail: null }
    score.a = after.pointsA
    score.b = after.pointsB
    const reason = str(d.reason)
    const was = before === null ? '' : `, was ${resultLine(ctx, before, null)}`
    return { what: plain, detail: `${resultLine(ctx, after, null)}${was}.${reason === null ? '' : ` Reason: ${reason}`}` }
  }

  if (entry.action === 'uncertify') {
    const reason = str(d.reason)
    return { what: plain, detail: reason === null ? null : `Reason: ${reason}` }
  }

  if (entry.action === 'advance') {
    const matNumber = num(d.matNumber)
    return { what: matNumber === null ? plain : `Called onto mat ${matNumber}`, detail: null }
  }

  return { what: plain, detail: null }
}

function pairUndos(entries: AuditEntry[]): { undone: Map<number, string>; paired: Set<number> } {
  const undone = new Map<number, string>()
  const paired = new Set<number>()
  const open: number[] = []
  entries.forEach((entry, i) => {
    const seq = num(detailOf(entry).seq)
    if (entry.action === 'undo') {
      const target = num(detailOf(entry).seq)
      for (let k = open.length - 1; k >= 0; k--) {
        if (num(detailOf(entries[open[k]]).seq) !== target) continue
        undone.set(open[k], `Undone ${historyTime(entry.at)} by ${actorWord(entries[i].actor)}`)
        open.splice(k, 1)
        paired.add(i)
        return
      }
      return
    }
    if (seq !== null) open.push(i)
  })
  return { undone, paired }
}

function namer(detail: EventDetail): (athleteId: number) => string {
  return athleteId => {
    const kid = detail.athletes.find(a => a.id === athleteId)
    return kid ? athleteName(kid) : 'Unknown'
  }
}

export function matchHistorySource(match: MatchView, matNumber: number | null, detail: EventDetail): HistorySource {
  const pair = `${match.a.name} vs ${match.b.name}`
  const ruleset = detail.rulesets.find(r => r.id === match.rulesetId)
  return {
    path: `/api/matches/${match.id}/history`,
    title: matNumber === null ? pair : `Mat ${matNumber}, ${pair}`,
    number: match.number,
    context: {
      nameOf: namer(detail),
      athleteAId: match.a.athleteId,
      athleteBId: match.b.athleteId,
      actions: ruleset?.actions ?? [],
      terminals: ruleset?.terminals ?? [],
    },
  }
}

export const EVENT_HISTORY_TITLE = 'Event history'

export function eventHistorySource(detail: EventDetail): HistorySource {
  return {
    path: `/api/events/${detail.event.id}/history`,
    title: EVENT_HISTORY_TITLE,
    number: null,
    context: { nameOf: namer(detail), athleteAId: null, athleteBId: null, actions: [], terminals: [] },
  }
}

export function historyRows(entries: AuditEntry[], ctx: HistoryContext): HistoryRow[] {
  const { undone, paired } = pairUndos(entries)
  const score: Score = { a: 0, b: 0 }
  const rows: HistoryRow[] = []
  entries.forEach((entry, i) => {
    if (paired.has(i)) return
    const taken = undone.get(i) ?? null
    const line = taken === null ? lineFor(entry, ctx, score) : lineFor(entry, ctx, { ...score })
    rows.push({
      id: entry.id,
      time: historyTime(entry.at),
      who: actorWord(entry.actor),
      fromMat: entry.actor.startsWith('mat'),
      what: line.what,
      detail: taken === null ? line.detail : null,
      undone: taken,
    })
  })
  return rows
}
