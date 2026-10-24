import { useEffect, useRef } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import type { EventContact } from '@shared/types'
import { clearMatBinding, getMatBinding, type MatBinding } from '@/lib/auth'
import { contactLine } from '@/lib/format'
import { matPickPath } from '@/lib/matBinding'
import { useSnapshot } from '@/lib/useSnapshot'
import { useClock } from '@/lib/useClock'
import { useWakeLock } from '@/lib/useWakeLock'
import { isFinished } from '@/lib/eventMode'
import { pollIntervalForSnapshot } from '@/lib/pollInterval'
import { playExpired, unlockAudio } from '@/lib/sounds'
import { buttonVariants } from '@/components/ui/button'
import { Connecting } from '@/components/Connecting'
import { ScoreSide } from './scorer/ScoreSide'
import { CenterColumn, nextNote } from './scorer/CenterColumn'
import { ConfirmSheet } from './scorer/ConfirmSheet'
import { useScorer } from './scorer/useScorer'
import { EVENT_FINISHED } from './scorer/actions'
import { scorerRefusals } from './scorer/refusals'
import { useFitsScorer } from './scorer/viewport'

function BoardNote({ eventId }: { eventId: number }) {
  const path = `/board/${eventId}`
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return (
    <>
      <p className="t3 text-gray-11">To follow the scores from here, open the board instead.</p>
      <Link to={path} className={buttonVariants({ size: 'lg' })}>Open the board</Link>
      <p className="fig t2 break-all text-gray-10">{origin}{path}</p>
    </>
  )
}

function WrongDevice({ binding }: { binding: MatBinding }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="grid max-w-md gap-4">
        <h1 className="t5 text-gray-12">Use a tablet for scoring</h1>
        <p className="t3 text-gray-11">
          Scoring runs on an iPad held sideways. The buttons have to stay big enough to hit without
          looking, and a phone cannot hold them at that size.
        </p>
        <BoardNote eventId={binding.eventId} />
      </div>
    </main>
  )
}

function EventFinished({ eventId, contact }: { eventId: number; contact: EventContact | null }) {
  const line = contactLine(contact)
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="grid max-w-md gap-4">
        <h1 className="t5 text-gray-12">{EVENT_FINISHED}</h1>
        <BoardNote eventId={eventId} />
        {line && <p className="t2 text-gray-10">{line}</p>}
      </div>
    </main>
  )
}

function Scorer({ binding }: { binding: MatBinding }) {
  const navigate = useNavigate()
  const { snapshot, connected, lastSuccessAt } = useSnapshot(binding.eventId)
  const s = useScorer(binding, snapshot, connected)
  const { remainingMs } = useClock(s.current?.clock ?? null, snapshot?.now ?? null)
  const firedForId = useRef<number | null>(null)
  const ranSinceFire = useRef(false)
  const firedForLength = useRef<number | null>(null)

  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  const wakeLock = useWakeLock()
  useEffect(() => {
    if (wakeLock.active) return
    const ask = () => void wakeLock.request()
    ask()
    window.addEventListener('pointerdown', ask)
    window.addEventListener('keydown', ask)
    return () => {
      window.removeEventListener('pointerdown', ask)
      window.removeEventListener('keydown', ask)
    }
  }, [wakeLock.active, wakeLock.request])

  useEffect(() => {
    if (!s.bindingLost) return
    clearMatBinding()
    navigate(matPickPath(binding.eventId, s.bindingLost), { replace: true })
  }, [s.bindingLost, binding.eventId, navigate])

  const m = s.current
  const expired = m !== null && m.status === 'live' && !m.pendingTerminal
    && remainingMs <= 0 && m.clock.elapsedMs >= m.clock.lengthMs

  useEffect(() => {
    if (m?.clock.startedAt) ranSinceFire.current = true
    if (m && firedForLength.current !== null && firedForLength.current !== m.clock.lengthMs) {
      firedForId.current = null
    }
    if (!expired || !m) return
    if (firedForId.current === m.id && !ranSinceFire.current) return
    firedForId.current = m.id
    firedForLength.current = m.clock.lengthMs
    ranSinceFire.current = false
    playExpired()
  }, [expired, m])

  if (snapshot !== null && isFinished(snapshot.event.status)) {
    return <EventFinished eventId={binding.eventId} contact={snapshot.event.contact} />
  }

  const teams = snapshot?.teams ?? []
  const refusals = scorerRefusals({
    connected,
    eventStatus: snapshot?.event.status ?? null,
    match: m,
    last: s.lastAction,
    expired,
  })
  const idleNote = s.mat && s.mat.current === null && s.mat.onDeck.length === 0
    ? `Mat ${s.mat.number} complete`
    : 'No match on this mat. Waiting for the organizer.'

  return (
    <main className="relative flex h-dvh select-none flex-col overflow-hidden bg-background">
      <Connecting connected={connected} />
      {wakeLock.failed && !wakeLock.active && (
        <div role="status" className="shrink-0 bg-gray-1 px-4 py-1.5 text-center t2 text-attend">
          Screen may sleep. Keep this tablet awake in its settings.
        </div>
      )}
      {!m || !s.mat ? (
        <div className="grid flex-1 place-items-center t5 text-gray-10">{idleNote}</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px_minmax(0,1fr)]">
          <ScoreSide
            side={m.a}
            team={teams.find(t => t.id === m.a.teamId)}
            ruleset={s.ruleset}
            edge="left"
            lead={m.a.score >= m.b.score}
            expired={expired}
            refusal={refusals.half}
            onTap={k => s.tap(m.a.athleteId, k)}
            onTerminal={k => void s.terminal(m.a.athleteId, k)}
          />
          <CenterColumn
            mat={s.mat}
            match={m}
            next={nextNote(s.mat, snapshot?.mats ?? [])}
            serverNow={snapshot?.now ?? null}
            lastSuccessAt={lastSuccessAt}
            pollIntervalMs={pollIntervalForSnapshot(snapshot)}
            expired={expired}
            lastAction={s.lastAction}
            refusals={refusals}
            error={s.sheet ? null : s.error}
            contact={contactLine(snapshot?.event.contact ?? null)}
            onClock={s.clock}
            onAddTime={s.addTime}
            onUndo={s.undo}
            onMinus={s.minus}
            onEnd={() => s.openEnd(expired ? 'time' : 'end')}
          />
          <ScoreSide
            side={m.b}
            team={teams.find(t => t.id === m.b.teamId)}
            ruleset={s.ruleset}
            edge="right"
            lead={m.b.score >= m.a.score}
            expired={expired}
            refusal={refusals.half}
            onTap={k => s.tap(m.b.athleteId, k)}
            onTerminal={k => void s.terminal(m.b.athleteId, k)}
          />
          <ConfirmSheet sheet={s.sheet} match={m} teams={teams} busy={s.sheetBusy} error={s.error} onPick={s.pickWinner} onPickType={s.pickWinType} onConfirm={() => void s.confirm()} onCancel={() => void s.cancel()} />
        </div>
      )}
    </main>
  )
}

export default function ScorerPage() {
  const { matId } = useParams()
  const binding = getMatBinding()
  const fits = useFitsScorer()
  if (!binding || binding.matId !== Number(matId)) return <Navigate to="/mat" replace />
  if (!fits) return <WrongDevice binding={binding} />
  return <Scorer binding={binding} />
}
