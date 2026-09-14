import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PasteMatchesDialog } from '@/routes/event/PasteMatchesDialog'
import { setAdminToken } from '@/lib/auth'
import { useEventDetail, useProposals } from '@/lib/queries'
import type { AthleteRow, EventDetail } from '@/lib/types'
import { fakeFetch, type Reply } from './fakes'

beforeEach(() => { localStorage.clear(); setAdminToken('tok') })
afterEach(() => vi.unstubAllGlobals())

const kid = (id: number, first: string, last: string, teamId: number): AthleteRow => ({
  id, eventId: 7, teamId, firstName: first, lastName: last, age: 9, ageSource: 'manual',
  weightLbs: 60, weightSource: 'manual', belt: 'grey', gender: 'M', source: 'manual',
  wlUid: null, wlLocation: null, leaderboardId: null, erp: null, promotedAt: null, syncedAt: null,
  syncChanges: null, suggestedWlUid: null, suggestedScore: null, dismissedWlUids: [], scoring: false,
})

const detail: EventDetail = {
  event: { id: 7, name: 'Fall Duels', date: '2026-10-03', matCount: 1, matCode: '0420', mode: 'live', status: 'setup', sameGender: false, createdAt: 'x' },
  teams: [
    { id: 1, eventId: 7, name: 'Ridgeline', color: 'red', position: 0 },
    { id: 2, eventId: 7, name: 'Lakeside', color: 'blue', position: 1 },
    { id: 3, eventId: 7, name: 'Summit', color: 'green', position: 2 },
  ],
  athletes: [kid(100, 'Mateo', 'Rivera', 1), kid(200, 'Olivia', 'Kim', 2), kid(300, 'Kai', 'Espinoza', 3)],
  rulesets: [], mats: [], matches: [], divisions: [], candidateCount: 0,
}

// An invalidation only refetches a query something is watching, so the caches this write
// is meant to refresh need a reader on screen the way the event page gives them one.
function Watchers() {
  useEventDetail(7)
  useProposals(7)
  return null
}

function mount(handler: (url: string, init?: RequestInit) => Reply = () => ({ json: {} }), watch = false) {
  const f = fakeFetch(handler)
  const closes: boolean[] = []
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      {watch && <Watchers />}
      <PasteMatchesDialog detail={detail} open onOpenChange={o => closes.push(o)} />
    </QueryClientProvider>,
  )
  return { ...f, closes }
}

const hits = (calls: { url: string }[], url: string) => calls.filter(c => c.url === url).length

const type = (text: string) => userEvent.setup().type(screen.getByLabelText('Match text'), text)
const rows = () => screen.getAllByRole('row').slice(1)
const button = () => screen.getByRole('button', { name: /^Create/ })

