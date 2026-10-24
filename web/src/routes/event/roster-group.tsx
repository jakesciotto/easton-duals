import type { PointerEvent as ReactPointerEvent } from 'react'
import { SCORING_CAP } from '@shared/types'
import type { AthleteRow, RosterCandidate } from '@/lib/types'
import { TeamPlate } from '@/components/TeamPlate'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldHead, FieldSet } from '@/components/ui/field-set'
import { cn } from '@/lib/utils'
import { DROP_ATTR, dropZoneValue } from './roster-drag'
import { ROSTER_COLS, RosterRow } from './roster-row'

const SUBHEAD_STICKY = 'sticky top-[var(--app-header-h,57px)] z-1'

export interface ScoringState {
  everyone: boolean
  full: boolean
  line: string
  shortfall: string | null
}

export function scoringState(kids: AthleteRow[]): ScoringState {
  const marked = kids.filter(k => k.scoring).length
  if (kids.length <= SCORING_CAP) return { everyone: true, full: false, line: 'Every athlete scores', shortfall: null }
  return {
    everyone: false,
    full: marked >= SCORING_CAP,
    line: `${marked} of ${SCORING_CAP} scoring`,
    shortfall: marked < SCORING_CAP ? `Pick ${SCORING_CAP - marked} more scoring athletes` : null,
  }
}

export function RosterGroup({
  title, color, teamId, kids, selected, faults, inMatch, pendingOrLive, suggestions, dragging, over,
  onSelect, onPatch, onRemove, onUnassign, onLink, onConfirm, onDismiss, onProfile, onDragStart, onAdd,
}: {
  title: string
  color: string | null
  teamId: number | null
  kids: AthleteRow[]
  selected: Set<number>
  faults: Set<number>
  inMatch: Set<number>
  pendingOrLive: Set<number>
  suggestions: Map<string, RosterCandidate>
  dragging: boolean
  over: boolean
  onSelect: (id: number, v: boolean, range: boolean) => void
  onPatch: (id: number, body: Partial<AthleteRow>) => void
  onRemove: (kid: AthleteRow) => void
  onUnassign: (kid: AthleteRow) => void
  onLink: (kid: AthleteRow) => void
  onConfirm: (kid: AthleteRow, wlUid: string) => void
  onDismiss: (kid: AthleteRow, wlUid: string) => void
  onProfile: (kid: AthleteRow) => void
  onDragStart: (e: ReactPointerEvent, id: number) => void
  onAdd?: () => void
}) {
  const scoring = teamId === null ? null : scoringState(kids)
  return (
    <section aria-label={title} className="min-w-0" {...{ [DROP_ATTR]: dropZoneValue(teamId) }}>
      <div className={cn(SUBHEAD_STICKY, 'flex h-10 items-center gap-3 bg-background xl:static xl:h-8 xl:bg-transparent')}>
        {color
          ? <TeamPlate color={color} name={title} className="min-w-0" />
          : <span className="t2 font-medium! text-gray-11">{title}</span>}
        {scoring && <span className="shrink-0 whitespace-nowrap t2 text-gray-10">{scoring.line}</span>}
        {scoring?.shortfall && <Badge variant="warn">{scoring.shortfall}</Badge>}
        <span className="ml-auto fig t2 text-gray-10">{kids.length}</span>
      </div>
      <FieldSet
        className={cn(
          'font-mono t2',
          dragging && 'border-gray-7!',
          over && 'bg-gray-3 shadow-[inset_0_0_0_2px_var(--white)]',
        )}
      >
        <FieldHead className={cn(ROSTER_COLS, 'font-mono t2')}>
          <span />
          <span />
          <span className="t1 font-sans">Competitor</span>
          <span className="tick t1 font-sans text-right">Age</span>
          <span className="tick t1 font-sans text-right">lb</span>
          {scoring !== null && !scoring.everyone
            ? <span className="tick t1 font-sans text-center">Scoring</span>
            : <span />}
          <span />
          <span />
          <span />
        </FieldHead>
        {kids.length === 0
          ? (
            <EmptyState
              message="No competitors here yet."
              action={onAdd && <Button size="sm" variant="ghost" onClick={onAdd}>Add a competitor</Button>}
            />
          )
          : (
            <div role="list">
              {kids.map(k => (
                <RosterRow
                  key={k.id}
                  kid={k}
                  selected={selected.has(k.id)}
                  fault={faults.has(k.id)}
                  inMatch={inMatch.has(k.id)}
                  busy={pendingOrLive.has(k.id)}
                  suggestion={k.suggestedWlUid === null ? undefined : suggestions.get(k.suggestedWlUid)}
                  wlRecord={k.wlUid === null ? undefined : suggestions.get(k.wlUid)}
                  scoringToggle={scoring !== null && !scoring.everyone}
                  scoringFull={scoring?.full ?? false}
                  onSelect={(v, range) => onSelect(k.id, v, range)}
                  onPatch={body => onPatch(k.id, body)}
                  onRemove={() => onRemove(k)}
                  onUnassign={() => onUnassign(k)}
                  onLink={() => onLink(k)}
                  onConfirm={wlUid => onConfirm(k, wlUid)}
                  onDismiss={wlUid => onDismiss(k, wlUid)}
                  onProfile={() => onProfile(k)}
                  onDragStart={onDragStart}
                />
              ))}
            </div>
          )}
      </FieldSet>
    </section>
  )
}
