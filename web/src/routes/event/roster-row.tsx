import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { IdCardIcon, UserMinusIcon, XIcon } from 'lucide-react'
import type { AthleteRow, RosterCandidate } from '@/lib/types'
import { athleteName, beltLabel, genderLabel } from '@/lib/format'
import { BeltDot } from '@/components/BeltDot'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Chip } from '@/components/ui/chip'
import { FieldRow } from '@/components/ui/field-set'
import { cn } from '@/lib/utils'

export const ROSTER_COLS =
  'grid grid-cols-[var(--col-select)_var(--col-state)_minmax(0,1fr)_var(--col-num-s)_var(--col-num-m)_56px_56px_var(--col-act)_var(--col-act)] gap-x-3 px-3'

const CELL = 'fig t2 h-6 w-full rounded-md px-1.5 text-right transition-colors duration-120 ease-out'

type Source = AthleteRow['ageSource']

function EditableCell({ label, value, source, onSave }: {
  label: string
  value: number | null
  source: Source
  onSave: (v: number | null) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const editing = draft !== null

  useEffect(() => {
    if (editing || !restoreFocus.current) return
    restoreFocus.current = false
    button.current?.focus()
  }, [editing])

  const close = () => {
    restoreFocus.current = true
    setDraft(null)
  }
  const commit = () => {
    if (draft === null) return
    const next = draft === '' ? null : Number(draft)
    close()
    if (next !== value && (next === null || Number.isFinite(next))) onSave(next)
  }

  if (editing) {
    return (
      <input
        autoFocus
        aria-label={label}
        inputMode="numeric"
        placeholder="--"
        value={draft}
        onChange={e => setDraft(e.target.value.replace(/\D/g, ''))}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
        }}
        className={cn(CELL, 'border-0 bg-gray-3 text-white outline-none placeholder:text-gray-9 focus-visible:shadow-focus')}
      />
    )
  }

  const estimated = value !== null && source === 'leaderboard'
  return (
    <button
      ref={button}
      type="button"
      aria-label={`${label}, ${value === null ? 'missing' : value}`}
      title={estimated ? 'Estimated from the leaderboard until it is typed over' : undefined}
      onClick={() => setDraft(value === null ? '' : String(value))}
      onKeyDown={e => {
        if (!/^[0-9]$/.test(e.key)) return
        e.preventDefault()
        setDraft(e.key)
      }}
      className={cn(
        CELL,
        'cursor-text hover:bg-gray-3 focus-visible:bg-gray-3 focus-visible:shadow-focus',
        value === null && 'text-attend',
        estimated && 'text-gray-10 underline decoration-gray-8 decoration-dotted underline-offset-2',
        value !== null && !estimated && 'text-white',
      )}
    >
      {value === null ? '--' : value}
    </button>
  )
}

export const NOT_IN_WL = 'Not in WellnessLiving'

export function looksLikeLine(candidate: { firstName: string; lastName: string; wlLocation: string }): string {
  return `Looks like ${athleteName(candidate)}, ${candidate.wlLocation}`
}

export const SCORING_FULL = 'a team scores with at most ten athletes'

function ScoringCell({ id, name, scoring, full, onChange }: {
  id: number
  name: string
  scoring: boolean
  full: boolean
  onChange: (v: boolean) => void
}) {
  const refused = full && !scoring
  return (
    <span data-slot="scoring-cell" className="flex h-6 items-center justify-center" title={refused ? SCORING_FULL : undefined}>
      <Checkbox
        id={`scoring-${id}`}
        aria-label={`Scoring for ${name}`}
        checked={scoring}
        disabled={refused}
        onCheckedChange={onChange}
        className="data-disabled:opacity-50"
      />
    </span>
  )
}

export function wlMismatchTitle(kid: AthleteRow, record: RosterCandidate): string | null {
  const diffs = [
    record.age !== null && record.age !== kid.age ? `${record.age}y` : null,
    record.weightLbs !== null && record.weightLbs !== kid.weightLbs ? `${record.weightLbs} lb` : null,
    record.belt !== null && record.belt !== kid.belt ? beltLabel(record.belt) : null,
    record.gender !== null && record.gender !== kid.gender ? genderLabel(record.gender) : null,
  ].filter((d): d is string => d !== null)
  return diffs.length === 0 ? null : `WellnessLiving: ${diffs.join(', ')}`
}

