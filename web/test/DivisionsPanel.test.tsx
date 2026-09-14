import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DivisionsPanel } from '@/routes/event/DivisionsPanel'
import { setAdminToken } from '@/lib/auth'
import type { AthleteRow, DivisionView, EventDetail, MatchRow } from '@/lib/types'
import { fakeFetch, type Reply } from './fakes'

beforeEach(() => { localStorage.clear(); setAdminToken('tok') })
afterEach(() => vi.unstubAllGlobals())

const NAMES = [
  ['Mateo', 'Rivera'], ['Olivia', 'Kim'], ['Kai', 'Espinoza'], ['Ava', 'Brandt'],
  ['Noa', 'Feldman'], ['Theo', 'Castellano'], ['Iris', 'Nakamura'], ['Milo', 'Achebe'],
]

const kid = (i: number): AthleteRow => ({
  id: 100 + i, eventId: 7, teamId: 1 + (i % 3), firstName: NAMES[i][0], lastName: NAMES[i][1],
  age: 9, ageSource: 'manual', weightLbs: 60, weightSource: 'manual', belt: 'grey', gender: 'M',
  source: 'manual', wlUid: null, wlLocation: null, leaderboardId: null, erp: null, promotedAt: null,
  syncedAt: null, syncChanges: null, suggestedWlUid: null, suggestedScore: null, dismissedWlUids: [], scoring: false,
})

const ATHLETES = NAMES.map((_, i) => kid(i))
const nameOf = (id: number) => { const a = ATHLETES.find(x => x.id === id)!; return `${a.firstName} ${a.lastName}` }

const match = (over: Partial<MatchRow> & { id: number; number: number }): MatchRow => ({
  eventId: 7, matId: null, orderIndex: over.number, rulesetId: 1, lengthSec: 300,
  athleteAId: null, athleteBId: null, feedAMatchId: null, feedATake: null, feedBMatchId: null, feedBTake: null,
  style: 'gi', divisionId: 1, round: null, status: 'pending', winnerAthleteId: null, winType: null,
  pointsA: 0, pointsB: 0, clockElapsedMs: 0, clockStartedAt: null,
  pendingTerminalAthleteId: null, pendingTerminalKey: null, lastSeq: 0, why: null, source: 'generated', ...over,
})

const division = (over: Partial<DivisionView> = {}): DivisionView => ({
  id: 1, eventId: 7, name: '47 to 53 boys', format: 'round_robin', styles: 'gi', position: 0,
  members: [0, 1, 2].map(i => ({ athleteId: 100 + i, seed: i + 1, firstName: NAMES[i][0], lastName: NAMES[i][1], teamId: 1 + (i % 3), erp: null })),
  matchIds: [], running: false, warnings: [], ...over,
})

const detailWith = (divisions: DivisionView[], matches: MatchRow[] = []): EventDetail => ({
  event: { id: 7, name: 'Fall Duals', date: '2026-10-03', matCount: 1, matCode: '0420', mode: 'live', status: 'setup', sameGender: false, createdAt: 'x' },
  teams: [
    { id: 1, eventId: 7, name: 'Ridgeline', color: 'red', position: 0 },
    { id: 2, eventId: 7, name: 'Lakeside', color: 'blue', position: 1 },
    { id: 3, eventId: 7, name: 'Summit', color: 'green', position: 2 },
  ],
  athletes: ATHLETES, rulesets: [], mats: [], matches, divisions, candidateCount: 0,
})

function mount(detail: EventDetail, certified = false, handler: (url: string, init?: RequestInit) => Reply = () => ({ json: {} })) {
  const f = fakeFetch(handler)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><DivisionsPanel detail={detail} certified={certified} /></QueryClientProvider>)
  return f
}

const card = () => screen.getByRole('region', { name: '47 to 53 boys' })

