import type { LeaderboardRow } from './types.js'

export interface RankableTeam { id: number; teamPoints: number; wins: number; points: number; position: number }

/**
 * The tiebreak in architecture.md: team points, then wins, then match points, then the
 * position the team was created at, which never ties. Teams level on the first three share
 * a rank and the ranks they used up are skipped, so a table reads 1, 1, 3 rather than
 * 1, 1, 2.
 *
 * Shared because three surfaces state the same standing: the snapshot the server builds,
 * the console's own tables, and the board's hero. Two copies of a ranking rule is two
 * answers to "who is winning" in one room.
 */
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
