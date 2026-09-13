import { describe, expect, it } from 'vitest'
import { parseMatchPaste, type DivisionLine, type PairLine } from '@/lib/match-paste'
import type { AthleteRow, MatchRow } from '@/lib/types'

const kid = (id: number, first: string, last: string, teamId: number | null = 1): AthleteRow => ({
  id, eventId: 7, teamId, firstName: first, lastName: last, age: 9, ageSource: 'manual',
  weightLbs: 60, weightSource: 'manual', belt: 'grey', gender: 'M', source: 'manual',
  wlUid: null, wlLocation: null, leaderboardId: null, erp: null, promotedAt: null, syncedAt: null,
  syncChanges: null, suggestedWlUid: null, suggestedScore: null, dismissedWlUids: [],
})

const MATEO = kid(100, 'Mateo', 'Rivera', 1)
const OLIVIA = kid(200, 'Olivia', 'Kim', 2)
const AVA = kid(101, 'Ava', 'Brandt', 1)
const KAI = kid(300, 'Kai', 'Espinoza', 3)
const ROSTER = [MATEO, OLIVIA, AVA, KAI]

const match = (over: Partial<MatchRow> = {}): MatchRow => ({
  id: 1, eventId: 7, number: 1, matId: null, orderIndex: 0, rulesetId: 1, lengthSec: 300,
  athleteAId: 100, athleteBId: 200, feedAMatchId: null, feedATake: null, feedBMatchId: null, feedBTake: null,
  style: 'gi', divisionId: null, round: null, status: 'pending', winnerAthleteId: null, winType: null,
  pointsA: 0, pointsB: 0, clockElapsedMs: 0, clockStartedAt: null,
  pendingTerminalAthleteId: null, pendingTerminalKey: null, lastSeq: 0, why: null, source: 'designed', ...over,
})

const parse = (text: string, athletes = ROSTER, existing: MatchRow[] = []) => parseMatchPaste(text, athletes, existing)
const pairs = (text: string, athletes = ROSTER, existing: MatchRow[] = []) =>
  parse(text, athletes, existing).lines.map(l => l.row).filter((r): r is PairLine => r?.kind === 'pair')
const onlyDivision = (text: string, athletes = ROSTER) => {
  const row = parse(text, athletes).lines[0].row
  if (row?.kind !== 'division') throw new Error(`expected a division line, got ${row?.kind ?? 'a problem'}`)
  return row as DivisionLine
}

