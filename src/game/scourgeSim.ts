import type { VoxelPos } from '../scene/asteroid/generateAsteroidVoxels'
import type { DrossState } from './drossSim'
import { spawnDrossFromRemovedCell } from './drossSim'
import type { DebrisState } from './debrisSim'
import { spawnDebrisFromRemovedCell as spawnDebrisShardFromRemovedCell } from './debrisSim'
import type { GameBalance } from './gameBalance'
import type { VoxelCell } from './voxelState'

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

function canScourgeConsume(cell: VoxelCell): boolean {
  if (cell.scourgeActive) return false
  if (cell.kind === 'replicator') return false
  if (cell.kind === 'reactor') return false
  if (cell.kind === 'battery') return false
  if (cell.kind === 'hub') return false
  if (cell.kind === 'refinery') return false
  if (cell.kind === 'depthScanner') return false
  if (cell.kind === 'computronium') return false
  if (cell.kind === 'miningDrone') return false
  if (cell.kind === 'processedMatter') return false
  if (cell.replicatorEating) return false
  return true
}

function advanceFrontFromCell(
  origin: VoxelCell,
  index: Map<string, VoxelCell>,
  newlyClaimed: VoxelCell[],
  conversionsLeft: { value: number },
): boolean {
  if (conversionsLeft.value <= 0) return false
  const { x, y, z } = origin.pos
  for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
    if (conversionsLeft.value <= 0) break
    const key = posKey({ x: x + dx, y: y + dy, z: z + dz })
    const n = index.get(key)
    if (!n || !canScourgeConsume(n)) continue
    n.scourgeActive = true
    n.scourgeJustClaimed = true

    newlyClaimed.push(n)
    conversionsLeft.value -= 1
    // Advance into a single neighbor per cell to keep a thin front.
    return true
  }
  return false
}

export function spawnScourgeAt(cell: VoxelCell): void {
  if (cell.scourgeActive) return
  cell.scourgeActive = true
  cell.scourgeJustClaimed = true
}

export interface StepScourgeOptions {
  drossState: DrossState
  balance: GameBalance
  debrisState?: DebrisState
  nowMs?: number
  gridSize?: number
  voxelSize?: number
}

export interface StepScourgeResult {
  changed: boolean
  /** Number of rock voxels destroyed by Scourge this step (for audio ticks). */
  consumeTicks: number
}

export function stepScourge(cells: VoxelCell[], options: StepScourgeOptions): StepScourgeResult {
  const { drossState, balance, debrisState, nowMs, gridSize, voxelSize } = options
  if (!balance.scourgeEnabled || cells.length === 0) {
    return { changed: false, consumeTicks: 0 }
  }

  const budget = Math.max(0, balance.scourgeMaxConversionsPerTick)
  if (budget <= 0) {
    return { changed: false, consumeTicks: 0 }
  }
  const whole = Math.floor(budget)
  const frac = budget - whole
  let maxConversions = whole
  if (Math.random() < frac) maxConversions += 1

  const frontier: VoxelCell[] = []
  for (const cell of cells) {
    if (cell.scourgeActive) {
      frontier.push(cell)
    }
  }
  if (frontier.length === 0) {
    return { changed: false, consumeTicks: 0 }
  }

  const index = buildPosIndex(cells)
  const newlyClaimed: VoxelCell[] = []
  const toRemove = new Set<VoxelCell>()
  const conversionsLeft = { value: maxConversions }

  for (const cell of frontier) {
    if (conversionsLeft.value <= 0) break
    const advanced = advanceFrontFromCell(cell, index, newlyClaimed, conversionsLeft)
    if (advanced) {
      // Current front cell has finished consuming its voxel; convert it to dross and remove it.
      spawnDrossFromRemovedCell(drossState, cell, balance)
      if (debrisState && nowMs !== undefined && gridSize !== undefined && voxelSize !== undefined) {
        const center = (gridSize - 1) / 2
        const lp = {
          x: (cell.pos.x - center) * voxelSize,
          y: (cell.pos.y - center) * voxelSize,
          z: (cell.pos.z - center) * voxelSize,
        }
        spawnDebrisShardFromRemovedCell(
          debrisState,
          cell,
          lp,
          nowMs,
          {
            spawnChance: balance.debrisSpawnChance,
            lifetimeMs: { min: 2600, max: 4400 },
            speedPerSec: { min: 0.8, max: 1.8 },
            rewardBaseUnits: 0.3,
            bonusUnits: 1,
            bonusChance: 0.1,
          },
        )
      }
      toRemove.add(cell)
    }
    if (conversionsLeft.value <= 0) break
  }

  // Remove consumed frontier cells from the voxel list so only the advancing front is visible.
  if (toRemove.size > 0) {
    for (let i = cells.length - 1; i >= 0; i--) {
      const c = cells[i]!
      if (toRemove.has(c)) {
        cells.splice(i, 1)
      }
    }
  }

  const destroyedCount = toRemove.size
  let anyChanged = newlyClaimed.length > 0 || destroyedCount > 0

  if (anyChanged) {
    for (const cell of cells) {
      if (cell.scourgeJustClaimed) {
        cell.scourgeJustClaimed = false
      }
    }
  }

  return { changed: anyChanged, consumeTicks: destroyedCount }
}

