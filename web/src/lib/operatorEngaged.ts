import { useEffect, useState } from 'react'

export function operatorEngaged(): boolean {
  if (typeof document === 'undefined') return false

  const dragging = document.querySelector('[data-dragging]')
  if (dragging && dragging.getAttribute('data-dragging') !== 'false') return true

  const active = document.activeElement
  if (active && active !== document.body && active !== granted) {
    const tag = active.tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true
    if ((active as HTMLElement).isContentEditable) return true
    if ((active as HTMLElement).closest('[data-slot="select-trigger"]')) return true
  }

  const dialogs = document.querySelectorAll('[data-slot="dialog-content"][data-open], [role="dialog"], [role="listbox"]')
  for (const dialog of dialogs) {
    if (dialog.hasAttribute('data-poll-through')) continue
    if (dialog.closest('[data-closed], [hidden]')) continue
    return true
  }

  return false
}

let granted: Element | null = null

const GRANT_ENDERS = ['keydown', 'pointerdown', 'blur'] as const

function releaseGrant(): void {
  if (!granted) return
  for (const type of GRANT_ENDERS) granted.removeEventListener(type, releaseGrant)
  granted = null
}

export function focusWithoutEngaging(el: HTMLElement | null | undefined): void {
  releaseGrant()
  if (!el) return
  el.focus()
  if (document.activeElement !== el) return
  granted = el
  for (const type of GRANT_ENDERS) el.addEventListener(type, releaseGrant)
}

export const ENGAGEMENT_RECHECK_MS = 200

export function useHeldWhileEngaged<T>(incoming: T, resetKey?: unknown): T {
  const [committed, setCommitted] = useState(incoming)
  const [watching, setWatching] = useState(resetKey)

  if (watching !== resetKey) {
    setWatching(resetKey)
    setCommitted(incoming)
  } else if (incoming !== committed && (committed === null || committed === undefined)) {
    setCommitted(incoming)
  }

  useEffect(() => {
    if (incoming === committed) return
    if (!operatorEngaged()) {
      setCommitted(incoming)
      return
    }
    const timer = setInterval(() => {
      if (operatorEngaged()) return
      clearInterval(timer)
      setCommitted(incoming)
    }, ENGAGEMENT_RECHECK_MS)
    return () => clearInterval(timer)
  }, [incoming, committed])

  return committed
}
