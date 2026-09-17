import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SmoothcompDialog } from '@/routes/event/SmoothcompDialog'
import { setAdminToken } from '@/lib/auth'
import type { AthleteRow, EventDetail, EventRow, StandingsReport } from '@/lib/types'
import { fakeFetch } from './fakes'

beforeEach(() => { localStorage.clear(); setAdminToken('tok') })
afterEach(() => vi.unstubAllGlobals())

const EVENT_URL = 'https://smoothcomp.com/en/event/29499'

const kid = (id: number, teamId: number | null, first: string, last: string, scoring: boolean): AthleteRow => ({
  id, eventId: 7, teamId, firstName: first, lastName: last, age: 8, ageSource: 'manual', weightLbs: 60, weightSource: 'manual',
  belt: 'grey', gender: 'M', source: 'manual', wlUid: null, wlLocation: null, leaderboardId: null, erp: null,
  promotedAt: null, syncedAt: null, syncChanges: null, suggestedWlUid: null, suggestedScore: null, dismissedWlUids: [], scoring,
})

// Ridgeline sits inside the cap, so its one mark is moot and the line says so. Lakeside is
// twelve deep with ten marked, which is the only shape where the marks decide anything.
const RIDGELINE = [
  kid(100, 1, 'Mateo', 'Rivera', true),
  kid(101, 1, 'Ava', 'Park', false),
  kid(102, 1, 'Liam', 'Cruz', false),
]
const LAKESIDE_NAMES = [
  'Olivia Kim', 'Noah Tran', 'Kai Wong', 'Iris Nolan', 'Hana Beck', 'Theo Marsh',
  'Nina Alvarez', 'Owen Pratt', 'Zara Idris', 'Felix Dunn', 'Maya Okoro', 'Rex Calder',
]
const LAKESIDE = LAKESIDE_NAMES.map((full, i) => {
  const [first, last] = full.split(' ')
  return kid(200 + i, 2, first, last, i < 10)
})

function detailWith(over: Partial<EventDetail> = {}, event: Partial<EventRow> = {}): EventDetail {
  return {
    event: { id: 7, name: 'Fall Duals', date: '2026-10-03', matCount: 1, matCode: '0420', mode: 'live', status: 'setup', sameGender: false, createdAt: 'x', ...event },
    teams: [
      { id: 1, eventId: 7, name: 'Ridgeline', color: 'red', position: 0 },
      { id: 2, eventId: 7, name: 'Lakeside', color: 'blue', position: 1 },
    ],
    athletes: [...RIDGELINE, ...LAKESIDE],
    rulesets: [], mats: [], matches: [], divisions: [], candidateCount: 0,
    ...over,
  }
}

const REPORT: StandingsReport = {
  fetchedAt: '2026-10-03T16:00:00.000Z',
  url: EVENT_URL,
  brackets: { read: 3, failed: [] },
  matches: { read: 6, counted: 4, byes: 1, unfinished: 0, undecided: 0, unmatched: 1, sameTeam: 0 },
  teams: [
    {
      teamId: 1, rank: 1, name: 'Ridgeline', color: 'red', teamPoints: 7, wins: 3, points: 12,
      scoring: { marked: 1, size: 3, everyone: true },
      athletes: [{ athleteId: 100, name: 'Mateo Rivera', scoring: true, wins: 2, losses: 0, teamPoints: 3 }],
    },
    {
      teamId: 2, rank: 2, name: 'Lakeside', color: 'blue', teamPoints: 2, wins: 1, points: 6,
      scoring: { marked: 10, size: 12, everyone: false },
      athletes: [{ athleteId: 200, name: 'Olivia Kim', scoring: false, wins: 0, losses: 1, teamPoints: 0 }],
    },
  ],
  unmatched: [{ name: 'Zed Quill', club: 'Cliffside BJJ', division: 'Boys 8 Grey 62' }],
  sameTeamPairs: [],
  unknownMethods: [],
}

const standings = (url: string) => url.endsWith('/smoothcomp/standings')

function mount(detail: EventDetail, certified = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <SmoothcompDialog detail={detail} certified={certified} open onOpenChange={() => {}} />
    </QueryClientProvider>,
  )
}

const teamLine = (name: string) => screen.getByText(name).closest('[data-slot="list-row"]') as HTMLElement
const calculate = () => screen.getByRole('button', { name: 'Calculate' })

