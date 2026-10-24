import { STALE_POLL_MULTIPLIER } from './pollInterval'

export function ageSeconds(lastSuccessAt: number | null, now: number): number | null {
  if (lastSuccessAt === null) return null
  return Math.max(0, Math.floor((now - lastSuccessAt) / 1000))
}

export function formatAge(ageSec: number): string {
  return `${ageSec}s`
}

export function isStale(lastSuccessAt: number | null, now: number, pollIntervalMs: number): boolean {
  if (lastSuccessAt === null) return false
  return now - lastSuccessAt > pollIntervalMs * STALE_POLL_MULTIPLIER
}

export type FreshnessLevel = 'fresh' | 'attend' | 'fault'

export function headerFreshnessLevel(ageSec: number | null, pollIntervalMs: number): FreshnessLevel {
  if (ageSec === null) return 'fresh'
  const ageMs = ageSec * 1000
  if (ageMs <= pollIntervalMs * 2) return 'fresh'
  if (ageMs <= pollIntervalMs * STALE_POLL_MULTIPLIER) return 'attend'
  return 'fault'
}