describe('PasteMatchesDialog', () => {
  it('previews a pair and a division, each with its style and its format', async () => {
    mount()
    await screen.findByRole('dialog')
    await type('Mateo Rivera vs Olivia Kim, nogi{Enter}47 to 53, round robin, gi, Mateo Rivera, Olivia Kim, Kai Espinoza')

    expect(within(rows()[0]).getAllByRole('cell').map(c => c.textContent))
      .toEqual(['', '1', 'Pair', 'Mateo Rivera vs Olivia Kim', 'NOGI', ''])
    expect(within(rows()[1]).getAllByRole('cell').map(c => c.textContent))
      .toEqual(['', '2', 'Division', '47 to 53: Mateo Rivera, Olivia Kim, Kai Espinoza', 'Gi', 'Round robin'])
  })

  it('shows one line that asks for both styles as the two matches it makes', async () => {
    mount()
    await screen.findByRole('dialog')
    await type('Mateo Rivera vs Olivia Kim, both')
    expect(rows().map(r => within(r).getAllByRole('cell').map(c => c.textContent)[4])).toEqual(['GI', 'NOGI'])
    expect(button()).toHaveTextContent('Create 2 matches')
  })

  it('prints a note against the line that earned it', async () => {
    mount()
    await screen.findByRole('dialog')
    await type('Matteo Rivera vs Olivia Kim')
    expect(within(rows()[0]).getByText('matched to Mateo Rivera')).toBeInTheDocument()
  })

  it('refuses the write while a line carries a problem, and says which line', async () => {
    mount()
    await screen.findByRole('dialog')
    await type('Mateo Rivera vs Olivia Kim{Enter}Zebedee Quill vs Kai Espinoza')

    const bad = rows()[1]
    expect(within(bad).getByText('2')).toBeInTheDocument()
    expect(within(bad).getByText('Unknown name: Zebedee Quill')).toBeInTheDocument()
    expect(screen.getByText('1 line to fix.')).toBeInTheDocument()
    expect(button()).toBeDisabled()
  })

  it('names both halves, in the singular, and drops the half the paste does not hold', async () => {
    mount()
    await screen.findByRole('dialog')
    await type('Mateo Rivera vs Olivia Kim')
    expect(button()).toHaveTextContent('Create 1 match')

    await userEvent.setup().clear(screen.getByLabelText('Match text'))
    await type('47 to 53, se, Mateo Rivera, Olivia Kim{Enter}Heavier, se, Mateo Rivera, Kai Espinoza')
    expect(button()).toHaveTextContent('Create 2 divisions')

    await userEvent.setup().clear(screen.getByLabelText('Match text'))
    await type('Mateo Rivera vs Olivia Kim{Enter}47 to 53, se, Mateo Rivera, Olivia Kim')
    expect(button()).toHaveTextContent('Create 1 match and 1 division')
  })

  it('posts one bulk body and closes', async () => {
    const f = mount(url => (url.endsWith('/matches/bulk') ? { status: 201, json: { matches: [], divisions: [], warnings: [] } } : { json: {} }))
    await screen.findByRole('dialog')
    await type('Mateo Rivera vs Olivia Kim{Enter}47 to 53, round robin, Mateo Rivera, Olivia Kim, Kai Espinoza')
    await userEvent.setup().click(button())

    const call = f.calls.findIndex(c => c.url === '/api/events/7/matches/bulk')
    expect(call).toBeGreaterThan(-1)
    expect(f.calls[call].init?.method).toBe('POST')
    expect(f.body(call)).toEqual({
      matches: [{ athleteAId: 100, athleteBId: 200, style: 'gi' }],
      divisions: [{ name: '47 to 53', format: 'round_robin', styles: 'both', athleteIds: [100, 200, 300] }],
    })
    expect(f.closes).toContain(false)
  })

  it('stays up to report what the server warned about', async () => {
    const f = mount(url => (url.endsWith('/matches/bulk')
      ? { status: 201, json: { matches: [], divisions: [], warnings: ['Same team: Mateo Rivera and Ava Brandt'] } }
      : { json: {} }))
    await screen.findByRole('dialog')
    await type('Mateo Rivera vs Olivia Kim')
    await userEvent.setup().click(button())

    expect(await screen.findByText('Same team: Mateo Rivera and Ava Brandt')).toBeInTheDocument()
    expect(f.closes).not.toContain(false)
    expect(screen.getByLabelText('Match text')).toHaveValue('')
  })

  it('refetches the event and the drafts, because a pasted pair can drop a proposal', async () => {
    const f = mount(url => (url.endsWith('/matches/bulk') ? { status: 201, json: { matches: [], divisions: [], warnings: [] } } : { json: [] }), true)
    await screen.findByRole('dialog')
    await waitFor(() => expect(hits(f.calls, '/api/events/7')).toBe(1))
    await type('Mateo Rivera vs Olivia Kim')
    await userEvent.setup().click(button())

    // The divisions travel on the event detail, so refetching it is refetching them.
    await waitFor(() => expect(hits(f.calls, '/api/events/7')).toBe(2))
    await waitFor(() => expect(hits(f.calls, '/api/events/7/proposals')).toBe(2))
  })

  it('reports a refused write without throwing the paste away', async () => {
    mount(url => (url.endsWith('/matches/bulk') ? { status: 409, json: { error: { code: 'match_state', message: 'this event is certified' } } } : { json: {} }))
    await screen.findByRole('dialog')
    await type('Mateo Rivera vs Olivia Kim')
    await userEvent.setup().click(button())

    expect(await screen.findByText('Those matches were not added')).toBeInTheDocument()
    expect(screen.getByLabelText('Match text')).toHaveValue('Mateo Rivera vs Olivia Kim')
  })
})
