import { useMemo, useState } from 'react'
import type { MatchView } from '@shared/types'
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVerticalIcon } from 'lucide-react'
import { adminApi, useAdminMutation, useProposals } from '@/lib/queries'
import { useSnapshot } from '@/lib/useSnapshot'
import { pollIntervalForSnapshot } from '@/lib/pollInterval'
import { CERTIFIED_REFUSAL, statusOf, writeErrorMessage } from '@/lib/eventMode'
import type { EventDetail, MatchRow, TeamRow } from '@/lib/types'
import { athleteName, styleTag, winTypeLabel } from '@/lib/format'
import { moveId } from '@/lib/reorder'
import { doubleBookedMatchIds } from '@/lib/doubleBooking'
import { feedLabel, feedOf, matchAthleteIds, matchViewOf } from '@/lib/matchView'
import { cn } from '@/lib/utils'
import { KidPickerDialog } from './KidPickerDialog'
import { MatchHistorySheet } from './MatchHistorySheet'
import { matchHistorySource, type HistorySource } from './match-history'
import { ResultDialog } from './ResultDialog'
import { AddMatchDialog } from './AddMatchDialog'
import { DivisionsPanel } from './DivisionsPanel'
import { PasteMatchesDialog } from './PasteMatchesDialog'
import { ProposalsPanel } from './ProposalsPanel'
import { ScheduleDialog } from './ScheduleDialog'
import {
  endedLabel, liveReason, matchLabel, matchLines, readyNote, skipNote, type MatchLine,
} from './matches-view'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { OverflowMenu } from '@/components/OverflowMenu'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldRow, FieldSet } from '@/components/ui/field-set'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Clock } from '@/components/Clock'
import { TeamPlate } from '@/components/TeamPlate'

interface Pick { matchId: number; side: 'a' | 'b'; exclude: number; held: number }

const PENDING_COLUMNS = 7

type Hover = (athleteId: number | null) => void

interface Side { athleteId: number | null; name: string; team: TeamRow | undefined }
type SideOf = (row: MatchRow, side: 'a' | 'b') => Side

interface Option { value: string; label: string }

function MatchChips({ row }: { row: MatchRow }) {
  return (
    <span className="flex items-center gap-1.5">
      <Chip size="t1">M<span className="fig">{row.number}</span></Chip>
      <Chip size="t1">{styleTag(row.style)}</Chip>
    </span>
  )
}

interface PatchResult { warnings?: string[] }

