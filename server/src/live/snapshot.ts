import { asc, eq } from 'drizzle-orm'
import type { DbLike } from '../db/client.js'
import { events, teams, athletes, rulesets, mats, matches, type MatchRow, type AthleteRow, type EventRow } from '../db/schema.js'
import { ON_DECK_DEPTH, SCORING_CAP, type Snapshot, type MatchView, type MatchSide, type MatView, type TeamView, type TeamColor, type EventContact, type Feed, type FeedTake } from '../shared/types.js'
import { rankTeams } from '../shared/leaderboard.js'
import { scoringSet, teamPointsFor } from '../shared/scoring.js'
import { MatchStateError, endedAtByMatch } from '../match/events.js'
import { effectiveLengthMs } from '../match/derive.js'
import type { TokenPayload } from '../auth/tokens.js'

/**
 * Which name a view carries. The snapshot is public: the board reads it with no token
 * and the tablets with a mat token, and until 2026-09-08 it served every child's full
 * name to anyone with the URL. Only the console, which holds an admin token, gets the
 * full name. Public is the default so a new caller has to ask for the full form.
 */
export type NameForm = 'full' | 'public'

export function nameFormFor(auth: TokenPayload | null | undefined): NameForm {
  return auth?.role === 'admin' ? 'full' : 'public'
}

/** First name plus last initial: "Mateo R.". A single name stays as it is. */
export function publicName(firstName: string, lastName: string): string {
  const first = firstName.trim()
  const initial = lastName.trim().charAt(0).toUpperCase()
  return initial ? `${first} ${initial}.` : first
}

export interface SnapshotOptions {
  nowMs: number
  names?: NameForm
}

export function eventContact(ev: Pick<EventRow, 'contactName' | 'contactPhone'>): EventContact | null {
  const name = ev.contactName?.trim() ?? ''
  const phone = ev.contactPhone?.trim() ?? ''
  return name && phone ? { name, phone } : null
}

/** "Winner of M7" or "Loser of M7", which is all an empty side has to print. */
export function feedLabel(feed: Feed): string {
  return `${feed.take === 'winner' ? 'Winner' : 'Loser'} of M${feed.matchNumber}`
}

/**
 * `numberOf` turns a feeder's match id into the number every surface prints. A caller
 * that cannot reach the feeder answers null, and the side falls back to 'Unknown' rather
 * than naming a match nobody can look up.
 */
export function toMatchView(
  m: MatchRow,
  athleteById: Map<number, AthleteRow>,
  endedAt: string | null,
  names: NameForm = 'public',
  numberOf: (matchId: number) => number | null = () => null,
): MatchView {
  const lengthMs = effectiveLengthMs(m)
  const feedOf = (matchId: number | null, take: FeedTake | null): Feed | null => {
    if (matchId === null || take === null) return null
    const matchNumber = numberOf(matchId)
    return matchNumber === null ? null : { matchId, matchNumber, take }
  }
  const side = (id: number | null, score: number, feed: Feed | null): MatchSide => {
    const a = id === null ? undefined : athleteById.get(id)
    return {
      athleteId: id,
      name: a ? (names === 'full' ? `${a.firstName} ${a.lastName}` : publicName(a.firstName, a.lastName))
        : feed && id === null ? feedLabel(feed) : 'Unknown',
      teamId: a?.teamId ?? null,
      belt: a?.belt ?? null,
      weightLbs: a?.weightLbs ?? null,
      score,
      feed,
    }
  }
  return {
    id: m.id,
    number: m.number,
    orderIndex: m.orderIndex,
    matId: m.matId,
    status: m.status,
    rulesetId: m.rulesetId,
    lengthSec: Math.round(lengthMs / 1000),
    why: m.why,
    source: m.source,
    style: m.style,
    divisionId: m.divisionId,
    round: m.round,
    a: side(m.athleteAId, m.pointsA, feedOf(m.feedAMatchId, m.feedATake)),
    b: side(m.athleteBId, m.pointsB, feedOf(m.feedBMatchId, m.feedBTake)),
    clock: { elapsedMs: m.clockElapsedMs, startedAt: m.clockStartedAt, lengthMs },
    result: m.winnerAthleteId !== null && m.winType !== null ? { winnerAthleteId: m.winnerAthleteId, winType: m.winType } : null,
    pendingTerminal: m.pendingTerminalAthleteId !== null && m.pendingTerminalKey !== null
      ? { athleteId: m.pendingTerminalAthleteId, actionKey: m.pendingTerminalKey }
      : null,
    endedAt,
    lastSeq: m.lastSeq,
  }
}

/**
 * Why the mat at the head of this queue is not running yet, or null when it is only
 * waiting to be called. An empty side comes first: a kid can be both waiting on a feeder
 * and busy elsewhere, and the feeder is the one that has to happen first.
 */
function blockedReason(next: MatchView | undefined, liveOn: Map<number, number>): string | null {
  if (!next) return null
  const empty = [next.a, next.b].find(side => side.athleteId === null)
  if (empty) return empty.feed ? `Waiting on M${empty.feed.matchNumber}` : null
  const busy = [next.a, next.b].find(side => side.athleteId !== null && liveOn.has(side.athleteId))
  const matNumber = busy?.athleteId === undefined || busy.athleteId === null ? undefined : liveOn.get(busy.athleteId)
  return busy && matNumber !== undefined ? `${busy.name} is live on mat ${matNumber}` : null
}

