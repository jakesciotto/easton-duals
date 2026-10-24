import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { Snapshot } from '@shared/types'
import { api, ApiError } from '@/lib/api'
import { clearMatBinding, getMatBinding, setMatBinding } from '@/lib/auth'
import { DESK_BIND_REFUSAL } from '@/lib/eventMode'
import { BIND_LOSS_COPY, isBindLoss } from '@/lib/matBinding'
import { POLL_DATA_ENTRY_MS } from '@/lib/pollInterval'
import { useWakeLock } from '@/lib/useWakeLock'
import { unlockAudio } from '@/lib/sounds'
import { unbind } from '@/lib/scoring'
import { CodeField } from '@/components/CodeField'
import { Connecting } from '@/components/Connecting'
import { Button, buttonVariants } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'

const MIN_MAT_SLOTS = 4

const GUARD_QUERY = '(min-width: 900px) and (orientation: landscape)'

function isBindableViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  try {
    return window.matchMedia(GUARD_QUERY).matches
  } catch {
    return true
  }
}

function boardUrlFor(eventId: number | null): string | null {
  return eventId !== null && typeof window !== 'undefined' ? `${window.location.origin}/board/${eventId}` : null
}

function BoardUrl({ eventId }: { eventId: number | null }) {
  const url = boardUrlFor(eventId)
  if (!url) return null
  return <span className="max-w-full truncate rounded-sm bg-black px-4 py-2 t7 font-mono text-white">{url}</span>
}

function TooSmallToScore({ eventId }: { eventId: number | null }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="grid max-w-sm gap-4 justify-items-center">
        <h1 className="t6 text-gray-12">Use a tablet for scoring</h1>
        <BoardUrl eventId={eventId} />
      </div>
    </main>
  )
}

function DeskEvent({ eventId }: { eventId: number | null }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="grid w-full max-w-md justify-items-center gap-4 rounded-lg border border-gray-7 bg-gray-2 p-4 text-center">
        <p className="t3 text-gray-11">{DESK_BIND_REFUSAL}</p>
        <BoardUrl eventId={eventId} />
      </div>
    </main>
  )
}

