import type { DivisionFormat } from './types.js'

export function bracketRounds(memberCount: number): number {
  let rounds = 0
  while (2 ** rounds < memberCount) rounds++
  return Math.max(1, rounds)
}

export function roundLabel(format: DivisionFormat, round: number, memberCount: number): string {
  if (format === 'round_robin') return `Round ${round}`
  const rounds = bracketRounds(memberCount)
  if (format === 'double_elim') {
    const losersRounds = 2 * (rounds - 1)
    if (round > rounds + losersRounds) return 'Grand final'
    if (round > rounds) return `Losers round ${round - rounds}`
  }
  const fromFinal = rounds - round
  if (fromFinal === 0) return 'Final'
  if (fromFinal === 1) return 'Semifinal'
  if (fromFinal === 2) return 'Quarterfinal'
  if (fromFinal === 3) return 'Round of 16'
  return `Round ${round}`
}
