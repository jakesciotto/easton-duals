import { describe, it, expect } from 'vitest'
import { allMatches, parseBracket } from '../src/smoothcomp/parse.js'
import { seat, BYE, match, elimBracket, roundRobinBracket } from './smoothcomp-fixtures.js'

describe('parseBracket', () => {
  it('parses an elimination bracket into one row per match, with the division, the ids, and won on the right seats', () => {
    const payload = elimBracket([
      match({ id: 501, left: seat({ name: 'Priya Nakamura' }), right: seat({ name: 'Owen Delacroix', won: true, id: 42 }) }),
      match({ id: 502, left: seat({ name: 'Talia Marchetti' }), right: seat({ name: 'Soren Whitfield', won: true }) }),
      match({ id: 503, left: seat({ name: 'Priya Nakamura' }), right: seat({ name: 'Soren Whitfield', won: true }) }),
    ])
    const rows = parseBracket(payload, 9001)
    expect(rows.map(r => r.id)).toEqual([501, 502, 503])
    expect(rows.every(r => r.bracketId === 9001)).toBe(true)
    expect(rows.every(r => r.division === 'Co-Ed Gi / 8 Years / 60 lbs')).toBe(true)
    expect(rows.map(r => r.right?.won)).toEqual([true, true, true])
    expect(rows.map(r => r.left?.won)).toEqual([false, false, false])
    expect(rows[0].right).toMatchObject({ type: 'registration', name: 'Owen Delacroix', firstName: 'Owen', lastName: 'Delacroix', club: 'Ridgeline BJJ', registrationId: 42 })
  })

  it('parses a round robin bracket keyed "1" and "2" into both rounds', () => {
    const payload = roundRobinBracket({
      '1': [match({ id: 601, left: seat({ name: 'Talia Marchetti' }), right: seat({ name: 'Soren Whitfield', won: true }) })],
      '2': [match({ id: 602, left: seat({ name: 'Talia Marchetti', won: true }), right: seat({ name: 'Soren Whitfield' }) })],
    })
    const rows = parseBracket(payload, 9002)
    expect(rows.map(r => r.id).sort((a, b) => a - b)).toEqual([601, 602])
    expect(rows.every(r => r.division === 'Co-Ed No-Gi / 9 Years / 70 lbs')).toBe(true)
  })

  it('reads isBye and a bye seat off a bye match', () => {
    const payload = elimBracket([match({ id: 701, isBye: true, left: seat({ name: 'Priya Nakamura', won: true }), right: BYE })])
    const [row] = parseBracket(payload, 9003)
    expect(row.isBye).toBe(true)
    expect(row.right).toMatchObject({ type: 'bye', name: 'BYE' })
    expect(row.left?.won).toBe(true)
  })

  it('parses a score of any dash form, and null for anything unparsable', () => {
    const scored = (score: string | null) => parseBracket(elimBracket([match({ id: 1, score })]), 1)[0].score
    expect(scored('6–0')).toEqual({ left: 6, right: 0 })
    expect(scored('6-0')).toEqual({ left: 6, right: 0 })
    expect(scored('6—0')).toEqual({ left: 6, right: 0 })
    expect(scored(null)).toBeNull()
    expect(scored('0–')).toBeNull()
  })

  it('splits a seat with no player object on whitespace, last word as the last name', () => {
    const payload = elimBracket([match({
      id: 1,
      left: seat({ name: 'Rosalind Achebe Kerr', player: false }),
      right: seat({ name: 'Owen Delacroix', won: true }),
    })])
    const [row] = parseBracket(payload, 1)
    expect(row.left).toMatchObject({ firstName: 'Rosalind Achebe', lastName: 'Kerr' })
  })

  it('answers null for allMatches and an empty list for parseBracket on neither shape', () => {
    expect(allMatches({})).toBeNull()
    expect(allMatches({ state: {} })).toBeNull()
    expect(parseBracket({}, 1)).toEqual([])
  })
})
