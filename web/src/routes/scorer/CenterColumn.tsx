import type { MatchView, MatView } from '@shared/types'
import { formatClock } from '@shared/clock'
import { Clock } from '@/components/Clock'
import { styleTag } from '@/lib/format'
import { useClock } from '@/lib/useClock'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ADD_TIME_MS, signed, type LocalAction } from './actions'
import {
  CLOCK_ROW, COLUMN_GAP, COMMIT, HEAD_GAP, HEAD_LINE, MOAT, PAD, REASON, RULE, SECONDARY,
  STACK_GAP, columnBudget,
} from './budget'
import { CLOCK_RUNNING } from './refusals'
import { useViewportHeight } from './viewport'

export interface CenterRefusals {
  clock: string | null
  addTime: string | null
  undo: string | null
  minusA: string | null
  minusB: string | null
}

function Reason({ text }: { text: string | null }) {
  return <p className="w-full overflow-hidden t2 text-gray-10" style={{ height: REASON }}>{text}</p>
}

function MinusButton({ name, athleteId, points, refusal, onMinus }: {
  name: string
  athleteId: number | null
  points: number | null
  refusal: string | null
  onMinus: (athleteId: number | null) => void
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={refusal !== null}
      onClick={() => onMinus(athleteId)}
      className="touch min-w-0 flex-col gap-0.5"
      style={{ height: SECONDARY }}
    >
      <span className="t2">Minus{points === null ? '' : ` ${Math.abs(points)}`}</span>
      <span className="max-w-full min-w-0 truncate t1 font-normal! text-gray-10">{name}</span>
    </Button>
  )
}

export function nextNote(mat: MatView, mats: MatView[]): string | null {
  const next = mat.onDeck[0]
  if (!next) return null

  const waiting = [next.a, next.b].find(side => side.athleteId === null && side.feed !== null)
  if (waiting?.feed) return `Next: waiting on M${waiting.feed.matchNumber}`

  for (const side of [next.a, next.b]) {
    if (side.athleteId === null) continue
    const elsewhere = mats.find(m => m.id !== mat.id && m.current !== null
      && (m.current.a.athleteId === side.athleteId || m.current.b.athleteId === side.athleteId))
    if (elsewhere) return `Next: ${side.name} is live on mat ${elsewhere.number}`
  }
  return `Next: ${next.a.name} vs ${next.b.name}`
}

function LastAction({ action }: { action: LocalAction | null }) {
  if (!action) return <p className="t2 text-gray-10">No action recorded on this tablet yet.</p>
  if (action.kind === 'clock') {
    return <p className="t2 text-gray-10">{action.label} at <span className="fig">{action.at}</span></p>
  }
  if (action.kind === 'extend') {
    return (
      <p className="t2 text-gray-10">
        {action.label} <span className="fig">{formatClock(action.addMs)}</span> at <span className="fig">{action.at}</span>
      </p>
    )
  }
  return (
    <p className="t2 text-gray-10">
      {action.label} <span className="fig">{signed(action.points)}</span> {action.name} at <span className="fig">{action.at}</span>
    </p>
  )
}

