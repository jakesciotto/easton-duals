import { useEffect, useState, type FormEvent } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVerticalIcon } from 'lucide-react'
import { bracketRounds, roundLabel } from '@shared/round-label'
import { CERTIFIED_REFUSAL, writeErrorMessage } from '@/lib/eventMode'
import { adminApi, useAdminMutation } from '@/lib/queries'
import { athleteName, formatLabel, styleTag, stylesLabel, winTypeLabel } from '@/lib/format'
import { feedLabel, feedOf } from '@/lib/matchView'
import { moveId } from '@/lib/reorder'
import type { DivisionFormat, DivisionMember, DivisionStyles, DivisionView, EventDetail, MatchRow, Style, TeamRow } from '@/lib/types'
import { cn } from '@/lib/utils'
import { dialogBody, dialogFooter, dialogStack, dialogSurface } from '@/components/dialog-frame'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segment } from '@/components/ui/segment'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TeamPlate } from '@/components/TeamPlate'

const FORMATS: { value: DivisionFormat; label: string }[] = [
  { value: 'round_robin', label: formatLabel('round_robin') },
  { value: 'single_elim', label: formatLabel('single_elim') },
  { value: 'double_elim', label: formatLabel('double_elim') },
]
const STYLES: { value: DivisionStyles; label: string }[] = [
  { value: 'gi', label: stylesLabel('gi') },
  { value: 'nogi', label: stylesLabel('nogi') },
  { value: 'both', label: stylesLabel('both') },
]

interface Sides { a: string; b: string }
type SidesOf = (row: MatchRow) => Sides

/** What a division's matches are grouped into before they are drawn. */
interface Column { key: string; label: string; matches: MatchRow[] }

/**
 * A bracket reads left to right through the winners rounds, then the losers rounds
 * underneath, then the grand final on its own. `roundLabel` names each one by its
 * distance from the final, so a semifinal is a semifinal in a division of four and in a
 * division of sixteen.
 */
export function bracketColumns(format: DivisionFormat, members: number, matches: MatchRow[]): { winners: Column[]; losers: Column[]; grandFinal: MatchRow[] } {
  const rounds = bracketRounds(members)
  const losersRounds = format === 'double_elim' ? 2 * (rounds - 1) : 0
  const of = (round: number) => matches.filter(m => m.round === round).sort((x, y) => x.number - y.number)
  const column = (round: number): Column => ({ key: `r${round}`, label: roundLabel(format, round, members), matches: of(round) })
  const kept = (columns: Column[]) => columns.filter(c => c.matches.length > 0)
  return {
    winners: kept(Array.from({ length: rounds }, (_, i) => column(i + 1))),
    losers: kept(Array.from({ length: losersRounds }, (_, i) => column(rounds + i + 1))),
    grandFinal: of(rounds + losersRounds + 1),
  }
}

function ResultLine({ row, sides }: { row: MatchRow; sides: Sides }) {
  if (row.winnerAthleteId === null || row.winType === null) {
    return <span className="t2 text-gray-10">{row.status === 'live' ? 'Live' : ''}</span>
  }
  const winner = row.winnerAthleteId === row.athleteAId ? sides.a : sides.b
  return <span className="truncate t2 text-gray-11">{winner} {winTypeLabel(row.winType)}</span>
}

/** The number and, where a division runs both, the style: every match names itself. */
function MatchTags({ row, showStyle }: { row: MatchRow; showStyle: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Chip size="t1">M<span className="fig">{row.number}</span></Chip>
      {showStyle && <Chip size="t1">{styleTag(row.style)}</Chip>}
    </span>
  )
}

function SideLine({ row, side, text }: { row: MatchRow; side: 'a' | 'b'; text: string }) {
  const empty = (side === 'a' ? row.athleteAId : row.athleteBId) === null
  return <span className={cn('truncate t2', empty ? 'text-gray-10' : 'text-gray-12')}>{text}</span>
}

