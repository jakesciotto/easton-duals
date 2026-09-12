// Standalone until Task R repoints it at the shared type of the same name.
export type Style = 'gi' | 'nogi'

export interface PendingMatch {
  id: number
  number: number
  style: Style
  athleteIds: (number | null)[]
  feeds: number[]
  age: number | null
  round: number | null
  divisionPosition: number | null
  lengthSec: number
}

export interface PlanInput {
  mats: { id: number; number: number }[]
  live: { matchId: number; athleteIds: number[] }[]
  pending: PendingMatch[]
  firstOrderIndex: number
}

export interface SchedulePlan {
  order: { matchId: number; matId: number | null; orderIndex: number; wave: number }[]
  waves: number
  minutes: number
  perMat: { matId: number | null; number: number; count: number }[]
  warnings: string[]
  gaps: { wave: number; matId: number | null; waitingOn: number }[]
}

// Lowest first: style, then age (a match with no known age runs last in its style), then
// round and division position (null ahead of any real one), then number as the final,
// always-unique tiebreaker.
function comparePriority(a: PendingMatch, b: PendingMatch): number {
  const styleA = a.style === 'gi' ? 0 : 1
  const styleB = b.style === 'gi' ? 0 : 1
  if (styleA !== styleB) return styleA - styleB
  const ageA = a.age ?? Infinity
  const ageB = b.age ?? Infinity
  if (ageA !== ageB) return ageA - ageB
  const roundA = a.round ?? -Infinity
  const roundB = b.round ?? -Infinity
  if (roundA !== roundB) return roundA - roundB
  const posA = a.divisionPosition ?? -Infinity
  const posB = b.divisionPosition ?? -Infinity
  if (posA !== posB) return posA - posB
  return a.number - b.number
}

export function planSchedule(input: PlanInput, names: (athleteId: number) => string): SchedulePlan {
  const lanes: { matId: number | null; number: number }[] = input.mats.length > 0
    ? [...input.mats].sort((a, b) => a.number - b.number).map(m => ({ matId: m.id, number: m.number }))
    : [{ matId: null, number: 1 }]

  const priority = [...input.pending].sort(comparePriority)
  const pendingIds = new Set(priority.map(m => m.id))
  const liveMatchIds = new Set(input.live.map(l => l.matchId))
  const placed = new Set<number>()
  const waveOfMatch = new Map<number, number>()

  // A live kid is fixed at wave -1 for the rest rule, whatever match they are in.
  const occupiedWave = new Map<number, number>()
  const occupiedMatchNumber = new Map<number, number>()
  for (const l of input.live) for (const aid of l.athleteIds) occupiedWave.set(aid, -1)

  let unplacedGi = priority.filter(m => m.style === 'gi').length

  // A feeder that is neither pending nor live has already run: it clears immediately.
  const feederWave = (feedId: number): number => {
    const placedWave = waveOfMatch.get(feedId)
    if (placedWave !== undefined) return placedWave
    if (pendingIds.has(feedId)) return Infinity
    if (liveMatchIds.has(feedId)) return -1
    return -Infinity
  }

  const feedersReady = (m: PendingMatch, wave: number): boolean =>
    m.feeds.every(f => feederWave(f) <= wave - 2)

  const restOk = (m: PendingMatch, wave: number, relaxed: boolean): boolean =>
    m.athleteIds.every(aid => {
      if (aid === null) return true
      const occ = occupiedWave.get(aid)
      if (occ === undefined) return true
      if (!relaxed) return occ !== wave && occ !== wave - 1
      // Relaxed still never doubles a kid into the same wave, and a live kid never
      // starts a new match before wave 1: there is no wave number to warn about yet.
      if (wave === 0 && occ === -1) return false
      return occ !== wave
    })

  const findCandidate = (wave: number, relaxed: boolean): PendingMatch | null => {
    for (const m of priority) {
      if (placed.has(m.id)) continue
      if (m.style === 'nogi' && unplacedGi > 0) break // gi is sorted first; the rest are all nogi
      if (!feedersReady(m, wave)) continue
      if (!restOk(m, wave, relaxed)) continue
      return m
    }
    return null
  }

  const order: SchedulePlan['order'] = []
  const gaps: SchedulePlan['gaps'] = []
  const warnings: string[] = []
  const laneCounts = new Map<number | null, number>(lanes.map(l => [l.matId, 0]))
  const waveMaxLength: number[] = []

  let nextOrderIndex = input.firstOrderIndex
  let remaining = priority.length
  let wave = 0

  while (remaining > 0) {
    let waveHasMatch = false
    let waveMax = 0
    for (const lane of lanes) {
      if (remaining === 0) break

      const match = findCandidate(wave, false)
      const relaxedMatch = match ? null : findCandidate(wave, true)
      const chosen = match ?? relaxedMatch

      if (!chosen) {
        const waitingOn = priority.find(m => !placed.has(m.id))
        if (waitingOn) gaps.push({ wave, matId: lane.matId, waitingOn: waitingOn.number })
        continue
      }

      if (relaxedMatch) {
        for (const aid of chosen.athleteIds) {
          if (aid === null || occupiedWave.get(aid) !== wave - 1) continue
          const priorNumber = occupiedMatchNumber.get(aid)
          if (priorNumber !== undefined) warnings.push(`${names(aid)}: M${priorNumber} and M${chosen.number} back to back`)
        }
      }

      placed.add(chosen.id)
      remaining--
      if (chosen.style === 'gi') unplacedGi--
      waveOfMatch.set(chosen.id, wave)
      for (const aid of chosen.athleteIds) {
        if (aid === null) continue
        occupiedWave.set(aid, wave)
        occupiedMatchNumber.set(aid, chosen.number)
      }

      order.push({ matchId: chosen.id, matId: lane.matId, orderIndex: nextOrderIndex++, wave })
      laneCounts.set(lane.matId, (laneCounts.get(lane.matId) ?? 0) + 1)
      waveHasMatch = true
      waveMax = Math.max(waveMax, chosen.lengthSec)
    }
    if (waveHasMatch) waveMaxLength.push(waveMax)
    wave++
  }

  const minutes = Math.ceil(waveMaxLength.reduce((sum, len) => sum + len + 60, 0) / 60)
  const perMat = lanes.map(lane => ({ matId: lane.matId, number: lane.number, count: laneCounts.get(lane.matId) ?? 0 }))

  return { order, waves: wave, minutes, perMat, warnings, gaps }
}
