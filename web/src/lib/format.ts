import type { CSSProperties } from 'react'
import { TEAM_COLORS, type DivisionFormat, type DivisionStyles, type EventContact, type Style, type TeamColor, type WinType } from '@shared/types'

export function beltLabel(belt: string | null): string {
  if (!belt) return 'No belt'
  return belt.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' / ')
}

const BELT_FAMILY: Record<string, string> = {
  white: 'var(--belt-white)', grey: 'var(--belt-grey)', yellow: 'var(--belt-yellow)', orange: 'var(--belt-orange)', green: 'var(--belt-green)',
}
const STRIPE: Record<string, string> = { white: 'var(--stripe-white)', black: 'var(--stripe-black)' }

export function beltDotStyle(belt: string | null): CSSProperties {
  if (!belt) return { boxShadow: 'inset 0 0 0 1.5px var(--gray-8)' }
  const [family, stripe] = belt.split('-')
  const fill = BELT_FAMILY[family] ?? 'var(--gray-8)'
  const centre = stripe === undefined ? null : STRIPE[stripe] ?? null
  return centre === null ? { background: fill } : { background: `radial-gradient(circle, ${centre} 0 3px, ${fill} 3.5px)` }
}

export function athleteName(a: { firstName: string; lastName: string }): string {
  return `${a.firstName} ${a.lastName}`.trim()
}

const WIN_TYPE_LABELS: Record<WinType, string> = {
  submission: 'by submission',
  points: 'on points',
  decision: 'by decision',
  walkover: 'by walkover',
  dq: 'by DQ',
}

export function winTypeLabel(w: WinType): string {
  return WIN_TYPE_LABELS[w]
}

export function winnerLine(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return `${names[0]} wins`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} tie`
}

export function teamHex(color: string): string {
  return TEAM_COLORS[color as TeamColor] ?? 'var(--gray-8)'
}

export function teamStyle(color: string): CSSProperties {
  return { '--team': teamHex(color) } as CSSProperties
}

export function genderLabel(gender: string | null): string | null {
  if (!gender) return null
  const first = gender.trim().charAt(0).toUpperCase()
  return first === '' ? null : first
}

export function contactLine(contact: EventContact | null): string | null {
  if (!contact) return null
  return `Questions at the desk: ${contact.name}, ${contact.phone}.`
}

export function timeOfDay(iso: string | null | undefined): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const hour = at.getHours() % 12 || 12
  return `${hour}:${String(at.getMinutes()).padStart(2, '0')} ${at.getHours() < 12 ? 'am' : 'pm'}`
}

export function styleLabel(style: Style): string {
  return style === 'gi' ? 'Gi' : 'Nogi'
}
export function styleTag(style: Style): string {
  return style === 'gi' ? 'GI' : 'NOGI'
}

export function stylesLabel(styles: DivisionStyles): string {
  return styles === 'both' ? 'Gi and nogi' : styleLabel(styles)
}
export function formatLabel(format: DivisionFormat): string {
  return format === 'round_robin' ? 'Round robin' : format === 'single_elim' ? 'Single elimination' : 'Double elimination'
}
