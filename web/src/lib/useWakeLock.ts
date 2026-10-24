import { useCallback, useEffect, useRef, useState } from 'react'

export interface WakeLockState {
  supported: boolean
  active: boolean
  failed: boolean
  request: () => Promise<void>
}

export function useWakeLock(): WakeLockState {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  const lockRef = useRef<WakeLockSentinel | null>(null)
  const wantedRef = useRef(false)
  const requestingRef = useRef(false)
  const [state, setState] = useState<{ active: boolean; failed: boolean }>({ active: false, failed: false })

  const request = useCallback(async () => {
    if (!supported || requestingRef.current || lockRef.current !== null) return
    wantedRef.current = true
    requestingRef.current = true
    try {
      const lock = await navigator.wakeLock.request('screen')
      lockRef.current = lock
      setState({ active: true, failed: false })
      lock.addEventListener('release', () => {
        lockRef.current = null
        setState(s => ({ ...s, active: false }))
      })
    } catch {
      setState({ active: false, failed: true })
    } finally {
      requestingRef.current = false
    }
  }, [supported])

  useEffect(() => {
    if (!supported) return
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && wantedRef.current && lockRef.current === null) void request()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      wantedRef.current = false
      const lock = lockRef.current
      lockRef.current = null
      if (lock) void lock.release().catch(() => {})
    }
  }, [supported, request])

  return { supported, active: state.active, failed: state.failed, request }
}