export default function MatPickPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const eventParam = params.get('event')
  const eventQueryId = eventParam ? Number(eventParam) : null
  const reasonParam = params.get('reason')
  const loss = isBindLoss(reasonParam) ? BIND_LOSS_COPY[reasonParam] : null
  const [eventId, setEventId] = useState(eventParam ?? '')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [matId, setMatId] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [reachable, setReachable] = useState(true)
  const [reads, setReads] = useState(0)
  const [busy, setBusy] = useState(false)
  const [contested, setContested] = useState<number | null>(null)
  const [binding, setBinding] = useState(() => getMatBinding())
  const [bindable, setBindable] = useState(isBindableViewport)
  const boundToCurrentEvent = binding !== null && (eventQueryId === null || binding.eventId === eventQueryId)
  const otherEventBinding = binding !== null && !boundToCurrentEvent ? binding : null
  const entryMode = snapshot?.event.mode === 'entry'

  const wakeLock = useWakeLock()
  const requestedRef = useRef(false)
  const onCodeEntryTap = () => {
    if (requestedRef.current) return
    requestedRef.current = true
    void wakeLock.request()
    unlockAudio()
  }

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    let mq: MediaQueryList
    try {
      mq = window.matchMedia(GUARD_QUERY)
    } catch {
      return
    }
    const onChange = () => setBindable(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!eventId) return
    const timer = setInterval(() => setReads(n => n + 1), POLL_DATA_ENTRY_MS)
    return () => clearInterval(timer)
  }, [eventId])

  useEffect(() => {
    if (!eventId) return
    let ignore = false
    api<{ version: number; snapshot: Snapshot }>(`/api/events/${eventId}/snapshot`)
      .then(body => {
        if (ignore) return
        setSnapshot(body.snapshot)
        setReadError(null)
        setReachable(true)
      })
      .catch(e => {
        if (ignore) return
        setReadError(e instanceof ApiError ? e.message : 'Could not reach the server')
        setReachable(e instanceof ApiError)
      })
    return () => { ignore = true }
  }, [eventId, reads])

  const bind = async (e?: FormEvent, takeOver = false) => {
    e?.preventDefault()
    if (matId === null || !snapshot || entryMode) return
    if (takeOver && contested !== matId) return
    setBusy(true)
    setError(null)
    setContested(null)
    try {
      const r = await api<{ token: string; mat: { id: number; number: number }; event: { id: number; name: string } }>(
        `/api/events/${snapshot.event.id}/mats/${matId}/bind`,
        { method: 'POST', body: takeOver ? { code, takeOver: true } : { code } },
      )
      setMatBinding({ eventId: r.event.id, matId: r.mat.id, matNumber: r.mat.number, eventName: r.event.name, token: r.token })
      navigate(`/mat/${r.mat.id}`)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'mat_bound') setContested(matId)
      setError(err instanceof ApiError ? err.message : 'Could not reach the server')
    } finally {
      setBusy(false)
    }
  }

  const frame = (body: ReactNode) => <><Connecting connected={reachable} />{body}</>

  if (!bindable) return frame(<TooSmallToScore eventId={eventQueryId ?? snapshot?.event.id ?? null} />)

  if (binding && boundToCurrentEvent) {
    return frame(
      <main className="grid min-h-dvh place-items-center p-6">
        <div className="grid w-full max-w-sm gap-4 rounded-lg border border-gray-7 bg-gray-2 p-4 text-center">
          <div className="grid gap-1">
            <h1 className="t6 text-gray-12">This iPad is bound to Mat {binding.matNumber}</h1>
            <p className="t3 text-gray-10">{binding.eventName}</p>
          </div>
          <div className="grid gap-2">
            <Link to={`/mat/${binding.matId}`} className={buttonVariants({ size: 'lg' })}>Open scorer</Link>
            <Button
              size="lg"
              variant="destructive"
              onClick={() => { void unbind(binding.matId, binding.token).catch(() => {}); clearMatBinding(); setBinding(null) }}
            >
              Unbind this device
            </Button>
          </div>
        </div>
      </main>
    )
  }

  if (snapshot && entryMode) return frame(<DeskEvent eventId={snapshot.event.id} />)

  const matSlotCount = Math.max(MIN_MAT_SLOTS, snapshot?.event.matCount ?? MIN_MAT_SLOTS)
  const matSlots = Array.from({ length: matSlotCount }, (_, i) => snapshot?.mats.find(m => m.number === i + 1) ?? null)

  return frame(
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="grid w-full max-w-md gap-4 rounded-lg border border-gray-7 bg-gray-2 p-4">
        <h1 className="t6 text-gray-12">Pick your mat</h1>
        {loss && (
          <Alert variant="attend">
            <AlertDescription>{loss}</AlertDescription>
          </Alert>
        )}
        {otherEventBinding && (
          <div className="grid gap-2">
            <Alert variant="attend" className="text-left">
              <AlertDescription>
                This device is bound to {otherEventBinding.eventName}, mat {otherEventBinding.matNumber}.
              </AlertDescription>
            </Alert>
            <Button
              size="sm"
              variant="destructive"
              className="justify-self-start"
              onClick={() => { clearMatBinding(); setBinding(null) }}
            >
              Unbind this device
            </Button>
          </div>
        )}
        {!eventParam && (
          <div className="grid gap-1.5">
            <Label htmlFor="ev">Event number</Label>
            <Input
              id="ev"
              inputMode="numeric"
              value={eventId}
              onChange={e => setEventId(e.target.value.replace(/\D/g, ''))}
              className="font-mono tabular-nums"
            />
          </div>
        )}
        {snapshot && <p className="t2 text-gray-10">{snapshot.event.name}</p>}
        {snapshot && (
          snapshot.mats.length > 0 ? (
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Mat">
              {matSlots.map((m, i) => m ? (
                <Toggle
                  key={m.id}
                  size="mat"
                  className="w-full flex-col gap-1.5"
                  pressed={matId === m.id}
                  onPressedChange={() => setMatId(m.id)}
                >
                  <span>Mat {m.number}</span>
                  {m.bound && (
                    <span className="grid justify-items-center gap-1">
                      <span aria-hidden className="h-0.5 w-10 bg-attend" />
                      <span className="t1 font-normal! text-attend">Scoring</span>
                    </span>
                  )}
                </Toggle>
              ) : (
                <div key={`empty-${i}`} aria-hidden className="h-[104px]" />
              ))}
            </div>
          ) : (
            <EmptyState message="This event has no mats yet" />
          )
        )}
        <form onSubmit={bind} className="grid gap-3">
          <div className="grid gap-1.5" onPointerDown={onCodeEntryTap} onFocus={onCodeEntryTap}>
            <Label htmlFor="code">Mat code</Label>
            <CodeField id="code" length={4} aria-label="Mat code" value={code} onValueChange={setCode} />
          </div>
          {wakeLock.failed && (
            <Alert variant="attend">
              <AlertTitle variant="attend">Screen may sleep</AlertTitle>
              <AlertDescription>Disable auto-lock for this device and keep it plugged in.</AlertDescription>
            </Alert>
          )}
          {(error ?? readError) && (
            <Alert>
              <AlertDescription>{error ?? readError}</AlertDescription>
            </Alert>
          )}
          {contested === matId && matId !== null && (
            <Button type="button" size="lg" variant="secondary" className="w-full" disabled={busy} onClick={() => void bind(undefined, true)}>
              Take over this mat
            </Button>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={busy || matId === null || code.length !== 4}>
            Bind this iPad
          </Button>
        </form>
      </div>
    </main>
  )
}
