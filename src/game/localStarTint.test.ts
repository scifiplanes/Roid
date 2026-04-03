import { describe, expect, it } from 'vitest'

import { hue01ExcludingHueBand } from './localStarTint'
import { createDefaultLocalStarTintDebug, excludedHueBandInterval } from './localStarTintDebug'

describe('hue01ExcludingHueBand', () => {
  it('never lands in the excluded band', () => {
    const g0 = 0.22
    const g1 = 0.47
    for (let i = 0; i < 500; i++) {
      const u = i / 500
      const h = hue01ExcludingHueBand(u, g0, g1)
      expect(h < g0 || h >= g1).toBe(true)
    }
  })

  it('covers both sides of the gap', () => {
    const g0 = 0.22
    const g1 = 0.47
    const samples = [0, 0.25, 0.5, 0.75, 0.99].map((u) => hue01ExcludingHueBand(u, g0, g1))
    expect(Math.min(...samples)).toBeLessThan(g0)
    expect(Math.max(...samples)).toBeGreaterThanOrEqual(g1)
  })

  it('is identity when band is degenerate', () => {
    expect(hue01ExcludingHueBand(0.37, 0.4, 0.3)).toBe(0.37)
  })
})

describe('excludedHueBandInterval', () => {
  it('matches legacy green band defaults', () => {
    const d = createDefaultLocalStarTintDebug()
    const b = excludedHueBandInterval(d)
    expect(b).not.toBeNull()
    expect(b!.g0).toBeCloseTo(0.22, 5)
    expect(b!.g1).toBeCloseTo(0.47, 5)
  })

  it('returns null when width is 0', () => {
    const d = createDefaultLocalStarTintDebug()
    d.excludedHueBandWidth = 0
    expect(excludedHueBandInterval(d)).toBeNull()
  })
})
