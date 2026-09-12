import { bracketRounds, roundLabel } from '../shared/round-label.js'
import type { DivisionFormat, DivisionStyles, FeedTake, Style } from '../shared/types.js'

/** A side of a generated match: a kid, or the winner or loser of an earlier one. */
export type Slot = { kind: 'kid'; athleteId: number } | { kind: 'feed'; index: number; take: FeedTake }

export interface GeneratedMatch { style: Style; round: number | null; a: Slot; b: Slot; why: string }

/** `name` is only ever printed in a warning, so a caller with no names can leave it out. */
export interface GenerateMember { athleteId: number; teamId: number; seed: number; name?: string }

export interface GenerateInput {
  name: string
  format: DivisionFormat
  styles: DivisionStyles
  members: GenerateMember[]
}

/**
 * The standard seeded slot order. order(1) is [1], and each doubling pairs every seed with
 * the one that completes the bracket, so eight slots read 1, 8, 4, 5, 2, 7, 3, 6 and the
 * top seed meets the bottom seed first.
 */
export function slotOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const next = order.length * 2
    order = order.flatMap(seed => [seed, next + 1 - seed])
  }
  return order
}

/**
 * The listed order rearranged by rating, best first, with unrated kids after them in the
 * order they were listed. Answers the athlete ids in their new seed order.
 */
export function seedByRating(members: { athleteId: number; erp: number | null; seed: number }[]): number[] {
  const bySeed = (a: { seed: number }, b: { seed: number }) => a.seed - b.seed
  const rated = members.filter((m): m is typeof m & { erp: number } => m.erp !== null)
    .sort((a, b) => b.erp - a.erp || bySeed(a, b))
  const unrated = members.filter(m => m.erp === null).sort(bySeed)
  return [...rated, ...unrated].map(m => m.athleteId)
}

// A bye, written as null, is a slot no kid reached. It wins its logical match without one
// being generated, and it produces no loser for the losers side to take.
type Entrant = Slot | null
interface Outcome { winner: Entrant; loser: Entrant }

const kidSlot = (m: GenerateMember): Slot => ({ kind: 'kid', athleteId: m.athleteId })
const nameOf = (m: GenerateMember) => m.name ?? `#${m.athleteId}`

class Emitter {
  readonly matches: GeneratedMatch[] = []
  constructor(private readonly style: Style, private readonly divisionName: string, private readonly format: DivisionFormat, private readonly memberCount: number) {}

  /** One logical node of a bracket: a match, or a walkover that emits nothing. */
  resolve(a: Entrant, b: Entrant, round: number): Outcome {
    if (a === null || b === null) return { winner: a ?? b, loser: null }
    const index = this.matches.length
    this.matches.push({ style: this.style, round, a, b, why: this.why(round) })
    return { winner: { kind: 'feed', index, take: 'winner' }, loser: { kind: 'feed', index, take: 'loser' } }
  }

  pair(a: Entrant, b: Entrant, round: number): Entrant {
    return this.resolve(a, b, round).winner
  }

  private why(round: number): string {
    return `${this.divisionName}, ${roundLabel(this.format, round, this.memberCount).toLowerCase()}`
  }
}

/**
 * The round one pairs of a bracket, byes included, after same-team pairs have been split
 * where a swap can split them. A pair that cannot be split stays and warns: the division
 * still has to exist, and the organizer is the one who decides what to do about it.
 */
export function arrangeSlots(members: GenerateMember[], warnings: string[]): (GenerateMember | null)[] {
  const ordered = [...members].sort((a, b) => a.seed - b.seed)
  const size = 2 ** bracketRounds(ordered.length)
  const slots = slotOrder(size).map(seed => ordered[seed - 1] ?? null)
  for (let pair = 0; pair * 2 < size; pair++) {
    const [left, right] = [pair * 2, pair * 2 + 1]
    const a = slots[left]
    const b = slots[right]
    if (!a || !b || a.teamId !== b.teamId) continue
    // The lower seed is the one that moves, and it moves the shortest distance in seed
    // terms that leaves both pairs cross-team.
    const movingAt = a.seed <= b.seed ? right : left
    const moving = slots[movingAt] as GenerateMember
    const staying = slots[movingAt === left ? right : left] as GenerateMember
    const candidates = slots
      .map((m, at) => ({ m, at }))
      .filter((c): c is { m: GenerateMember; at: number } => c.m !== null && Math.floor(c.at / 2) !== pair)
      .sort((x, y) => Math.abs(x.m.seed - moving.seed) - Math.abs(y.m.seed - moving.seed) || x.m.seed - y.m.seed)
    const swap = candidates.find(c => {
      const partner = slots[c.at ^ 1]
      return c.m.teamId !== staying.teamId && (partner === null || partner.teamId !== moving.teamId)
    })
    if (!swap) {
      warnings.push(`Same team: ${nameOf(a)} and ${nameOf(b)}`)
      continue
    }
    slots[movingAt] = swap.m
    slots[swap.at] = moving
  }
  return slots
}

