import type { VoxelCell } from './voxelState'
import { gameBalance } from './gameBalance'
import {
  addRootTalliesFromPmComposition,
  defaultUniformRootComposition,
  type ResourceId,
  type RootResourceId,
} from './resources'
import { takeOneProcessedMatterUnit } from './localStores'

/**
 * Runs after {@link stepHubs} on the same tick so hubs consume PM first; cargo drains remaining PM.
 * Fractional matter units accumulate across frames when rate &lt; 1/s.
 */
let drainAcc = 0

export interface StepCargoDronesResult {
  meshDirty: boolean
  tallyChanged: boolean
}

export interface StepCargoDronesOptions {
  nowMs: number
  onRootTalliesFromPm: (cell: VoxelCell, credited: Partial<Record<RootResourceId, number>>) => void
  onProcessedMatterUnitTaken: (cell: VoxelCell) => void
}

function isPmEligibleForCargoPull(cell: VoxelCell, nowMs: number): boolean {
  if (cell.kind !== 'processedMatter') return false
  if ((cell.processedMatterUnits ?? 0) < 1) return false
  const start = cell.lifterChargeStartMs
  if (start != null && nowMs - start < gameBalance.lifterChargeMs) return false
  return true
}

function findNextPmCell(cells: VoxelCell[], nowMs: number): VoxelCell | null {
  for (const cell of cells) {
    if (isPmEligibleForCargoPull(cell, nowMs)) return cell
  }
  return null
}

const MAX_UNITS_PER_TICK = 48

export function stepCargoDrones(
  dtSec: number,
  cells: VoxelCell[],
  tallies: Record<ResourceId, number>,
  cargoDroneSatelliteCount: number,
  options: StepCargoDronesOptions,
): StepCargoDronesResult {
  if (dtSec <= 0 || cargoDroneSatelliteCount <= 0 || cells.length === 0) {
    return { meshDirty: false, tallyChanged: false }
  }

  const rate =
    gameBalance.cargoDroneMatterUnitsPerSecPerSat *
    cargoDroneSatelliteCount *
    gameBalance.cargoDronePullMult
  drainAcc += rate * dtSec

  let meshDirty = false
  let tallyChanged = false
  let safety = 0

  while (drainAcc >= 1 && safety < MAX_UNITS_PER_TICK) {
    safety++
    const cell = findNextPmCell(cells, options.nowMs)
    if (cell === null) {
      drainAcc = 0
      break
    }
    if (!takeOneProcessedMatterUnit(cell)) break
    drainAcc -= 1
    const comp = cell.processedMatterRootComposition ?? defaultUniformRootComposition()
    const credited: Partial<Record<RootResourceId, number>> = {}
    addRootTalliesFromPmComposition(tallies, comp, credited)
    options.onRootTalliesFromPm(cell, credited)
    tallyChanged = true
    options.onProcessedMatterUnitTaken(cell)
    if (cell.kind === 'processedMatter' && (cell.processedMatterUnits ?? 0) <= 0) {
      const i = cells.indexOf(cell)
      if (i >= 0) cells.splice(i, 1)
      meshDirty = true
    }
  }

  return { meshDirty, tallyChanged }
}
