import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { clearAdminToken } from '@/lib/auth'
import { Connecting } from '@/components/Connecting'
import { Wordmark } from '@/components/Wordmark'
import { Button } from '@/components/ui/button'
import { useNow } from '@/lib/useClock'
import { ageSeconds, formatAge, headerFreshnessLevel } from '@/lib/freshness'
import { cn } from '@/lib/utils'

export interface ShellFreshness {
  lastSuccessAt: number | null
  pollIntervalMs: number
  paused?: boolean
  waiting?: number
}

function FreshnessSlot({ freshness }: { freshness: ShellFreshness }) {
  const now = useNow(freshness.lastSuccessAt !== null && !freshness.paused, 1000)
  const ageSec = ageSeconds(freshness.lastSuccessAt, now)

  if (freshness.paused) {
    const waiting = freshness.waiting ?? 0
    return (
      <span aria-live="off" className="ml-auto flex shrink-0 items-center gap-2 t2 text-attend">
        <span aria-hidden className="size-1.5 rounded-full bg-attend" />
        Paused, <span className="fig fig-2">{waiting}</span> {waiting === 1 ? 'update' : 'updates'} waiting
      </span>
    )
  }

  if (ageSec === null) {
    return (
      <span className="ml-auto flex shrink-0 items-center gap-2 t2 text-gray-10">
        <span aria-hidden className="size-1.5 rounded-full bg-gray-8" />
        Connecting
      </span>
    )
  }

  const level = headerFreshnessLevel(ageSec, freshness.pollIntervalMs)
  const tone = level === 'fault' ? 'text-fault' : level === 'attend' ? 'text-attend' : 'text-gray-11'
  const dot = level === 'fault' ? 'bg-fault' : level === 'attend' ? 'bg-attend' : 'bg-gray-11'

  return (
    <span aria-live="off" className={cn('ml-auto flex shrink-0 items-center gap-2 t2', tone)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', dot)} />
      {level === 'fresh'
        ? 'Live'
        : <>Not updating <span className="fig fig-2">{formatAge(ageSec)}</span></>}
    </span>
  )
}

function useHeaderHeight() {
  const ref = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const publish = () => document.documentElement.style.setProperty('--app-header-h', `${el.offsetHeight}px`)
    publish()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return ref
}

export function AdminShell({ title, status, actions, meta, freshness, connected, footer, children }: {
  title: string
  status?: ReactNode
  actions?: ReactNode
  meta?: ReactNode
  freshness?: ShellFreshness
  connected?: boolean
  footer?: ReactNode
  children: ReactNode
}) {
  const headerRef = useHeaderHeight()
  return (
    <div className="flex min-h-dvh flex-col">
      {connected !== undefined && <Connecting connected={connected} />}
      <header ref={headerRef} className="sticky top-0 z-20 border-b border-gray-7 bg-background py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-6">
          <Link to="/admin" className="flex items-center gap-2.5 rounded-md outline-none focus-visible:shadow-focus">
            <img src="/easton-logo.png" alt="Easton Training Center" width={24} height={24} className="size-6 shrink-0 rounded-full" />
            <Wordmark />
          </Link>
          <span aria-hidden className="text-gray-8">/</span>
          <span className="truncate t2 text-gray-12">{title}</span>
          {status}
          {freshness && <FreshnessSlot freshness={freshness} />}
          <div className={cn('flex items-center gap-2', !freshness && 'ml-auto')}>
            {actions}
            <Button variant="ghost" size="sm" onClick={clearAdminToken}>Sign out</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 t3">
        <div className="grid gap-2 px-4 pt-6 pb-4 sm:px-6">
          <h1 className="truncate t6 text-gray-12">{title}</h1>
          {meta}
        </div>
        {children}
      </main>
      {footer && (
        <footer className="sticky bottom-0 z-10 border-t border-gray-7 bg-gray-1 px-4 py-2 t2 text-gray-10 sm:px-6">
          <div className="mx-auto max-w-6xl">{footer}</div>
        </footer>
      )}
    </div>
  )
}
