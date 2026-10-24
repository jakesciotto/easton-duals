import { ApiError } from './api'

export type BindLoss = 'expired' | 'taken'

export const BIND_LOSS_COPY: Record<BindLoss, string> = {
  expired: 'This iPad needs the mat code again.',
  taken: 'Another iPad took this mat over. Bind again to score from here.',
}

export function bindLossOf(e: unknown): BindLoss | null {
  if (!(e instanceof ApiError) || e.status !== 401) return null
  if (e.code === 'token_stale') return 'taken'
  if (e.code === 'unauthorized') return 'expired'
  return null
}

export function isBindLoss(value: string | null): value is BindLoss {
  return value === 'expired' || value === 'taken'
}

export function matPickPath(eventId: number, reason: BindLoss): string {
  return `/mat?event=${eventId}&reason=${reason}`
}
