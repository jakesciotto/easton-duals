import { useState } from 'react'
import { adminApi, useAdminMutation, useProposals } from '@/lib/queries'
import { CERTIFIED_REFUSAL, writeErrorMessage } from '@/lib/eventMode'
import type { EventDetail, Proposal, ProposalSide, Style, TeamRow } from '@/lib/types'
import { beltLabel, styleLabel, styleTag } from '@/lib/format'
import { KidPickerDialog } from './KidPickerDialog'
import { RegenerateConfirmDialog } from './RegenerateConfirmDialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { Segment } from '@/components/ui/segment'
import { FieldHead, FieldRow, FieldSet } from '@/components/ui/field-set'
import { OverflowMenu } from '@/components/OverflowMenu'
import { TeamPlate } from '@/components/TeamPlate'

const PROPOSAL_COLS = 'grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3'

const STYLE_OPTIONS: { value: Style; label: string }[] = [
  { value: 'gi', label: styleLabel('gi') },
  { value: 'nogi', label: styleLabel('nogi') },
]

interface Swap { proposalId: number; side: 'a' | 'b'; exclude: number; held: number }

interface SwapResult { proposal: Proposal; removed: number[]; warnings: string[] }

interface RowNote { warnings: string[]; removed: number; refusal: string | null }

const EMPTY_NOTE: RowNote = { warnings: [], removed: 0, refusal: null }

const sideName = (s: ProposalSide) => `${s.firstName} ${s.lastName}`.trim()
const proposalLabel = (p: Proposal) => p.c ? `${sideName(p.a)}, ${sideName(p.b)} and ${sideName(p.c)}` : `${sideName(p.a)} versus ${sideName(p.b)}`

function removalNotice(removed: number): string {
  return removed === 1
    ? 'One other proposal was removed to free this competitor.'
    : `${removed} other proposals were removed to free this competitor.`
}

function proposedLine(count: number): string {
  if (count === 0) return 'Nothing left to pair.'
  return `${count} ${count === 1 ? 'proposal' : 'proposals'} ready.`
}

function confirmedLine(created: number, skipped: number): string {
  return skipped > 0 ? `Confirmed ${created}, skipped ${skipped}.` : `Confirmed ${created}.`
}

function SideLine({ side, team, disabled, onSwap }: {
  side: ProposalSide
  team: TeamRow | undefined
  disabled: boolean
  onSwap: () => void
}) {
  const name = sideName(side)
  const meta = [side.age === null ? '--' : `${side.age}`, side.weightClass ?? '--', beltLabel(side.belt)].join(' · ')
  return (
    <button
      type="button"
      aria-label={`Swap ${name}, ${team?.name ?? 'no team'}`}
      title={disabled ? CERTIFIED_REFUSAL : 'Swap'}
      disabled={disabled}
      onClick={onSwap}
      className="-mx-2 grid min-w-0 gap-1 rounded-md px-2 py-1 text-left outline-none transition-colors duration-150 ease-standard hover:bg-gray-3 focus-visible:shadow-focus active:bg-gray-4 disabled:pointer-events-none disabled:opacity-50"
    >
      <span className="flex min-w-0 items-center gap-2">
        {team && <TeamPlate color={team.color} name={team.name} size="inline" showName={false} />}
        <span className="truncate t3">{name}</span>
      </span>
      <span className="truncate t2 text-gray-10">{meta}</span>
    </button>
  )
}