describe('DivisionsPanel', () => {
  it('says so when the event has no divisions', () => {
    mount(detailWith([]))
    expect(screen.getByText('No divisions yet.')).toBeInTheDocument()
  })

  it('heads a card with the name, the format and the styles, and lists the members in seed order', () => {
    mount(detailWith([division({ format: 'single_elim', styles: 'both' })]))
    const head = card()
    expect(within(head).getByRole('heading', { name: '47 to 53 boys' })).toBeInTheDocument()
    expect(within(head).getByText('Single elimination')).toBeInTheDocument()
    expect(within(head).getByText('Gi and nogi')).toBeInTheDocument()

    const members = within(head).getByRole('list', { name: '47 to 53 boys competitors' })
    expect(within(members).getAllByRole('listitem').map(r => r.textContent))
      .toEqual(['1RIDRidgelineMateo RiveraUpDown', '2LAKLakesideOlivia KimUpDown', '3SUMSummitKai EspinozaUpDown'])
  })

  it('draws a round robin as rows carrying the number, the style and the result', () => {
    const matches = [
      match({ id: 10, number: 4, athleteAId: 100, athleteBId: 101 }),
      match({ id: 11, number: 5, athleteAId: 100, athleteBId: 102, status: 'done', winnerAthleteId: 102, winType: 'submission' }),
    ]
    mount(detailWith([division()], matches))
    const rows = within(card()).getAllByRole('listitem').slice(3)
    expect(rows[0].textContent).toBe('M4GIMateo Rivera vs Olivia Kim')
    expect(rows[1].textContent).toBe('M5GIMateo Rivera vs Kai EspinozaKai Espinoza by submission')
  })

  it('draws a bracket as one column per round, labelled by distance from the final', () => {
    const four = division({ format: 'single_elim', members: [0, 1, 2, 3].map(i => ({ athleteId: 100 + i, seed: i + 1, firstName: NAMES[i][0], lastName: NAMES[i][1], teamId: 1, erp: null })) })
    const matches = [
      match({ id: 10, number: 1, round: 1, athleteAId: 100, athleteBId: 103 }),
      match({ id: 11, number: 2, round: 1, athleteAId: 101, athleteBId: 102 }),
      match({ id: 12, number: 3, round: 2, feedAMatchId: 10, feedATake: 'winner', feedBMatchId: 11, feedBTake: 'winner' }),
    ]
    mount(detailWith([four], matches))
    expect(within(card()).getByText('Semifinal')).toBeInTheDocument()
    expect(within(card()).getByText('Final')).toBeInTheDocument()
    // The empty sides of the final name the matches they wait on.
    expect(within(card()).getByText('Winner of M1')).toBeInTheDocument()
    expect(within(card()).getByText('Winner of M2')).toBeInTheDocument()
  })

  it('puts the losers rounds under the winners rounds and the grand final last', () => {
    const four = division({ format: 'double_elim', members: [0, 1, 2, 3].map(i => ({ athleteId: 100 + i, seed: i + 1, firstName: NAMES[i][0], lastName: NAMES[i][1], teamId: 1, erp: null })) })
    const matches = [
      match({ id: 10, number: 1, round: 1, athleteAId: 100, athleteBId: 103 }),
      match({ id: 11, number: 2, round: 2, feedAMatchId: 10, feedATake: 'winner', athleteBId: 101 }),
      match({ id: 12, number: 3, round: 3, feedAMatchId: 10, feedATake: 'loser', athleteBId: 102 }),
      match({ id: 13, number: 4, round: 5, feedAMatchId: 11, feedATake: 'winner', feedBMatchId: 12, feedBTake: 'winner' }),
    ]
    mount(detailWith([four], matches))
    const labels = within(card()).getAllByText(/Semifinal|Final|Losers round|Grand final/).map(e => e.textContent)
    expect(labels).toEqual(['Semifinal', 'Final', 'Losers round 1'])
    // The grand final is one match on its own, below the columns and under no head.
    const chips = within(card()).getAllByText((_, e) => e?.getAttribute('data-slot') === 'chip').map(e => e.textContent)
    expect(chips).toEqual(['M1', 'M2', 'M3', 'M4'])
    expect(within(card()).getByText('Loser of M1')).toBeInTheDocument()
  })

  it('groups a both-styles bracket by style', () => {
    const both = division({ format: 'single_elim', styles: 'both' })
    const matches = [
      match({ id: 10, number: 1, round: 1, style: 'gi', athleteAId: 100, athleteBId: 101 }),
      match({ id: 11, number: 2, round: 1, style: 'nogi', athleteAId: 100, athleteBId: 101 }),
    ]
    mount(detailWith([both], matches))
    expect(within(card()).getByText('GI')).toBeInTheDocument()
    expect(within(card()).getByText('NOGI')).toBeInTheDocument()
  })

  it('locks a running division to its name, its shape and the word Running', () => {
    mount(detailWith([division({ running: true })]))
    expect(within(card()).getByText('Running')).toBeInTheDocument()
    for (const name of ['Seed by rating', 'Edit', 'Delete']) {
      expect(within(card()).queryByRole('button', { name })).toBeNull()
    }
    expect(within(card()).queryByRole('button', { name: /^Move / })).toBeNull()
  })

  it('takes every control away from a certified event and says why', () => {
    mount(detailWith([division()]), true)
    expect(within(card()).queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(within(card()).getByText(/certified/i)).toBeInTheDocument()
  })

  it('prints the warnings the server recomputed for the set', () => {
    mount(detailWith([division({ warnings: ['Same team: Mateo Rivera and Olivia Kim'] })]))
    expect(within(card()).getByText('Same team: Mateo Rivera and Olivia Kim')).toBeInTheDocument()
  })

  it('reorders a member by Up and Down, sending the whole seed order', async () => {
    const f = mount(detailWith([division()]))
    await userEvent.setup().click(within(card()).getByRole('button', { name: `Move ${nameOf(102)} up` }))
    const call = f.calls.findIndex(c => c.url === '/api/divisions/1')
    expect(f.calls[call].init?.method).toBe('PATCH')
    expect(f.body(call)).toEqual({ athleteIds: [100, 102, 101] })
  })

  it('seeds by rating', async () => {
    const f = mount(detailWith([division()]))
    await userEvent.setup().click(within(card()).getByRole('button', { name: 'Seed by rating' }))
    const call = f.calls.findIndex(c => c.url === '/api/divisions/1/seed')
    expect(call).toBeGreaterThan(-1)
    expect(f.calls[call].init?.method).toBe('POST')
  })

  it('deletes a division', async () => {
    const f = mount(detailWith([division()]), false, () => ({ status: 204 }))
    await userEvent.setup().click(within(card()).getByRole('button', { name: 'Delete' }))
    const call = f.calls.findIndex(c => c.url === '/api/divisions/1')
    expect(f.calls[call].init?.method).toBe('DELETE')
  })

  it('edits the name, the format and the styles in one patch', async () => {
    const f = mount(detailWith([division()]))
    const user = userEvent.setup()
    await user.click(within(card()).getByRole('button', { name: 'Edit' }))
    await screen.findByRole('dialog')
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), '54 to 61 boys')
    await user.click(screen.getByRole('radio', { name: 'Double elimination' }))
    await user.click(screen.getByRole('radio', { name: 'Gi and nogi' }))
    await user.click(screen.getByRole('button', { name: 'Save division' }))

    const call = f.calls.findIndex(c => c.url === '/api/divisions/1' && c.init?.method === 'PATCH')
    expect(f.body(call)).toEqual({ name: '54 to 61 boys', format: 'double_elim', styles: 'both' })
  })

  it('reports a refused write on the card it was refused on', async () => {
    mount(detailWith([division()]), false, () => ({ status: 409, json: { error: { code: 'match_state', message: 'division is running' } } }))
    await userEvent.setup().click(within(card()).getByRole('button', { name: 'Seed by rating' }))
    await waitFor(() => expect(within(card()).getByText('division is running')).toBeInTheDocument())
  })

  it('keeps a refused edit inside the dialog that made it', async () => {
    mount(detailWith([division()]), false, () => ({ status: 409, json: { error: { code: 'match_state', message: 'division is running' } } }))
    const user = userEvent.setup()
    await user.click(within(card()).getByRole('button', { name: 'Edit' }))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Save division' }))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('That division did not save')).toBeInTheDocument()
  })

  it('orders the cards by their stored position', () => {
    const second = division({ id: 2, name: 'Heavier', position: 1 })
    const first = division({ id: 1, name: '47 to 53 boys', position: 0 })
    mount(detailWith([second, first]))
    expect(screen.getAllByRole('heading', { level: 4 }).map(h => h.textContent)).toEqual(['47 to 53 boys', 'Heavier'])
  })
})
