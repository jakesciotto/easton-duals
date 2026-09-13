import { DIVISION_LIMITS, type DivisionFormat, type DivisionStyles, type Style } from '@shared/types'
import { SUGGEST_FLOOR, SUGGEST_MARGIN, exactName, nameScore } from '@shared/similarity'
import { athleteName, formatLabel } from './format'
import type { AthleteRow, MatchRow } from './types'

export type PasteKind = 'pair' | 'division'

/** One match a line asks for: two competitors already resolved against the roster. */
export interface PairLine { kind: 'pair'; athleteAId: number; athleteBId: number; style: Style; notes: string[] }
export interface DivisionLine { kind: 'division'; name: string; format: DivisionFormat; styles: DivisionStyles; athleteIds: number[]; notes: string[] }

/**
 * One row of the preview. `n` is the source line, and two rows share it when one line
 * asks for both styles: a pair line reading "both" makes a gi match and a nogi match,
 * and the reader is owed both of them rather than one row that stands for two writes.
 */
export interface MatchPasteLine { n: number; text: string; row: PairLine | DivisionLine | null; problem: string | null }

export interface MatchPasteResult {
  lines: MatchPasteLine[]
  matches: { athleteAId: number; athleteBId: number; style: Style }[]
  divisions: { name: string; format: DivisionFormat; styles: DivisionStyles; athleteIds: number[] }[]
  errors: string[]
}

const STYLE_TOKENS: Record<string, DivisionStyles> = {
  gi: 'gi',
  nogi: 'nogi',
  'no gi': 'nogi',
  both: 'both',
}

const FORMAT_TOKENS: Record<string, DivisionFormat> = {
  'round robin': 'round_robin',
  rr: 'round_robin',
  'single elimination': 'single_elim',
  'single elim': 'single_elim',
  se: 'single_elim',
  'double elimination': 'double_elim',
  'double elim': 'double_elim',
  de: 'double_elim',
}

/** Hyphens and runs of space read the same, so "no-gi", "no gi" and "No Gi" are one token. */
function token(cell: string): string {
  return cell.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ')
}

const styleOf = (cell: string): DivisionStyles | undefined => STYLE_TOKENS[token(cell)]
const formatOf = (cell: string): DivisionFormat | undefined => FORMAT_TOKENS[token(cell)]

/** A full name splits at its first space, so a double surname stays whole. */
function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim()
  const at = trimmed.indexOf(' ')
  return at === -1
    ? { firstName: trimmed, lastName: '' }
    : { firstName: trimmed.slice(0, at), lastName: trimmed.slice(at + 1).trim() }
}

/** Either a competitor, with the note a near match owes the reader, or the problem. */
type Resolved =
  | { athleteId: number; note: string | null; problem: null }
  | { athleteId: null; note: null; problem: string }

/**
 * One typed name against the roster. An exact match links by itself; a near one links and
 * says so, and only when it is clear of the runner up, because two candidates inside the
 * margin are a choice rather than a suggestion.
 */
function resolveName(raw: string, athletes: AthleteRow[]): Resolved {
  const typed = splitName(raw)
  if (typed.firstName === '') return { athleteId: null, note: null, problem: `Unknown name: ${raw.trim()}` }

  const exact = athletes.filter(a => exactName(typed, a))
  if (exact.length > 1) return { athleteId: null, note: null, problem: `Ambiguous name: ${raw.trim()}` }
  if (exact.length === 1) return { athleteId: exact[0].id, note: null, problem: null }

  const ranked = athletes
    .map(a => ({ a, score: nameScore(typed, a) }))
    .sort((x, y) => y.score - x.score)
  const best = ranked[0]
  const runnerUp = ranked[1]
  if (best && best.score >= SUGGEST_FLOOR && (!runnerUp || best.score - runnerUp.score >= SUGGEST_MARGIN)) {
    return { athleteId: best.a.id, note: `matched to ${athleteName(best.a)}`, problem: null }
  }
  return { athleteId: null, note: null, problem: `Unknown name: ${raw.trim()}` }
}

/** The competitor names on a line, once the style and format tokens have been taken out. */
function nameCells(cells: string[]): string[] {
  return cells.filter(c => c.trim() !== '')
}

function limitProblem(format: DivisionFormat, count: number): string | null {
  const [min, max] = DIVISION_LIMITS[format]
  if (count >= min && count <= max) return null
  return `${formatLabel(format)} takes ${min} to ${max} competitors, not ${count}`
}

type Pair = { athleteAId: number; athleteBId: number; style: Style }

const samePair = (m: { athleteAId: number | null; athleteBId: number | null }, p: Pair) =>
  (m.athleteAId === p.athleteAId && m.athleteBId === p.athleteBId)
  || (m.athleteAId === p.athleteBId && m.athleteBId === p.athleteAId)