export function ProposalsPanel({ detail, certified, onConfirmOpenChange }: {
  detail: EventDetail
  certified: boolean
  onConfirmOpenChange?: (open: boolean) => void
}) {
  const eventId = detail.event.id
  const q = useProposals(eventId)
  const proposals = q.data ?? []
  const [style, setStyle] = useState<Style>('gi')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<number, RowNote>>({})
  const [swapping, setSwapping] = useState<Swap | null>(null)

  const propose = useAdminMutation(eventId, (asked: Style) => adminApi<Proposal[]>(`/api/events/${eventId}/proposals`, { method: 'POST', body: { style: asked } }), { proposals: true })
  const confirm = useAdminMutation(eventId, (id: number) => adminApi(`/api/proposals/${id}/confirm`, { method: 'POST' }), { proposals: true })
  const confirmAll = useAdminMutation(eventId, () => adminApi<{ created: number; skipped: number }>(`/api/events/${eventId}/proposals/confirm-all`, { method: 'POST' }), { proposals: true })
  const swap = useAdminMutation(eventId, (v: { id: number; body: Record<string, number> }) =>
    adminApi<SwapResult>(`/api/proposals/${v.id}`, { method: 'PATCH', body: v.body }), { proposals: true })
  const remove = useAdminMutation(eventId, (id: number) => adminApi(`/api/proposals/${id}`, { method: 'DELETE' }), { proposals: true })

  const teams = new Map(detail.teams.map(t => [t.id, t]))
  const has = proposals.length > 0
  const inStyle = proposals.filter(p => p.style === style).length

  const openConfirm = (o: boolean) => {
    setConfirmOpen(o)
    onConfirmOpenChange?.(o)
  }
  const closeConfirm = () => {
    openConfirm(false)
    propose.reset()
  }
  const runPropose = () => {
    propose.mutate(style, {
      onSuccess: rows => {
        setSummary(proposedLine(rows.length))
        setNotes({})
        closeConfirm()
      },
    })
  }
  const onProposeClick = () => {
    setSummary(null)
    if (inStyle > 0) { openConfirm(true); return }
    runPropose()
  }
  const onConfirmAll = () => {
    setSummary(null)
    confirmAll.mutate(undefined, { onSuccess: r => setSummary(confirmedLine(r.created, r.skipped ?? 0)) })
  }
  const onPicked = (athleteId: number) => {
    if (!swapping) return
    const { proposalId, side } = swapping
    setSummary(null)
    setNotes(n => ({ ...n, [proposalId]: EMPTY_NOTE }))
    swap.mutate(
      { id: proposalId, body: side === 'a' ? { athleteAId: athleteId } : { athleteBId: athleteId } },
      { onSuccess: r => setNotes(n => ({ ...n, [proposalId]: { warnings: r.warnings, removed: r.removed.length, refusal: null } })) },
    )
    setSwapping(null)
  }

  const failure = [
    confirmOpen || !propose.error ? null : { title: 'The proposals did not come back', error: propose.error, at: propose.submittedAt },
    confirmAll.error ? { title: 'The proposals were not confirmed', error: confirmAll.error, at: confirmAll.submittedAt } : null,
    swap.error ? { title: 'The swap did not save', error: swap.error, at: swap.submittedAt } : null,
    remove.error ? { title: 'That proposal was not removed', error: remove.error, at: remove.submittedAt } : null,
  ].filter((f): f is { title: string; error: Error; at: number } => f !== null)
    .sort((x, y) => y.at - x.at)[0] ?? null

  return (
    <section aria-label="Proposals" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="t4">Proposals</h3>
        <Segment
          aria-label="Style"
          value={style}
          onValueChange={v => { setSummary(null); setStyle(v as Style) }}
          options={STYLE_OPTIONS}
        />
        <Button size="sm" disabled={certified || propose.isPending} onClick={onProposeClick}>
          {inStyle > 0 ? 'Propose more' : 'Propose matches'}
        </Button>
        <Button size="sm" variant="secondary" disabled={certified || !has || confirmAll.isPending} onClick={onConfirmAll}>
          Confirm all
        </Button>
        {certified && <span className="t2 text-gray-10">{CERTIFIED_REFUSAL}</span>}
        <span aria-live="polite" className="t2 text-gray-10">{summary ?? ''}</span>
      </div>

      {q.error && (
        <Alert>
          <AlertTitle>The proposals did not load</AlertTitle>
          <AlertDescription>{q.error.message}</AlertDescription>
        </Alert>
      )}
      {failure && (
        <Alert>
          <AlertTitle>{failure.title}</AlertTitle>
          <AlertDescription>{writeErrorMessage(failure.error)}</AlertDescription>
        </Alert>
      )}

      <FieldSet>
        <FieldHead className={PROPOSAL_COLS}>
          <span className="font-sans">Style</span>
          <span className="font-sans">Competitor</span>
          <span className="font-sans">Why</span>
          <span className="font-sans">Competitor</span>
          <span className="sr-only">Actions</span>
        </FieldHead>
        {!has
          ? q.isLoading ? null : <EmptyState message="No proposals yet." />
          : (
            <div role="list">
              {proposals.map(p => {
                const note = notes[p.id]
                const label = proposalLabel(p)
                return (
                  <FieldRow key={p.id} role="listitem" className="py-2">
                    <div className={PROPOSAL_COLS}>
                      <Chip size="t1">{styleTag(p.style)}</Chip>
                      <SideLine
                        side={p.a} team={teams.get(p.a.teamId)} disabled={certified}
                        onSwap={() => setSwapping({ proposalId: p.id, side: 'a', exclude: p.b.teamId, held: p.a.athleteId })}
                      />
                      <span className="truncate t2 text-gray-10" title={p.why}>{p.why}</span>
                      <SideLine
                        side={p.b} team={teams.get(p.b.teamId)} disabled={certified}
                        onSwap={() => setSwapping({ proposalId: p.id, side: 'b', exclude: p.a.teamId, held: p.b.athleteId })}
                      />
                      <span className="flex items-center gap-2">
                        <Button
                          size="sm" aria-label={`Confirm ${label}`}
                          title={certified ? CERTIFIED_REFUSAL : undefined}
                          disabled={certified || confirm.isPending}
                          onClick={() => {
                            setSummary(null)
                            setNotes(n => ({ ...n, [p.id]: EMPTY_NOTE }))
                            confirm.mutate(p.id, {
                              onError: e => setNotes(n => ({ ...n, [p.id]: { ...EMPTY_NOTE, refusal: writeErrorMessage(e) } })),
                            })
                          }}
                        >
                          Confirm
                        </Button>
                        <OverflowMenu
                          label={`Swap ${label}`}
                          text="Swap"
                          disabled={certified || p.c !== null}
                          items={[
                            { key: 'a', label: `Swap ${sideName(p.a)}`, disabled: false, onSelect: () => setSwapping({ proposalId: p.id, side: 'a', exclude: p.b.teamId, held: p.a.athleteId }) },
                            { key: 'b', label: `Swap ${sideName(p.b)}`, disabled: false, onSelect: () => setSwapping({ proposalId: p.id, side: 'b', exclude: p.a.teamId, held: p.b.athleteId }) },
                          ]}
                        />
                        <Button
                          size="sm" variant="destructive" className="ml-4" aria-label={`Remove ${label}`}
                          title={certified ? CERTIFIED_REFUSAL : undefined}
                          disabled={certified || remove.isPending}
                          onClick={() => { setSummary(null); remove.mutate(p.id) }}
                        >
                          Remove
                        </Button>
                      </span>
                    </div>
                    {p.c && (
                      <div className={PROPOSAL_COLS}>
                        <span />
                        <SideLine side={p.c} team={teams.get(p.c.teamId)} disabled onSwap={() => {}} />
                        <span className="truncate t2 text-gray-10">round robin</span>
                        <span />
                        <span />
                      </div>
                    )}
                    {note && (note.warnings.length > 0 || note.removed > 0 || note.refusal !== null) && (
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        {note.refusal !== null && <span className="t2 text-attend">{note.refusal}</span>}
                        {note.warnings.map(w => <span key={w} className="t2 text-attend">{w}</span>)}
                        {note.removed > 0 && <span className="t2 text-gray-10">{removalNotice(note.removed)}</span>}
                      </div>
                    )}
                  </FieldRow>
                )
              })}
            </div>
          )}
      </FieldSet>

      <RegenerateConfirmDialog
        open={confirmOpen}
        count={inStyle}
        style={style}
        pending={propose.isPending}
        error={propose.error}
        onOpenChange={o => { if (o) openConfirm(true); else closeConfirm() }}
        onConfirm={runPropose}
      />
      <KidPickerDialog
        detail={detail}
        exclude={swapping?.exclude ?? null}
        held={swapping?.held ?? null}
        open={swapping !== null}
        onOpenChange={o => { if (!o) setSwapping(null) }}
        onPick={onPicked}
      />
    </section>
  )
}
