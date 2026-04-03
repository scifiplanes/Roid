import { describe, expect, it } from 'vitest'
import { packVoxelKey } from './spatialKey'
import { raycastFirstOccupiedCellIndex, raycastOccupiedCellIndicesAlongRay } from './voxelGridRaycast'

describe('voxelGridRaycast', () => {
  const gridSize = 5
  const voxelSize = 1
  /** Three collinear cells along +Z through center column. */
  function threeAlongZPosMap(): Map<number, number> {
    const m = new Map<number, number>()
    m.set(packVoxelKey(2, 2, 0, gridSize), 100)
    m.set(packVoxelKey(2, 2, 1, gridSize), 101)
    m.set(packVoxelKey(2, 2, 2, gridSize), 102)
    return m
  }

  it('raycastFirstOccupiedCellIndex matches first of multi-raycast', () => {
    const posMap = threeAlongZPosMap()
    const origin = { x: 0, y: 0, z: -10 }
    const dir = { x: 0, y: 0, z: 1 }
    const first = raycastFirstOccupiedCellIndex(origin, dir, voxelSize, gridSize, posMap)
    const multi = raycastOccupiedCellIndicesAlongRay(origin, dir, voxelSize, gridSize, posMap, 3)
    expect(first).toBe(100)
    expect(multi).toEqual([100, 101, 102])
  })

  it('raycastOccupiedCellIndicesAlongRay respects maxCells', () => {
    const posMap = threeAlongZPosMap()
    const origin = { x: 0, y: 0, z: -10 }
    const dir = { x: 0, y: 0, z: 1 }
    expect(raycastOccupiedCellIndicesAlongRay(origin, dir, voxelSize, gridSize, posMap, 2)).toEqual([
      100, 101,
    ])
    expect(raycastOccupiedCellIndicesAlongRay(origin, dir, voxelSize, gridSize, posMap, 0)).toEqual([])
  })
})
