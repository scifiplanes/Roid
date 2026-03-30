import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import { deriveAsteroidProfile, discoveryDensityScale } from './asteroidGenProfile'
import { generateAsteroidVoxels } from '../scene/asteroid/generateAsteroidVoxels'
import { enrichVoxelCells } from './voxelState'
import { isDiscoverySite } from './discoveryGen'
import { gameBalance } from './gameBalance'
import { applyRareLodeEnrichment, morphologyWeights } from './rareLodeField'
import { defaultUniformRootComposition, ROOT_RESOURCE_IDS } from './resources'
import { densityToHeatmapRgb } from './scanVisualization'

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

describe('rare lode morphology + heatmap', () => {
  it('morphologyWeights sum to 1 for representative profiles', () => {
    for (let s = 0; s < 80; s++) {
      const w = morphologyWeights(deriveAsteroidProfile(s))
      const sum = w.pocket + w.vein + w.speckle
      expect(sum).toBeGreaterThan(0.999)
      expect(sum).toBeLessThan(1.001)
      expect(w.pocket).toBeGreaterThan(0)
      expect(w.vein).toBeGreaterThan(0)
      expect(w.speckle).toBeGreaterThan(0)
    }
  })

  it('applyRareLodeEnrichment returns normalized bulk', () => {
    const base = defaultUniformRootComposition()
    const pos = { x: 7, y: 8, z: 9 }
    for (const seed of [1, 42, 99]) {
      const profile = deriveAsteroidProfile(seed)
      const { bulk } = applyRareLodeEnrichment(seed, pos, base, profile)
      let s = 0
      for (const r of ROOT_RESOURCE_IDS) s += bulk[r] ?? 0
      expect(s).toBeGreaterThan(0.999)
      expect(s).toBeLessThan(1.001)
    }
  })

  it('densityToHeatmapRgb is cool at 0 and warm at 1', () => {
    const c0 = new Color()
    const c1 = new Color()
    densityToHeatmapRgb(0, c0)
    densityToHeatmapRgb(1, c1)
    expect(c0.b).toBeGreaterThan(c0.r)
    expect(c1.r).toBeGreaterThan(c1.b)
  })
})
