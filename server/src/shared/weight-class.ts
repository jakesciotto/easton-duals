export interface WeightClass { index: number; label: string }

const UPPER = [39, 46, 53, 61, 70, 80, 90, 100, 110, 120]
const TOP = UPPER[UPPER.length - 1]
const STEP = 10

export function weightClass(lbs: number): WeightClass {
  const w = Math.round(lbs)
  const i = UPPER.findIndex(upper => w <= upper)
  if (i === 0) return { index: 0, label: `Up to ${UPPER[0]} lbs` }
  if (i > 0) return { index: i, label: `${UPPER[i - 1] + 1} to ${UPPER[i]} lbs` }
  const over = Math.ceil((w - TOP) / STEP)
  return { index: UPPER.length - 1 + over, label: `${TOP + (over - 1) * STEP + 1} to ${TOP + over * STEP} lbs` }
}

export function classGap(a: number, b: number): number {
  return Math.abs(weightClass(a).index - weightClass(b).index)
}