describe('SmoothcompDialog', () => {
  it('counts each team and says which of its competitors score', async () => {
    fakeFetch(() => ({ json: {} }))
    mount(detailWith())
    await screen.findByRole('dialog')
    expect(teamLine('Ridgeline')).toHaveTextContent('3 competitors, every competitor scores')
    expect(teamLine('Lakeside')).toHaveTextContent('12 competitors, 10 scoring')
  })

  it('asks for the roster first, and holds Calculate until somebody is on a team', async () => {
    fakeFetch(() => ({ json: {} }))
    // The URL is already stored, so the empty roster is the only thing in the way.
    mount(detailWith({ athletes: [] }, { smoothcompUrl: EVENT_URL }))
    await screen.findByRole('dialog')
    expect(screen.getByText("Paste the roster first. The names must match Smoothcomp's registrations.")).toBeInTheDocument()
    expect(calculate()).toBeDisabled()
  })

  it('steps aside for the paste dialog rather than nesting one inside the other', async () => {
    fakeFetch(() => ({ json: {} }))
    mount(detailWith())
    const user = userEvent.setup()
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Paste roster' }))
    await vi.waitFor(() => expect(screen.getByRole('dialog')).toHaveAccessibleName('Paste roster'))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('saves a changed URL before it reads Smoothcomp', async () => {
    const f = fakeFetch(url => (standings(url) ? { json: REPORT } : { json: {} }))
    mount(detailWith())
    const user = userEvent.setup()
    await screen.findByRole('dialog')
    await user.type(screen.getByLabelText('Smoothcomp event URL'), EVENT_URL)
    await user.click(calculate())
    await screen.findByText('Ridgeline wins')
    expect(f.calls.map(c => `${c.init?.method} ${c.url}`)).toEqual([
      'PATCH /api/events/7',
      'POST /api/events/7/smoothcomp/standings',
    ])
    expect(f.body(0)).toEqual({ smoothcompUrl: EVENT_URL })
  })

  it('sends no save when the stored URL is the one on screen', async () => {
    const f = fakeFetch(() => ({ json: REPORT }))
    mount(detailWith({}, { smoothcompUrl: EVENT_URL }))
    const user = userEvent.setup()
    await screen.findByRole('dialog')
    await user.click(calculate())
    await screen.findByText('Ridgeline wins')
    expect(f.calls.map(c => `${c.init?.method} ${c.url}`)).toEqual(['POST /api/events/7/smoothcomp/standings'])
  })

  it('stops at a refused save rather than reading Smoothcomp anyway', async () => {
    const f = fakeFetch(() => ({ status: 422, json: { error: { code: 'validation', message: 'Not a smoothcomp.com URL: example.com' } } }))
    mount(detailWith())
    const user = userEvent.setup()
    await screen.findByRole('dialog')
    await user.type(screen.getByLabelText('Smoothcomp event URL'), 'https://example.com/event/1')
    await user.click(calculate())
    expect(await screen.findByText('Not a smoothcomp.com URL: example.com')).toBeInTheDocument()
    expect(f.calls.every(c => !standings(c.url))).toBe(true)
  })

  it('names the winner, ranks the teams and prints what it could not place', async () => {
    fakeFetch(url => (standings(url) ? { json: REPORT } : { json: {} }))
    mount(detailWith({}, { smoothcompUrl: EVENT_URL }))
    const user = userEvent.setup()
    await screen.findByRole('dialog')
    await user.click(calculate())
    expect(await screen.findByText('Ridgeline wins')).toBeInTheDocument()

    const ranked = within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1)
    expect(ranked.map(r => within(r).getAllByRole('cell')[0].textContent)).toEqual(['1', '2'])

    const mateo = screen.getByText('Mateo Rivera').closest('tr') as HTMLElement
    expect(within(mateo).getAllByRole('cell').map(c => c.textContent)).toEqual(['Mateo Rivera', 'yes', '2-0', '3'])
    const olivia = screen.getByText('Olivia Kim').closest('tr') as HTMLElement
    expect(within(olivia).getAllByRole('cell').map(c => c.textContent)).toEqual(['Olivia Kim', '--', '0-1', '0'])

    expect(screen.getByText('Not on the roster')).toBeInTheDocument()
    expect(screen.getByText('Zed Quill, Cliffside BJJ, Boys 8 Grey 62')).toBeInTheDocument()
    expect(screen.getByText(/matches read/)).toHaveTextContent('6 matches read, 4 counted, 1 byes, 0 not finished, 0 undecided, 1 skipped')
  })

  it('leaves out every list the report has nothing for', async () => {
    fakeFetch(url => (standings(url) ? { json: REPORT } : { json: {} }))
    mount(detailWith({}, { smoothcompUrl: EVENT_URL }))
    const user = userEvent.setup()
    await screen.findByRole('dialog')
    await user.click(calculate())
    await screen.findByText('Ridgeline wins')
    expect(screen.queryByText('Same team pairs')).not.toBeInTheDocument()
    expect(screen.queryByText('Unknown win methods')).not.toBeInTheDocument()
    expect(screen.queryByText('Brackets that failed')).not.toBeInTheDocument()
  })

  it('names the failure when Smoothcomp does not answer in time', async () => {
    fakeFetch(url => (standings(url)
      ? { status: 504, json: { error: { code: 'smoothcomp_timeout', message: 'Smoothcomp took too long. Try again.' } } }
      : { json: {} }))
    mount(detailWith({}, { smoothcompUrl: EVENT_URL }))
    const user = userEvent.setup()
    await screen.findByRole('dialog')
    await user.click(calculate())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Standings were not calculated')
    expect(alert).toHaveTextContent('Smoothcomp took too long. Try again.')
  })

  it('locks the URL on a certified event, because saving it is a write', async () => {
    fakeFetch(() => ({ json: {} }))
    mount(detailWith({}, { smoothcompUrl: EVENT_URL }), true)
    await screen.findByRole('dialog')
    expect(screen.getByLabelText('Smoothcomp event URL')).toBeDisabled()
    expect(calculate()).toBeEnabled()
  })
})