/**
 * The match paste, spec 7. A line naming a format is a division; anything else is a pair.
 * Both resolve their competitors against the roster, and neither invents one: a name the
 * roster does not carry is a problem on its line rather than a competitor added quietly.
 *
 * Nothing is created while any line carries a problem, the way the roster paste already
 * works, so a paste is all or nothing and the preview says which line to fix.
 */
export function parseMatchPaste(text: string, athletes: AthleteRow[], existing: MatchRow[]): MatchPasteResult {
  const lines: MatchPasteLine[] = []
  const errors: string[] = []
  const matches: Pair[] = []
  const divisions: MatchPasteResult['divisions'] = []
  const teamOf = new Map(athletes.map(a => [a.id, a.teamId]))
  const nameOf = (id: number) => { const a = athletes.find(x => x.id === id); return a ? athleteName(a) : 'Unknown' }

  const source = text.split(/\r?\n/)
    .map((t, i) => ({ n: i + 1, text: t }))
    .filter(l => l.text.trim() !== '')

  for (const { n, text: raw } of source) {
    const cells = (raw.includes('\t') ? raw.split('\t') : raw.split(','))
      // A cell holding "vs" or "v" between two names is two cells.
      .flatMap(c => c.split(/\s+vs?\s+/i))
      .map(c => c.trim())

    const formatAt = cells.findIndex(c => formatOf(c) !== undefined)
    const fail = (problem: string) => {
      lines.push({ n, text: raw, row: null, problem })
      errors.push(`line ${n}: ${problem}`)
    }

    if (formatAt !== -1) {
      const format = FORMAT_TOKENS[token(cells[formatAt])]
      const name = nameCells(cells.slice(0, formatAt)).join(' ') || `Division ${divisions.length + 1}`
      const after = cells.slice(formatAt + 1)
      const declared = styleOf(after[0] ?? '')
      const styles = declared ?? 'both'
      const members = nameCells(declared === undefined ? after : after.slice(1))

      const notes: string[] = []
      const athleteIds: number[] = []
      let problem: string | null = null
      for (const cell of members) {
        const r = resolveName(cell, athletes)
        if (r.problem !== null) { problem ??= r.problem; continue }
        if (r.note !== null) notes.push(r.note)
        if (athleteIds.includes(r.athleteId)) { problem ??= `${nameOf(r.athleteId)} is in the division twice`; continue }
        if (teamOf.get(r.athleteId) === null) { problem ??= `${nameOf(r.athleteId)} is on no team`; continue }
        athleteIds.push(r.athleteId)
      }
      problem ??= limitProblem(format, athleteIds.length)
      if (problem !== null) { fail(problem); continue }

      lines.push({ n, text: raw, row: { kind: 'division', name, format, styles, athleteIds, notes }, problem: null })
      divisions.push({ name, format, styles, athleteIds })
      continue
    }

    const styleAt = cells.findIndex(c => styleOf(c) !== undefined)
    const asked: DivisionStyles = styleAt === -1 ? 'gi' : STYLE_TOKENS[token(cells[styleAt])]
    const names = nameCells(styleAt === -1 ? cells : cells.filter((_, i) => i !== styleAt))
    // Two full names, or four cells as first, last, first, last.
    const pair = names.length === 2
      ? names
      : names.length === 4 ? [`${names[0]} ${names[1]}`, `${names[2]} ${names[3]}`] : null
    if (pair === null) { fail('a pair needs two names'); continue }

    const notes: string[] = []
    const ids: number[] = []
    let problem: string | null = null
    for (const cell of pair) {
      const r = resolveName(cell, athletes)
      if (r.problem !== null) { problem ??= r.problem; continue }
      if (r.note !== null) notes.push(r.note)
      if (teamOf.get(r.athleteId) === null) { problem ??= `${nameOf(r.athleteId)} is on no team`; continue }
      ids.push(r.athleteId)
    }
    if (problem === null && ids.length === 2 && ids[0] === ids[1]) problem = `${nameOf(ids[0])} is on both sides`
    if (problem !== null || ids.length !== 2) { fail(problem ?? 'a pair needs two names'); continue }

    if (teamOf.get(ids[0]) === teamOf.get(ids[1])) notes.push('Same team')

    // Gi first, then nogi: one line asking for both is two matches and two preview rows.
    for (const style of asked === 'both' ? (['gi', 'nogi'] as const) : [asked]) {
      const row: Pair = { athleteAId: ids[0], athleteBId: ids[1], style }
      // The paste's own earlier lines count as met: the second of two identical lines is
      // about to make the rematch this warning exists to point at.
      const met = existing.some(m => m.style === style && samePair(m, row)) || matches.some(m => m.style === style && samePair(m, row))
      lines.push({ n, text: raw, row: { kind: 'pair', ...row, notes: met ? [...notes, 'Already met'] : notes }, problem: null })
      matches.push(row)
    }
  }

  return errors.length > 0
    ? { lines, matches: [], divisions: [], errors }
    : { lines, matches, divisions, errors }
}
