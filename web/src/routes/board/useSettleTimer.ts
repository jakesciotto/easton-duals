import { useEffect, useRef, useState } from 'react'

export const HOLD_MS = 10_000

function sameSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

export function useSettleTimer(ids: readonly number[], ready: boolean, holdMs = HOLD_MS): ReadonlySet<number> {
  const [settled, setSettled] = useState<ReadonlySet<number>>(() => new Set<number>())
  const seen = useRef(new Map<number, number>())
  const primed = useRef(false)
  const latest = useRef(ids)
  latest.current = ids
  const key = ids.join(',')

  useEffect(() => {
    if (!ready) return
    const current = latest.current
    const now = Date.now()
    const first = !primed.current
    primed.current = true

    for (const id of current) {
      if (!seen.current.has(id)) seen.current.set(id, first ? now - holdMs : now)
    }
    for (const id of seen.current.keys()) {
      if (!current.includes(id)) seen.current.delete(id)
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const evaluate = () => {
      const at = Date.now()
      const next = new Set<number>()
      let soonest = Number.POSITIVE_INFINITY
      for (const [id, since] of seen.current) {
        if (at - since >= holdMs) next.add(id)
        else soonest = Math.min(soonest, since + holdMs)
      }
      setSettled(prev => (sameSet(prev, next) ? prev : next))
      if (soonest !== Number.POSITIVE_INFINITY) {
        timer = setTimeout(evaluate, Math.max(0, soonest - at) + 50)
      }
    }
    evaluate()
    return () => { if (timer) clearTimeout(timer) }
  }, [key, ready, holdMs])

  return settled
}
