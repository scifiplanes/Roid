import { describe, expect, it } from 'vitest'
import { deriveAsteroidProfile, discoveryDensityScale } from './asteroidGenProfile'
import { generateAsteroidVoxels } from '../scene/asteroid/generateAsteroidVoxels'
import { enrichVoxelCells } from './voxelState'
import { isDiscoverySite } from './discoveryGen'
import { gameBalance } from './gameBalance'

describe('deriveAsteroidProfile', () => {
  it('is deterministic for the same seed', () => {
    const a = deriveAsteroidProfile(42)
    const b = deriveAsteroidProfile(42)
    expect(a.spectralClass).toBe(b.spectralClass)
    expect(a.regime).toBe(b.regime)
    expect(a.shape).toEqual(b.shape)
    expect(a.pickKind).toEqual(b.pickKind)
  })

  it('produces shape params in stable ranges', () => {
    for (const seed of [0, 1, 42, 999_999, -7]) {
      const p = deriveAsteroidProfile(seed)
      expect(p.shape.baseRadius).toBeGreaterThanOrEqual(8.5)
      expect(p.shape.baseRadius).toBeLessThanOrEqual(16)
      expect(p.shape.noiseAmplitude).toBeGreaterThanOrEqual(0.35)
      expect(p.shape.noiseScale).toBeGreaterThanOrEqual(0.055)
    }
  })
})

describe('discoveryDensityScale', () => {
  it('clamps to [0.85, 1.15]', () => {
    for (let s = 0; s < 200; s++) {
      const d = discoveryDensityScale(deriveAsteroidProfile(s))
      expect(d).toBeGreaterThanOrEqual(0.85)
      expect(d).toBeLessThanOrEqual(1.15)
    }
  })
})

describe('isDiscoverySite + profile scale', () => {
  it('accepts density scale without throwing', () => {
    const p = deriveAsteroidProfile(123)
    const scale = discoveryDensityScale(p)
    const pos = { x: 5, y: 5, z: 5 }
    const a = isDiscoverySite(123, pos, gameBalance, 1)
    const b = isDiscoverySite(123, pos, gameBalance, scale)
    expect(typeof a).toBe('boolean')
    expect(typeof b).toBe('boolean')
  })
})

describe('enrichVoxelCells + generation', () => {
  it('keeps voxel count above impact crater floor for typical seeds', () => {
    const gridSize = 33
    for (const seed of [42, 100, 777]) {
      const profile = deriveAsteroidProfile(seed)
      const positions = generateAsteroidVoxels({
        gridSize,
        seed,
        ...profile.shape,
      })
      expect(positions.length).toBeGreaterThan(400)
      const cells = enrichVoxelCells(positions, {
        seed,
        gridSize,
        baseRadius: profile.shape.baseRadius,
        noiseAmplitude: profile.shape.noiseAmplitude,
        profile,
      })
      expect(cells.length).toBe(positions.length)
    }
  })
})
