import type { MatchView } from '@shared/types'
import { MatRow } from './MatRow'

export const RESULTS_EMPTY = 'First results go up as they come off the mats.'

export function ResultsBand({ results, total, settled, teamColor }: {
  results: MatchView[]
  total: number
  settled: ReadonlySet<number>
  teamColor: (teamId: number | null) => string | null
}) {
  return (
    <>
      <div className="b-band">
        {results.length === 0
          ? <div className="b-row-empty font-sans">{RESULTS_EMPTY}</div>
          : results.map((match, i) => (
            <section key={match.id} aria-label={`Result ${i + 1}`} className="b-panel">
              <MatRow
                a={match.a}
                b={match.b}
                settled={settled.has(match.id)}
                winnerAthleteId={match.result?.winnerAthleteId ?? null}
                colorA={teamColor(match.a.teamId)}
                colorB={teamColor(match.b.teamId)}
              />
            </section>
          ))}
      </div>
      <div className="b-footer font-sans">
        {'Results entered: '}
        <span className="font-mono">{total}</span>
      </div>
    </>
  )
}
