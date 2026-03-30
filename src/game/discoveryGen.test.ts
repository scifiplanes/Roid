import { describe, expect, it } from 'vitest'
import { gameBalance } from './gameBalance'
import { isDiscoverySite, tryDiscoveryClaim } from './discoveryGen'

function findAnyDiscoverySite(
  seed: number,
  balance: typeof gameBalance,
  densityScale: number,
): { x: number; y: number; z: number } | null {
  for (let x = 0; x < 24; x++) {
    for (let y = 0; y < 24; y++) {
      for (let z = 0; z < 24; z++) {
        if (isDiscoverySite(seed, { x, y, z }, balance, densityScale)) {
          return { x, y, z }
        }
      }
    }
  }
  return null
}

describe('tryDiscoveryClaim', () => {
  it('returns none when not a discovery site', () => {
    const consumed = new Set<string>()
    const counter = { current: 0 }
    let pos: { x: number; y: number; z: number } | null = null
    for (let x = 0; x < 32 && !pos; x++) {
      for (let y = 0; y < 32 && !pos; y++) {
        for (let z = 0; z < 32 && !pos; z++) {
          if (!isDiscoverySite(42, { x, y, z }, gameBalance, 1)) {
            pos = { x, y, z }
          }
        }
      }
    }
    expect(pos).not.toBeNull()
    const r = tryDiscoveryClaim(42, pos!, gameBalance, consumed, counter, 1)
    expect(r.kind).toBe('none')
    expect(consumed.size).toBe(0)
  })

  it('returns offer with positive archetype weights', () => {
    const site = findAnyDiscoverySite(42, gameBalance, 1)
    expect(site).not.toBeNull()
    const consumed = new Set<string>()
    const counter = { current: 0 }
    const r = tryDiscoveryClaim(42, site!, gameBalance, consumed, counter, 1)
    expect(r.kind).toBe('offer')
    if (r.kind === 'offer') {
      expect(r.offer.id.length).toBeGreaterThan(0)
      expect(r.offer.foundAt).toEqual(site)
    }
    expect(consumed.size).toBe(1)
  })

  it('returns falseSignal when all archetype weights are zero', () => {
    const zeroWeights = {
      ...gameBalance,
      discoveryWeightWindfall: 0,
      discoveryWeightDrain: 0,
      discoveryWeightLore: 0,
      discoveryWeightResearchBypass: 0,
    }
    const site = findAnyDiscoverySite(999, zeroWeights, 1)
    expect(site).not.toBeNull()
    const consumed = new Set<string>()
    const counter = { current: 0 }
    const r = tryDiscoveryClaim(999, site!, zeroWeights, consumed, counter, 1)
    expect(r.kind).toBe('falseSignal')
    expect(consumed.size).toBe(1)
  })

  it('returns none if position was already consumed', () => {
    const site = findAnyDiscoverySite(7, gameBalance, 1)
    expect(site).not.toBeNull()
    const consumed = new Set<string>()
    const counter = { current: 0 }
    const first = tryDiscoveryClaim(7, site!, gameBalance, consumed, counter, 1)
    expect(first.kind).toBe('offer')
    const second = tryDiscoveryClaim(7, site!, gameBalance, consumed, counter, 1)
    expect(second.kind).toBe('none')
  })
})
