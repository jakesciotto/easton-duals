import type { Snapshot } from '@shared/types'

export const POLL_CLOCK_RUNNING_MS = 1000
export const POLL_LIVE_IDLE_MS = 3000
export const POLL_DATA_ENTRY_MS = 5000

export const STALE_POLL_MULTIPLIER = 3

export function pollIntervalForSnapshot(snapshot: Snapshot | null): number {
  if (!snapshot) return POLL_CLOCK_RUNNING_MS
  if (snapshot.event.mode === 'entry') return POLL_DATA_ENTRY_MS
  if (snapshot.mats.length === 0) return POLL_DATA_ENTRY_MS
  const clockRunning = snapshot.mats.some(mat => mat.current !== null && mat.current.clock.startedAt !== null)
  return clockRunning ? POLL_CLOCK_RUNNING_MS : POLL_LIVE_IDLE_MS
}

export const POLL_DEADLINE_MIN_MS = 4000
