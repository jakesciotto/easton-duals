import type { Composition } from './plan'

export type Banded = Exclude<Composition, 'done'>

export const SAFE_CQH = 90

export const B1 = 22
export const B2 = 13
export const B3 = 9
export const HERO: Record<Banded, number> = { cold: 31, setup: 31, mats: 31, entry: 38 }
export const HERO_GAP: Record<Banded, number> = { cold: 3, setup: 3, mats: 3, entry: 2 }

export const NOTE_GAP = 1
export const SIGN_GAP = 1
export const FOOTER_GAP = 1

export const RESULT_GAP = 1

export const ENTRY_ROWS_MAX = 4
export const SETUP_FIRST_UP = 3
export const SETUP_HEAD_GAP = 2

export const MAT_ROW_1 = 20
export const MAT_ROW_2 = 18
export const MAT_QUEUE_1 = 4
export const MAT_QUEUE_2 = 1

export const FLOOR_NOTE_MATS = 'More mats than this screen fits. The rest are on the Live tab.'
export const FLOOR_NOTE_FAR = 'The far setting is too large for this screen'

export interface BoardBudget {
  hero: number
  heroGap: number
  band: number
  footer: number
  footerGap: number
  note: number
  noteGap: number
  sign: number
  signGap: number
  result: number
  resultGap: number
  panel: number
  matGap: number
  row: number
  queue: number
  matsShown: number
  clock: boolean
  lbRows: number
  lbGap: number
  rows: number
  floorNote: string | null
}

function clampInt(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

function linesIn(room: number, step: number): number {
  return Math.floor(room / step + 1e-9)
}

export function lbGapFor(teams: number): number {
  if (teams <= 2) return 1.5
  if (teams <= 4) return 1.2
  return 0.4
}

export function heroFloorFor(teams: number): number {
  const n = Math.max(2, teams)
  return n * B3 + (n - 1) * lbGapFor(n)
}

export function maxFarFor(teams: number): number {
  return (SAFE_CQH - HERO_GAP.mats) / (heroFloorFor(teams) + B3)
}

export function lbRowFor(hero: number, teams: number, far: number): number {
  const n = Math.max(2, teams)
  return (hero - (n - 1) * lbGapFor(n) * far) / n
}

export function matGapFor(mats: number): number {
  if (mats <= 2) return 2
  if (mats <= 4) return 1
  return 0.4
}

export function boardBudget({ comp, mats, teams = 2, far, note, sign = false }: {
  comp: Composition
  mats: number
  teams?: number
  far: number
  note: boolean
  sign?: boolean
}): BoardBudget {
  const count = Math.max(1, mats)
  const lbRows = Math.max(2, teams)
  const b3 = B3 * far
  const noteH = note ? b3 : 0
  const noteGap = note ? NOTE_GAP : 0
  const signed = sign && comp === 'done'
  const signH = signed ? b3 : 0
  const signGap = signed ? SIGN_GAP : 0
  const foot = noteGap + noteH + signGap + signH
  const lbGap = lbGapFor(lbRows) * far
  const floorHero = heroFloorFor(lbRows) * far
  const base = {
    note: noteH, noteGap, sign: signH, signGap, footer: 0, footerGap: 0,
    result: 0, resultGap: 0, matGap: 0, queue: 0, rows: 0, matsShown: 0, clock: false,
    lbRows, lbGap, floorNote: null as string | null,
  }

  if (comp === 'done') {
    return {
      ...base, heroGap: 0, band: 0, panel: 0, row: 0,
      result: b3, resultGap: RESULT_GAP,
      hero: SAFE_CQH - RESULT_GAP - b3 - foot,
    }
  }

  const heroGap = HERO_GAP[comp]
  const wanted = Math.max(HERO[comp] * far, floorHero)

  if (comp === 'entry') {
    const room = SAFE_CQH - heroGap - FOOTER_GAP - b3 - foot
    const hero = Math.min(wanted, room - b3)
    const band = room - hero
    const rows = clampInt(linesIn(band, b3), 0, ENTRY_ROWS_MAX)
    const row = rows > 0 ? band / rows : band
    return {
      ...base, heroGap, hero, band, footer: b3, footerGap: FOOTER_GAP, panel: row, row, rows,
      floorNote: rows === 0 ? FLOOR_NOTE_FAR : null,
    }
  }

  const room = SAFE_CQH - heroGap - foot
  const minBand = comp === 'setup' ? 2 * b3 + SETUP_HEAD_GAP : b3
  let hero = Math.min(wanted, room - minBand)
  let band = room - hero

  if (comp === 'setup') {
    const queue = clampInt(linesIn(band - b3 - SETUP_HEAD_GAP, b3), 0, SETUP_FIRST_UP)
    return {
      ...base, heroGap, hero, band, panel: band, row: b3, queue, matsShown: count,
      floorNote: queue === 0 ? FLOOR_NOTE_FAR : null,
    }
  }

  let matsShown = count
  while (matsShown > 1 && (band - (matsShown - 1) * matGapFor(matsShown)) / matsShown < b3) matsShown--

  const matGap = matGapFor(matsShown)
  let panel = (band - (matsShown - 1) * matGap) / matsShown
  let row = matsShown === 1 ? Math.min(panel, MAT_ROW_1 * far)
    : matsShown === 2 ? Math.min(panel, MAT_ROW_2 * far)
    : panel
  const queue = matsShown > 2 ? 0
    : clampInt(linesIn(panel - row, b3), 0, matsShown === 1 ? MAT_QUEUE_1 : MAT_QUEUE_2)

  if (hero > HERO[comp] * far + 1e-9 && matsShown === 1 && queue === 0 && row > b3) {
    row = b3
    panel = b3
    band = b3
    hero = room - band
  }

  const clock = matsShown <= 2 && row > b3 + 1e-9
  const noteFits = note || room - NOTE_GAP - b3 >= floorHero + minBand - 1e-9
  return {
    ...base, heroGap, hero, band, panel, matGap, row, queue, matsShown, clock,
    floorNote: comp !== 'mats' || !noteFits ? null
      : matsShown < count ? FLOOR_NOTE_MATS
      : row < b3 - 1e-9 ? FLOOR_NOTE_FAR
      : null,
  }
}

export function budgetWithNotes(input: { comp: Composition; mats: number; teams?: number; far: number; sign?: boolean }, notes: string[]): {
  budget: BoardBudget
  notes: string[]
} {
  let budget = boardBudget({ ...input, note: notes.length > 0 })
  if (budget.floorNote !== null && notes.length === 0) budget = boardBudget({ ...input, note: true })
  return { budget, notes: budget.floorNote === null ? notes : [...notes, budget.floorNote] }
}