function BracketMatch({ row, sides, showStyle }: { row: MatchRow; sides: Sides; showStyle: boolean }) {
  return (
    <div className="grid min-w-0 gap-0.5 rounded-md bg-gray-3 px-2.5 py-2">
      <MatchTags row={row} showStyle={showStyle} />
      <SideLine row={row} side="a" text={sides.a} />
      <SideLine row={row} side="b" text={sides.b} />
      <ResultLine row={row} sides={sides} />
    </div>
  )
}

function BracketRow({ columns, sidesOf, showStyle }: { columns: Column[]; sidesOf: SidesOf; showStyle: boolean }) {
  return (
    // Wide brackets scroll inside their own card rather than widening the tab.
    <div className="flex min-w-0 gap-3 overflow-x-auto">
      {columns.map(c => (
        <div key={c.key} className="grid w-[196px] shrink-0 content-start gap-2">
          <span className="t1 text-gray-10 uppercase">{c.label}</span>
          {c.matches.map(m => <BracketMatch key={m.id} row={m} sides={sidesOf(m)} showStyle={showStyle} />)}
        </div>
      ))}
    </div>
  )
}

function RoundRobinRows({ matches, sidesOf }: { matches: MatchRow[]; sidesOf: SidesOf }) {
  return (
    <div role="list" className="grid gap-1">
      {matches.map(m => {
        const sides = sidesOf(m)
        return (
          <div key={m.id} role="listitem" className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
            <MatchTags row={m} showStyle />
            <span className="truncate t2 text-gray-12">{sides.a} vs {sides.b}</span>
            <ResultLine row={m} sides={sides} />
          </div>
        )
      })}
    </div>
  )
}

