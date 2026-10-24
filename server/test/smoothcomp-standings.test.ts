import { describe, it, expect } from 'vitest'
import { computeStandings, resolveKid, winTypeFor, type StandingsKid, type StandingsTeamInput } from '../src/smoothcomp/standings.js'
import type { SmoothcompMatch, SmoothcompSeat } from '../src/smoothcomp/parse.js'

// A parsed seat, invented names only. registrationId stays null: these tests resolve by
// name, the same path a Smoothcomp payload with no player id would take.
function seat(name: string, won: boolean, club = ''): SmoothcompSeat {
  const [firstName, ...rest] = name.split(' ')
  return { type: 'registration', name, firstName, lastName: rest.join(' '), club, registrationId: null, won }
}
const BYE_SEAT: SmoothcompSeat = { type: 'bye', name: 'BYE', firstName: '', lastName: '', club: '', registrationId: null, won: false }

function match(o: { id: number; left: SmoothcompSeat | null; right: SmoothcompSeat | null; wonBy?: string; state?: string; isBye?: boolean; score?: { left: number; right: number } | null; division?: string }): SmoothcompMatch {
  return {
    id: o.id, bracketId: 1, division: o.division ?? 'Co-Ed Gi / 8 Years / 60 lbs', state: o.state ?? 'finished',
    isBye: o.isBye ?? false, wonBy: o.wonBy ?? 'points', score: o.score ?? null, left: o.left, right: o.right,
  }
}

describe('a Smoothcomp win method maps to a win type and an unknown method earns one point', () => {
  it('maps disqualification to dq, case insensitively', () => {
    expect(winTypeFor('Disqualification')).toBe('dq')
  })

  it('answers null for a method it does not know, including bye', () => {
    expect(winTypeFor('bye')).toBeNull()
  })

  it('maps every method of the table in any case and padding', () => {
    const table: [string, string][] = [
      ['submission', 'submission'], ['points', 'points'], ['decision', 'decision'],
      ['walkover', 'walkover'], ['disqualification', 'dq'], ['dq', 'dq'],
    ]
    for (const [method, type] of table) {
      expect(winTypeFor(method)).toBe(type)
      expect(winTypeFor(`  ${method.toUpperCase()} `)).toBe(type)
    }
    for (const method of ['bye', 'Penalties', 'Advantages', '', 'sub']) expect(winTypeFor(method)).toBeNull()
  })

  it('pays a scoring winner the table points for a known method and one point for an unknown one, and names it', () => {
    const teams: StandingsTeamInput[] = [
      { id: 1, name: 'Ridgeline', color: 'red', position: 0 },
      { id: 2, name: 'Lakeside', color: 'blue', position: 1 },
    ]
    const kids: StandingsKid[] = [
      { id: 1, firstName: 'Mateo', lastName: 'Rivera', teamId: 1, scoring: false },
      { id: 2, firstName: 'Olivia', lastName: 'Kim', teamId: 2, scoring: false },
    ]
    const methods: [string, number][] = [
      ['Submission', 3], ['Points', 2], ['Decision', 1], ['Walkover', 1], ['Disqualification', 1], ['Penalties', 1], ['Advantages', 1],
    ]
    for (const [wonBy, expected] of methods) {
      const report = computeStandings({
        teams, kids, matches: [match({ id: 1, left: seat('Mateo Rivera', true), right: seat('Olivia Kim', false), wonBy })],
        brackets: { read: 1, failed: [] }, url: 'https://smoothcomp.com/en/event/1', fetchedAt: '2026-10-24T00:00:00.000Z',
      })
      const ridgeline = report.teams.find(t => t.teamId === 1)
      expect([wonBy, ridgeline?.teamPoints, ridgeline?.wins]).toEqual([wonBy, expected, 1])
      expect(report.unknownMethods).toEqual(winTypeFor(wonBy) === null ? [wonBy] : [])
    }
  })
})

