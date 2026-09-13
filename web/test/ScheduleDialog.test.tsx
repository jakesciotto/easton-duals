import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ScheduleDialog, gapLine, wavesLine } from '@/routes/event/ScheduleDialog'
import { setAdminToken } from '@/lib/auth'
import type { EventDetail, SchedulePlan } from '@/lib/types'
import { fakeFetch, type Reply } from './fakes'

beforeEach(() => { localStorage.clear(); setAdminToken('tok') })
afterEach(() => vi.unstubAllGlobals())

const detail: EventDetail = {
  event: { id: 7, name: 'Fall Duels', date: '2026-10-03', matCount: 2, matCode: '0420', mode: 'live', status: 'setup', sameGender: false, createdAt: 'x' },
  teams: [], athletes: [], rulesets: [],
  mats: [{ id: 1, eventId: 7, number: 1, currentMatchId: null }, { id: 2, eventId: 7, number: 2, currentMatchId: null }],
  matches: [], divisions: [], candidateCount: 0,
}

const plan = (over: Partial<SchedulePlan> = {}): SchedulePlan => ({
  order: [{ matchId: 10, matId: 1, orderIndex: 0, wave: 0 }, { matchId: 11, matId: 2, orderIndex: 1, wave: 0 }],
  waves: 3, minutes: 74,
  perMat: [{ matId: 1, number: 1, count: 5 }, { matId: 2, number: 2, count: 4 }],
  warnings: [], gaps: [], ...over,
})

function mount(handler: (url: string, init?: RequestInit) => Reply) {
  const f = fakeFetch(handler)
  const closes: boolean[] = []
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ScheduleDialog detail={detail} open onOpenChange={o => closes.push(o)} />
    </QueryClientProvider>,
  )
  return { ...f, closes }
}

const serving = (answer: SchedulePlan, applied = false) => (url: string) =>
  (url === '/api/events/7/schedule' ? { json: { ...answer, applied } } : { json: {} })

describe('wavesLine', () => {
  it('drops the hour part under an hour', () => {
    expect(wavesLine(plan({ minutes: 42 }))).toBe('3 waves, about 42m on 2 mats')
    expect(wavesLine(plan({ minutes: 74 }))).toBe('3 waves, about 1h 14m on 2 mats')
  })

  it('counts one wave on one mat in the singular', () => {
    expect(wavesLine(plan({ waves: 1, minutes: 6, perMat: [{ matId: 1, number: 1, count: 2 }] })))
      .toBe('1 wave, about 6m on 1 mat')
  })
})

describe('gapLine', () => {
  it('names the mat by its number and the match by its own', () => {
    const p = plan({ gaps: [{ wave: 1, matId: 2, waitingOn: 12 }] })
    expect(gapLine(p, p.gaps[0])).toBe('Mat 2 waits on M12')
  })

  it('reads the one lane of an event with no mats as mat 1', () => {
    const p = plan({ perMat: [{ matId: null, number: 1, count: 4 }], gaps: [{ wave: 0, matId: null, waitingOn: 3 }] })
    expect(gapLine(p, p.gaps[0])).toBe('Mat 1 waits on M3')
  })
})

describe('ScheduleDialog', () => {
  it('asks for the plan without applying it, and prints what it would do', async () => {
    const f = mount(serving(plan()))
    await screen.findByRole('dialog')
    expect(await screen.findByText('3 waves, about 1h 14m on 2 mats')).toBeInTheDocument()

    const call = f.calls.findIndex(c => c.url === '/api/events/7/schedule')
    expect(f.calls[call].init?.method).toBe('POST')
    expect(f.body(call)).toEqual({ apply: false })

    const rows = screen.getAllByRole('dialog')[0]
    expect(within(rows).getByText('5')).toBeInTheDocument()
    expect(within(rows).getByText('4')).toBeInTheDocument()
  })

  it('prints the warnings and the gaps the plan carries', async () => {
    mount(serving(plan({
      warnings: ['Mateo Rivera: M3 and M5 back to back'],
      gaps: [{ wave: 2, matId: 2, waitingOn: 9 }],
    })))
    expect(await screen.findByText('Mateo Rivera: M3 and M5 back to back')).toBeInTheDocument()
    expect(screen.getByText('Mat 2 waits on M9')).toBeInTheDocument()
  })

  it('writes the order on Apply order and closes', async () => {
    const f = mount(serving(plan()))
    await screen.findByText('3 waves, about 1h 14m on 2 mats')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Apply order' }))

    const bodies = f.calls.filter(c => c.url === '/api/events/7/schedule').map((_, i) => i)
    expect(bodies).toHaveLength(2)
    const second = f.calls.findLastIndex(c => c.url === '/api/events/7/schedule')
    expect(f.body(second)).toEqual({ apply: true })
    expect(f.closes).toContain(false)
  })

  it('offers nothing to apply when there is nothing left to order', async () => {
    mount(serving(plan({ order: [], waves: 0, minutes: 0, perMat: [], warnings: [], gaps: [] })))
    expect(await screen.findByText('Nothing left to order.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply order' })).toBeDisabled()
  })

  it('shows a refused plan as the dialog error line', async () => {
    mount(() => ({ status: 409, json: { error: { code: 'match_state', message: 'schedule cannot place M4: every mat is busy' } } }))
    expect(await screen.findByText('schedule cannot place M4: every mat is busy')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply order' })).toBeDisabled()
  })

  it('reports a refused apply without closing over it', async () => {
    let applied = false
    const f = mount((url, init) => {
      if (url !== '/api/events/7/schedule') return { json: {} }
      const body = JSON.parse(String(init?.body)) as { apply: boolean }
      if (!body.apply) return { json: { ...plan(), applied: false } }
      applied = true
      return { status: 409, json: { error: { code: 'match_state', message: 'schedule cannot place M4: every mat is busy' } } }
    })
    await screen.findByText('3 waves, about 1h 14m on 2 mats')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Apply order' }))

    expect(await screen.findByText('schedule cannot place M4: every mat is busy')).toBeInTheDocument()
    expect(applied).toBe(true)
    expect(f.closes).not.toContain(false)
  })
})
