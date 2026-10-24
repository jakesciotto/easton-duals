import type { MatView, MatchView } from '@shared/types'
import { isRunning } from '@shared/clock'
import { styleTag } from '@/lib/format'
import { POLL_CLOCK_RUNNING_MS } from '@/lib/pollInterval'
import { MatRow, NextLine } from './MatRow'

function MatPanel({ mat, held, settled, serverNow, nextCount, withClock, lastSuccessAt, pollIntervalMs, everCarried, teamColor }: {
  mat: MatView
  everCarried: boolean
  teamColor: (teamId: number | null) => string | null
  held: MatchView | undefined
  settled: boolean
  serverNow: string | null
  nextCount: number
  withClock: boolean
  lastSuccessAt: number | null
  pollIntervalMs: number
}) {
  const current = mat.current
  const showing = current ?? held ?? null
  const finished = showing !== null && showing.status === 'done'
  const upcoming = showing === null ? mat.onDeck[0] ?? null : null
  const subject = showing ?? upcoming
  const live = current !== null && !finished && isRunning(current.clock)

  const queue = (showing === null ? mat.onDeck.slice(1) : mat.onDeck).slice(0, nextCount)

  return (
    <section aria-label={`Mat ${mat.number}`} className="b-panel">
      {subject !== null && <div className="b-mat-head font-sans">{`M${subject.number} · ${styleTag(subject.style)}`}</div>}
      <MatRow
        matNumber={mat.number}
        a={subject?.a ?? null}
        b={subject?.b ?? null}
        live={live}
        settled={finished && settled}
        upcoming={showing === null && upcoming !== null}
        winnerAthleteId={finished ? showing.result?.winnerAthleteId ?? null : null}
        colorA={subject === null ? null : teamColor(subject.a.teamId)}
        colorB={subject === null ? null : teamColor(subject.b.teamId)}
        note={subject === null ? (everCarried ? `Mat ${mat.number} complete` : `Nothing on mat ${mat.number} yet`) : null}
        withClock={withClock}
        clock={withClock && current !== null && !finished ? current.clock : null}
        serverNow={serverNow}
        lastSuccessAt={lastSuccessAt}
        pollIntervalMs={pollIntervalMs}
      />
      {queue.length > 0 && (
        <div className="b-next">
          {queue.map(m => <NextLine key={m.id} a={m.a} b={m.b} />)}
        </div>
      )}
    </section>
  )
}

export function MatBand({ mats, matches, held, settled, serverNow, teamColor, withClock = false, nextCount = 0, lastSuccessAt = null, pollIntervalMs = POLL_CLOCK_RUNNING_MS }: {
  mats: MatView[]
  matches: MatchView[]
  teamColor: (teamId: number | null) => string | null
  held: ReadonlyMap<number, MatchView>
  settled: ReadonlySet<number>
  serverNow: string | null
  withClock?: boolean
  nextCount?: number
  lastSuccessAt?: number | null
  pollIntervalMs?: number
}) {
  return (
    <div className="b-band">
      {mats.map(mat => {
        const showing = mat.current ?? held.get(mat.id) ?? null
        return (
          <MatPanel
            key={mat.id}
            mat={mat}
            held={held.get(mat.id)}
            everCarried={matches.some(m => m.matId === mat.id)}
            teamColor={teamColor}
            settled={showing !== null && settled.has(showing.id)}
            serverNow={serverNow}
            nextCount={nextCount}
            withClock={withClock}
            lastSuccessAt={lastSuccessAt}
            pollIntervalMs={pollIntervalMs}
          />
        )
      })}
    </div>
  )
}
