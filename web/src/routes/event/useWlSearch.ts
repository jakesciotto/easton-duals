import { useEffect, useRef, useState } from 'react'
import { ApiError } from '@/lib/api'
import { adminApi } from '@/lib/queries'
import type { RosterCandidate } from '@/lib/types'

export const SEARCH_PAUSE_MS = 300
const SEARCH_MIN_CHARS = 2
export const SEARCH_TOO_SHORT = 'Type at least two letters.'

export interface WlSearch {
  q: string
  setQ: (q: string) => void
  results: RosterCandidate[]
  pending: boolean
  error: string | null
}

export function useWlSearch(eventId: number): WlSearch {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<RosterCandidate[]>([])
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const generation = useRef(0)

  const query = q.trim()
  const tooShort = query.length < SEARCH_MIN_CHARS

  useEffect(() => {
    generation.current += 1
    const mine = generation.current
    if (tooShort) {
      setResults([])
      setFailure(null)
      setPending(false)
      return
    }
    let ignore = false
    const fresh = () => !ignore && generation.current === mine
    setPending(true)
    const timer = window.setTimeout(() => {
      adminApi<RosterCandidate[]>(`/api/events/${eventId}/wl-search?q=${encodeURIComponent(query)}`)
        .then(rows => {
          if (!fresh()) return
          setResults(rows)
          setFailure(null)
          setPending(false)
        })
        .catch(e => {
          if (!fresh()) return
          setResults([])
          setFailure(e instanceof ApiError ? e.message : 'Could not reach the server')
          setPending(false)
        })
    }, SEARCH_PAUSE_MS)
    return () => {
      ignore = true
      window.clearTimeout(timer)
    }
  }, [eventId, query, tooShort])

  return { q, setQ, results, pending, error: tooShort ? SEARCH_TOO_SHORT : failure }
}