function MemberRow({ member, team, index, count, locked, onMove }: {
  member: DivisionMember
  team: TeamRow | undefined
  index: number
  count: number
  locked: boolean
  onMove: (from: number, to: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: member.athleteId })
  const name = athleteName(member)
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      role="listitem"
      className="flex h-8 min-w-0 items-center gap-2"
    >
      <span className="fig w-[var(--col-num-s)] shrink-0 text-right t2 text-gray-10">{member.seed}</span>
      {team && <TeamPlate color={team.color} name={team.name} size="inline" showName={false} />}
      <span className="min-w-0 flex-1 truncate t3">{name}</span>
      {!locked && (
        <span className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>Up</Button>
          <Button size="sm" variant="ghost" aria-label={`Move ${name} down`} disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>Down</Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Reorder ${name}`} className="cursor-grab" {...attributes} {...listeners}>
            <GripVerticalIcon />
          </Button>
        </span>
      )}
    </div>
  )
}

/** Name, format and styles. The members are reordered on the card, not in here. */
function EditDivisionDialog({ division, open, pending, error, onOpenChange, onSave }: {
  division: DivisionView
  open: boolean
  pending: boolean
  error: Error | null
  onOpenChange: (o: boolean) => void
  onSave: (patch: { name: string; format: DivisionFormat; styles: DivisionStyles }) => void
}) {
  const [name, setName] = useState(division.name)
  const [format, setFormat] = useState<DivisionFormat>(division.format)
  const [styles, setStyles] = useState<DivisionStyles>(division.styles)

  // Opening is the only thing that resets the form, so an arriving refetch cannot wipe a
  // half typed name out from under the operator.
  useEffect(() => {
    if (!open) return
    setName(division.name)
    setFormat(division.format)
    setStyles(division.styles)
  }, [open, division.id])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim() === '') return
    onSave({ name: name.trim(), format, styles })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogSurface(512)}>
        <form onSubmit={submit} className={dialogStack}>
          <DialogHeader><DialogTitle>Edit division</DialogTitle></DialogHeader>
          <DialogBody className={cn(dialogBody, 'gap-4')}>
            <div className="grid gap-2">
              <Label htmlFor="div-name">Name</Label>
              <Input id="div-name" value={name} autoComplete="off" onChange={e => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <span className="t2 text-gray-10">Format</span>
              <Segment aria-label="Format" value={format} onValueChange={v => setFormat(v as DivisionFormat)} options={FORMATS} />
            </div>
            <div className="grid gap-2">
              <span className="t2 text-gray-10">Styles</span>
              <Segment aria-label="Styles" value={styles} onValueChange={v => setStyles(v as DivisionStyles)} options={STYLES} />
            </div>
            <p className="t2 text-gray-10">Saving draws the division again, so its matches take new numbers.</p>
            {error && (
              <Alert>
                <AlertTitle>That division did not save</AlertTitle>
                <AlertDescription>{writeErrorMessage(error)}</AlertDescription>
              </Alert>
            )}
          </DialogBody>
          <DialogFooter className={dialogFooter}>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || name.trim() === ''}>Save division</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface Writes {
  /** `then` hears the outcome, so a write made inside a dialog reports inside it. */
  patch: (divisionId: number, body: Record<string, unknown>, then?: (error: Error | null) => void) => void
  seed: (divisionId: number) => void
  remove: (divisionId: number) => void
  pending: boolean
}

function DivisionCard({ division, detail, certified, refusal, writes }: {
  division: DivisionView
  detail: EventDetail
  certified: boolean
  /** What the last write on THIS card was refused with, or null. */
  refusal: string | null
  writes: Writes
}) {
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<Error | null>(null)
  // 6.8: a certified event refuses rather than asks, and a running division is locked for
  // the same reason. Either way the controls go rather than sitting there dead.
  const locked = certified || division.running
  const pointer = useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  const sensors = useSensors(...(locked ? [] : [pointer]))

  const teamById = new Map(detail.teams.map(t => [t.id, t]))
  const byId = new Map(detail.athletes.map(a => [a.id, a]))
  const numberOf = (matchId: number) => detail.matches.find(m => m.id === matchId)?.number ?? null
  const sidesOf: SidesOf = row => {
    const one = (side: 'a' | 'b') => {
      const athleteId = side === 'a' ? row.athleteAId : row.athleteBId
      if (athleteId !== null) { const k = byId.get(athleteId); return k ? athleteName(k) : 'Unknown competitor' }
      const feed = feedOf(row, side, numberOf)
      return feed === null ? 'Unknown competitor' : feedLabel(feed.take, feed.matchNumber)
    }
    return { a: one('a'), b: one('b') }
  }

  const matches = detail.matches.filter(m => m.divisionId === division.id).sort((x, y) => x.number - y.number)
  const seeds = division.members.map(m => m.athleteId)
  const move = (from: number, to: number) => {
    if (to < 0 || to >= seeds.length) return
    writes.patch(division.id, { athleteIds: moveId(seeds, from, to) })
  }
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    move(seeds.indexOf(Number(e.active.id)), seeds.indexOf(Number(e.over.id)))
  }

  const bracket = division.format === 'round_robin'
    ? null
    : (division.styles === 'both' ? (['gi', 'nogi'] as const) : [division.styles as Style])
      .map(style => ({ style, ...bracketColumns(division.format, division.members.length, matches.filter(m => m.style === style)) }))

  return (
    <section aria-label={division.name} className="grid min-w-0 gap-3 rounded-lg bg-gray-2 p-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h4 className="t4">{division.name}</h4>
        <span className="t2 text-gray-10">{formatLabel(division.format)}</span>
        <span className="t2 text-gray-10">{stylesLabel(division.styles)}</span>
        {division.running && <span className="t1 text-live uppercase">Running</span>}
        {!locked && (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" disabled={writes.pending} onClick={() => writes.seed(division.id)}>Seed by rating</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditError(null); setEditing(true) }}>Edit</Button>
            {/* 7.7: a destructive control never sits flush against the row's most repeated one. */}
            <Button size="sm" variant="destructive" className="ml-4" disabled={writes.pending} onClick={() => writes.remove(division.id)}>Delete</Button>
          </span>
        )}
        {certified && <span className="ml-auto t2 text-gray-10">{CERTIFIED_REFUSAL}</span>}
      </div>

      {refusal !== null && <p className="t2 text-attend">{refusal}</p>}
      {division.warnings.map(w => <p key={w} className="t2 text-attend">{w}</p>)}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={seeds} strategy={verticalListSortingStrategy}>
          <div role="list" aria-label={`${division.name} competitors`} className="grid min-w-0 gap-0.5">
            {division.members.map((m, i) => (
              <MemberRow
                key={m.athleteId} member={m} team={m.teamId === null ? undefined : teamById.get(m.teamId)}
                index={i} count={division.members.length} locked={locked} onMove={move}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {matches.length === 0
        ? <EmptyState message="No matches drawn yet." className="px-0" />
        : bracket === null
          ? <RoundRobinRows matches={matches} sidesOf={sidesOf} />
          : (
            <div className="grid min-w-0 gap-3">
              {bracket.map(b => (
                <div key={b.style} className="grid min-w-0 gap-2">
                  {division.styles === 'both' && <span className="t1 text-gray-10 uppercase">{styleTag(b.style)}</span>}
                  <BracketRow columns={b.winners} sidesOf={sidesOf} showStyle={false} />
                  {b.losers.length > 0 && <BracketRow columns={b.losers} sidesOf={sidesOf} showStyle={false} />}
                  {b.grandFinal.map(m => <BracketMatch key={m.id} row={m} sides={sidesOf(m)} showStyle={false} />)}
                </div>
              ))}
            </div>
          )}

      <EditDivisionDialog
        division={division}
        open={editing}
        pending={writes.pending}
        error={editError}
        onOpenChange={o => { if (!o) { setEditing(false); setEditError(null) } }}
        onSave={patch => writes.patch(division.id, patch, error => {
          setEditError(error)
          if (error === null) setEditing(false)
        })}
      />
    </section>
  )
}

/**
 * Spec 9's Divisions panel, above the drafts on the Matches tab. A division is created by
 * the paste; this is where it is read, reseeded, edited and deleted, and where its bracket
 * is drawn. Everything is locked the moment one of its matches is live or done, because
 * redrawing a division is deleting its matches and generating them again.
 */
export function DivisionsPanel({ detail, certified }: { detail: EventDetail; certified: boolean }) {
  const eventId = detail.event.id
  // A refusal belongs to the card it was refused on rather than to a banner over the
  // panel, because the card is still there and reading it is what happens next.
  const [refusals, setRefusals] = useState<Record<number, string>>({})
  const divisions = [...detail.divisions].sort((x, y) => x.position - y.position)

  const patch = useAdminMutation(eventId, (v: { id: number; body: Record<string, unknown> }) =>
    adminApi(`/api/divisions/${v.id}`, { method: 'PATCH', body: v.body }))
  const seed = useAdminMutation(eventId, (id: number) => adminApi(`/api/divisions/${id}/seed`, { method: 'POST' }))
  const remove = useAdminMutation(eventId, (id: number) => adminApi(`/api/divisions/${id}`, { method: 'DELETE' }))

  const note = (id: number, e: Error) => setRefusals(r => ({ ...r, [id]: writeErrorMessage(e) }))
  const clear = (id: number) => setRefusals(r => { const next = { ...r }; delete next[id]; return next })

  const writes: Writes = {
    pending: patch.isPending || seed.isPending || remove.isPending,
    patch: (id, body, then) => {
      clear(id)
      patch.mutate({ id, body }, {
        onSuccess: () => then?.(null),
        onError: e => { if (then) then(e); else note(id, e) },
      })
    },
    seed: id => { clear(id); seed.mutate(id, { onError: e => note(id, e) }) },
    remove: id => { clear(id); remove.mutate(id, { onError: e => note(id, e) }) },
  }

  return (
    <section aria-label="Divisions" className="grid gap-3">
      <h3 className="t4">Divisions</h3>
      {divisions.length === 0
        ? <EmptyState message="No divisions yet." />
        : divisions.map(d => (
          <DivisionCard
            key={d.id} division={d} detail={detail} certified={certified}
            refusal={refusals[d.id] ?? null} writes={writes}
          />
        ))}
    </section>
  )
}
