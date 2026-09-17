// Builders for synthetic Smoothcomp payloads. Every name here is invented: never a real
// child's name, never a payload captured from a live event.

export function seat(o: { name: string; club?: string; won?: boolean; id?: number; player?: boolean }) {
  const [first, ...rest] = o.name.split(' ')
  return {
    id: o.id ?? 1, type: 'registration', approved: 1, name: o.name, club: o.club ?? 'Ridgeline BJJ',
    isWinner: o.won === true, result: o.won === true ? 'won' : 'lost', placement: null,
    player: o.player === false ? null : { registration_id: o.id ?? 1, id: o.id ?? 1, firstname: first, lastname: rest.join(' '), club: o.club ?? 'Ridgeline BJJ' },
  }
}
export const BYE = { id: 0, type: 'bye', name: 'BYE', club: '', isWinner: false, result: null, placement: null, player: null }

export function match(o: { id: number; left?: unknown; right?: unknown; wonBy?: string; state?: string; isBye?: boolean; score?: string | null; round?: number }) {
  return {
    id: o.id, state: o.state ?? 'finished', match_nr: 0, round: o.round ?? 1, isBye: o.isBye ?? false, isCancel: false,
    wonBy: o.wonBy ?? 'points', score: o.score === null ? [] : { score: o.score ?? '2–0' },
    points: { left: 0, right: 0 }, seats: { left: o.left ?? null, right: o.right ?? null },
  }
}
export function elimBracket(matches: unknown[], division = 'Co-Ed Gi / 8 Years / 60 lbs') {
  return { state: { matches, match_trees: [] }, bracketInfo: { relatedBrackets: null, bracketHeaderData: { group: { name: division } } } }
}
export function roundRobinBracket(rounds: Record<string, unknown[]>, division = 'Co-Ed No-Gi / 9 Years / 70 lbs') {
  return { state: { rounds, players: {}, sortPlayersBy: 'points' }, bracketInfo: { relatedBrackets: null, bracketHeaderData: { group: { name: division } } } }
}
