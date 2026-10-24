import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, type ApiOptions } from './api'
import { clearAdminToken, getAdminToken } from './auth'
import { useHeldWhileEngaged } from './operatorEngaged'
import type { EventDetail, EventSummary, Proposal } from './types'

export const qk = {
  events: ['events'] as const,
  event: (id: number) => ['event', id] as const,
  proposals: (id: number) => ['proposals', id] as const,
}

export async function adminApi<T = unknown>(path: string, opts: Omit<ApiOptions, 'token'> = {}): Promise<T> {
  try {
    return await api<T>(path, { ...opts, token: getAdminToken() })
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && e.code !== 'bad_pin') clearAdminToken()
    throw e
  }
}

export function useEvents() {
  return useQuery({ queryKey: qk.events, queryFn: () => adminApi<EventSummary[]>('/api/events') })
}

export interface EventDetailQuery {
  data: EventDetail | undefined
  error: Error | null
  isLoading: boolean
}

export function useEventDetail(eventId: number): EventDetailQuery {
  const q = useQuery({
    queryKey: qk.event(eventId),
    queryFn: () => adminApi<EventDetail>(`/api/events/${eventId}`),
  })
  return { data: useHeldWhileEngaged(q.data, eventId), error: q.error, isLoading: q.isLoading }
}

export function useProposals(eventId: number) {
  return useQuery({ queryKey: qk.proposals(eventId), queryFn: () => adminApi<Proposal[]>(`/api/events/${eventId}/proposals`) })
}

export interface AdminMutationOptions {
  proposals?: boolean
  awaitRefetch?: boolean
}

export function useAdminMutation<TVars, TResult = unknown>(
  eventId: number | null,
  run: (vars: TVars) => Promise<TResult>,
  opts: AdminMutationOptions = {},
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      const refetched = Promise.all([
        qc.invalidateQueries({ queryKey: qk.events }),
        eventId !== null ? qc.invalidateQueries({ queryKey: qk.event(eventId) }) : Promise.resolve(),
        eventId !== null && opts.proposals ? qc.invalidateQueries({ queryKey: qk.proposals(eventId) }) : Promise.resolve(),
      ])
      return opts.awaitRefetch === false ? undefined : refetched
    },
  })
}
