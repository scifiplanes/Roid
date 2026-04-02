import type { VoxelPos } from '../scene/asteroid/generateAsteroidVoxels'
import {
  convertCellToProcessedMatterFromRockSnapshot,
  ROCK_LITHOLOGY_KINDS,
  type ConvertRockToPmOptions,
} from './convertRockToProcessedMatter'
import { clearReplicatorTransformState } from './energyAndStructures'
import type { GameBalance } from './gameBalance'
import { voxelHasCompositionIntel } from './inspectVoxel'
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

function manhattan(a: VoxelPos, b: VoxelPos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = arr[i]!
    arr[i] = arr[j]!
    arr[j] = t
  }
}

/** Rock cells at minimum Manhattan distance from `drone`, excluding `claimedTargets`. */
function pickNearestRockTeleportTarget(
  droneCell: VoxelCell,
  cells: VoxelCell[],
  claimedTargets: Set<string>,
): VoxelCell | null {
  let bestDist = Infinity
  const atBest: VoxelCell[] = []
  for (const c of cells) {
    if (!ROCK_LITHOLOGY_KINDS.has(c.kind)) continue
    const key = posKey(c.pos)
    if (claimedTargets.has(key)) continue
    const d = manhattan(droneCell.pos, c.pos)
    if (d < bestDist) {
      bestDist = d
      atBest.length = 0
      atBest.push(c)
    } else if (d === bestDist) {
      atBest.push(c)
    }
  }
  if (atBest.length === 0) return null
  return atBest[Math.floor(Math.random() * atBest.length)]!
}

function applyMiningDroneMove(
  droneCell: VoxelCell,
  pick: VoxelCell,
  pmOptions: ConvertRockToPmOptions,
): void {
  const legible = voxelHasCompositionIntel(pick)
  convertCellToProcessedMatterFromRockSnapshot(
    droneCell,
    legible
      ? {
          kind: pick.kind,
          bulkComposition: pick.bulkComposition,
          rareLodeStrength01: pick.rareLodeStrength01,
        }
      : {
          kind: pick.kind,
          bulkComposition: undefined,
          rareLodeStrength01: undefined,
        },
    legible ? pmOptions : { ...pmOptions, onDiscovery: () => {} },
  )
  initMiningDroneCell(pick)
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

  const claimedTargets = new Set<string>()
  let changed = false

  const drones = cells.filter((c) => c.kind === 'miningDrone')
  shuffleInPlace(drones)
  const index = buildPosIndex(cells)

  for (const droneCell of drones) {
    if (!cells.includes(droneCell) || droneCell.kind !== 'miningDrone') continue
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

    let pick: VoxelCell | null =
      candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)]! : null
    if (pick === null) {
      pick = pickNearestRockTeleportTarget(droneCell, cells, claimedTargets)
    }
    if (pick === null) continue

    const tKey = posKey(pick.pos)
    if (claimedTargets.has(tKey)) continue
    if (!ROCK_LITHOLOGY_KINDS.has(pick.kind)) continue

    claimedTargets.add(tKey)

    applyMiningDroneMove(droneCell, pick, pmOptions)
    maxMoves -= 1
    changed = true
  }

  return changed
}
