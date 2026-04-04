import type { VoxelCell } from './voxelState'
import { gameBalance } from './gameBalance'
import { trySpendEnergy } from './energyAndStructures'
import type { RefineryRecipeSelection } from './refineryRecipeUnlock'
import {
  addResourceYields,
  refinementYieldForParent,
  type ResourceId,
  type RootResourceId,
} from './resources'

/** True when this refinery voxel may process global root tallies this tick. */
export function isRefineryProcessing(cell: VoxelCell): boolean {
  return cell.kind === 'refinery' && cell.refineryDisabled !== true
}

const REFINERY_ROOTS_PER_SEC = 5.2

/** Same issue as hub: without accrual, high FPS + `max(perRoot, rate*dt)` ⇒ ~`perRoot * FPS` J/s. */
let refineryEnergyBudgetAcc = 0

export function resetRefineryEnergyBudget(): void {
  refineryEnergyBudgetAcc = 0
}

export interface StepRefineryProcessingResult {
  tallyChanged: boolean
}

export interface RefineryProcessingOptions {
  /** Global active recipe: only this root is consumed when stock allows; idle skips processing. */
  selectedRoot: RefineryRecipeSelection
  isRecipeUnlocked: (root: RootResourceId) => boolean
}

export function stepRefineryProcessing(
  dtSec: number,
  cells: VoxelCell[],
  tallies: Record<ResourceId, number>,
  energyState: { current: number },
  options: RefineryProcessingOptions,
): StepRefineryProcessingResult {
  if (dtSec <= 0) {
    return { tallyChanged: false }
  }

  const active = cells.filter(isRefineryProcessing)
  if (active.length === 0) {
    return { tallyChanged: false }
  }

  const { selectedRoot, isRecipeUnlocked } = options
  if (selectedRoot === 'idle') {
    return { tallyChanged: false }
  }
  if (!isRecipeUnlocked(selectedRoot)) {
    return { tallyChanged: false }
  }

  const attemptsPerRefinery = Math.min(
    64,
    Math.max(1, Math.ceil(dtSec * REFINERY_ROOTS_PER_SEC * gameBalance.refineryProcessMult)),
  )

  const perRoot = gameBalance.refineryEnergyPerRoot
  const maxRate =
    gameBalance.refineryMaxEnergySpendBasePerSec *
    gameBalance.refineryMaxProcessEnergySpendMult *
    active.length
  const allowanceThisTick = maxRate * dtSec
  const maxBank = maxRate * 5
  refineryEnergyBudgetAcc = Math.min(refineryEnergyBudgetAcc + allowanceThisTick, maxBank)

  let tallyChanged = false
  let backfillIceThisTick = 0
  const perRefineryIceCap =
    gameBalance.refineryIceBackfillPerSecPerRefinery * dtSec
  const globalIceCap =
    gameBalance.refineryIceBackfillMaxPerSecGlobal * dtSec

  for (const _ref of active) {
    for (let a = 0; a < attemptsPerRefinery; a++) {
      if (refineryEnergyBudgetAcc + 1e-9 < perRoot) break
      if (energyState.current < perRoot) break

      if ((tallies[selectedRoot] ?? 0) < 1) break

      const spent = trySpendEnergy(energyState, perRoot)
      if (spent < perRoot) break
      if ((tallies[selectedRoot] ?? 0) < 1) {
        energyState.current += spent
        break
      }
      tallies[selectedRoot] -= 1
      refineryEnergyBudgetAcc -= perRoot
      addResourceYields(tallies, refinementYieldForParent(selectedRoot))
      // Anti-softlock: allow a capped trickle of extra surface ice from any active refinery,
      // so running completely dry on ices recovers over time even if no fresh ice voxels remain.
      if (perRefineryIceCap > 0 && globalIceCap > 0 && backfillIceThisTick < globalIceCap) {
        const remainingGlobal = globalIceCap - backfillIceThisTick
        const add = Math.min(perRefineryIceCap, remainingGlobal)
        if (add > 0) {
          tallies.surfaceIces = (tallies.surfaceIces ?? 0) + add
          backfillIceThisTick += add
        }
      }
      tallyChanged = true
    }
  }

  return { tallyChanged }
}
