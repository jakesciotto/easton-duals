import { describe, it, expect } from 'vitest'
import { dice, exactName, nameScore, SUGGEST_FLOOR, SUGGEST_MARGIN } from '../src/shared/similarity.js'

describe('a name resolves through one similarity module', () => {
  const mateo = { firstName: 'Mateo', lastName: 'Rivera' }

  it('scores a hyphenated surname above the suggestion floor', () => {
    expect(nameScore(mateo, { firstName: 'Mateo', lastName: 'Rivera-Lopez' })).toBeCloseTo(0.8, 5)
  })

  it('adds 0.1 when the last names match exactly', () => {
    const withLast = nameScore({ firstName: 'Jon', lastName: 'Smith' }, { firstName: 'Jonathan', lastName: 'Smith' })
    const withoutLast = dice('Jon Smith', 'Jonathan Smith')
    expect(withLast).toBeCloseTo(withoutLast + 0.1, 5)
  })

  it('caps at 1', () => {
    expect(nameScore(mateo, { firstName: 'Mateo', lastName: 'Rivera' })).toBe(1)
  })

  it('ranks the closer candidate higher', () => {
    const near = nameScore(mateo, { firstName: 'Mateo', lastName: 'Riveras' })
    const far = nameScore(mateo, { firstName: 'Olivia', lastName: 'Kim' })
    expect(near).toBeGreaterThan(far)
    expect(far).toBeLessThan(SUGGEST_FLOOR)
  })

  it('keeps a floor of 0.6 and a margin of 0.05', () => {
    expect(SUGGEST_FLOOR).toBe(0.6)
    expect(SUGGEST_MARGIN).toBe(0.05)
  })

  it('reads a middle name, an initial, accents, hyphens and a nickname as the same name, and nothing else', () => {
    const rivera = { firstName: 'Mateo', lastName: 'Rivera' }
    const cases: [{ firstName: string; lastName: string }, { firstName: string; lastName: string }, boolean][] = [
      [{ firstName: 'Mateo Luis', lastName: 'Rivera' }, rivera, true],
      [{ firstName: 'Mateo L.', lastName: 'Rivera' }, rivera, true],
      [{ firstName: 'José', lastName: 'Núñez-Ortiz' }, { firstName: 'Jose', lastName: 'Nunez Ortiz' }, true],
      [{ firstName: 'Mary-Kate', lastName: 'Olsen' }, { firstName: 'Mary Kate', lastName: 'Olsen' }, true],
      [{ firstName: 'Alex', lastName: 'Reyes' }, { firstName: 'Alexander', lastName: 'Reyes' }, true],
      [{ firstName: 'Zach', lastName: 'Reyes' }, { firstName: 'Zachary', lastName: 'Reyes' }, true],
      [rivera, { firstName: 'Mateo', lastName: 'Rivera-Lopez' }, false],
      [rivera, { firstName: 'Marco', lastName: 'Rivera' }, false],
    ]
    for (const [a, b, same] of cases) expect(exactName(a, b), `${a.firstName} ${a.lastName} / ${b.firstName} ${b.lastName}`).toBe(same)
  })
})