function CompetitorLine({ side, disabled = false, title, onHover, onPick }: {
  side: Side
  disabled?: boolean
  title?: string
  onHover: (on: boolean) => void
  onPick: () => void
}) {
  const { name, team } = side
  if (side.athleteId === null) {
    return <span className="flex h-8 min-w-0 items-center truncate t3 text-gray-10">{name}</span>
  }
  return (
    <button
      type="button"
      aria-label={`Swap ${name}, ${team?.name ?? 'no team'}`}
      title={title ?? 'Swap'}
      disabled={disabled}
      onClick={onPick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className="-mx-2 flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-left outline-none transition-colors duration-150 ease-standard hover:bg-gray-3 focus-visible:shadow-focus active:bg-gray-4 disabled:pointer-events-none disabled:opacity-50"
    >
      {team && <TeamPlate color={team.color} name={team.name} size="inline" showName={false} />}
      <span className="truncate t3">{name}</span>
    </button>
  )
}

function LiveStrip({ line, a, b, serverNow, lastSuccessAt, pollIntervalMs, highlight, onHover }: {
  line: MatchLine
  a: Side
  b: Side
  serverNow: string | null
  pollIntervalMs: number
  lastSuccessAt: number | null
  highlight: boolean
  onHover: Hover
}) {
  const reason = liveReason(line)
  return (
    <div
      data-match-state="live"
      className={cn(
        'grid gap-2 rounded-lg border-l-[3px] border-live p-4 transition-colors duration-150 ease-standard',
        highlight ? 'bg-gray-4' : 'bg-gray-2',
      )}
    >
      <div className="flex items-baseline gap-4">
        <span className="t1 text-live uppercase">Live</span>
        <span className="t1 text-gray-10 uppercase">{line.matNumber === null ? 'No mat' : `Mat ${line.matNumber}`}</span>
        <MatchChips row={line.row} />
        <span className="ml-auto font-mono">
          <Clock
            clock={line.clock}
            serverNow={serverNow}
            lastSuccessAt={lastSuccessAt}
            pollIntervalMs={pollIntervalMs}
            className="t5 font-medium!"
          />
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 t5">
        <span className="flex min-w-0 items-center gap-2" onMouseEnter={() => onHover(a.athleteId)} onMouseLeave={() => onHover(null)}>
          {a.team && <TeamPlate color={a.team.color} name={a.team.name} size="inline" showName={false} />}
          <span className="truncate">{a.name}</span>
        </span>
        <span className="t1 text-gray-10 uppercase">vs</span>
        <span className="flex min-w-0 items-center gap-2" onMouseEnter={() => onHover(b.athleteId)} onMouseLeave={() => onHover(null)}>
          {b.team && <TeamPlate color={b.team.color} name={b.team.name} size="inline" showName={false} />}
          <span className="truncate">{b.name}</span>
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="t2 text-gray-10">{reason}</span>
        <Button
          size="sm" variant="destructive" title={reason} disabled
          aria-label={`Delete ${matchLabel(line.row.number, a.name, b.name)}`}
        >
          Delete
        </Button>
      </div>
    </div>
  )
}

function PendingRow({ line, sideOf, warnings, matItems, rulesetItems, index, count, doubleBooked, certified, highlight, onHover, onPick, onPatch, onDelete, onMove }: {
  line: MatchLine
  sideOf: SideOf
  warnings: string[]
  matItems: Option[]
  rulesetItems: Option[]
  index: number
  count: number
  doubleBooked: boolean
  certified: boolean
  highlight: boolean
  onHover: Hover
  onPick: (p: Pick) => void
  onPatch: (id: number, body: Partial<MatchRow>, onError?: () => void) => void
  onDelete: (id: number) => void
  onMove: (index: number, dir: -1 | 1) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: line.row.id })
  const m = line.row
  const a = sideOf(m, 'a')
  const b = sideOf(m, 'b')
  const attend = doubleBooked || line.state === 'skipped'
  const ready = line.state === 'ready' ? readyNote(line) : null
  const noted = line.state === 'skipped' || doubleBooked || warnings.length > 0 || ready !== null
  const row = matchLabel(m.number, a.name, b.name)

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-match-state={line.state}
      selected={highlight}
      className="h-16"
    >
      <TableCell className="w-[var(--col-act)] pr-0">
        <Button
          type="button" variant="ghost" size="icon" aria-label={`Reorder ${row}`}
          className={certified ? undefined : 'cursor-grab'}
          disabled={certified} title={certified ? CERTIFIED_REFUSAL : undefined}
          {...(certified ? {} : attributes)} {...(certified ? {} : listeners)}
        >
          <GripVerticalIcon />
        </Button>
      </TableCell>
      <TableCell className="relative w-[var(--col-state)] p-0">
        {attend && <span aria-hidden className="absolute inset-y-0 left-0 w-[var(--col-state)] bg-attend" />}
      </TableCell>
      <TableCell className="w-[116px]"><MatchChips row={m} /></TableCell>
      <TableCell className="w-[112px]">
        <Select
          value={String(m.matId ?? '')}
          onValueChange={v => { const next = String(v ?? ''); onPatch(m.id, { matId: next ? Number(next) : null }) }}
          items={matItems}
        >
          <SelectTrigger size="sm" aria-label={`Mat for ${row}`} disabled={certified} title={certified ? CERTIFIED_REFUSAL : undefined}><SelectValue /></SelectTrigger>
          <SelectContent>
            {matItems.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="min-w-0">
        <div className="grid min-w-0">
          <CompetitorLine
            side={a} disabled={certified || b.team === undefined} title={certified ? CERTIFIED_REFUSAL : undefined}
            onHover={on => onHover(on ? a.athleteId : null)}
            onPick={() => { if (b.team && a.athleteId !== null) onPick({ matchId: m.id, side: 'a', exclude: b.team.id, held: a.athleteId }) }}
          />
          <CompetitorLine
            side={b} disabled={certified || a.team === undefined} title={certified ? CERTIFIED_REFUSAL : undefined}
            onHover={on => onHover(on ? b.athleteId : null)}
            onPick={() => { if (a.team && b.athleteId !== null) onPick({ matchId: m.id, side: 'b', exclude: a.team.id, held: b.athleteId }) }}
          />
          {noted && (
            <span className="flex h-4 min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap">
              {line.state === 'skipped' && <span className="t2 text-attend">{skipNote(line)}</span>}
              {doubleBooked && <span className="t2 text-attend">Double booked</span>}
              {warnings.map(w => <span key={w} className="t2 text-attend">{w}</span>)}
              {ready && <span className="t2 text-gray-10">{ready}</span>}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="w-[168px]">
        <Select
          value={String(m.rulesetId)}
          onValueChange={v => { const next = String(v ?? ''); if (next) onPatch(m.id, { rulesetId: Number(next) }) }}
          items={rulesetItems}
        >
          <SelectTrigger size="sm" aria-label={`Ruleset for ${row}`} disabled={certified} title={certified ? CERTIFIED_REFUSAL : undefined}><SelectValue /></SelectTrigger>
          <SelectContent>
            {rulesetItems.map(i => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="w-px whitespace-nowrap">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" aria-label={`Move ${row} up`} title={certified ? CERTIFIED_REFUSAL : undefined} disabled={certified || index === 0} onClick={() => onMove(index, -1)}>Up</Button>
          <Button size="sm" variant="ghost" aria-label={`Move ${row} down`} title={certified ? CERTIFIED_REFUSAL : undefined} disabled={certified || index === count - 1} onClick={() => onMove(index, 1)}>Down</Button>
          <OverflowMenu
            label={`Swap in ${row}`}
            text="Swap"
            disabled={certified}
            items={[
              { key: 'a', label: `Swap ${a.name}`, disabled: b.team === undefined || a.athleteId === null, onSelect: () => { if (b.team && a.athleteId !== null) onPick({ matchId: m.id, side: 'a', exclude: b.team.id, held: a.athleteId }) } },
              { key: 'b', label: `Swap ${b.name}`, disabled: a.team === undefined || b.athleteId === null, onSelect: () => { if (a.team && b.athleteId !== null) onPick({ matchId: m.id, side: 'b', exclude: a.team.id, held: b.athleteId }) } },
            ]}
          />
          <Button size="sm" variant="destructive" className="ml-4" aria-label={`Delete ${row}`} title={certified ? CERTIFIED_REFUSAL : undefined} disabled={certified} onClick={() => onDelete(m.id)}>Delete</Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function SettledRow({ line, sideOf, highlight, certified, onHover, onHistory, onEdit }: {
  line: MatchLine
  sideOf: SideOf
  highlight: boolean
  certified: boolean
  onHover: Hover
  onHistory: () => void
  onEdit: () => void
}) {
  const m = line.row
  const aWon = m.winnerAthleteId === m.athleteAId
  const winner = sideOf(m, aWon ? 'a' : 'b')
  const loser = sideOf(m, aWon ? 'b' : 'a')
  const winnerId = winner.athleteId
  const loserId = loser.athleteId

  return (
    <TableRow data-match-state="done" selected={highlight}>
      <TableCell className="w-[116px]"><MatchChips row={m} /></TableCell>
      <TableCell className="w-[80px] t2 text-gray-10">{line.matNumber === null ? '' : `Mat ${line.matNumber}`}</TableCell>
      <TableCell className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="flex min-w-0 items-center gap-2"
            onMouseEnter={() => onHover(winnerId)}
            onMouseLeave={() => onHover(null)}
          >
            {winner.team && <TeamPlate color={winner.team.color} name={winner.team.name} size="inline" showName={false} />}
            <span className="truncate t3 font-medium text-white">{winner.name}</span>
          </span>
          <span className="shrink-0 t2 text-gray-10">beat</span>
          <span
            className="flex min-w-0 items-center gap-2"
            onMouseEnter={() => onHover(loserId)}
            onMouseLeave={() => onHover(null)}
          >
            {loser.team && <TeamPlate color={loser.team.color} name={loser.team.name} size="inline" showName={false} />}
            <span className="truncate t3 text-gray-10">{loser.name}</span>
          </span>
        </span>
      </TableCell>
      <TableCell className="w-[160px] t2 text-gray-10">{m.winType ? winTypeLabel(m.winType) : ''}</TableCell>
      <TableCell numeric className="w-[80px] text-gray-10">{endedLabel(line.endedAt)}</TableCell>
      <TableCell className="w-px pl-0">
        <OverflowMenu
          label={`${matchLabel(m.number, sideOf(m, 'a').name, sideOf(m, 'b').name)} actions`}
          items={[
            { key: 'history', label: 'Match history', disabled: false, onSelect: onHistory },
            { key: 'edit', label: 'Edit result', disabled: certified, onSelect: onEdit },
          ]}
        />
      </TableCell>
    </TableRow>
  )
}

export function MatchesTab({ detail }: { detail: EventDetail }) {
  const eventId = detail.event.id
  const { snapshot, live: liveSnapshot, lastSuccessAt } = useSnapshot(eventId)
  const pollIntervalMs = pollIntervalForSnapshot(snapshot)
  const proposals = useProposals(eventId).data ?? []
  const certified = statusOf(liveSnapshot, detail.event.status) === 'certified'
  const [pick, setPick] = useState<Pick | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [orderOpen, setOrderOpen] = useState(false)
  const [addStart, setAddStart] = useState<number | null>(null)
  const [swapNotes, setSwapNotes] = useState<Record<number, string[]>>({})
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState<number | null>(null)
  const [showSettled, setShowSettled] = useState(false)
  const [history, setHistory] = useState<HistorySource | null>(null)
  const [editing, setEditing] = useState<MatchView | null>(null)
  const pointer = useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  const sensors = useSensors(...(certified ? [] : [pointer]))

  const lines = useMemo(() => matchLines(detail, snapshot), [detail, snapshot])
  const live = useMemo(() => lines.filter(l => l.lane === 'live'), [lines])
  const pending = useMemo(() => lines.filter(l => l.lane === 'pending'), [lines])
  const settled = useMemo(() => lines.filter(l => l.lane === 'settled'), [lines])
  const pendingIds = useMemo(() => pending.map(l => l.row.id), [pending])
  const doubleBooked = useMemo(
    () => doubleBookedMatchIds(lines.map(l => ({ ...l.row, status: l.status }))),
    [lines],
  )

  const patch = useAdminMutation(eventId, (v: { id: number; body: Partial<MatchRow> }) => adminApi<PatchResult>(`/api/matches/${v.id}`, { method: 'PATCH', body: v.body }))
  const del = useAdminMutation(eventId, (id: number) => adminApi(`/api/matches/${id}`, { method: 'DELETE' }))
  const reorder = useAdminMutation(eventId, (next: number[]) => adminApi(`/api/events/${eventId}/matches/reorder`, { method: 'POST', body: { ids: next } }))

  const resetExcept = (keep: 'patch' | 'del' | 'reorder') => {
    if (keep !== 'patch') patch.reset()
    if (keep !== 'del') del.reset()
    if (keep !== 'reorder') reorder.reset()
  }

  const pendingCount = pendingIds.length

  const reorderPending = (pendingFrom: number, pendingTo: number): number[] => {
    const movedPending = moveId(pendingIds, pendingFrom, pendingTo)
    let cursor = 0
    return lines.map(l => (l.lane === 'pending' ? movedPending[cursor++] : l.row.id))
  }
  const onMovePending = (pendingIndex: number, dir: -1 | 1) => {
    const to = pendingIndex + dir
    if (to < 0 || to >= pendingIds.length) return
    resetExcept('reorder')
    reorder.mutate(reorderPending(pendingIndex, to))
  }
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(false)
    if (!e.over || e.active.id === e.over.id) return
    const from = pendingIds.indexOf(Number(e.active.id))
    const to = pendingIds.indexOf(Number(e.over.id))
    if (from === -1 || to === -1) return
    resetExcept('reorder')
    reorder.mutate(reorderPending(from, to))
  }
  const onPicked = (athleteId: number) => {
    if (!pick) return
    const { matchId, side } = pick
    resetExcept('patch')
    patch.mutate(
      { id: matchId, body: side === 'a' ? { athleteAId: athleteId } : { athleteBId: athleteId } },
      { onSuccess: r => setSwapNotes(n => ({ ...n, [matchId]: r?.warnings ?? [] })) },
    )
    setPick(null)
  }
  const onPatchAction = (id: number, body: Partial<MatchRow>, onError?: () => void) => {
    resetExcept('patch')
    patch.mutate({ id, body }, onError ? { onError } : undefined)
  }
  const onDeleteAction = (id: number) => {
    resetExcept('del')
    del.mutate(id)
  }

  const byId = useMemo(() => new Map(detail.athletes.map(a => [a.id, a])), [detail.athletes])
  const teamById = useMemo(() => new Map(detail.teams.map(t => [t.id, t])), [detail.teams])
  const numberOf = (matchId: number) => detail.matches.find(x => x.id === matchId)?.number ?? null
  const sideOf: SideOf = (row, side) => {
    const athleteId = side === 'a' ? row.athleteAId : row.athleteBId
    if (athleteId === null) {
      const feed = feedOf(row, side, numberOf)
      return { athleteId: null, name: feed === null ? 'Unknown competitor' : feedLabel(feed.take, feed.matchNumber), team: undefined }
    }
    const k = byId.get(athleteId)
    if (!k) return { athleteId, name: 'Unknown competitor', team: undefined }
    return { athleteId, name: athleteName(k), team: k.teamId === null ? undefined : teamById.get(k.teamId) }
  }
  const matItems = useMemo(() => [
    { value: '', label: 'No mat' },
    ...detail.mats.map(mat => ({ value: String(mat.id), label: `Mat ${mat.number}` })),
  ], [detail.mats])
  const rulesetItems = useMemo(() => detail.rulesets.map(r => ({ value: String(r.id), label: r.name })), [detail.rulesets])
  const booked = new Set([
    ...detail.matches.flatMap(matchAthleteIds),
    ...detail.divisions.flatMap(d => d.members.map(m => m.athleteId)),
  ])
  const draftedIds = new Set(proposals.flatMap(p => [p.a.athleteId, p.b.athleteId]))
  const drafted = detail.athletes.filter(a => !booked.has(a.id) && draftedIds.has(a.id)).length
  const free = detail.teams.map(t => ({
    team: t,
    kids: detail.athletes.filter(a => a.teamId === t.id && !booked.has(a.id) && !draftedIds.has(a.id)),
  }))
  const openAdd = (startId: number | null) => { setAddStart(startId); setAddOpen(true) }
  const holds = (line: MatchLine) => hovered !== null && (line.row.athleteAId === hovered || line.row.athleteBId === hovered)
  const viewOf = (line: MatchLine) => matchViewOf(line.row, detail, snapshot)

  const failure = patch.error ? { title: 'The change did not save', error: patch.error }
    : del.error ? { title: 'The match was not deleted', error: del.error }
      : reorder.error ? { title: 'The new order did not save', error: reorder.error }
        : null

  return (
    <div className="grid gap-6" data-dragging={dragging ? 'true' : undefined}>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" disabled={certified} onClick={() => openAdd(null)}>Add match</Button>
        <Button size="sm" variant="secondary" disabled={certified} onClick={() => setPasteOpen(true)}>Paste matches</Button>
        <Button size="sm" variant="secondary" disabled={certified} onClick={() => setOrderOpen(true)}>Order matches</Button>
        {certified && <span className="t2 text-gray-10">{CERTIFIED_REFUSAL}</span>}
      </div>

      {failure && (
        <Alert>
          <AlertTitle>{failure.title}</AlertTitle>
          <AlertDescription>{writeErrorMessage(failure.error)}</AlertDescription>
        </Alert>
      )}

      {live.length > 0 && (
        <section aria-label="Live now" className="grid gap-3">
          {live.map(l => (
            <LiveStrip
              key={l.row.id} line={l} a={sideOf(l.row, 'a')} b={sideOf(l.row, 'b')}
              serverNow={snapshot?.now ?? null} lastSuccessAt={lastSuccessAt} pollIntervalMs={pollIntervalMs}
              highlight={holds(l)} onHover={setHovered}
            />
          ))}
        </section>
      )}

      <KidPickerDialog
        detail={detail}
        exclude={pick?.exclude ?? null}
        held={pick?.held ?? null}
        matchId={pick?.matchId ?? null}
        open={pick !== null}
        onOpenChange={o => { if (!o) setPick(null) }}
        onPick={onPicked}
      />
      <AddMatchDialog detail={detail} start={addStart} open={addOpen} onOpenChange={setAddOpen} />
      <PasteMatchesDialog detail={detail} open={pasteOpen} onOpenChange={setPasteOpen} />
      <ScheduleDialog detail={detail} open={orderOpen} onOpenChange={setOrderOpen} />
      <ResultDialog detail={detail} match={editing} open={editing !== null} onOpenChange={o => { if (!o) setEditing(null) }} />
      <MatchHistorySheet source={history} open={history !== null} onOpenChange={o => { if (!o) setHistory(null) }} />

      <DivisionsPanel detail={detail} certified={certified} />

      <ProposalsPanel detail={detail} certified={certified} />

      <section aria-label="Pending matches" className="grid gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h3 className="t4">Pending</h3>
          <span className="t2 text-gray-10"><span className="fig">{pendingCount}</span> to run</span>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => setDragging(true)} onDragCancel={() => setDragging(false)} onDragEnd={onDragEnd}>
          <SortableContext items={pendingIds} strategy={verticalListSortingStrategy}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[var(--col-act)] pr-0"><span className="sr-only">Reorder</span></TableHead>
                  <TableHead className="w-[var(--col-state)] p-0"><span className="sr-only">State</span></TableHead>
                  <TableHead className="w-[116px]">Match</TableHead>
                  <TableHead className="w-[112px]">Mat</TableHead>
                  <TableHead>Competitors</TableHead>
                  <TableHead className="w-[168px]">Ruleset</TableHead>
                  <TableHead className="w-px"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={PENDING_COLUMNS} className="p-0">
                      <EmptyState
                        message="No matches yet."
                        action={<Button size="sm" variant="ghost" disabled={certified} onClick={() => openAdd(null)}>Add match</Button>}
                      />
                    </TableCell>
                  </TableRow>
                ) : pending.map((l, i) => (
                  <PendingRow
                    key={l.row.id} line={l} sideOf={sideOf} warnings={swapNotes[l.row.id] ?? []}
                    matItems={matItems} rulesetItems={rulesetItems} index={i} count={pending.length}
                    doubleBooked={doubleBooked.has(l.row.id)} certified={certified}
                    highlight={holds(l)} onHover={setHovered}
                    onPick={setPick} onPatch={onPatchAction} onDelete={onDeleteAction} onMove={onMovePending}
                  />
                ))}
              </TableBody>
            </Table>
          </SortableContext>
        </DndContext>
      </section>

      {settled.length > 0 && (
        <section aria-label="Settled matches" className="grid gap-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h3 className="t4">Completed (<span className="fig">{settled.length}</span>)</h3>
            <Button size="sm" variant="ghost" aria-expanded={showSettled} onClick={() => setShowSettled(s => !s)}>
              {showSettled ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showSettled && (
            <div className="overflow-hidden rounded-lg bg-gray-1">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[116px]">Match</TableHead>
                    <TableHead className="w-[80px]">Mat</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="w-[160px]">Win by</TableHead>
                    <TableHead numeric className="w-[80px]"><span className="font-sans">At</span></TableHead>
                    <TableHead className="w-px"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settled.map(l => (
                    <SettledRow
                      key={l.row.id} line={l} sideOf={sideOf}
                      highlight={holds(l)} certified={certified} onHover={setHovered}
                      onHistory={() => setHistory(matchHistorySource(viewOf(l), l.matNumber, detail))}
                      onEdit={() => setEditing(viewOf(l))}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}

      <section aria-label="No match yet" className="grid gap-3">
        <h3 className="t4">No match yet</h3>
        {drafted > 0 && <p className="t2 text-gray-10"><span className="fig">{drafted}</span> more have a proposed match.</p>}
        <div className="grid items-start gap-6 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          {free.map(({ team, kids }) => (
            <div key={team.id} className="grid min-w-0 gap-3">
              <div className="flex items-baseline gap-3">
                <TeamPlate color={team.color} name={team.name} />
                <span className="ml-auto fig t2 text-gray-10">{kids.length}</span>
              </div>
              <FieldSet>
                {kids.length === 0
                  ? <EmptyState message="Everybody here has a match." />
                  : (
                    <div role="list">
                      {kids.map(k => (
                        <FieldRow key={k.id} role="listitem" className="flex h-10 gap-3">
                          <span className="min-w-0 flex-1 truncate t3 text-gray-11">{athleteName(k)}</span>
                          <Button
                            size="sm" variant="ghost" aria-label={`Add match for ${athleteName(k)}`}
                            title={certified ? CERTIFIED_REFUSAL : undefined} disabled={certified}
                            onClick={() => openAdd(k.id)}
                          >
                            Add match
                          </Button>
                        </FieldRow>
                      ))}
                    </div>
                  )}
              </FieldSet>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
