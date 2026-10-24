import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Snapshot } from '@shared/types'
import EventPage from '@/routes/EventPage'
import { setAdminToken } from '@/lib/auth'
import type { EventDetail, MatchRow } from '@/lib/types'
import { fakeFetch, sampleSnapshot, type Reply } from './fakes'

vi.mock('qrcode', () => ({ default: { toString: async () => '<svg>mock</svg>' } }))
beforeEach(() => { localStorage.clear(); setAdminToken('tok') })
afterEach(() => vi.unstubAllGlobals())

const kid = (id: number, teamId: number, first: string, last: string): EventDetail['athletes'][number] => ({
  id, eventId: 7, teamId, firstName: first, lastName: last, age: 8, ageSource: 'manual', weightLbs: 60, weightSource: 'manual',
  belt: 'grey', gender: 'M', source: 'manual', wlUid: null, wlLocation: null, leaderboardId: null, erp: null,
  promotedAt: null, syncedAt: null, syncChanges: null, suggestedWlUid: null, suggestedScore: null, dismissedWlUids: [], scoring: false,
})

const match = (id: number, orderIndex: number, a: number, b: number): MatchRow => ({
  id, eventId: 7, matId: 1, orderIndex, rulesetId: 1, lengthSec: 300, athleteAId: a, athleteBId: b, status: 'pending',
  winnerAthleteId: null, winType: null, pointsA: 0, pointsB: 0, clockElapsedMs: 0, clockStartedAt: null,
  pendingTerminalAthleteId: null, pendingTerminalKey: null,
  number: id, style: 'gi', divisionId: null, round: null, feedAMatchId: null, feedATake: null, feedBMatchId: null, feedBTake: null,
  lastSeq: 0, why: null, source: 'designed',
})

const ROSTER = [
  kid(100, 1, 'Mateo', 'Rivera'), kid(101, 1, 'Ava', 'Park'), kid(102, 1, 'Liam', 'Cruz'),
  kid(200, 2, 'Olivia', 'Kim'), kid(201, 2, 'Noah', 'Tran'), kid(202, 2, 'Kai', 'Wong'),
]

const IN_ORDER = [match(1, 0, 100, 200), match(2, 1, 101, 201), match(3, 2, 102, 202)]

function detailWith(matches: MatchRow[], athletes = ROSTER): EventDetail {
  return {
    event: { id: 7, name: 'Fall Duals', date: '2026-10-03', matCount: 1, matCode: '0420', status: 'setup', mode: 'live', sameGender: false, createdAt: 'x' },
    teams: [{ id: 1, eventId: 7, name: 'Ridgeline', color: 'red', position: 0 }, { id: 2, eventId: 7, name: 'Lakeside', color: 'blue', position: 1 }],
    athletes,
    rulesets: [{ id: 1, eventId: 7, name: 'Default', defaultLengthSec: 300, actions: [], terminals: [] }],
    mats: [{ id: 1, eventId: 7, number: 1, currentMatchId: null }],
    matches,
    divisions: [], candidateCount: 0,
  }
}

const slowSnapshot = (over: Partial<Snapshot['event']> = {}) => sampleSnapshot({
  mats: [],
  matches: [],
  event: { id: 7, name: 'Fall Duals', date: '2026-10-03', status: 'setup', mode: 'live', matCount: 1, contact: null, certifiedAt: null, far: null, ...over },
})
const SLOW_SNAPSHOT = slowSnapshot()

function mount(handler: (url: string, init?: RequestInit) => Reply | undefined, path = '/events/7') {
  const f = fakeFetch((url, init) => handler(url, init) ?? { json: [] })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/events/:eventId', element: <EventPage /> }, { path: '/admin', element: <div>Events</div> }],
    { initialEntries: [path] },
  )
  render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>)
  return { f, qc, router }
}

const snapshotReply = (url: string, snapshot: Snapshot = SLOW_SNAPSHOT): Reply | undefined =>
  /\/snapshot(\?|$)/.test(url) ? { json: { version: 1, snapshot } } : undefined

const snapshotGets = (f: { calls: { url: string }[] }) => f.calls.filter(c => c.url.includes('/snapshot')).length

describe('one poll for the whole event', () => {
  it('serves every tab from the stream the event body owns rather than one loop per tab', async () => {
    const { f } = mount(url => snapshotReply(url) ?? (url === '/api/events/7' ? { json: detailWith(IN_ORDER) } : undefined))
    const user = userEvent.setup()

    await screen.findByRole('tab', { name: /Roster/ })
    await vi.waitFor(() => expect(snapshotGets(f)).toBe(1))

    await user.click(screen.getByRole('tab', { name: 'Live' }))
    expect(await screen.findByText('This event has no mats.')).toBeInTheDocument()
    expect(snapshotGets(f)).toBe(1)

    await user.click(screen.getByRole('tab', { name: /Matches/ }))
    await screen.findByRole('region', { name: 'Pending matches' })
    expect(snapshotGets(f)).toBe(1)
  })

  it('reports the paused rack in the header, not a fresh age', async () => {
    mount(url => snapshotReply(url) ?? (url === '/api/events/7' ? { json: detailWith(IN_ORDER) } : undefined))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: /Live/ }))

    const pause = await screen.findByRole('button', { name: 'Pause updates' })
    expect(screen.getByRole('banner')).not.toHaveTextContent('Paused')

    await user.click(pause)
    expect(screen.getByRole('banner')).toHaveTextContent(/Paused/)
    await user.click(screen.getByRole('button', { name: /Paused/ }))
    expect(screen.getByRole('banner')).not.toHaveTextContent('Paused')
  })
})
