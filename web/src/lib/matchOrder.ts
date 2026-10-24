export function sortDoneMatches<T extends { id: number; endedAt?: string | null }>(matches: readonly T[]): T[] {
  return [...matches].sort((x, y) => {
    const xa = x.endedAt ?? null
    const ya = y.endedAt ?? null
    if (xa === null && ya === null) return y.id - x.id
    if (xa === null) return 1
    if (ya === null) return -1
    if (xa !== ya) return xa < ya ? 1 : -1
    return y.id - x.id
  })
}
