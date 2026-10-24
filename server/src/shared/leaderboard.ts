import type { LeaderboardRow } from './types.js'

export interface RankableTeam { id: number; teamPoints: number; wins: number; points: number; position: number }

export function rankTeams(teams: RankableTeam[]): LeaderboardRow[] {
  const sorted = [...teams].sort((x, y) =>
    y.teamPoints - x.teamPoints || y.wins - x.wins || y.points - x.points || x.position - y.position)
  const rows: LeaderboardRow[] = []
  for (const [i, team] of sorted.entries()) {
    const above = rows[i - 1]
    const tied = above !== undefined && above.teamPoints === team.teamPoints && above.wins === team.wins && above.points === team.points
    rows.push({ teamId: team.id, rank: tied ? above.rank : i + 1, teamPoints: team.teamPoints, wins: team.wins, points: team.points })
  }
  return rows
}