describe('parseMatchPaste', () => {
  it('reads nothing out of nothing', () => {
    expect(parse('')).toEqual({ lines: [], matches: [], divisions: [], errors: [] })
  })

  describe('pair lines', () => {
    it('splits on commas and on tabs, and skips blank lines', () => {
      const commas = parse('Mateo Rivera, Olivia Kim')
      const tabs = parse('\nMateo Rivera\tOlivia Kim\n\n')
      expect(commas.matches).toEqual([{ athleteAId: 100, athleteBId: 200, style: 'gi' }])
      expect(tabs.matches).toEqual(commas.matches)
      expect(tabs.lines).toHaveLength(1)
      expect(tabs.lines[0].n).toBe(2)
    })

    it('splits one cell on "vs" and on "v"', () => {
      expect(parse('Mateo Rivera vs Olivia Kim').matches).toEqual([{ athleteAId: 100, athleteBId: 200, style: 'gi' }])
      expect(parse('Mateo Rivera V Olivia Kim').matches).toEqual([{ athleteAId: 100, athleteBId: 200, style: 'gi' }])
    })

    it('reads four cells as first, last, first, last', () => {
      expect(parse('Mateo, Rivera, Olivia, Kim').matches).toEqual([{ athleteAId: 100, athleteBId: 200, style: 'gi' }])
    })

    it('defaults to gi and takes every style token', () => {
      expect(pairs('Mateo Rivera, Olivia Kim').map(p => p.style)).toEqual(['gi'])
      expect(pairs('Mateo Rivera, Olivia Kim, gi').map(p => p.style)).toEqual(['gi'])
      expect(pairs('Mateo Rivera, Olivia Kim, nogi').map(p => p.style)).toEqual(['nogi'])
      expect(pairs('Mateo Rivera, Olivia Kim, No-Gi').map(p => p.style)).toEqual(['nogi'])
      expect(pairs('Mateo Rivera, Olivia Kim, no gi').map(p => p.style)).toEqual(['nogi'])
    })

    it('makes a gi match and a nogi match out of one line reading both', () => {
      const r = parse('Mateo Rivera, Olivia Kim, both')
      expect(r.matches).toEqual([
        { athleteAId: 100, athleteBId: 200, style: 'gi' },
        { athleteAId: 100, athleteBId: 200, style: 'nogi' },
      ])
      // Both rows point at the line that asked for them, so the preview says so.
      expect(r.lines.map(l => l.n)).toEqual([1, 1])
    })

    it('refuses a line that does not hold two names', () => {
      const r = parse('Mateo Rivera')
      expect(r.errors).toEqual(['line 1: a pair needs two names'])
      expect(r.matches).toEqual([])
    })

    it('refuses one competitor on both sides', () => {
      expect(parse('Mateo Rivera, Mateo Rivera').errors).toEqual(['line 1: Mateo Rivera is on both sides'])
    })

    it('refuses a competitor on no team', () => {
      const loose = kid(400, 'Noa', 'Feldman', null)
      expect(parse('Mateo Rivera, Noa Feldman', [...ROSTER, loose]).errors)
        .toEqual(['line 1: Noa Feldman is on no team'])
    })

    it('warns rather than blocks on a same team pair', () => {
      const [pair] = pairs('Mateo Rivera, Ava Brandt')
      expect(pair.notes).toEqual(['Same team'])
      expect(parse('Mateo Rivera, Ava Brandt').matches).toHaveLength(1)
    })

    it('warns that a pair has already met, per style', () => {
      const met = [match({ style: 'gi', athleteAId: 200, athleteBId: 100 })]
      expect(pairs('Mateo Rivera, Olivia Kim', ROSTER, met)[0].notes).toEqual(['Already met'])
      expect(pairs('Mateo Rivera, Olivia Kim, nogi', ROSTER, met)[0].notes).toEqual([])
    })

    it('counts the paste itself, so the second of two identical lines says they have met', () => {
      const notes = pairs('Mateo Rivera, Olivia Kim\nMateo Rivera, Olivia Kim').map(p => p.notes)
      expect(notes).toEqual([[], ['Already met']])
    })
  })

  describe('name resolution', () => {
    it('takes an exact name, ignoring case and a nickname', () => {
      const alex = kid(500, 'Alexander', 'Nguyen', 2)
      expect(parse('mateo rivera, Alex Nguyen', [...ROSTER, alex]).matches)
        .toEqual([{ athleteAId: 100, athleteBId: 500, style: 'gi' }])
    })

    it('takes a near name and says what it matched to', () => {
      const [pair] = pairs('Matteo Rivera, Olivia Kim')
      expect(pair.athleteAId).toBe(100)
      expect(pair.notes).toEqual(['matched to Mateo Rivera'])
    })

    it('refuses a name the roster does not carry', () => {
      expect(parse('Zebedee Quill, Olivia Kim').errors).toEqual(['line 1: Unknown name: Zebedee Quill'])
    })

    it('refuses a name two competitors answer to', () => {
      const twin = kid(600, 'Mateo', 'Rivera', 2)
      expect(parse('Mateo Rivera, Olivia Kim', [...ROSTER, twin]).errors)
        .toEqual(['line 1: Ambiguous name: Mateo Rivera'])
    })

    it('splits a full name at its first space, so a double surname stays whole', () => {
      const double = kid(700, 'Noa', 'Feldman Ortiz', 2)
      expect(parse('Mateo Rivera, Noa Feldman Ortiz', [...ROSTER, double]).matches)
        .toEqual([{ athleteAId: 100, athleteBId: 700, style: 'gi' }])
    })
  })

  describe('division lines', () => {
    it('reads the name, the format and the members', () => {
      const d = onlyDivision('47 to 53 boys, round robin, Mateo Rivera, Olivia Kim, Kai Espinoza')
      expect(d).toMatchObject({ name: '47 to 53 boys', format: 'round_robin', styles: 'both', athleteIds: [100, 200, 300] })
    })

    it('takes every format token', () => {
      const of = (t: string) => onlyDivision(`D, ${t}, Mateo Rivera, Olivia Kim, Kai Espinoza`).format
      expect(of('round robin')).toBe('round_robin')
      expect(of('RR')).toBe('round_robin')
      expect(of('single elimination')).toBe('single_elim')
      expect(of('Single Elim')).toBe('single_elim')
      expect(of('se')).toBe('single_elim')
      expect(of('double elimination')).toBe('double_elim')
      expect(of('double elim')).toBe('double_elim')
      expect(of('DE')).toBe('double_elim')
    })

    it('defaults to both styles and takes a style token after the format', () => {
      const members = 'Mateo Rivera, Olivia Kim, Kai Espinoza'
      expect(onlyDivision(`D, rr, ${members}`).styles).toBe('both')
      expect(onlyDivision(`D, rr, nogi, ${members}`).styles).toBe('nogi')
      expect(onlyDivision(`D, rr, gi, ${members}`).styles).toBe('gi')
    })

    it('names an unnamed division by its place in the paste', () => {
      const r = parse('rr, Mateo Rivera, Olivia Kim\nse, Mateo Rivera, Olivia Kim, Kai Espinoza')
      expect(r.divisions.map(d => d.name)).toEqual(['Division 1', 'Division 2'])
    })

    it('refuses a member count outside the format limits', () => {
      const eleven = Array.from({ length: 11 }, (_, i) => kid(1000 + i, `First${i}`, `Last${i}`, 1 + (i % 3)))
      const line = `Big, round robin, ${eleven.map(k => `${k.firstName} ${k.lastName}`).join(', ')}`
      expect(parse(line, eleven).errors).toEqual(['line 1: Round robin takes 2 to 10 competitors, not 11'])
      expect(parse('Small, double elim, Mateo Rivera, Olivia Kim').errors)
        .toEqual(['line 1: Double elimination takes 3 to 16 competitors, not 2'])
    })

    it('refuses one competitor listed twice', () => {
      expect(parse('D, rr, Mateo Rivera, Olivia Kim, Mateo Rivera').errors)
        .toEqual(['line 1: Mateo Rivera is in the division twice'])
    })

    it('refuses a member on no team', () => {
      const loose = kid(400, 'Noa', 'Feldman', null)
      expect(parse('D, rr, Mateo Rivera, Olivia Kim, Noa Feldman', [...ROSTER, loose]).errors)
        .toEqual(['line 1: Noa Feldman is on no team'])
    })

    it('carries a near match note onto the division line', () => {
      expect(onlyDivision('D, rr, Matteo Rivera, Olivia Kim').notes).toEqual(['matched to Mateo Rivera'])
    })
  })

  it('creates nothing while any line carries a problem', () => {
    const r = parse('Mateo Rivera, Olivia Kim\nZebedee Quill, Kai Espinoza')
    expect(r.errors).toEqual(['line 2: Unknown name: Zebedee Quill'])
    expect(r.matches).toEqual([])
    expect(r.divisions).toEqual([])
    // The preview still shows the good line, so the reader sees what survives the fix.
    expect(r.lines[0].row).toMatchObject({ kind: 'pair', athleteAId: 100, athleteBId: 200 })
    expect(r.lines[1].problem).toBe('Unknown name: Zebedee Quill')
  })

  it('reads a paste of both kinds at once', () => {
    const r = parse('Mateo Rivera vs Olivia Kim\n47 to 53 boys\tse\tgi\tMateo Rivera\tOlivia Kim\tKai Espinoza')
    expect(r.matches).toEqual([{ athleteAId: 100, athleteBId: 200, style: 'gi' }])
    expect(r.divisions).toEqual([{ name: '47 to 53 boys', format: 'single_elim', styles: 'gi', athleteIds: [100, 200, 300] }])
    expect(r.errors).toEqual([])
  })
})
