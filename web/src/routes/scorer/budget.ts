export const IPAD_SCREEN_HEIGHT = 768

export const MAX_BROWSER_CHROME = 90

export const SHORTEST_VIEWPORT = IPAD_SCREEN_HEIGHT - MAX_BROWSER_CHROME

export const PAD = 24
export const COLUMN_GAP = 8
export const HEAD_GAP = 4
export const STACK_GAP = 8

export const MAT_LINE = 16
export const LINE = 18
export const CONTACT_LINE = LINE
export const STALE_LINE = 18
export const HEAD_LINE = Math.max(MAT_LINE, STALE_LINE)
export const ALERT = 44

export const COMMIT = 104
export const SECONDARY = 64
export const REASON = 24
export const MOAT = 32
export const RULE = 1

export function clockHeight(viewport: number): number {
  return Math.max(viewport * 0.12, 96)
}

export const MINUS_ROW = SECONDARY + STACK_GAP

export const CLOCK_ROW = COMMIT

export const STACK_COMMIT =
  COMMIT + REASON + CLOCK_ROW + REASON + MOAT + RULE + COMMIT + 6 * STACK_GAP

export const STACK = STACK_COMMIT + MINUS_ROW

export interface ColumnBudget {
  clock: number
  guaranteed: number
  minusRowFixed: boolean
  fixed: number
  slack: number
}

export function columnBudget(viewport: number): ColumnBudget {
  const clock = clockHeight(viewport)
  const guaranteed =
    PAD * 2 + HEAD_LINE + HEAD_GAP + clock + COLUMN_GAP * 3 + ALERT + STACK_COMMIT
  const minusRowFixed = viewport - guaranteed >= MINUS_ROW
  const fixed = guaranteed + (minusRowFixed ? MINUS_ROW : 0)
  return { clock, guaranteed, minusRowFixed, fixed, slack: viewport - fixed }
}
