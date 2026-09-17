// Pure. JSON in, rows out. No network, no I/O, so smoothcomp-fixtures.ts can pin the
// behaviour with invented payloads.
//
// Smoothcomp returns two bracket shapes. An elimination bracket carries state.matches, an
// array of match objects. A round robin or best-of-three bracket carries state.rounds
// instead (an object keyed by round number, whose values are arrays of the same match
// shape) and has no state.matches at all. allMatches() reconciles both shapes into one
// flat list and answers null for neither.

export interface SmoothcompSeat { type: 'registration' | 'bye'; name: string; firstName: string; lastName: string; club: string; registrationId: number | null; won: boolean }
export interface SmoothcompMatch { id: number; bracketId: number; division: string; state: string; isBye: boolean; wonBy: string; score: { left: number; right: number } | null; left: SmoothcompSeat | null; right: SmoothcompSeat | null }

type Json = Record<string, unknown>
const obj = (v: unknown): Json | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Json : null
const str = (v: unknown): string => typeof v === 'string' ? v : ''

export function allMatches(json: unknown): unknown[] | null {
  const state = obj(obj(json)?.state)
  if (Array.isArray(state?.matches)) return state.matches
  const rounds = obj(state?.rounds)
  if (rounds) return Object.values(rounds).flatMap(r => Array.isArray(r) ? r : Object.values(obj(r) ?? {}))
  return null
}

// Smoothcomp writes a score as "6–0" with a hyphen, an en dash or an em dash.
const SCORE = /^\s*(\d+)\s*[-–—]\s*(\d+)\s*$/

function parseScore(v: unknown): { left: number; right: number } | null {
  const m = SCORE.exec(str(obj(v)?.score))
  return m ? { left: Number(m[1]), right: Number(m[2]) } : null
}

function parseSeat(v: unknown): SmoothcompSeat | null {
  const s = obj(v)
  if (!s) return null
  const player = obj(s.player)
  const name = str(s.name).trim()
  let firstName = str(player?.firstname).trim()
  let lastName = str(player?.lastname).trim()
  if (!firstName || !lastName) {
    const words = name.split(/\s+/).filter(Boolean)
    lastName = words.length > 0 ? words[words.length - 1] : ''
    firstName = words.slice(0, -1).join(' ')
  }
  const id = player?.id
  return {
    type: s.type === 'bye' || name.toUpperCase() === 'BYE' ? 'bye' : 'registration',
    name, firstName, lastName, club: str(s.club).trim(),
    registrationId: typeof id === 'number' ? id : null,
    won: s.isWinner === true || str(s.result).toLowerCase() === 'won',
  }
}

export function parseBracket(json: unknown, bracketId: number): SmoothcompMatch[] {
  const division = str(obj(obj(obj(obj(json)?.bracketInfo)?.bracketHeaderData)?.group)?.name)
  return (allMatches(json) ?? []).flatMap(raw => {
    const m = obj(raw)
    if (!m || typeof m.id !== 'number') return []
    const seats = obj(m.seats)
    return [{
      id: m.id, bracketId, division, state: str(m.state), isBye: m.isBye === true, wonBy: str(m.wonBy),
      score: parseScore(m.score), left: parseSeat(seats?.left), right: parseSeat(seats?.right),
    }]
  })
}
