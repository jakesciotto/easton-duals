import type { LeaderboardRow, TeamView } from '@shared/types'
import { winnerLine } from '@/lib/format'

/**
 * The sentence under the final standings. Every team that shares rank 1 is named, in
 * the standings' own order, so the line and the numerals above it cannot disagree.
 *
 * A tie of more than three is still named in full: the alternative is a line that says
 * some teams tied and leaves the room counting numerals to work out which.
 */
export function resultText(teams: TeamView[], leaderboard: LeaderboardRow[]): string {
  const byId = new Map(teams.map(t => [t.id, t]))
  const names = leaderboard
    .filter(row => row.rank === 1)
    .map(row => byId.get(row.teamId)?.name)
    .filter((name): name is string => name !== undefined)
  return winnerLine(names)
}

/**
 * 6.15's note slot, in the budget but not in the note's colour: --attend is reserved for
 * a state that needs a person, and a finished event needs nobody. Gray 12 at b3.
 */
export function DoneBand({ teams, leaderboard }: { teams: TeamView[]; leaderboard: LeaderboardRow[] }) {
  return <div className="b-result font-sans">{resultText(teams, leaderboard)}</div>
}
