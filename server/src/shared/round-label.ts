import type { DivisionFormat } from './types.js'

/**
 * How many rounds the winners bracket runs, which is the exponent of the smallest power
 * of two at or above the member count. Two kids are one round; five are three, because
 * the bracket is built at eight and the byes go to the top seeds.
 */
export function bracketRounds(memberCount: number): number {
  let rounds = 0
  while (2 ** rounds < memberCount) rounds++
  return Math.max(1, rounds)
}

/**
 * What the console calls a round. A bracket round is named by its distance from the final
 * rather than by its ordinal, because "Semifinal" means the same thing in a division of
 * four and a division of sixteen. Round robin has no rounds and never asks.
 */
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
