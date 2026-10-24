import type { LeaderboardRow, TeamView } from '@shared/types'
import { winnerLine } from '@/lib/format'

export function resultText(teams: TeamView[], leaderboard: LeaderboardRow[]): string {
  const byId = new Map(teams.map(t => [t.id, t]))
  const names = leaderboard
    .filter(row => row.rank === 1)
    .map(row => byId.get(row.teamId)?.name)
    .filter((name): name is string => name !== undefined)
  return winnerLine(names)
}

export function DoneBand({ teams, leaderboard }: { teams: TeamView[]; leaderboard: LeaderboardRow[] }) {
  return <div className="b-result font-sans">{resultText(teams, leaderboard)}</div>
}
