import type { VoxelPos } from '../scene/asteroid/generateAsteroidVoxels'
import type { VoxelCell } from './voxelState'
import { compositionToYields } from './compositionYields'
import { gameBalance } from './gameBalance'
import { addYieldsToCellStore } from './localStores'
import { defaultUniformRootComposition, type ResourceId, RESOURCE_IDS_ORDERED } from './resources'
import { clearDepthRevealState, clearSurfaceScanTint } from './scanVisualization'

/** Wall-clock ms between each HP lost while a replicator eats rock (before per-cell jitter). */
export const REPLICATOR_MS_PER_HP = 3200

/** Multiplier range for `replicatorMsPerHp` around `REPLICATOR_MS_PER_HP` (deterministic per voxel). */
const FEED_JITTER_MIN = 0.78
const FEED_JITTER_MAX = 1.24

function latticeHashJitter(ix: number, iy: number, iz: number): number {
  let n = ix * 374761393 + iy * 668265263 + iz * 1274126177 + 902110433
  n = (n ^ (n >>> 13)) * 1274126177
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function ensureReplicatorFeedJitter(cell: VoxelCell): void {
  if (cell.replicatorMsPerHp !== undefined) return
  const { x, y, z } = cell.pos
  const h = latticeHashJitter(x, y, z)
  cell.replicatorMsPerHp = REPLICATOR_MS_PER_HP * (FEED_JITTER_MIN + h * (FEED_JITTER_MAX - FEED_JITTER_MIN))
}

/** Passive resource trickle per mature replicator cell (per second, fractional parts accumulate). */
const PASSIVE_PER_SEC: Partial<Record<ResourceId, number>> = {
  regolithMass: 0.03,
  silicates: 0.015,
}

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

export function posKey(p: VoxelPos): string {
  return `${p.x},${p.y},${p.z}`
}

export function buildPosIndex(cells: VoxelCell[]): Map<string, VoxelCell> {
  const m = new Map<string, VoxelCell>()
  for (const c of cells) {
    m.set(posKey(c.pos), c)
  }
  return m
}

function ensurePassiveRemainder(cell: VoxelCell): Partial<Record<ResourceId, number>> {
  if (!cell.passiveRemainder) cell.passiveRemainder = {}
  return cell.passiveRemainder
}

export function resetReplicatorSimAccumulators(): void {
  /* Per-cell passive remainders are cleared with new voxel data on regenerate. */
}

function applyPassiveIncomePerCell(dtSec: number, cell: VoxelCell): boolean {
  if (cell.kind !== 'replicator' || dtSec <= 0) return false
  const rem = ensurePassiveRemainder(cell)
  let changed = false
  for (const id of RESOURCE_IDS_ORDERED) {
    const rate = PASSIVE_PER_SEC[id]
    if (rate === undefined || rate <= 0) continue
    rem[id] = (rem[id] ?? 0) + rate * gameBalance.passiveIncomeMult * dtSec
    const whole = Math.floor(rem[id] ?? 0)
    if (whole > 0) {
      addYieldsToCellStore(cell, { [id]: whole })
      rem[id] = (rem[id] ?? 0) - whole
      changed = true
    }
  }
  return changed
}

function canSpreadTo(cell: VoxelCell): boolean {
  if (
    cell.kind === 'replicator' ||
    cell.kind === 'reactor' ||
    cell.kind === 'battery' ||
    cell.kind === 'hub' ||
    cell.kind === 'refinery' ||
    cell.kind === 'depthScanner' ||
    cell.kind === 'computronium' ||
    cell.kind === 'processedMatter'
  )
    return false
  if (cell.replicatorEating) return false
  return true
}

function spreadFromCell(origin: VoxelCell, index: Map<string, VoxelCell>): void {
  const { x, y, z } = origin.pos
  for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
    const key = posKey({ x: x + dx, y: y + dy, z: z + dz })
    const n = index.get(key)
    if (!n || !canSpreadTo(n)) continue
    n.replicatorActive = true
    n.replicatorEating = true
    n.replicatorEatAccumulatorMs = 0
  }
}

function finishEating(cell: VoxelCell, index: Map<string, VoxelCell>): void {
  const rockKind = cell.kind
  const bulk = cell.bulkComposition ?? defaultUniformRootComposition()
  addYieldsToCellStore(cell, compositionToYields(rockKind, bulk))
  cell.kind = 'replicator'
  cell.hpRemaining = 0
  cell.bulkComposition = undefined
  clearSurfaceScanTint(cell)
  clearDepthRevealState(cell)
  cell.replicatorEating = false
  cell.replicatorEatAccumulatorMs = 0
  cell.replicatorMsPerHp = undefined
  cell.replicatorActive = true
  spreadFromCell(cell, index)
}

export interface StepReplicatorsResult {
  meshDirty: boolean
  tallyChanged: boolean
  /** HP steps consumed by replicators this frame (for subtle click SFX). */
  replicatorConsumeTicks: number
}

export interface StepReplicatorsOptions {
  /** Fires once each time a replicator consumes 1 HP of rock (cell still rock until `finishEating`). */
  onReplicatorRockHpConsumed?: (cell: VoxelCell) => void
}

/**
 * Advances replicator eating and passive income into per-cell stores. Mutates `cells`.
 */
export function stepReplicators(
  dtMs: number,
  cells: VoxelCell[],
  options?: StepReplicatorsOptions,
): StepReplicatorsResult {
  if (cells.length === 0 || dtMs <= 0) {
    return { meshDirty: false, tallyChanged: false, replicatorConsumeTicks: 0 }
  }

  const index = buildPosIndex(cells)
  let meshDirty = false
  let tallyChanged = false
  let replicatorConsumeTicks = 0

  for (const cell of cells) {
    if (applyPassiveIncomePerCell(dtMs / 1000, cell)) {
      tallyChanged = true
    }
  }

  for (const cell of cells) {
    if (!cell.replicatorEating || cell.kind === 'replicator') continue

    ensureReplicatorFeedJitter(cell)
    const baseMs = cell.replicatorMsPerHp ?? REPLICATOR_MS_PER_HP
    const speed = gameBalance.replicatorFeedSpeedMult
    const msPerHp = baseMs / Math.max(0.01, speed)

    let acc = (cell.replicatorEatAccumulatorMs ?? 0) + dtMs
    while (acc >= msPerHp && cell.hpRemaining > 0) {
      acc -= msPerHp
      cell.hpRemaining -= 1
      replicatorConsumeTicks += 1
      meshDirty = true
      options?.onReplicatorRockHpConsumed?.(cell)
      if (cell.hpRemaining <= 0) {
        finishEating(cell, index)
        tallyChanged = true
        meshDirty = true
        acc = 0
        break
      }
    }
    if (cell.replicatorEating) {
      cell.replicatorEatAccumulatorMs = acc
    }
  }

  return { meshDirty, tallyChanged, replicatorConsumeTicks }
}
