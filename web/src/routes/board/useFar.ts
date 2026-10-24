import { useEffect, useRef, useState } from 'react'
import type { Snapshot } from '@shared/types'
import { getAdminToken } from '@/lib/auth'
import { adminApi } from '@/lib/queries'
import { maxFarFor } from './budget'

const KEY = 'duels.board.far'
export const FAR_STEPS = [0.85, 1, 1.2]
const MIN = FAR_STEPS[0]
const MAX = FAR_STEPS[FAR_STEPS.length - 1]

function clamp(value: number): number {
  return Math.min(MAX, Math.max(MIN, value))
}

export function farCapFor(teams: number): number {
  const max = maxFarFor(teams)
  const held = FAR_STEPS.filter(step => step <= max + 1e-9)
  return held.length > 0 ? held[held.length - 1] : MIN
}

export function farOf(snapshot: { event: { far?: number | null } } | null | undefined): number | null {
  return snapshot?.event.far ?? null
}

function nearestStep(value: number): number {
  let nearest = 0
  for (let i = 1; i < FAR_STEPS.length; i += 1) {
    if (Math.abs(FAR_STEPS[i] - value) < Math.abs(FAR_STEPS[nearest] - value)) nearest = i
  }
  return nearest
}

function fromQuery(): number | null {
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get('far')
  if (raw === null) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? clamp(value) : null
}

function fromStorage(): number | null {
  try {
    const value = Number(window.localStorage?.getItem(KEY))
    return Number.isFinite(value) && value > 0 ? clamp(value) : null
  } catch {
    return null
  }
}

function readLocal(): number {
  if (typeof window === 'undefined') return 1
  return fromQuery() ?? fromStorage() ?? 1
}

export function useFar(snapshot: Snapshot | null): number {
  const [local, setLocal] = useState(readLocal)
  const stored = farOf(snapshot)
  const set = stored === null ? local : clamp(stored)
  const far = Math.min(set, farCapFor(snapshot?.teams.length ?? 2))

  useEffect(() => {
    try { window.localStorage?.setItem(KEY, String(set)) } catch { }
  }, [set])

  const eventId = snapshot?.event.id ?? null
  const written = useRef<string | null>(null)
  useEffect(() => {
    const wanted = fromQuery()
    if (eventId === null || wanted === null || !getAdminToken()) return
    const once = `${eventId}:${wanted}`
    if (written.current === once) return
    written.current = once
    adminApi(`/api/events/${eventId}`, { method: 'PATCH', body: { far: wanted } }).catch(() => {})
  }, [eventId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '+' && e.key !== '=' && e.key !== '-' && e.key !== '_') return
      const step = e.key === '-' || e.key === '_' ? -1 : 1
      setLocal(current => FAR_STEPS[Math.min(FAR_STEPS.length - 1, Math.max(0, nearestStep(current) + step))])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return far
}
