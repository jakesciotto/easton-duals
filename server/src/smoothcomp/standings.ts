import { SCORING_CAP, TEAM_POINTS, type StandingsAthlete, type StandingsCounts, type StandingsReport, type StandingsTeam, type StandingsUnmatched, type TeamColor, type WinType } from '../shared/types.js'
import { scoringSet } from '../shared/scoring.js'
import { rankTeams } from '../shared/leaderboard.js'
import { exactName, nameScore, SUGGEST_FLOOR, SUGGEST_MARGIN } from '../shared/similarity.js'
import type { SmoothcompMatch, SmoothcompSeat } from './parse.js'

export interface StandingsKid { id: number; firstName: string; lastName: string; teamId: number | null; scoring: boolean }
export interface StandingsTeamInput { id: number; name: string; color: TeamColor; position: number }

const METHODS: Record<string, WinType> = { submission: 'submission', points: 'points', decision: 'decision', walkover: 'walkover', disqualification: 'dq', dq: 'dq' }

export function winTypeFor(wonBy: string): WinType | null {
  return METHODS[wonBy.trim().toLowerCase()] ?? null
}

// The exact rule first, then one clear near match. Two exact matches are two kids with one
// name, and nobody can say which one fought, so neither is chosen.
export function resolveKid(seat: { firstName: string; lastName: string }, kids: StandingsKid[]): StandingsKid | null {
  const exact = kids.filter(k => exactName(seat, k))
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return null
  const scored = kids.map(k => ({ k, s: nameScore(seat, k) })).sort((x, y) => y.s - x.s)
  const [best, second] = scored
  if (!best || best.s < SUGGEST_FLOOR) return null
  if (second && second.s > best.s - SUGGEST_MARGIN) return null
  return best.k
}

interface Tally { teamPoints: number; wins: number; points: number }
interface KidTally { wins: number; losses: number; teamPoints: number }

export function computeStandings(input: {
  teams: StandingsTeamInput[]; kids: StandingsKid[]; matches: SmoothcompMatch[]
  brackets: { read: number; failed: number[] }; url: string; fetchedAt: string
}): StandingsReport {
  const { teams, kids, matches } = input
  const kidsByTeam = new Map<number, StandingsKid[]>(teams.map(t => [t.id, []]))
  for (const k of kids) if (k.teamId !== null) kidsByTeam.get(k.teamId)?.push(k)
  const scorers = new Map(teams.map(t => [t.id, scoringSet(kidsByTeam.get(t.id) ?? [])]))
  const teamById = new Map(teams.map(t => [t.id, t]))
  const tally = new Map<number, Tally>(teams.map(t => [t.id, { teamPoints: 0, wins: 0, points: 0 }]))
  const kidTally = new Map<number, KidTally>()
  const counts: StandingsCounts = { read: matches.length, counted: 0, byes: 0, unfinished: 0, undecided: 0, unmatched: 0, sameTeam: 0 }
  const unmatched = new Map<string, StandingsUnmatched>()
  const sameTeamPairs: string[] = []
  const unknownMethods = new Set<string>()
  const name = (k: StandingsKid) => `${k.firstName} ${k.lastName}`

  const listUnmatched = (seat: SmoothcompSeat, division: string) => {
    const key = seat.registrationId !== null ? `id:${seat.registrationId}` : `name:${seat.name}|${seat.club}`
    if (!unmatched.has(key)) unmatched.set(key, { name: seat.name, club: seat.club, division })
  }

  for (const m of matches) {
    if (m.state !== 'finished') { counts.unfinished++; continue }
    const { left, right } = m
    if (m.isBye || !left || !right || left.type === 'bye' || right.type === 'bye') { counts.byes++; continue }
    if (left.won === right.won) { counts.undecided++; continue }
    const a = resolveKid(left, kids)
    const b = resolveKid(right, kids)
    if (!a || a.teamId === null) listUnmatched(left, m.division)
    if (!b || b.teamId === null) listUnmatched(right, m.division)
    if (!a || !b || a.teamId === null || b.teamId === null) { counts.unmatched++; continue }
    counts.counted++
    const winner = left.won ? a : b
    const loser = left.won ? b : a
    const winnerTeam = winner.teamId as number
    if (a.teamId === b.teamId) {
      counts.sameTeam++
      sameTeamPairs.push(`${name(a)} and ${name(b)} (${teamById.get(a.teamId)?.name ?? ''})`)
    }
    const type = winTypeFor(m.wonBy)
    if (type === null) unknownMethods.add(m.wonBy)
    const earned = scorers.get(winnerTeam)?.has(winner.id) ? (type === null ? 1 : TEAM_POINTS[type]) : 0
    const wt = tally.get(winnerTeam)
    if (wt) { wt.wins += 1; wt.teamPoints += earned }
    if (m.score) {
      const ta = tally.get(a.teamId); if (ta) ta.points += m.score.left
      const tb = tally.get(b.teamId); if (tb) tb.points += m.score.right
    }
    const kw = kidTally.get(winner.id) ?? { wins: 0, losses: 0, teamPoints: 0 }
    kw.wins += 1; kw.teamPoints += earned; kidTally.set(winner.id, kw)
    const kl = kidTally.get(loser.id) ?? { wins: 0, losses: 0, teamPoints: 0 }
    kl.losses += 1; kidTally.set(loser.id, kl)
  }

  const ranked = rankTeams(teams.map(t => ({ id: t.id, position: t.position, ...(tally.get(t.id) as Tally) })))
  const teamRows: StandingsTeam[] = ranked.map(row => {
    const t = teamById.get(row.teamId) as StandingsTeamInput
    const members = kidsByTeam.get(t.id) ?? []
    const scoring = scorers.get(t.id) ?? new Set<number>()
    const athletes: StandingsAthlete[] = members.map(k => {
      const kt = kidTally.get(k.id) ?? { wins: 0, losses: 0, teamPoints: 0 }
      return { athleteId: k.id, name: name(k), scoring: scoring.has(k.id), ...kt }
    }).sort((x, y) => y.teamPoints - x.teamPoints || y.wins - x.wins || x.name.localeCompare(y.name))
    return {
      ...row, name: t.name, color: t.color, athletes,
      scoring: { marked: members.filter(k => k.scoring).length, size: members.length, everyone: members.length <= SCORING_CAP },
    }
  })

  return {
    fetchedAt: input.fetchedAt, url: input.url, brackets: input.brackets, matches: counts, teams: teamRows,
    unmatched: [...unmatched.values()], sameTeamPairs, unknownMethods: [...unknownMethods],
  }
}
