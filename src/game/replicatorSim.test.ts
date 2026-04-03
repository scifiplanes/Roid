import { describe, expect, it } from 'vitest'
import {
  buildPosIndex,
  getReplicatorSimHotListSizes,
  rebuildReplicatorSimHotLists,
  stepReplicators,
} from './replicatorSim'
import type { VoxelCell } from './voxelState'

const gridSize = 33

function cell(
  pos: { x: number; y: number; z: number },
  kind: VoxelCell['kind'],
  extra: Partial<VoxelCell> = {},
): VoxelCell {
  return {
    pos,
    kind,
    hpRemaining: extra.hpRemaining ?? 3,
    ...extra,
  } as VoxelCell
}

describe('rebuildReplicatorSimHotLists', () => {
  it('classifies mature replicators and eating rock cells', () => {
    const a = cell({ x: 5, y: 5, z: 5 }, 'replicator', { hpRemaining: 2 })
    const b = cell({ x: 6, y: 5, z: 5 }, 'silicateRock', {
      replicatorEating: true,
      hpRemaining: 4,
    })
    const c = cell({ x: 7, y: 5, z: 5 }, 'regolith', { hpRemaining: 1 })
    rebuildReplicatorSimHotLists([a, b, c])
    const s = getReplicatorSimHotListSizes()
    expect(s.mature).toBe(1)
    expect(s.eatingRock).toBe(1)
  })
})

describe('stepReplicators', () => {
  it('passive income runs only for cells in the mature hot list', () => {
    const mature = cell({ x: 10, y: 10, z: 10 }, 'replicator', { hpRemaining: 1 })
    rebuildReplicatorSimHotLists([mature])
    const index = buildPosIndex([mature], gridSize)
    // Passive rates are fractional per second; need enough dt to produce ≥1 whole store unit.
    const r = stepReplicators(60_000, [mature], { neighborIndex: index, gridSize })
    expect(r.tallyChanged).toBe(true)
  })

  it('HP-only rock consumption requests instance colors only, not full mesh rebuild', () => {
    const eating = cell({ x: 11, y: 11, z: 11 }, 'regolith', {
      replicatorEating: true,
      hpRemaining: 10,
    })
    rebuildReplicatorSimHotLists([eating])
    const index = buildPosIndex([eating], gridSize)
    // Above max per-HP interval (~3200 * 1.24) so at least one tick applies.
    const r = stepReplicators(5000, [eating], { neighborIndex: index, gridSize })
    expect(r.replicatorConsumeTicks).toBeGreaterThanOrEqual(1)
    expect(r.meshDirty).toBe(false)
    expect(r.eatingVisualDirty).toBe(true)
  })

  it('finishEating sets structural meshDirty when rock becomes replicator', () => {
    const eating = cell({ x: 12, y: 12, z: 12 }, 'regolith', {
      replicatorEating: true,
      hpRemaining: 1,
    })
    rebuildReplicatorSimHotLists([eating])
    const index = buildPosIndex([eating], gridSize)
    const r = stepReplicators(5000, [eating], { neighborIndex: index, gridSize })
    expect(r.meshDirty).toBe(true)
    expect(eating.kind).toBe('replicator')
  })

  it('spread inherits strain + seed program to neighbor eating rock', () => {
    const neighbor = cell({ x: 14, y: 12, z: 12 }, 'regolith', { hpRemaining: 4 })
    const eating = cell({ x: 13, y: 12, z: 12 }, 'regolith', {
      replicatorEating: true,
      hpRemaining: 1,
      replicatorStrainId: 'TestStrain',
      seedRuntime: {
        seedTypeId: 'basicSeed',
        lifetimeTotalSec: 120,
        lifetimeRemainingSec: 120,
        activeRecipes: ['metals'],
        slots: [{ kind: 'recipe', resourceId: 'metals', durationSec: 10 }],
        currentSlotIndex: 0,
        currentSlotRemainingSec: 10,
      },
      replicatorRecipeResourceId: 'metals',
    })
    const cells = [eating, neighbor]
    rebuildReplicatorSimHotLists(cells)
    const index = buildPosIndex(cells, gridSize)
    stepReplicators(5000, cells, { neighborIndex: index, gridSize })
    expect(eating.kind).toBe('replicator')
    expect(neighbor.replicatorEating).toBe(true)
    expect(neighbor.replicatorStrainId).toBe('TestStrain')
    expect(neighbor.seedRuntime?.seedTypeId).toBe('basicSeed')
    expect(neighbor.seedRuntime?.lifetimeRemainingSec).toBe(120)
    expect(neighbor.seedRuntime?.currentSlotIndex).toBe(0)
    expect(neighbor.replicatorRecipeResourceId).toBe('metals')
  })

  it('loops the slot program when seed lifetime outlasts one full pass (min lifetime vs short stack)', () => {
    const mature = cell({ x: 20, y: 20, z: 20 }, 'replicator', {
      hpRemaining: 1,
      seedRuntime: {
        seedTypeId: 'basicSeed',
        lifetimeTotalSec: 30,
        lifetimeRemainingSec: 30,
        activeRecipes: ['metals', 'silicates'],
        slots: [
          { kind: 'recipe', resourceId: 'metals', durationSec: 5 },
          { kind: 'recipe', resourceId: 'silicates', durationSec: 5 },
        ],
        currentSlotIndex: 0,
        currentSlotRemainingSec: 5,
      },
    })
    rebuildReplicatorSimHotLists([mature])
    const index = buildPosIndex([mature], gridSize)
    stepReplicators(10_000, [mature], { neighborIndex: index, gridSize })
    expect(mature.seedRuntime?.currentSlotIndex).toBe(0)
    expect(mature.seedRuntime?.lifetimeRemainingSec).toBeCloseTo(20, 5)
  })

  it('die slot terminates the seed (no loop after die)', () => {
    const mature = cell({ x: 21, y: 21, z: 21 }, 'replicator', {
      hpRemaining: 1,
      seedRuntime: {
        seedTypeId: 'basicSeed',
        lifetimeTotalSec: 60,
        lifetimeRemainingSec: 60,
        activeRecipes: ['metals'],
        slots: [
          { kind: 'recipe', resourceId: 'metals', durationSec: 1 },
          { kind: 'die', durationSec: 1 },
        ],
        currentSlotIndex: 0,
        currentSlotRemainingSec: 1,
      },
    })
    rebuildReplicatorSimHotLists([mature])
    const index = buildPosIndex([mature], gridSize)
    stepReplicators(3000, [mature], { neighborIndex: index, gridSize })
    expect(mature.seedRuntime?.lifetimeRemainingSec).toBe(0)
  })
})
