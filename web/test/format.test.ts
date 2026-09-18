import { describe, it, expect } from 'vitest'
import { contactLine, genderLabel, winTypeLabel, winnerLine, beltDotStyle } from '@/lib/format'

// The column is free text up to ten characters. The roster sync writes "Male", a hand entry
// writes "M", and the roster row prints the value inside a line that must never wrap, so a
// four letter value costs the rating its place on the row.
describe('genderLabel', () => {
  it('shortens what the roster sync writes', () => {
    expect(genderLabel('Male')).toBe('M')
    expect(genderLabel('Female')).toBe('F')
  })

  it('leaves what a hand entry writes alone', () => {
    expect(genderLabel('M')).toBe('M')
    expect(genderLabel('F')).toBe('F')
  })

  it('takes the first letter of anything else, because the column is free text', () => {
    expect(genderLabel('boy')).toBe('B')
    expect(genderLabel('  girl ')).toBe('G')
  })

  it('has nothing to say when the value is missing or blank', () => {
    expect(genderLabel(null)).toBeNull()
    expect(genderLabel('')).toBeNull()
    expect(genderLabel('   ')).toBeNull()
  })
})

// 6.4's footer line, printed on the connect page and in the scorer from one formatter, so
// the two screens a volunteer moves between cannot describe the desk differently.
describe('contactLine', () => {
  it('reads as a sentence a volunteer can act on', () => {
    expect(contactLine({ name: 'Dana Whitfield', phone: '555 0147' }))
      .toBe('Questions at the desk: Dana Whitfield, 555 0147.')
  })

  it('prints nothing at all when the event carries no contact', () => {
    expect(contactLine(null)).toBeNull()
  })
})

// One sentence fragment per win type, printed identically by the board, the ledger, the
// scorer and the mat panel. A walkover and a DQ joined the list in 0.15.0.
describe('winTypeLabel', () => {
  it('says how every win was won', () => {
    expect(winTypeLabel('submission')).toBe('by submission')
    expect(winTypeLabel('points')).toBe('on points')
    expect(winTypeLabel('decision')).toBe('by decision')
    expect(winTypeLabel('walkover')).toBe('by walkover')
    expect(winTypeLabel('dq')).toBe('by DQ')
  })
})

// The board's done band and the Smoothcomp report print the same sentence from this one
// rule, so a tie named on the wall cannot read differently in the organizer's dialog.
describe('winnerLine', () => {
  it('names one winner, and every team in a tie', () => {
    expect(winnerLine([])).toBe('')
    expect(winnerLine(['Ridgeline'])).toBe('Ridgeline wins')
    expect(winnerLine(['Ridgeline', 'Lakeside'])).toBe('Ridgeline and Lakeside tie')
    expect(winnerLine(['Ridgeline', 'Lakeside', 'Harbor Park'])).toBe('Ridgeline, Lakeside and Harbor Park tie')
  })
})

describe('beltDotStyle', () => {
  it('fills a plain belt with its family colour', () => {
    expect(beltDotStyle('grey')).toEqual({ background: 'var(--belt-grey)' })
  })

  it('puts the stripe at the centre of a striped belt', () => {
    expect(beltDotStyle('grey-white')).toEqual({ background: 'radial-gradient(circle, var(--stripe-white) 0 3px, var(--belt-grey) 3.5px)' })
    expect(beltDotStyle('yellow-black')).toEqual({ background: 'radial-gradient(circle, var(--stripe-black) 0 3px, var(--belt-yellow) 3.5px)' })
  })

  it('draws no belt as a hollow ring', () => {
    expect(beltDotStyle(null)).toEqual({ boxShadow: 'inset 0 0 0 1.5px var(--gray-8)' })
  })
})