export function CenterColumn({ mat, match, next, serverNow, lastSuccessAt, pollIntervalMs, expired, lastAction, refusals, error, contact, onClock, onAddTime, onUndo, onMinus, onEnd }: {
  mat: MatView
  next: string | null
  match: MatchView
  serverNow: string | null
  lastSuccessAt: number | null
  pollIntervalMs: number
  expired: boolean
  lastAction: LocalAction | null
  refusals: CenterRefusals
  error: string | null
  contact: string | null
  onClock: () => void
  onAddTime: () => void
  onUndo: () => void
  onMinus: (athleteId: number | null) => void
  onEnd: () => void
}) {
  const running = match.clock.startedAt !== null
  const viewport = useViewportHeight()
  const budget = columnBudget(viewport)
  const { stale } = useClock(match.clock, serverNow, lastSuccessAt, pollIntervalMs)
  const correctionReason = refusals.undo
  const clockRowReason = refusals.clock
    ?? (!running && refusals.addTime !== CLOCK_RUNNING ? refusals.addTime : null)
  const minusPoints = (refusal: string | null) =>
    refusal === null && lastAction?.kind === 'score' ? lastAction.points : null

  const minusRow = (
    <div className="grid grid-cols-2 gap-4">
      <MinusButton
        name={match.a.name}
        athleteId={match.a.athleteId}
        points={minusPoints(refusals.minusA)}
        refusal={refusals.minusA}
        onMinus={onMinus}
      />
      <MinusButton
        name={match.b.name}
        athleteId={match.b.athleteId}
        points={minusPoints(refusals.minusB)}
        refusal={refusals.minusB}
        onMinus={onMinus}
      />
    </div>
  )

  return (
    <div
      className="flex w-80 shrink-0 flex-col items-center overflow-hidden border-x border-gray-7 bg-background"
      style={{ padding: PAD, gap: COLUMN_GAP }}
    >
      <div className="flex w-full shrink-0 flex-col items-center" style={{ gap: HEAD_GAP }}>
        {!stale && (
          <div className="flex w-full items-center justify-center overflow-hidden" style={{ height: HEAD_LINE }}>
            <span className="max-w-full truncate fig t1 text-gray-10">
              MAT {mat.number} · M{match.number} · {styleTag(match.style)} · {formatClock(match.clock.lengthMs)}
            </span>
          </div>
        )}
        <Clock
          clock={match.clock}
          serverNow={serverNow}
          lastSuccessAt={lastSuccessAt}
          pollIntervalMs={pollIntervalMs}
          className="text-[length:max(12vh,96px)] leading-none tracking-[-0.018em]"
          staleLabelClassName="shrink-0"
        />
      </div>

      {expired && (
        <Alert className="w-full shrink-0">
          <AlertTitle>Time expired. Record the result or add time.</AlertTitle>
        </Alert>
      )}

      <div className="flex w-full min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mt-auto grid w-full" style={{ gap: COLUMN_GAP }}>
          {error && (
            <Alert>
              <AlertTitle>That did not go through</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!expired && !error && next !== null && (
            <p className="truncate text-center t2 text-gray-10">{next}</p>
          )}
          <LastAction action={lastAction} />
          {contact && <p className="text-center t2 text-gray-10">{contact}</p>}
          {!budget.minusRowFixed && minusRow}
        </div>
      </div>

      <div className="grid w-full shrink-0" style={{ gap: STACK_GAP }}>
        <Button
          type="button"
          variant="secondary"
          disabled={refusals.undo !== null}
          onClick={onUndo}
          className="touch w-full flex-col gap-1"
          style={{ height: COMMIT }}
        >
          <span>
            {lastAction?.kind === 'score' && `Undo ${lastAction.label.toLowerCase()} `}
            {lastAction?.kind === 'score' && <span className="fig">{signed(lastAction.points)}</span>}
            {lastAction?.kind === 'extend' && 'Undo the added time'}
            {(!lastAction || lastAction.kind === 'clock') && 'Undo the last action'}
          </span>
          {lastAction?.kind === 'score' && (
            <span className="max-w-full min-w-0 truncate t2 font-normal! text-gray-10">{lastAction.name}</span>
          )}
        </Button>

        {budget.minusRowFixed && minusRow}
        <Reason text={correctionReason} />

        <div className="grid w-full" style={{ gridTemplateColumns: '3fr 2fr', gap: STACK_GAP * 2 }}>
          <Button
            type="button"
            variant={running ? 'secondary' : 'default'}
            disabled={refusals.clock !== null}
            onClick={onClock}
            className="touch w-full"
            style={{ height: CLOCK_ROW }}
          >
            {running ? 'Pause' : 'Start'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={refusals.addTime !== null}
            onClick={onAddTime}
            className="touch w-full"
            style={{ height: CLOCK_ROW }}
          >
            Add <span className="fig">{formatClock(ADD_TIME_MS)}</span>
          </Button>
        </div>
        <Reason text={clockRowReason} />

        <div aria-hidden style={{ height: MOAT }} />
        <div aria-hidden className="bg-gray-7" style={{ height: RULE }} />
        <Button type="button" variant="secondary" onClick={onEnd} className="touch w-full" style={{ height: COMMIT }}>
          End match
        </Button>
      </div>
    </div>
  )
}