describe('a Smoothcomp match counts only when both names resolve to roster kids on teams', () => {
  const teams: StandingsTeamInput[] = [
    { id: 1, name: 'Ridgeline', color: 'red', position: 0 },
    { id: 2, name: 'Lakeside', color: 'blue', position: 1 },
  ]
  const kids: StandingsKid[] = [
    { id: 1, firstName: 'Mateo', lastName: 'Rivera', teamId: 1, scoring: false },
    { id: 2, firstName: 'Ava', lastName: 'Park', teamId: 1, scoring: false },
    { id: 3, firstName: 'Olivia', lastName: 'Kim', teamId: 2, scoring: false },
    { id: 4, firstName: 'Noah', lastName: 'Tran', teamId: 2, scoring: false },
    { id: 5, firstName: 'Ines', lastName: 'Baptista', teamId: null, scoring: false },
  ]

  it('joins the roster to the finished matches and ranks the teams', () => {
    const mateo = seat('Mateo Rivera', true)
    const olivia = seat('Olivia Kim', false)
    const noah = seat('Noah Tran', true)
    const ava = seat('Ava Park', false)
    const avaWins = seat('Ava Park', true)
    const noahLoses = seat('Noah Tran', false)
    const mateoLoses = seat('Mateo Rivera', false)
    const mateoWins = seat('Mateo Rivera', true)
    const avaLoses = seat('Ava Park', false)
    const ines = seat('Ines Baptista', false, 'Lakeside BJJ')
    const zed = seat('Zed Quill', true, 'Hillcrest BJJ')
    const mateoPending = seat('Mateo Rivera', false)
    const noahPending = seat('Noah Tran', false)

    const report = computeStandings({
      teams, kids, url: 'https://smoothcomp.com/en/event/29499', fetchedAt: '2026-09-17T18:00:00.000Z',
      brackets: { read: 3, failed: [] },
      matches: [
        match({ id: 1, left: mateo, right: olivia, wonBy: 'submission', score: { left: 2, right: 0 } }),
        match({ id: 2, left: noah, right: ava, wonBy: 'points', score: { left: 6, right: 2 } }),
        match({ id: 3, left: avaWins, right: noahLoses, wonBy: 'injury', score: { left: 0, right: 0 } }),
        match({ id: 4, left: seat('Mateo Rivera', true), right: BYE_SEAT, isBye: true }),
        match({ id: 5, left: seat('Olivia Kim', true), right: ines }),
        match({ id: 6, left: mateoLoses, right: zed }),
        match({ id: 7, left: mateoPending, right: noahPending, state: 'pending' }),
        match({ id: 8, left: mateoWins, right: avaLoses, wonBy: 'walkover', score: null }),
      ],
    })

    expect(report.matches).toEqual({ read: 8, counted: 4, byes: 1, unfinished: 1, undecided: 0, unmatched: 2, sameTeam: 1 })
    expect(report.unknownMethods).toEqual(['injury'])
    expect(report.sameTeamPairs).toEqual(['Mateo Rivera and Ava Park (Ridgeline)'])
    expect(report.unmatched).toEqual([
      { name: 'Ines Baptista', club: 'Lakeside BJJ', division: 'Co-Ed Gi / 8 Years / 60 lbs' },
      { name: 'Zed Quill', club: 'Hillcrest BJJ', division: 'Co-Ed Gi / 8 Years / 60 lbs' },
    ])

    const ridgeline = report.teams.find(t => t.name === 'Ridgeline')
    const lakeside = report.teams.find(t => t.name === 'Lakeside')
    expect(ridgeline).toMatchObject({ rank: 1, teamPoints: 5, wins: 3, points: 4 })
    expect(lakeside).toMatchObject({ rank: 2, teamPoints: 2, wins: 1, points: 6 })

    const mateoRow = ridgeline?.athletes.find(a => a.name === 'Mateo Rivera')
    expect(mateoRow).toMatchObject({ wins: 2, losses: 0, teamPoints: 4, scoring: true })
  })

  it('pays zero team points for an unmarked kid on a team over the cap, and the marks for the rest', () => {
    const bigTeam: StandingsTeamInput[] = [{ id: 1, name: 'Ridgeline', color: 'red', position: 0 }, { id: 2, name: 'Lakeside', color: 'blue', position: 1 }]
    const eleven: StandingsKid[] = Array.from({ length: 11 }, (_, i) => ({
      id: i + 1, firstName: `Kid${i + 1}`, lastName: 'Ridgeline', teamId: 1, scoring: i + 1 === 1 || i + 1 === 2,
    }))
    const opponent: StandingsKid = { id: 200, firstName: 'Sage', lastName: 'Coulter', teamId: 2, scoring: false }

    const report = computeStandings({
      teams: bigTeam, kids: [...eleven, opponent], url: 'https://smoothcomp.com/en/event/1', fetchedAt: '2026-09-17T18:00:00.000Z',
      brackets: { read: 2, failed: [] },
      matches: [
        // Kid1 is marked: the submission earns Ridgeline three team points.
        match({ id: 1, left: seat('Kid1 Ridgeline', true), right: seat('Sage Coulter', false), wonBy: 'submission' }),
        // Kid3 is not marked: the win counts, the team gets nothing for it.
        match({ id: 2, left: seat('Kid3 Ridgeline', true), right: seat('Sage Coulter', false), wonBy: 'submission' }),
      ],
    })

    const ridgeline = report.teams.find(t => t.name === 'Ridgeline')
    expect(ridgeline?.scoring).toEqual({ marked: 2, size: 11, everyone: false })
    expect(ridgeline?.athletes.find(a => a.name === 'Kid1 Ridgeline')).toMatchObject({ scoring: true, wins: 1, losses: 0, teamPoints: 3 })
    expect(ridgeline?.athletes.find(a => a.name === 'Kid3 Ridgeline')).toMatchObject({ scoring: false, wins: 1, losses: 0, teamPoints: 0 })
    expect(ridgeline?.athletes.find(a => a.name === 'Kid5 Ridgeline')).toMatchObject({ scoring: false, wins: 0, losses: 0, teamPoints: 0 })
  })

  it('shares rank 1 on a tie across all three keys, and the next team reads rank 3', () => {
    const threeTeams: StandingsTeamInput[] = [
      { id: 1, name: 'Ridgeline', color: 'red', position: 0 },
      { id: 2, name: 'Lakeside', color: 'blue', position: 1 },
      { id: 3, name: 'Hillcrest', color: 'green', position: 2 },
    ]
    const threeKids: StandingsKid[] = [
      { id: 1, firstName: 'Rory', lastName: 'Beckman', teamId: 1, scoring: false },
      { id: 2, firstName: 'Sage', lastName: 'Coulter', teamId: 2, scoring: false },
    ]
    const report = computeStandings({
      teams: threeTeams, kids: threeKids, url: 'https://smoothcomp.com/en/event/1', fetchedAt: '2026-09-17T18:00:00.000Z',
      brackets: { read: 2, failed: [] },
      matches: [
        match({ id: 1, left: seat('Rory Beckman', true), right: seat('Sage Coulter', false), wonBy: 'decision', score: { left: 0, right: 0 } }),
        match({ id: 2, left: seat('Sage Coulter', true), right: seat('Rory Beckman', false), wonBy: 'decision', score: { left: 0, right: 0 } }),
      ],
    })
    const byName = (n: string) => report.teams.find(t => t.name === n)
    expect(byName('Ridgeline')?.rank).toBe(1)
    expect(byName('Lakeside')?.rank).toBe(1)
    expect(byName('Hillcrest')?.rank).toBe(3)
  })

  it('resolves a seat to one roster kid by exact, canonical or near name, and to nothing when two share it or none is close', () => {
    const roster: StandingsKid[] = [
      { id: 1, firstName: 'Mateo', lastName: 'Rivera', teamId: 1, scoring: false },
      { id: 2, firstName: 'Ava', lastName: 'Park', teamId: 1, scoring: false },
    ]
    const twins: StandingsKid[] = [
      { id: 1, firstName: 'Mateo', lastName: 'Rivera', teamId: 1, scoring: false },
      { id: 2, firstName: 'Mateo', lastName: 'Rivera', teamId: 2, scoring: false },
    ]
    const cases: [{ firstName: string; lastName: string }, StandingsKid[], StandingsKid | null][] = [
      [{ firstName: 'Mateo', lastName: 'Rivera' }, roster, roster[0]],
      [{ firstName: 'Mateo A.', lastName: 'Rivera' }, roster, roster[0]],
      [{ firstName: 'Matt', lastName: 'Rivera' }, roster, roster[0]],
      [{ firstName: 'Mateo', lastName: 'Rivera' }, twins, null],
      [{ firstName: 'Zed', lastName: 'Quill' }, roster, null],
    ]
    for (const [seatName, kids, expected] of cases) {
      expect(resolveKid(seatName, kids), `${seatName.firstName} ${seatName.lastName}`).toBe(expected)
    }
  })
})
