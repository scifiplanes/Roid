import { describe, expect, it } from 'vitest'
import { packVoxelKey, unpackVoxelKey } from './spatialKey'

describe('packVoxelKey', () => {
  it('roundtrips for grid 33', () => {
    const g = 33
    for (const x of [0, 16, 32]) {
      for (const y of [0, 10, 32]) {
        for (const z of [0, 5, 32]) {
          const k = packVoxelKey(x, y, z, g)
          expect(unpackVoxelKey(k, g)).toEqual({ x, y, z })
        }
      }
    }
  })
})
