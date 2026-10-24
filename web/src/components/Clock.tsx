import type { ClockState } from '@shared/types'
import { formatClock } from '@shared/clock'
import { useClock } from '@/lib/useClock'
import { cn } from '@/lib/utils'

const NEAR_EXPIRY_MS = 30_000

export function Clock({
  clock,
  serverNow,
  lastSuccessAt = null,
  pollIntervalMs,
  className,
  staleLabelClassName,
}: {
  clock: ClockState | null
  serverNow: string | null
  lastSuccessAt?: number | null
  pollIntervalMs?: number
  className?: string
  staleLabelClassName?: string
}) {
  const { remainingMs, running, stale, ageSec } = useClock(clock, serverNow, lastSuccessAt, pollIntervalMs)
  const expired = clock !== null && remainingMs <= 0
  const nearExpiry = running && !expired && remainingMs <= NEAR_EXPIRY_MS

  const colorClass = stale ? 'text-gray-10'
    : expired ? 'text-fault'
    : nearExpiry ? 'text-white'
    : running ? 'text-gray-11'
    : 'text-gray-10'

  return (
    <>
      <span className={cn('fig fig-4', className, colorClass)}>{formatClock(remainingMs)}</span>
      {stale && ageSec !== null && (
        <span className={cn('t2 text-gray-10', staleLabelClassName)}>Not updating {ageSec}s</span>
      )}
    </>
  )
}
