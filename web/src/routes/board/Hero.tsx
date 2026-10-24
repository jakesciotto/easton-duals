import type { LeaderboardRow, TeamView } from '@shared/types'
import { Skeleton } from '@/components/ui/skeleton'
import { teamStyle } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Fig } from './MatRow'

function Standing({ team, row }: { team: TeamView; row: LeaderboardRow }) {
  return (
    <div style={teamStyle(team.color)} className={cn('lb-row font-mono', row.rank === 1 ? 'lb-lead' : null)}>
      <span aria-hidden className="lb-edge" />
      <span className="lb-rank">{row.rank}</span>
      <span className="lb-name font-sans">{team.name}</span>
      <Fig className="lb-wins" value={row.teamPoints} />
      <span className="lb-pts font-sans">
        <span className="lb-pts-n font-mono">{row.wins}</span>
        <span> wins</span>
      </span>
    </div>
  )
}

export function Hero({ teams, leaderboard }: { teams: TeamView[]; leaderboard: LeaderboardRow[] }) {
  const byId = new Map(teams.map(t => [t.id, t]))
  return (
    <section aria-label="Scoreboard" className="b-lb">
      {leaderboard.map(row => {
        const team = byId.get(row.teamId)
        return team === undefined ? null : <Standing key={row.teamId} team={team} row={row} />
      })}
    </section>
  )
}

export function HeroSkeleton() {
  return (
    <section aria-label="Scoreboard" className="b-lb">
      {[0, 1].map(i => (
        <div key={i} className="lb-row font-mono">
          <span aria-hidden className="lb-edge" />
          <span className="lb-rank" />
          <span className="lb-name font-sans" />
          <Skeleton className="lb-wins b-skel-wins" />
          <span className="lb-pts font-sans">
            <span className="lb-pts-n font-mono" />
            <span> wins</span>
          </span>
        </div>
      ))}
    </section>
  )
}
