import type { MatchSide, MatchView, TeamView, WinType } from '@shared/types'
import type { Sheet as SheetState } from './useScorer'
import { DECISION_TYPES, decisionOf, type DecisionType } from '@/lib/scoring'
import { winTypeLabel } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Toggle } from '@/components/ui/toggle'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { TeamPlate } from '@/components/TeamPlate'

function Said({ side, winType, scores }: {
  side: MatchSide | null
  winType: WinType | null
  scores: { a: number; b: number }
}) {
  return (
    <>
      {side ? `${side.name} ${winTypeLabel(winType ?? 'decision')}` : 'a tie'},{' '}
      <span className="fig">{scores.a}</span> to <span className="fig">{scores.b}</span>
    </>
  )
}

const DECISION_WORD: Record<DecisionType, string> = { decision: 'Decision', dq: 'DQ', walkover: 'Walkover' }

export function ConfirmSheet({ sheet, match, teams, busy, error, onPick, onPickType, onConfirm, onCancel }: {
  sheet: SheetState | null
  match: MatchView
  teams: TeamView[]
  busy: boolean
  error: string | null
  onPick: (athleteId: number | null) => void
  onPickType: (winType: DecisionType) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const sideOf = (athleteId: number | null): MatchSide | null =>
    athleteId === null ? null : athleteId === match.a.athleteId ? match.a : match.b
  const winner = sheet ? sideOf(sheet.winner) : null
  const changed = sheet?.changed ?? null
  const title = changed ? 'The score changed'
    : sheet?.reason === 'time' ? 'Time is up'
    : sheet?.reason === 'terminal' ? 'Match over'
    : 'End the match?'
  const teamOf = (teamId: number | null) => teams.find(t => t.id === teamId)
  const decidedItself = sheet !== null && sheet.shown.winner !== null
  const decided = decisionOf(sheet?.winType ?? null)

  const pickOne = () => (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
        {[match.a, match.b].map(side => (
          <Toggle
            key={side.athleteId}
            size="mat"
            pressed={sheet?.winner === side.athleteId}
            onPressedChange={() => onPick(side.athleteId)}
            aria-label={`${side.name} wins`}
            className="flex-col gap-1"
          >
            <TeamPlate color={teamOf(side.teamId)?.color ?? 'red'} name={teamOf(side.teamId)?.name ?? 'Unassigned'} size="desk" showName={false} />
            <span className="max-w-full min-w-0 truncate">{side.name} wins</span>
          </Toggle>
        ))}
      </div>
      <div role="group" aria-label="How it was won" className="grid grid-cols-3 gap-4">
        {DECISION_TYPES.map(type => (
          <Toggle
            key={type}
            pressed={decided === type}
            onPressedChange={() => onPickType(type)}
            className="touch h-16"
          >
            {DECISION_WORD[type]}
          </Toggle>
        ))}
      </div>
    </div>
  )

  return (
    <Sheet open={sheet !== null} onOpenChange={o => { if (!o) onCancel() }}>
      <SheetContent side="bottom" data-poll-through>
        <SheetHeader showCloseButton={false}>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {changed ? (
            <>
              <Alert>
                <AlertTitle>The match moved while this was open</AlertTitle>
                <AlertDescription>
                  This was raised on{' '}
                  <Said side={sideOf(changed.was.winner)} winType={changed.was.winType} scores={changed.was.scores} />.
                  {' '}It now says{' '}
                  <Said side={sideOf(changed.now.winner)} winType={changed.now.winType} scores={changed.now.scores} />.
                </AlertDescription>
              </Alert>
              {changed.now.winner === null ? pickOne() : (
                <Button
                  type="button"
                  variant="secondary"
                  className="touch h-[104px] w-full"
                  aria-label={`${sideOf(changed.now.winner)!.name} wins ${winTypeLabel(changed.now.winType ?? 'decision')}`}
                  onClick={() => onPick(changed.now.winner!)}
                >
                  <TeamPlate
                    color={teamOf(sideOf(changed.now.winner)?.teamId ?? null)?.color ?? 'red'}
                    name={teamOf(sideOf(changed.now.winner)?.teamId ?? null)?.name ?? 'Unassigned'}
                    size="desk"
                    showName={false}
                  />
                  <span className="max-w-full min-w-0 truncate">
                    {sideOf(changed.now.winner)!.name} wins {winTypeLabel(changed.now.winType ?? 'decision')}
                  </span>
                </Button>
              )}
            </>
          ) : decidedItself && winner && sheet?.winType ? (
            <p className="flex flex-wrap items-center gap-2 t5 text-gray-12">
              <TeamPlate color={teamOf(winner.teamId)?.color ?? 'red'} name={teamOf(winner.teamId)?.name ?? 'Unassigned'} size="desk" showName={false} />
              <span>{winner.name} wins {winTypeLabel(sheet.winType)},</span>
              <span className="fig">{sheet.shown.scores.a}</span>
              <span>to</span>
              <span className="fig">{sheet.shown.scores.b}</span>
            </p>
          ) : (
            <div className="grid gap-3">
              <p className="t3 text-gray-11">
                Scores are tied at <span className="fig">{sheet?.shown.scores.a ?? 0}</span>. Referee decision:
              </p>
              {pickOne()}
            </div>
          )}
          {!changed && error && (
            <Alert>
              <AlertTitle>That did not go through</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </SheetBody>
        <SheetFooter className="gap-4">
          <Button type="button" variant="secondary" className="touch h-[104px] flex-1" onClick={onCancel} disabled={busy}>
            Back to match
          </Button>
          <Button
            type="button"
            className="touch h-[104px] flex-1"
            onClick={onConfirm}
            disabled={busy || !sheet || changed !== null || sheet.winner === null || sheet.winType === null}
          >
            Record win {winTypeLabel(sheet?.winType ?? 'decision')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
