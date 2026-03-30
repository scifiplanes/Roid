import type { VoxelCell } from './voxelState'
import { gameBalance } from './gameBalance'
import { trySpendEnergy } from './energyAndStructures'
import {
  addResourceYields,
  refinementYieldForParent,
  ROOT_RESOURCE_IDS,
  type ResourceId,
  type RootResourceId,
} from './resources'

/** True when this refinery voxel may process global root tallies this tick. */
export function isRefineryProcessing(cell: VoxelCell): boolean {
  return cell.kind === 'refinery' && cell.refineryDisabled !== true
}

const REFINERY_ENERGY_PER_ROOT = 0.32
const REFINERY_ROOTS_PER_SEC = 5.2
const REFINERY_MAX_ENERGY_SPEND_PER_SEC = 5

export interface StepRefineryProcessingResult {
  tallyChanged: boolean
}

export function stepRefineryProcessing(
  dtSec: number,
  cells: VoxelCell[],
  tallies: Record<ResourceId, number>,
  energyState: { current: number },
): StepRefineryProcessingResult {
  if (dtSec <= 0) {
    return { tallyChanged: false }
  }

  const active = cells.filter(isRefineryProcessing)
  if (active.length === 0) {
    return { tallyChanged: false }
  }

  const attemptsPerRefinery = Math.min(
    64,
    Math.max(1, Math.ceil(dtSec * REFINERY_ROOTS_PER_SEC * gameBalance.refineryProcessMult)),
  )

  const maxEnergyThisTick =
    REFINERY_MAX_ENERGY_SPEND_PER_SEC *
    dtSec *
    gameBalance.refineryMaxProcessEnergySpendMult *
    active.length
  let energySpent = 0
  let tallyChanged = false

  for (const _ref of active) {
    for (let a = 0; a < attemptsPerRefinery; a++) {
      if (energyState.current < REFINERY_ENERGY_PER_ROOT) break
      if (energySpent + REFINERY_ENERGY_PER_ROOT > maxEnergyThisTick) break

      let rid: RootResourceId | null = null
      for (const id of ROOT_RESOURCE_IDS) {
        if ((tallies[id] ?? 0) >= 1) {
          rid = id
          break
        }
      }
      if (rid === null) break

      const spent = trySpendEnergy(energyState, REFINERY_ENERGY_PER_ROOT)
      if (spent < REFINERY_ENERGY_PER_ROOT) break
      if ((tallies[rid] ?? 0) < 1) {
        energyState.current += spent
        break
      }
      tallies[rid] -= 1
      energySpent += spent
      addResourceYields(tallies, refinementYieldForParent(rid))
      tallyChanged = true
    }
  }

  return { tallyChanged }
}
