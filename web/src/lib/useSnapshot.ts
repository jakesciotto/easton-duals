import { getAdminToken } from './auth'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Snapshot } from '@shared/types'
import { POLL_DEADLINE_MIN_MS, pollIntervalForSnapshot } from './pollInterval'
import { useHeldWhileEngaged } from './operatorEngaged'

export interface StreamState {
  snapshot: Snapshot | null
  connected: boolean
  lastSuccessAt: number | null
  paused: boolean
  waiting: number
  setPaused: (on: boolean) => void
  live: Snapshot | null
}

interface SharedStream { eventId: number; state: StreamState }

export const SnapshotStreamContext = createContext<SharedStream | null>(null)

interface PollState { snapshot: Snapshot | null; connected: boolean; lastSuccessAt: number | null }

export function useSnapshot(eventId: number | null, pollMs?: number): StreamState {
  const shared = useContext(SnapshotStreamContext)
  const covered = eventId !== null && shared !== null && shared.eventId === eventId
  const own = useOwnStream(covered ? null : eventId, pollMs)
  return covered ? shared.state : own
}

function useOwnStream(eventId: number | null, pollMs?: number): StreamState {
  const poll = usePoll(eventId, pollMs)
  const committed = useHeldWhileEngaged(poll.snapshot, eventId)

  const [frozen, setFrozen] = useState<Snapshot | null>(null)
  const shown = useRef(committed)
  shown.current = committed
  const setPaused = useCallback((on: boolean) => { setFrozen(on ? shown.current : null) }, [])
  useEffect(() => { setFrozen(null) }, [eventId])

  const snapshot = frozen ?? committed
  const paused = frozen !== null
  const waiting = frozen !== null && poll.snapshot !== null ? Math.max(0, poll.snapshot.version - frozen.version) : 0

  return useMemo(
    () => ({ snapshot, connected: poll.connected, lastSuccessAt: poll.lastSuccessAt, paused, waiting, setPaused, live: committed }),
    [snapshot, poll.connected, poll.lastSuccessAt, paused, waiting, setPaused, committed],
  )
}

function usePoll(eventId: number | null, pollMs?: number): PollState {
  const [state, setState] = useState<PollState>({ snapshot: null, connected: false, lastSuccessAt: null })
  const [watching, setWatching] = useState(eventId)
  if (watching !== eventId) {
    setWatching(eventId)
    setState({ snapshot: null, connected: false, lastSuccessAt: null })
  }

  useEffect(() => {
    if (eventId === null) return
    let ignore = false
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let version = -1
    let inFlight = false
    let latest: Snapshot | null = null

    const nextInterval = () => pollMs ?? pollIntervalForSnapshot(latest)

    const tick = async () => {
      if (ignore || inFlight) return
      if (document.hidden) { timer = setTimeout(tick, nextInterval()); return }
      inFlight = true
      const deadline = new AbortController()
      const cutOff = setTimeout(() => deadline.abort(), Math.max(POLL_DEADLINE_MIN_MS, nextInterval() * 3))
      try {
        const token = getAdminToken()
        const res = await fetch(`/api/events/${eventId}/snapshot?since=${version}`, {
          signal: deadline.signal,
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) throw new Error(String(res.status))
        const body = await res.json() as { version: number; snapshot?: Snapshot }
        if (ignore) return
        failures = 0
        version = body.version
        if (body.snapshot) latest = body.snapshot
        setState({ snapshot: latest, connected: true, lastSuccessAt: Date.now() })
      } catch {
        if (ignore) return
        failures += 1
        if (failures >= 3) setState(s => (s.connected ? { ...s, connected: false } : s))
      } finally {
        clearTimeout(cutOff)
        inFlight = false
      }
      if (!ignore) timer = setTimeout(tick, nextInterval())
    }
    const wake = () => {
      if (ignore || document.hidden || inFlight) return
      if (timer) clearTimeout(timer)
      void tick()
    }
    document.addEventListener('visibilitychange', wake)
    void tick()
    return () => {
      ignore = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [eventId, pollMs])

  return state
}
