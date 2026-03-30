import type { VoxelPos } from '../scene/asteroid/generateAsteroidVoxels'
import { compositionToYields } from './compositionYields'
import type { GameBalance } from './gameBalance'
import type { ResourceId } from './resources'
import {
  RESOURCE_IDS_ORDERED,
  ROOT_RESOURCE_IDS,
  defaultUniformRootComposition,
} from './resources'
import type { RootResourceId } from './resources'
import type { VoxelCell } from './voxelState'
import type { VoxelKind } from './voxelKinds'

/** One spatial pile of dross (voxel-equivalent mass) left after removals. */
export interface DrossCluster {
  pos: VoxelPos
  /** Voxel-equivalent mass (same scale as one mining break ≈ 1). */
  mass: number
  kind: VoxelKind
  bulk: Record<RootResourceId, number>
}

export interface DrossState {
  clusters: DrossCluster[]
  /** Fractional resource accumulation before applying integer tallies. */
  yieldRemainder: Partial<Record<ResourceId, number>>
}

const MAX_CLUSTERS = 512

export function createDrossState(): DrossState {
  return { clusters: [], yieldRemainder: {} }
}

export function resetDrossState(state: DrossState): void {
  state.clusters.length = 0
  for (const id of RESOURCE_IDS_ORDERED) {
    delete state.yieldRemainder[id]
  }
}

function mergeBulk(
  a: Record<RootResourceId, number>,
  b: Record<RootResourceId, number>,
  wa: number,
  wb: number,
): Record<RootResourceId, number> {
  const w = wa + wb
  if (w <= 0) return { ...defaultUniformRootComposition() }
  const out = {} as Record<RootResourceId, number>
  for (const r of ROOT_RESOURCE_IDS) {
    out[r] = ((a[r] ?? 0) * wa + (b[r] ?? 0) * wb) / w
  }
  return out
}

function addDrossMassAtCell(state: DrossState, cell: VoxelCell, add: number): void {
  if (add <= 0) return
  const bulk = cell.bulkComposition ?? defaultUniformRootComposition()
  const key = `${cell.pos.x},${cell.pos.y},${cell.pos.z}`
  for (const c of state.clusters) {
    const k = `${c.pos.x},${c.pos.y},${c.pos.z}`
    if (k === key) {
      const newMass = c.mass + add
      c.bulk = mergeBulk(c.bulk, bulk, c.mass, add)
      c.mass = newMass
      c.kind = cell.kind
      return
    }
  }

  if (state.clusters.length >= MAX_CLUSTERS) {
    state.clusters.shift()
  }
  state.clusters.push({
    pos: { ...cell.pos },
    mass: add,
    kind: cell.kind,
    bulk: { ...bulk },
  })
}

/**
 * Called before a voxel is spliced out: adds dross mass at that cell (merged if already present).
 */
export function spawnDrossFromRemovedCell(
  state: DrossState,
  cell: VoxelCell,
  balance: GameBalance,
): void {
  const add = Math.max(0, balance.drossMassPerRemoval * balance.drossMassMult)
  addDrossMassAtCell(state, cell, add)
}

/**
 * Probabilistic replicator scrap: call from main after a successful spawn roll.
 */
export function spawnDrossReplicatorScrap(
  state: DrossState,
  cell: VoxelCell,
  balance: GameBalance,
): void {
  const add = Math.max(0, balance.drossMassPerReplicatorHp * balance.drossMassMult)
  addDrossMassAtCell(state, cell, add)
}

function flushRemainders(
  tallies: Record<ResourceId, number>,
  rem: Partial<Record<ResourceId, number>>,
): void {
  for (const id of RESOURCE_IDS_ORDERED) {
    let v = rem[id] ?? 0
    if (v <= 0) continue
    const w = Math.floor(v)
    if (w >= 1) {
      tallies[id] += w
      v -= w
      rem[id] = v > 1e-8 ? v : undefined
    }
  }
}

/**
 * Pulls dross into resources when ≥1 collector satellite. Returns whether tallies changed.
 */
export function stepDrossCollection(
  dtSec: number,
  state: DrossState,
  tallies: Record<ResourceId, number>,
  collectorCount: number,
  balance: GameBalance,
): boolean {
  if (dtSec <= 0 || collectorCount <= 0 || state.clusters.length === 0) return false

  let totalM = 0
  for (const c of state.clusters) totalM += c.mass
  if (totalM <= 1e-9) return false

  const maxDrain =
    balance.drossCollectionRatePerSatellitePerSec *
    balance.drossCollectionMult *
    collectorCount *
    dtSec
  const drain = Math.min(totalM, maxDrain)
  if (drain <= 0) return false

  const rem = state.yieldRemainder
  let didYield = false

  for (const c of state.clusters) {
    if (c.mass <= 0) continue
    const take = drain * (c.mass / totalM)
    if (take <= 0) continue
    c.mass -= take
    const y = compositionToYields(c.kind, c.bulk)
    for (const id of ROOT_RESOURCE_IDS) {
      const yi = y[id]
      if (yi === undefined || yi <= 0) continue
      rem[id] = (rem[id] ?? 0) + yi * take
      didYield = true
    }
  }

  flushRemainders(tallies, rem)

  for (let i = state.clusters.length - 1; i >= 0; i--) {
    if (state.clusters[i]!.mass <= 1e-6) state.clusters.splice(i, 1)
  }

  return didYield
}

export function totalDrossMass(state: DrossState): number {
  let s = 0
  for (const c of state.clusters) s += c.mass
  return s
}