export function RosterRow({ kid, selected, fault, inMatch, busy, suggestion, wlRecord, scoringToggle, scoringFull, onSelect, onPatch, onRemove, onUnassign, onLink, onConfirm, onDismiss, onProfile, onDragStart }: {
  kid: AthleteRow
  selected: boolean
  fault: boolean
  inMatch: boolean
  busy: boolean
  suggestion: RosterCandidate | undefined
  wlRecord: RosterCandidate | undefined
  scoringToggle: boolean
  scoringFull: boolean
  onSelect: (v: boolean, range: boolean) => void
  onPatch: (body: Partial<AthleteRow>) => void
  onRemove: () => void
  onUnassign: () => void
  onLink: () => void
  onConfirm: (wlUid: string) => void
  onDismiss: (wlUid: string) => void
  onProfile: () => void
  onDragStart: (e: ReactPointerEvent, id: number) => void
}) {
  const suggested = kid.suggestedWlUid
  const unlinked = kid.wlUid === null && suggested === null
  const missing = unlinked && kid.syncedAt !== null
  const name = athleteName(kid)
  const range = useRef(false)
  const state = fault ? 'fault' : kid.age === null || kid.weightLbs === null ? 'attend' : 'ok'
  const mismatch = kid.wlUid !== null && wlRecord !== undefined ? wlMismatchTitle(kid, wlRecord) : null
  const inTeam = kid.teamId !== null
  const metaParts: ReactNode[] = [
    <BeltDot key="belt" belt={kid.belt} />,
    kid.erp === null ? null : <Chip key="erp" value={kid.erp.toFixed(1)} size="t1" />,
    missing ? <span key="missing" className="truncate">{NOT_IN_WL}</span> : null,
    suggested !== null && suggestion !== undefined
      ? <span key="suggestion" className="truncate text-gray-11">{looksLikeLine(suggestion)}</span>
      : null,
  ].filter((part): part is NonNullable<typeof part> => part !== null)

  return (
    <FieldRow
      role="listitem"
      data-density="two-line"
      data-state={state}
      data-selected={selected}
      onPointerDownCapture={e => { range.current = e.shiftKey }}
      onClickCapture={e => { range.current = e.shiftKey }}
      onPointerDown={e => {
        if ((e.target as HTMLElement).closest('button, input, a')) return
        onDragStart(e, kid.id)
      }}
      className={cn(
        ROSTER_COLS,
        'group/row touch-pan-y py-2 font-mono t2 focus-within:bg-accent',
        suggested === null ? 'h-14' : 'min-h-14 gap-y-2',
      )}
    >
      <Checkbox
        aria-label={`Select ${name}`}
        checked={selected}
        onCheckedChange={checked => onSelect(checked, range.current)}
      />
      <span
        aria-hidden
        className={cn(
          'h-9 w-full rounded-[2px]',
          state === 'attend' && 'bg-attend',
          state === 'fault' && 'bg-fault',
        )}
      />
      <span className="min-w-0 font-sans">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate t3 font-medium! text-white" title={name}>{name}</span>
          {mismatch !== null && (
            <span aria-label={mismatch} title={mismatch} className="size-1.5 shrink-0 rounded-full bg-attend" />
          )}
        </span>
        <span className="flex min-w-0 items-center gap-2 t2 font-normal! leading-4! text-gray-10">
          {metaParts}
        </span>
      </span>
      <EditableCell
        label={`Age for ${name}`}
        value={kid.age}
        source={kid.ageSource}
        onSave={age => onPatch({ age })}
      />
      <EditableCell
        label={`Weight for ${name}`}
        value={kid.weightLbs}
        source={kid.weightSource}
        onSave={weightLbs => onPatch({ weightLbs })}
      />
      {scoringToggle
        ? (
          <ScoringCell
            id={kid.id}
            name={name}
            scoring={kid.scoring}
            full={scoringFull}
            onChange={scoring => onPatch({ scoring })}
          />
        )
        : <span />}
      {unlinked
        ? <Button variant="ghost" size="sm" aria-label={`Link ${name}`} onClick={onLink} className="w-full px-0 font-sans">Link</Button>
        : <span />}
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Profile for ${name}`}
        onClick={onProfile}
        className="text-gray-9 group-hover/row:text-gray-11 group-focus-within/row:text-gray-11"
      >
        <IdCardIcon />
      </Button>
      {inTeam
        ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Move ${name} to Unassigned`}
            title={busy ? `${name} is in a match.` : undefined}
            disabled={busy}
            onClick={onUnassign}
            className="text-gray-9 group-hover/row:text-gray-11 group-focus-within/row:text-gray-11"
          >
            <UserMinusIcon />
          </Button>
        )
        : (
          <Button
            variant="ghost"
            size="icon"
            aria-label={inMatch ? `Remove ${name}, already in a match` : `Remove ${name}`}
            disabled={inMatch}
            onClick={onRemove}
            className="text-gray-9 hover:text-fault group-hover/row:text-fault group-focus-within/row:text-fault"
          >
            <XIcon />
          </Button>
        )}
      {suggested !== null && (
        <span className="col-span-full flex items-center gap-2 font-sans">
          <Button variant="ghost" size="sm" aria-label={`Confirm ${name}`} onClick={() => onConfirm(suggested)}>Confirm</Button>
          <Button variant="ghost" size="sm" aria-label={`Not them, ${name}`} onClick={() => onDismiss(suggested)}>Not them</Button>
        </span>
      )}
    </FieldRow>
  )
}
