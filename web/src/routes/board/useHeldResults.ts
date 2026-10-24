import { useEffect, useRef, useState } from 'react'
import type { MatchView, Snapshot } from '@shared/types'

function sameHeld(a: Map<number, MatchView>, b: Map<number, MatchView>): boolean {
  if (a.size !== b.size) return false
  for (const [id, match] of a) {
    const other = b.get(id)
    if (!other || other.id !== match.id || other.lastSeq !== match.lastSeq) return false
  }
  return true
}

export function useHeldResults(snapshot: Snapshot | null): Map<number, MatchView> {
  const prev = useRef<Snapshot | null>(null)
  const [held, setHeld] = useState<Map<number, MatchView>>(() => new Map())

  useEffect(() => {
    if (!snapshot) return
    const before = prev.current
    prev.current = snapshot

    setHeld(old => {
      const next = new Map(old)
      for (const mat of snapshot.mats) {
        const carried = next.get(mat.id)
        if (mat.current && carried && mat.current.id !== carried.id) next.delete(mat.id)

        const was = before?.mats.find(m => m.id === mat.id)?.current
        if (!was || mat.current?.id === was.id) continue
        const finished = snapshot.matches.find(m => m.id === was.id)
        if (finished && finished.status === 'done') next.set(mat.id, finished)
      }
      for (const id of next.keys()) {
        if (!snapshot.mats.some(m => m.id === id)) next.delete(id)
      }
      return sameHeld(old, next) ? old : next
    })
  }, [snapshot])

  return held
}
