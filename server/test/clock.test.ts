import { describe, it, expect } from 'vitest'
import { formatClock } from '../src/shared/clock.js'

describe('formatClock', () => {
  it('rounds up to the next whole second', () => {
    expect(formatClock(299_001)).toBe('5:00')
    expect(formatClock(59_999)).toBe('1:00')
    expect(formatClock(1)).toBe('0:01')
    expect(formatClock(0)).toBe('0:00')
  })
})
