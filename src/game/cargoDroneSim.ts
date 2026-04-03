import type { VoxelPos } from '../scene/asteroid/generateAsteroidVoxels'
import type { VoxelCell } from './voxelState'
import { gameBalance } from './gameBalance'
import {
  addRootTalliesFromPmComposition,
  defaultUniformRootComposition,
  ROOT_RESOURCE_IDS,
  type ResourceId,
  type RootResourceId,
} from './resources'
import { takeOneProcessedMatterUnit } from './localStores'
import { packVoxelKey } from './spatialKey'

/**
 * Runs after {@link stepHubs} on the same tick so hubs consume PM first; cargo drains remaining PM.
 * Fractional matter units accumulate across frames when rate &lt; 1/s.
 */
let drainAcc = 0

/** Roots credited from PM this `stepCargoDrones` call (HUD float anchoring at the PM cell). */
export interface CargoRootGainBatch {
  cellPos: VoxelPos
  delta: Partial<Record<RootResourceId, number>>
}

export interface StepCargoDronesResult {
  meshDirty: boolean
  tallyChanged: boolean
  cargoRootGains: CargoRootGainBatch[]
}

export interface StepCargoDronesOptions {
  nowMs: number
  /** Grid edge length for packed keys (default 33). */
  gridSize?: number
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
    return { meshDirty: false, tallyChanged: false, cargoRootGains: [] }
  }

  const gridSize = options.gridSize ?? 33
  const gainByKey = new Map<
    number,
    { cellPos: VoxelPos; delta: Partial<Record<RootResourceId, number>> }
  >()

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
    const ck = packVoxelKey(cell.pos.x, cell.pos.y, cell.pos.z, gridSize)
    let g = gainByKey.get(ck)
    if (!g) {
      g = {
        cellPos: { x: cell.pos.x, y: cell.pos.y, z: cell.pos.z },
        delta: {},
      }
      gainByKey.set(ck, g)
    }
    for (const id of ROOT_RESOURCE_IDS) {
      const v = credited[id]
      if (v === undefined || v <= 0) continue
      g.delta[id] = (g.delta[id] ?? 0) + v
    }
    tallyChanged = true
    options.onProcessedMatterUnitTaken(cell)
    if (cell.kind === 'processedMatter' && (cell.processedMatterUnits ?? 0) <= 0) {
      const i = cells.indexOf(cell)
      if (i >= 0) cells.splice(i, 1)
      meshDirty = true
    }
  }

  const cargoRootGains: CargoRootGainBatch[] = []
  for (const v of gainByKey.values()) {
    let nonempty = false
    for (const id of ROOT_RESOURCE_IDS) {
      if ((v.delta[id] ?? 0) > 0) {
        nonempty = true
        break
      }
    }
    if (!nonempty) continue
    cargoRootGains.push({
      cellPos: { x: v.cellPos.x, y: v.cellPos.y, z: v.cellPos.z },
      delta: { ...v.delta },
    })
  }

  return { meshDirty, tallyChanged, cargoRootGains }
}
