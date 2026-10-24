import { TEAM_COLORS, TEAM_COLOR_KEYS, TEAM_COLOR_LABELS, type TeamColor } from '@shared/types'

const HUE: Record<TeamColor, number> = {
  red: 25, orange: 68, green: 112, amber: 150, teal: 196, blue: 250, purple: 300, pink: 340,
}

export const HUE_FLOOR = 60
export const CONFUSION_FLOOR = 20
export const CONFUSION_WARN = 30

export type GuardLevel = 'ok' | 'warn' | 'block'
export interface PairVerdict {
  level: GuardLevel
  reason: string | null
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const hexToLinear = (hex: string) => [1, 3, 5].map(i => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255))

function simulate(hex: string, kind: 'deuteranopia' | 'protanopia'): number[] {
  const [r, g, b] = hexToLinear(hex)
  const L = 17.8824 * r + 43.5161 * g + 4.11935 * b
  const M = 3.45565 * r + 27.1554 * g + 3.86714 * b
  const S = 0.0299566 * r + 0.184309 * g + 1.46709 * b
  const l = kind === 'protanopia' ? 2.02344 * M - 2.52581 * S : L
  const m = kind === 'deuteranopia' ? 0.494207 * L + 1.24827 * S : M
  return [
    0.080944 * l - 0.130504 * m + 0.116721 * S,
    -0.0102485 * l + 0.0540194 * m - 0.113615 * S,
    -0.000365294 * l - 0.00412163 * m + 0.693513 * S,
  ].map(v => Math.min(1, Math.max(0, v)))
}

function toLab([r, g, b]: number[]): number[] {
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
  const y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
  const z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function deltaE00([L1, a1, b1]: number[], [L2, a2, b2]: number[]): number {
  const rad = Math.PI / 180
  const deg = 180 / Math.PI
  const cBar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)))
  const ap1 = (1 + g) * a1
  const ap2 = (1 + g) * a2
  const cp1 = Math.hypot(ap1, b1)
  const cp2 = Math.hypot(ap2, b2)
  const hue = (b: number, ap: number) => {
    if (b === 0 && ap === 0) return 0
    const h = Math.atan2(b, ap) * deg
    return h < 0 ? h + 360 : h
  }
  const hp1 = hue(b1, ap1)
  const hp2 = hue(b2, ap2)
  const dLp = L2 - L1
  const dCp = cp2 - cp1
  let dhp = 0
  if (cp1 * cp2 !== 0) {
    dhp = hp2 - hp1
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dhp * rad) / 2)
  const lbp = (L1 + L2) / 2
  const cbp = (cp1 + cp2) / 2
  let hbp = hp1 + hp2
  if (cp1 * cp2 !== 0) {
    if (Math.abs(hp1 - hp2) > 180) hbp += hbp < 360 ? 360 : -360
    hbp /= 2
  }
  const t = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
    + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad)
  const sl = 1 + (0.015 * (lbp - 50) ** 2) / Math.sqrt(20 + (lbp - 50) ** 2)
  const sc = 1 + 0.045 * cbp
  const sh = 1 + 0.015 * cbp * t
  const rt = -Math.sin(2 * (30 * Math.exp(-(((hbp - 275) / 25) ** 2))) * rad)
    * (2 * Math.sqrt(cbp ** 7 / (cbp ** 7 + 25 ** 7)))
  return Math.sqrt((dLp / sl) ** 2 + (dCp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dCp / sc) * (dHp / sh))
}

export function hueSeparation(a: TeamColor, b: TeamColor): number {
  const d = Math.abs(HUE[a] - HUE[b]) % 360
  return d > 180 ? 360 - d : d
}

export function confusion(a: TeamColor, b: TeamColor): number {
  const under = (kind: 'deuteranopia' | 'protanopia') =>
    deltaE00(toLab(simulate(TEAM_COLORS[a], kind)), toLab(simulate(TEAM_COLORS[b], kind)))
  return Math.min(under('deuteranopia'), under('protanopia'))
}

function legalPartners(taken: TeamColor[]): TeamColor[] {
  return TEAM_COLOR_KEYS.filter(c => !taken.includes(c)
    && taken.every(t => hueSeparation(t, c) >= HUE_FLOOR && confusion(t, c) >= CONFUSION_FLOOR))
}

const nearest = (taken: TeamColor[], c: TeamColor) =>
  taken.length === 0 ? 360 : Math.min(...taken.map(t => hueSeparation(t, c)))

export function suggestions(taken: TeamColor[]): TeamColor[] {
  const best = [...legalPartners(taken)].sort((x, y) => nearest(taken, y) - nearest(taken, x)).slice(0, 2)
  return TEAM_COLOR_KEYS.filter(c => best.includes(c))
}

export function freeColors(taken: TeamColor[]): TeamColor[] {
  return TEAM_COLOR_KEYS.filter(c => !taken.includes(c))
}

export function nextColor(taken: TeamColor[]): TeamColor {
  return suggestions(taken)[0] ?? freeColors(taken)[0] ?? TEAM_COLOR_KEYS[0]
}

const swapTail = (taken: TeamColor[]) => {
  const copy = suggestions(taken).map(c => TEAM_COLOR_LABELS[c]).join(' or ')
  return copy === '' ? '' : ` Try ${copy}.`
}

export function colourVerdict(candidate: TeamColor, others: TeamColor[]): PairVerdict {
  if (others.includes(candidate)) {
    return { level: 'block', reason: `${TEAM_COLOR_LABELS[candidate]} is already taken.${swapTail(others)}` }
  }
  const near = others.find(o => hueSeparation(o, candidate) < HUE_FLOOR)
  if (near !== undefined) {
    return {
      level: 'block',
      reason: `${TEAM_COLOR_LABELS[near]} and ${TEAM_COLOR_LABELS[candidate]} look the same from the back of the gym.${swapTail(others)}`,
    }
  }
  if (others.some(o => confusion(o, candidate) < CONFUSION_FLOOR)) {
    return { level: 'block', reason: `These two look the same to about one person in twelve.${swapTail(others)}` }
  }
  const close = others.find(o => confusion(o, candidate) < CONFUSION_WARN)
  if (close !== undefined) {
    return {
      level: 'warn',
      reason: `${TEAM_COLOR_LABELS[close]} and ${TEAM_COLOR_LABELS[candidate]} are close under colour blindness. The three letter codes still tell them apart.`,
    }
  }
  return { level: 'ok', reason: null }
}
