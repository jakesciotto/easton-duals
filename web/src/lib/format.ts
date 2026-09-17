import type { CSSProperties } from 'react'
import { TEAM_COLORS, type DivisionFormat, type DivisionStyles, type EventContact, type Style, type TeamColor, type WinType } from '@shared/types'

export function beltLabel(belt: string | null): string {
  if (!belt) return 'No belt'
  return belt.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' / ')
}

export function athleteName(a: { firstName: string; lastName: string }): string {
  return `${a.firstName} ${a.lastName}`.trim()
}

// How a win reads in a sentence. Every surface that names an outcome prints one of these,
// so a walkover is the same words on the board, in the ledger and on the mat.
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

/** The board's result line: one name wins, more than one tie. Empty for no name. */
export function winnerLine(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return `${names[0]} wins`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} tie`
}

// The only consumer is teamStyle, which assigns the result to a custom property,
// so the fallback stays a token reference rather than a literal.
export function teamHex(color: string): string {
  return TEAM_COLORS[color as TeamColor] ?? 'var(--gray-8)'
}

// Sets --team so Tailwind classes like bg-[var(--team)] and text-[var(--team)] pick the team colour.
export function teamStyle(color: string): CSSProperties {
  return { '--team': teamHex(color) } as CSSProperties
}

// The column is free text up to ten characters, and the roster sync writes "Male" while a
// hand entry writes "M". The roster row prints it inside a line that must never wrap, so a
// four letter value costs the rating its place. Display only: the stored value never changes.
export function genderLabel(gender: string | null): string | null {
  if (!gender) return null
  const first = gender.trim().charAt(0).toUpperCase()
  return first === '' ? null : first
}

/**
 * 6.4's footer line, printed identically wherever a volunteer might need the desk: the
 * connect page, the scorer's reference region and its done screen. Null when the event
 * carries no contact, because a half filled one gives nobody anything to act on.
 */
export function contactLine(contact: EventContact | null): string | null {
  if (!contact) return null
  return `Questions at the desk: ${contact.name}, ${contact.phone}.`
}

/**
 * "3:41 pm". One formatter for every surface that stamps a time of day: the mat panel's
 * last result, the Result dialog's statement of what is being corrected, and the board's
 * certified note. An event never crosses noon and midnight both, so the hour needs no
 * date beside it.
 */
export function timeOfDay(iso: string | null | undefined): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const hour = at.getHours() % 12 || 12
  return `${hour}:${String(at.getMinutes()).padStart(2, '0')} ${at.getHours() < 12 ? 'am' : 'pm'}`
}

/** The word for a style in a sentence, and the tag a chip prints beside a match number. */
export function styleLabel(style: Style): string {
  return style === 'gi' ? 'Gi' : 'Nogi'
}
export function styleTag(style: Style): string {
  return style === 'gi' ? 'GI' : 'NOGI'
}

/** What a division runs, and how it is drawn. Spec 9's words, verbatim. */
export function stylesLabel(styles: DivisionStyles): string {
  return styles === 'both' ? 'Gi and nogi' : styleLabel(styles)
}
export function formatLabel(format: DivisionFormat): string {
  return format === 'round_robin' ? 'Round robin' : format === 'single_elim' ? 'Single elimination' : 'Double elimination'
}