export async function buildSnapshot(db: DbLike, eventId: number, opts: SnapshotOptions): Promise<Snapshot> {
  const ev = await db.select().from(events).where(eq(events.id, eventId)).get()
  if (!ev) throw new MatchStateError('event not found')
  const teamRows = await db.select().from(teams).where(eq(teams.eventId, eventId)).orderBy(asc(teams.position)).all()
  const athleteRows = await db.select().from(athletes).where(eq(athletes.eventId, eventId)).all()
  const athleteById = new Map(athleteRows.map(a => [a.id, a]))
  const rulesetRows = await db.select().from(rulesets).where(eq(rulesets.eventId, eventId)).orderBy(asc(rulesets.id)).all()
  const matRows = await db.select().from(mats).where(eq(mats.eventId, eventId)).orderBy(asc(mats.number)).all()
  const matchRows = await db.select().from(matches).where(eq(matches.eventId, eventId)).orderBy(asc(matches.orderIndex), asc(matches.id)).all()
  const endedAtById = await endedAtByMatch(db, matchRows.map(m => m.id))
  const numberById = new Map(matchRows.map(m => [m.id, m.number]))
  const numberOf = (matchId: number) => numberById.get(matchId) ?? null
  const views = matchRows.map(m => toMatchView(m, athleteById, endedAtById.get(m.id) ?? null, opts.names ?? 'public', numberOf))

  const kidsByTeam = new Map<number, AthleteRow[]>(teamRows.map(t => [t.id, []]))
  for (const a of athleteRows) if (a.teamId !== null) kidsByTeam.get(a.teamId)?.push(a)
  const scorers = new Map(teamRows.map(t => [t.id, scoringSet(kidsByTeam.get(t.id) ?? [])]))
  const tally = new Map<number, { teamPoints: number; wins: number; points: number }>(teamRows.map(t => [t.id, { teamPoints: 0, wins: 0, points: 0 }]))
  const add = (teamId: number | null, wins: number, points: number, teamPoints = 0) => {
    if (teamId === null) return
    const t = tally.get(teamId)
    if (t) {
      t.teamPoints += teamPoints
      t.wins += wins
      t.points += points
    }
  }
  for (const v of views) {
    add(v.a.teamId, 0, v.a.score)
    add(v.b.teamId, 0, v.b.score)
    if (v.status === 'done' && v.result) {
      // Every win counts as a win; only a win by a scoring kid earns the team points.
      const winner = v.result.winnerAthleteId === v.a.athleteId ? v.a : v.b
      const scores = winner.teamId !== null && (scorers.get(winner.teamId)?.has(v.result.winnerAthleteId) ?? false)
      add(winner.teamId, 1, 0, scores ? teamPointsFor(v.result.winType) : 0)
    }
  }

  const teamViews: TeamView[] = teamRows.map(t => {
    const kids = kidsByTeam.get(t.id) ?? []
    return {
      id: t.id, name: t.name, color: t.color as TeamColor, position: t.position,
      teamPoints: tally.get(t.id)?.teamPoints ?? 0, wins: tally.get(t.id)?.wins ?? 0, points: tally.get(t.id)?.points ?? 0,
      scoring: { marked: kids.filter(k => k.scoring).length, size: kids.length, everyone: kids.length <= SCORING_CAP },
    }
  })
  // Which mat each kid on a mat right now is on, so an idle mat can say who it is waiting
  // for by name rather than only that something is in the way.
  const matNumberById = new Map(matRows.map(m => [m.id, m.number]))
  const liveOn = new Map<number, number>()
  for (const v of views) {
    const matNumber = v.matId === null ? undefined : matNumberById.get(v.matId)
    if (v.status !== 'live' || matNumber === undefined) continue
    for (const side of [v.a, v.b]) if (side.athleteId !== null) liveOn.set(side.athleteId, matNumber)
  }
  const matViews: MatView[] = matRows.map(mat => {
    const current = mat.currentMatchId !== null ? views.find(v => v.id === mat.currentMatchId) ?? null : null
    const onDeck = views.filter(v => v.matId === mat.id && v.status === 'pending' && v.id !== current?.id).slice(0, ON_DECK_DEPTH)
    return { id: mat.id, number: mat.number, current, onDeck, bound: mat.bound, blocked: current ? null : blockedReason(onDeck[0], liveOn) }
  })
  return {
    version: ev.version,
    now: new Date(opts.nowMs).toISOString(),
    event: { id: ev.id, name: ev.name, date: ev.date, status: ev.status, mode: ev.mode, matCount: ev.matCount, contact: eventContact(ev), certifiedAt: ev.certifiedAt, far: ev.far },
    teams: teamViews,
    leaderboard: rankTeams(teamViews),
    rulesets: rulesetRows.map(r => ({ id: r.id, name: r.name, defaultLengthSec: r.defaultLengthSec, actions: r.actions, terminals: r.terminals })),
    mats: matViews,
    matches: views,
  }
}
