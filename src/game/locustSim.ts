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

function canLocustConsume(cell: VoxelCell): boolean {
  if (cell.locustActive) return false
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

function advanceFrontFromLocustCell(
  origin: VoxelCell,
  index: Map<string, VoxelCell>,
  newlyClaimed: VoxelCell[],
  conversionsLeft: { value: number },
): boolean {
  if (conversionsLeft.value <= 0) return false
  const { x, y, z } = origin.pos
  let claimedAny = false
  for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
    if (conversionsLeft.value <= 0) break
    const key = posKey({ x: x + dx, y: y + dy, z: z + dz })
    const n = index.get(key)
    if (!n || !canLocustConsume(n)) continue
    n.locustActive = true
    n.locustJustClaimed = true
    newlyClaimed.push(n)
    conversionsLeft.value -= 1
    claimedAny = true
  }
  return claimedAny
}

export function spawnLocustAt(cell: VoxelCell): void {
  if (cell.locustActive) return
  cell.locustActive = true
  cell.locustJustClaimed = true
}

export interface StepLocustOptions {
  drossState: DrossState
  balance: GameBalance
  debrisState?: DebrisState
  nowMs?: number
  gridSize?: number
  voxelSize?: number
}

export function stepLocust(cells: VoxelCell[], options: StepLocustOptions): boolean {
  const { drossState, balance, debrisState, nowMs, gridSize, voxelSize } = options
  if (!balance.locustEnabled) return false
  if (cells.length === 0) return false

  const budget = Math.max(0, balance.locustMaxConversionsPerTick)
  if (budget <= 0) return false
  const whole = Math.floor(budget)
  const frac = budget - whole
  let maxConversions = whole
  if (Math.random() < frac) maxConversions += 1

  const frontier: VoxelCell[] = []
  for (const cell of cells) {
    if (cell.locustActive) {
      frontier.push(cell)
    }
  }
  if (frontier.length === 0) return false

  const index = buildPosIndex(cells)
  const newlyClaimed: VoxelCell[] = []
  const toRemove = new Set<VoxelCell>()
  const conversionsLeft = { value: maxConversions }

  for (const cell of frontier) {
    if (conversionsLeft.value <= 0) break
    const advanced = advanceFrontFromLocustCell(cell, index, newlyClaimed, conversionsLeft)
    if (!advanced) {
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
            lifetimeMs: {
              min: balance.debrisLifetimeMinSec * 1000,
              max: balance.debrisLifetimeMaxSec * 1000,
            },
            speedPerSec: { min: balance.debrisSpeedMin, max: balance.debrisSpeedMax },
            rewardBaseUnits: 0.25,
            bonusUnits: 1,
            bonusChance: 0.08,
          },
        )
      }
      toRemove.add(cell)
    }
    if (conversionsLeft.value <= 0) break
  }

  if (toRemove.size > 0) {
    for (let i = cells.length - 1; i >= 0; i--) {
      const c = cells[i]!
      if (toRemove.has(c)) {
        cells.splice(i, 1)
      }
    }
  }

  let anyChanged = newlyClaimed.length > 0 || toRemove.size > 0

  if (anyChanged) {
    for (const cell of cells) {
      if (cell.locustJustClaimed) {
        cell.locustJustClaimed = false
      }
    }
  }

  return anyChanged
}

