import { describe, it, expect } from 'vitest'
import { deriveMatch, deriveOutcome, type MatchEventInput } from '../src/match/derive.js'
import { DEFAULT_TERMINALS } from '../src/shared/types.js'
import { appendMatchEvent, endMatch, DecisionRequired } from '../src/match/events.js'
import { freshDb, seedEvent } from './fixtures.js'

const A = 11, B = 22, LEN = 300_000
const t = (s: number) => new Date(Date.parse('2026-08-27T18:00:00.000Z') + s * 1000).toISOString()
let seq = 0
const ev = (p: Partial<MatchEventInput> & { type: MatchEventInput['type'] }): MatchEventInput => ({
  seq: ++seq, athleteId: null, actionKey: null, points: null, payload: null, at: t(0), ...p,
})

async function liveMatch() {
  const db = await freshDb()
  const s = await seedEvent(db, { live: true })
  return { db, s, matchId: s.matchIds[0] }
}

describe('a score and a win type derive from the events', () => {
  const base = { scoreA: 0, scoreB: 0, clockElapsedMs: 0, clockStartedAt: null, lastSeq: 0, pendingTerminal: null, result: null, extensionMs: 0, lengthMs: 300_000 }
  it('prefers the pending terminal', () => {
    const o = deriveOutcome({ ...base, scoreA: 0, scoreB: 9, pendingTerminal: { athleteId: A, actionKey: 'pin' } }, A, B, DEFAULT_TERMINALS)
    expect(o).toEqual({ kind: 'decided', winnerAthleteId: A, winType: 'submission' })
  })
  it('picks the higher score as a points win', () => {
    expect(deriveOutcome({ ...base, scoreA: 2, scoreB: 4 }, A, B, DEFAULT_TERMINALS)).toEqual({ kind: 'decided', winnerAthleteId: B, winType: 'points' })
  })
  it('reports a tie', () => {
    expect(deriveOutcome({ ...base, scoreA: 3, scoreB: 3 }, A, B, DEFAULT_TERMINALS)).toEqual({ kind: 'tie' })
  })

  it('sums points per athlete and clamps at zero', () => {
    seq = 0
    const d = deriveMatch([
      ev({ type: 'score', athleteId: A, actionKey: 'takedown', points: 2 }),
      ev({ type: 'score', athleteId: B, actionKey: 'penalty', points: -1 }),
      ev({ type: 'score', athleteId: A, actionKey: 'mount', points: 4 }),
    ], A, B, LEN)
    expect(d.scoreA).toBe(6)
    expect(d.scoreB).toBe(0)
    expect(d.lastSeq).toBe(3)
  })

  it('set_score replaces the running total', () => {
    seq = 0
    const d = deriveMatch([
      ev({ type: 'score', athleteId: A, actionKey: 'takedown', points: 2 }),
      ev({ type: 'set_score', athleteId: A, points: 7 }),
      ev({ type: 'set_score', athleteId: B, points: 3 }),
      ev({ type: 'score', athleteId: B, actionKey: 'sweep', points: 2 }),
    ], A, B, LEN)
    expect(d.scoreA).toBe(7)
    expect(d.scoreB).toBe(5)
  })

  it('sets the result on end and clears it on reopen', () => {
    seq = 0
    const base = [ev({ type: 'end', athleteId: A, payload: { kind: 'end', winnerAthleteId: A, winType: 'points' } })]
    expect(deriveMatch(base, A, B, LEN).result).toEqual({ winnerAthleteId: A, winType: 'points' })
    const reopened = [...base, ev({ type: 'admin', payload: { kind: 'reopen' } })]
    expect(deriveMatch(reopened, A, B, LEN).result).toBeNull()
    const edited = [...reopened, ev({ type: 'admin', payload: { kind: 'edit_result', winnerAthleteId: B, winType: 'decision' } })]
    expect(deriveMatch(edited, A, B, LEN).result).toEqual({ winnerAthleteId: B, winType: 'decision' })
  })

  it('requires a decision on a tie and records it', async () => {
    const { db, s, matchId } = await liveMatch()
    await expect(endMatch(db, { id: 'end1', matchId, lastSeq: 0 })).rejects.toThrow(DecisionRequired)
    const r = await endMatch(db, { id: 'end2', matchId, lastSeq: 0, winnerAthleteId: s.a1 })
    expect(r.match.winType).toBe('decision')
    expect(r.match.winnerAthleteId).toBe(s.a1)
  })

  it('takes a chosen win type on a tie', async () => {
    const { db, s, matchId } = await liveMatch()
    const r = await endMatch(db, { id: 'end1', matchId, lastSeq: 0, winnerAthleteId: s.a1, winType: 'dq' })
    expect(r.match.winType).toBe('dq')
    expect(r.match.winnerAthleteId).toBe(s.a1)
  })

  it('ignores a client win type once a terminal already decided it', async () => {
    const { db, s, matchId } = await liveMatch()
    await appendMatchEvent(db, { id: 't1', matchId, type: 'terminal', athleteId: s.a1, actionKey: 'submission', lastSeq: 0 })
    const r = await endMatch(db, { id: 'end1', matchId, lastSeq: 1, winType: 'walkover' })
    expect(r.match.winType).toBe('submission')
  })

  it('ignores a client win type once the points already decided it', async () => {
    const { db, s, matchId } = await liveMatch()
    await appendMatchEvent(db, { id: 'e1', matchId, type: 'score', athleteId: s.b1, actionKey: 'mount', lastSeq: 0 })
    const r = await endMatch(db, { id: 'end1', matchId, lastSeq: 1, winType: 'dq' })
    expect(r.match.winType).toBe('points')
    expect(r.match.winnerAthleteId).toBe(s.b1)
  })
})