interface Winners { champion: Entrant; losersByRound: Entrant[][] }

function buildWinners(slots: (GenerateMember | null)[], emit: Emitter): Winners {
  let current: Entrant[] = slots.map(m => m ? kidSlot(m) : null)
  const losersByRound: Entrant[][] = []
  for (let round = 1; current.length > 1; round++) {
    const next: Entrant[] = []
    const losers: Entrant[] = []
    for (let i = 0; i < current.length; i += 2) {
      const outcome = emit.resolve(current[i], current[i + 1], round)
      next.push(outcome.winner)
      losers.push(outcome.loser)
    }
    current = next
    losersByRound.push(losers)
  }
  return { champion: current[0] ?? null, losersByRound }
}

/**
 * The losers side, which alternates: a round that pairs the kids already on it, then a
 * round that puts each of those winners against a loser dropping out of the next winners
 * round, that round's losers in reverse order so a pair does not meet twice at once.
 */
function buildLosers(winners: Winners, emit: Emitter, winnersRounds: number): Entrant {
  let current = winners.losersByRound[0] ?? []
  let round = winnersRounds
  for (let drop = 1; drop < winnersRounds; drop++) {
    round++
    const among: Entrant[] = []
    for (let i = 0; i < current.length; i += 2) among.push(emit.pair(current[i], current[i + 1], round))
    round++
    const dropping = [...winners.losersByRound[drop]].reverse()
    current = among.map((entrant, i) => emit.pair(entrant, dropping[i] ?? null, round))
  }
  return current[0] ?? null
}

/** Every cross-team pair in seed order, 1 against 2, then 1 against 3. No rounds. */
function roundRobin(members: GenerateMember[], style: Style, name: string): GeneratedMatch[] {
  const ordered = [...members].sort((a, b) => a.seed - b.seed)
  const matches: GeneratedMatch[] = []
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      if (ordered[i].teamId === ordered[j].teamId) continue
      matches.push({ style, round: null, a: kidSlot(ordered[i]), b: kidSlot(ordered[j]), why: name })
    }
  }
  return matches
}

function generateStyle(input: GenerateInput, style: Style, slots: (GenerateMember | null)[]): GeneratedMatch[] {
  if (input.format === 'round_robin') return roundRobin(input.members, style, input.name)
  const emit = new Emitter(style, input.name, input.format, input.members.length)
  const winners = buildWinners(slots, emit)
  if (input.format === 'double_elim') {
    const rounds = winners.losersByRound.length
    const losersChampion = buildLosers(winners, emit, rounds)
    emit.resolve(winners.champion, losersChampion, rounds + 2 * (rounds - 1) + 1)
  }
  return emit.matches
}

const shift = (slot: Slot, offset: number): Slot => slot.kind === 'feed' ? { ...slot, index: slot.index + offset } : slot

/**
 * Every match a division runs, in dependency order: a feed's index always points at an
 * earlier match of the same array. A division of both styles is two independent sets, the
 * gi one first, so a kid can be knocked out of one and still fight the other.
 */
export function generateDivision(input: GenerateInput): { matches: GeneratedMatch[]; warnings: string[] } {
  const warnings: string[] = []
  const slots = input.format === 'round_robin' ? [] : arrangeSlots(input.members, warnings)
  const styles: Style[] = input.styles === 'both' ? ['gi', 'nogi'] : [input.styles]
  const matches: GeneratedMatch[] = []
  for (const style of styles) {
    const offset = matches.length
    for (const m of generateStyle(input, style, slots)) {
      matches.push({ ...m, a: shift(m.a, offset), b: shift(m.b, offset) })
    }
  }
  return { matches, warnings: [...new Set(warnings)] }
}
