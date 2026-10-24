import { useRef, type CSSProperties } from 'react'
import type { MatchView, Snapshot } from '@shared/types'
import { ageSeconds, formatAge, isStale } from '@/lib/freshness'
import { timeOfDay } from '@/lib/format'
import { POLL_CLOCK_RUNNING_MS, POLL_DEADLINE_MIN_MS, pollIntervalForSnapshot } from '@/lib/pollInterval'
import { useNow } from '@/lib/useClock'
import { Hero, HeroSkeleton } from './Hero'
import { MatBand } from './MatBand'
import { ResultsBand } from './ResultsBand'
import { OrderBand, SetupBand } from './SetupBand'
import { DoneBand } from './DoneBand'
import { boardPlan } from './plan'
import { sortDoneMatches } from '@/lib/matchOrder'
import { budgetWithNotes } from './budget'
import { useFar } from './useFar'
import { useHeldResults } from './useHeldResults'
import { useSettleTimer } from './useSettleTimer'
import './board.css'

const AGE_TICK_MS = 1000

export const FIRST_CONTACT_MS = POLL_DEADLINE_MIN_MS * 2 + POLL_CLOCK_RUNNING_MS

export const NOTE_NO_CONTACT = 'Cannot reach the server'

export const CERTIFIED_NOTE = 'Final, certified at'

function settleIds(snapshot: Snapshot | null, held: ReadonlyMap<number, MatchView>, entry: MatchView[]): number[] {
  if (!snapshot) return []
  const ids = new Set<number>()
  for (const mat of snapshot.mats) {
    const showing = mat.current ?? held.get(mat.id) ?? null
    if (showing && showing.status === 'done') ids.add(showing.id)
  }
  for (const match of entry) ids.add(match.id)
  return [...ids].sort((x, y) => x - y)
}

export function Board({ snapshot, connected, lastSuccessAt = null, screenMaySleep = false }: {
  snapshot: Snapshot | null
  connected: boolean
  lastSuccessAt?: number | null
  screenMaySleep?: boolean
}) {
  const far = useFar(snapshot)
  const held = useHeldResults(snapshot)
  const plan = boardPlan(snapshot)
  const pollIntervalMs = pollIntervalForSnapshot(snapshot)

  const silent = lastSuccessAt === null && !connected
  const openedAt = useRef(Date.now())
  const now = useNow(lastSuccessAt !== null || silent, AGE_TICK_MS)
  const stale = isStale(lastSuccessAt, now, pollIntervalMs)
  const ageSec = ageSeconds(lastSuccessAt, now)
  const unreachable = silent && now - openedAt.current >= FIRST_CONTACT_MS

  const certifiedAt = plan.comp === 'done' ? timeOfDay(snapshot?.event.certifiedAt) : null

  const reported = [
    unreachable ? NOTE_NO_CONTACT : null,
    stale && ageSec !== null ? `Not updating ${formatAge(ageSec)}` : null,
    screenMaySleep ? 'Screen may sleep' : null,
  ].filter((note): note is string => note !== null)

  const { budget, notes } = budgetWithNotes(
    { comp: plan.comp, mats: plan.mats, teams: plan.teams, far, sign: certifiedAt !== null },
    reported,
  )

  const done = snapshot ? sortDoneMatches(snapshot.matches.filter(m => m.status === 'done')) : []
  const entryRows = plan.comp === 'entry' ? done.slice(0, budget.rows) : []
  const settled = useSettleTimer(settleIds(snapshot, held, entryRows), snapshot !== null)

  const teamColors = new Map((snapshot?.teams ?? []).map(t => [t.id, t.color]))
  const teamColor = (teamId: number | null) => (teamId === null ? null : teamColors.get(teamId) ?? null)

  return (
    <main className="b-frame">
      <div className="b-stage" style={{ '--far': String(far) } as CSSProperties}>
        <div
          className="b-safe"
          data-comp={plan.comp}
          data-mats={plan.mats}
          style={{
            '--b-hero-n': String(budget.hero),
            '--b-hero-gap-n': String(budget.heroGap),
            '--b-band-n': String(budget.band),
            '--b-panel-n': String(budget.panel),
            '--b-mat-gap-n': String(budget.matGap),
            '--b-row-n': String(budget.row),
            '--lb-rows': String(budget.lbRows),
            '--lb-gap-n': String(budget.lbGap),
          } as CSSProperties}
        >
          {snapshot === null || plan.comp === 'cold'
            ? <HeroSkeleton />
            : <Hero teams={snapshot.teams} leaderboard={snapshot.leaderboard} />}

          {snapshot !== null && plan.comp === 'setup' && (snapshot.event.mode === 'entry'
            ? <OrderBand mats={snapshot.mats} matches={snapshot.matches} firstUp={budget.queue} />
            : <SetupBand mats={snapshot.mats} firstUp={budget.queue} />)}
          {snapshot !== null && plan.comp === 'mats' && (
            <MatBand
              mats={snapshot.mats.slice(0, budget.matsShown)}
              matches={snapshot.matches}
              held={held}
              settled={settled}
              serverNow={snapshot.now}
              teamColor={teamColor}
              withClock={budget.clock}
              nextCount={budget.queue}
              lastSuccessAt={lastSuccessAt}
              pollIntervalMs={pollIntervalMs}
            />
          )}
          {snapshot !== null && plan.comp === 'entry' && (
            <ResultsBand results={entryRows} total={done.length} settled={settled} teamColor={teamColor} />
          )}
          {snapshot !== null && plan.comp === 'done' && (
            <DoneBand teams={snapshot.teams} leaderboard={snapshot.leaderboard} />
          )}
          {snapshot === null && <div className="b-band" />}

          {notes.length > 0 && (
            <div role="status" className="b-note font-sans">
              {notes.map(note => <span key={note}>{note}</span>)}
            </div>
          )}

          {certifiedAt !== null && (
            <div className="b-sign font-sans">
              {CERTIFIED_NOTE} <span className="b-sign-at font-mono">{certifiedAt}</span>
            </div>
          )}
        </div>
        {!connected && (
          <div role="status" className="b-stale">
            <span className="sr-only">Reconnecting to the server</span>
          </div>
        )}
      </div>
    </main>
  )
}
