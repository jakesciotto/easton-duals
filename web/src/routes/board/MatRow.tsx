import { useState } from 'react'
import type { ClockState, MatchSide, MatchView } from '@shared/types'
import { formatClock, remainingMs as remainingAt } from '@shared/clock'
import { styleTag, teamStyle } from '@/lib/format'
import { useClock, useServerOffset } from '@/lib/useClock'
import { POLL_CLOCK_RUNNING_MS } from '@/lib/pollInterval'
import { cn } from '@/lib/utils'
import { boardName } from './names'

const NEAR_EXPIRY_MS = 30_000

export function Fig({ value, className }: { value: number | string; className?: string }) {
  const text = String(value)
  const [state, setState] = useState(() => ({ slots: [text, ''] as [string, string], active: 0, shown: text }))
  if (state.shown !== text) {
    const active = state.active === 0 ? 1 : 0
    const slots: [string, string] = active === 0 ? [text, state.slots[1]] : [state.slots[0], text]
    setState({ slots, active, shown: text })
  }
  return (
    <span className={cn('b-fig', className)}>
      {state.slots.map((slot, i) => (
        <span
          key={i}
          aria-hidden={i !== state.active}
          className={i === state.active ? 'b-fig-on' : undefined}
        >
          {slot}
        </span>
      ))}
    </span>
  )
}

export function figTone(mine: number, theirs: number): string {
  return mine >= theirs ? 'b-lead' : 'b-trail'
}

export function rowTone(won: boolean | null, mine: number, theirs: number, settled: boolean): string | null {
  if (won === null) return settled ? null : figTone(mine, theirs)
  if (settled) return won ? null : 'b-fade'
  return won ? 'b-lead' : 'b-trail'
}

export function BoardName({ full, side, className }: { full: string; side: 'a' | 'b'; className?: string }) {
  const { first, last } = boardName(full)
  return (
    <span className={cn('b-name font-sans', side === 'a' ? 'b-name-a' : 'b-name-b', className)}>
      <span className="b-name-first">{first}</span>
      {last && <span className="b-name-last">{` ${last}`}</span>}
    </span>
  )
}

export function BoardSide({ side, which, className }: { side: MatchSide; which: 'a' | 'b'; className?: string }) {
  if (side.athleteId === null) {
    return <span className={cn('b-name b-feed font-sans', which === 'a' ? 'b-name-a' : 'b-name-b')}>{side.name}</span>
  }
  return <BoardName full={side.name} side={which} className={className} />
}

function BoardClock({ clock, serverNow, lastSuccessAt, pollIntervalMs }: {
  clock: ClockState
  serverNow: string | null
  lastSuccessAt: number | null
  pollIntervalMs: number
}) {
  const offset = useServerOffset(serverNow)
  const { remainingMs, running, stale } = useClock(clock, serverNow, lastSuccessAt, pollIntervalMs)
  const frozen = stale && lastSuccessAt !== null
  const shown = frozen ? remainingAt(clock, lastSuccessAt + offset) : remainingMs
  const state = stale ? 'b-clock-stale'
    : shown <= 0 ? 'b-clock-expired'
    : !running ? 'b-clock-paused'
    : shown <= NEAR_EXPIRY_MS ? 'b-clock-near'
    : null
  return <span className={cn('b-clock', state)}>{formatClock(shown)}</span>
}

export interface MatRowProps {
  a: MatchSide | null
  b: MatchSide | null
  matNumber?: number
  scores?: boolean
  live?: boolean
  settled?: boolean
  upcoming?: boolean
  winnerAthleteId?: number | null
  note?: string | null
  colorA?: string | null
  colorB?: string | null
  withClock?: boolean
  clock?: ClockState | null
  serverNow?: string | null
  lastSuccessAt?: number | null
  pollIntervalMs?: number
}

export function MatRow({
  a, b, matNumber, scores = true, live = false, settled = false, upcoming = false,
  winnerAthleteId = null, note = null, colorA = null, colorB = null,
  withClock = false, clock = null, serverNow = null,
  lastSuccessAt = null, pollIntervalMs = POLL_CLOCK_RUNNING_MS,
}: MatRowProps) {
  const showScores = scores && a !== null && b !== null && !upcoming
  const wonA = !showScores || winnerAthleteId === null || a === null ? null : a.athleteId === winnerAthleteId
  const toneA = !showScores || a === null || b === null ? null : rowTone(wonA, a.score, b.score, settled)
  const toneB = !showScores || a === null || b === null ? null : rowTone(wonA === null ? null : !wonA, b.score, a.score, settled)
  const nameToneA = settled ? toneA : null
  const nameToneB = settled ? toneB : null
  return (
    <div
      className={cn(
        'b-row font-mono',
        withClock ? 'b-row-clock' : null,
        live ? 'b-row-live' : null,
        settled ? 'b-row-settled' : null,
        upcoming ? 'b-row-upcoming' : null,
      )}
    >
      <span className="b-gut" aria-hidden />
      {a?.athleteId != null && colorA && <span aria-hidden style={teamStyle(colorA)} className="b-edge b-edge-a" />}
      {b?.athleteId != null && colorB && <span aria-hidden style={teamStyle(colorB)} className="b-edge b-edge-b" />}
      {matNumber !== undefined && <span className="b-mat">{matNumber}</span>}
      {note !== null && <span className="b-row-note font-sans">{note}</span>}
      {a && <BoardSide side={a} which="a" className={nameToneA ?? undefined} />}
      {showScores && a && b && <Fig className={cn('b-score b-score-a', toneA)} value={a.score} />}
      {clock && (
        <BoardClock
          clock={clock}
          serverNow={serverNow}
          lastSuccessAt={lastSuccessAt}
          pollIntervalMs={pollIntervalMs}
        />
      )}
      {showScores && a && b && <Fig className={cn('b-score b-score-b', toneB)} value={b.score} />}
      {b && <BoardSide side={b} which="b" className={nameToneB ?? undefined} />}
    </div>
  )
}

export function NextLine({ a, b }: { a: MatchSide; b: MatchSide }) {
  return (
    <div className="b-next-line">
      <BoardSide side={a} which="a" />
      <BoardSide side={b} which="b" />
    </div>
  )
}

export function OrderLine({ match }: { match: MatchView }) {
  return (
    <div className="b-order-line">
      <span className="b-order-tag font-sans">{`M${match.number} · ${styleTag(match.style)}`}</span>
      <BoardSide side={match.a} which="a" />
      <BoardSide side={match.b} which="b" />
    </div>
  )
}
