import { describe, expect, it } from 'vitest'
import { clampGameSpeedMult } from './gameSpeedDebug'

describe('clampGameSpeedMult', () => {
  it('defaults non-finite and non-positive to 1', () => {
    expect(clampGameSpeedMult(NaN)).toBe(1)
    expect(clampGameSpeedMult(Infinity)).toBe(1)
    expect(clampGameSpeedMult(-1)).toBe(1)
    expect(clampGameSpeedMult(0)).toBe(1)
  })

  it('clamps to 0.05…8', () => {
    expect(clampGameSpeedMult(0.01)).toBe(0.05)
    expect(clampGameSpeedMult(0.05)).toBe(0.05)
    expect(clampGameSpeedMult(1)).toBe(1)
    expect(clampGameSpeedMult(10)).toBe(8)
  })
})
