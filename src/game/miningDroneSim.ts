import type { VoxelPos } from '../scene/asteroid/generateAsteroidVoxels'
import {
  convertCellToProcessedMatterFromRockSnapshot,
  ROCK_LITHOLOGY_KINDS,
  type ConvertRockToPmOptions,
} from './convertRockToProcessedMatter'
import { clearReplicatorTransformState } from './energyAndStructures'
import type { GameBalance } from './gameBalance'
import { clearDepthRevealState, clearSurfaceScanTint } from './scanVisualization'
import { hpForVoxelKind, type VoxelCell } from './voxelState'

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

function posKey(p: VoxelPos): string {
  return `${p.x},${p.y},${p.z}`
}

function buildPosIndex(cells: VoxelCell[]): Map<string, VoxelCell> {
  const m = new Map<string, VoxelCell>()
  for (const c of cells) {
    m.set(posKey(c.pos), c)
  }
  return m
}

/**
 * Replaces cell contents with a fresh mining-drone voxel (placement or move target).
 */
export function initMiningDroneCell(cell: VoxelCell): void {
  cell.kind = 'miningDrone'
  cell.hpRemaining = hpForVoxelKind('miningDrone')
  cell.replicatorActive = false
  cell.replicatorEating = false
  cell.replicatorEatAccumulatorMs = 0
  cell.replicatorMsPerHp = undefined
  cell.replicatorStrainId = undefined
  cell.replicatorFeedingOther = undefined
  cell.replicatorBeingFed = undefined
  cell.replicatorFeedOtherAccumulatorMs = undefined
  cell.replicatorFeedOtherMsPerHp = undefined
  cell.passiveRemainder = undefined
  cell.storedResources = undefined
  cell.drossResources = undefined
  cell.seedRuntime = undefined
  cell.replicatorRecipeResourceId = undefined
  cell.bulkComposition = undefined
  cell.rareLodeStrength01 = undefined
  cell.processedMatterUnits = undefined
  cell.processedMatterRootComposition = undefined
  cell.hubDisabled = undefined
  cell.refineryDisabled = undefined
  cell.computroniumDisabled = undefined
  cell.explosiveFuseEndMs = undefined
  cell.lifterChargeStartMs = undefined
  cell.scourgeActive = undefined
  cell.scourgeJustClaimed = undefined
  cell.locustActive = undefined
  cell.locustJustClaimed = undefined
  clearReplicatorTransformState(cell)
  clearSurfaceScanTint(cell)
  clearDepthRevealState(cell)
}

export interface StepMiningDronesOptions extends ConvertRockToPmOptions {
  balance: GameBalance
}

export function stepMiningDrones(cells: VoxelCell[], options: StepMiningDronesOptions): boolean {
  const { balance, ...pmOptions } = options
  if (!balance.miningDroneEnabled || cells.length === 0) return false

  let maxMoves = Math.max(0, Math.floor(balance.miningDroneMaxMovesPerTick))
  if (maxMoves <= 0) return false

  const index = buildPosIndex(cells)
  const claimedTargets = new Set<string>()
  let changed = false

  for (const droneCell of cells) {
    if (droneCell.kind !== 'miningDrone') continue
    if (maxMoves <= 0) break

    const candidates: VoxelCell[] = []
    const { x, y, z } = droneCell.pos
    for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
      const key = posKey({ x: x + dx, y: y + dy, z: z + dz })
      const n = index.get(key)
      if (!n || !ROCK_LITHOLOGY_KINDS.has(n.kind)) continue
      if (claimedTargets.has(key)) continue
      candidates.push(n)
    }
    if (candidates.length === 0) continue

    const pick = candidates[Math.floor(Math.random() * candidates.length)]!
    const tKey = posKey(pick.pos)
    if (claimedTargets.has(tKey)) continue
    if (!ROCK_LITHOLOGY_KINDS.has(pick.kind)) continue

    claimedTargets.add(tKey)

    convertCellToProcessedMatterFromRockSnapshot(
      droneCell,
      {
        kind: pick.kind,
        bulkComposition: pick.bulkComposition,
        rareLodeStrength01: pick.rareLodeStrength01,
      },
      pmOptions,
    )

    initMiningDroneCell(pick)
    maxMoves -= 1
    changed = true
  }

  return changed
}
