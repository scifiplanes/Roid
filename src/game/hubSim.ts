import type { VoxelPos } from '../scene/asteroid/generateAsteroidVoxels'
import type { VoxelCell } from './voxelState'
import { gameBalance } from './gameBalance'
import { trySpendEnergy } from './energyAndStructures'
import {
  cellHasRefinableStock,
  takeOneProcessedMatterUnit,
  takeOneResource,
  totalStoredResourceUnits,
} from './localStores'
import { buildPosIndex, type ReplicatorNeighborIndex } from './replicatorSim'
import { packVoxelKey } from './spatialKey'
import {
  addRootTalliesFromPmComposition,
  defaultUniformRootComposition,
  ROOT_RESOURCE_IDS,
  type ResourceId,
  type RootResourceId,
} from './resources'

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

/** True when this hub voxel is allowed to run pull logic this tick. */
export function isHubProcessing(cell: VoxelCell): boolean {
  return cell.kind === 'hub' && cell.hubDisabled !== true
}

/** Graph edges for hub pull: goo network + processed matter (includes idle hubs / refineries). */
export function isHubTransitCell(cell: VoxelCell): boolean {
  if (cell.kind === 'processedMatter') return true
  if (
    cell.kind === 'replicator' ||
    cell.kind === 'reactor' ||
    cell.kind === 'battery' ||
    cell.kind === 'hub' ||
    cell.kind === 'refinery' ||
    cell.kind === 'depthScanner' ||
    cell.kind === 'computronium'
  )
    return true
  if (cell.replicatorEating === true) return true
  return false
}

const HUB_DISTANCE_LAMBDA = 0.42
const HUB_ENERGY_PER_UNIT = 0.32
const HUB_UNITS_PER_SEC = 5.2

/** Max energy all hubs may spend per second (before `hubMaxEnergySpendMult`). */
const HUB_MAX_ENERGY_SPEND_PER_SEC = 5

function buildDistanceMap(
  start: VoxelPos,
  index: ReplicatorNeighborIndex,
  gridSize: number,
): Map<number, number> {
  const dist = new Map<number, number>()
  const q: VoxelPos[] = []
  const startK = packVoxelKey(start.x, start.y, start.z, gridSize)
  dist.set(startK, 0)
  q.push(start)
  while (q.length > 0) {
    const p = q.shift()!
    const d = dist.get(packVoxelKey(p.x, p.y, p.z, gridSize))!
    for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
      const np = { x: p.x + dx, y: p.y + dy, z: p.z + dz }
      const nk = packVoxelKey(np.x, np.y, np.z, gridSize)
      if (dist.has(nk)) continue
      const nc = index.get(nk)
      if (!nc || !isHubTransitCell(nc)) continue
      dist.set(nk, d + 1)
      q.push(np)
    }
  }
  return dist
}

function scoreForPull(cell: VoxelCell, dist: number): number {
  const u = totalStoredResourceUnits(cell)
  if (u <= 0) return 0
  return u / (1 + HUB_DISTANCE_LAMBDA * dist)
}

/** Roots credited to global tallies by a hub this `stepHubs` call (for HUD float anchoring). */
export interface HubRootGainBatch {
  hubPos: VoxelPos
  delta: Partial<Record<RootResourceId, number>>
}

export interface StepHubsResult {
  meshDirty: boolean
  tallyChanged: boolean
  /** True when a root unit was pulled from a mature replicator (local stock display). */
  replicatorStoreChanged: boolean
  /** Per-hub root credits this tick (empty when no pulls). */
  hubRootGains: HubRootGainBatch[]
}

export interface StepHubsOptions {
  /** Fires after one processed-matter unit is successfully taken from a `processedMatter` cell. */
  onProcessedMatterUnitTaken?: (cell: VoxelCell) => void
  /**
   * Optional callback when root tallies are credited from processed matter.
   * Allows callers to maintain origin-tagged tallies alongside the primary map.
   */
  onRootTalliesFromPm?: (cell: VoxelCell, credited: Partial<Record<RootResourceId, number>>) => void
  /**
   * Shared position→cell map for this tick (same shape as `buildPosIndex`).
   * When omitted, a fresh index is built.
   */
  posIndex?: ReplicatorNeighborIndex
  /** Grid edge length for packed keys (default 33). */
  gridSize?: number
}

export function stepHubs(
  dtSec: number,
  cells: VoxelCell[],
  tallies: Record<ResourceId, number>,
  energyState: { current: number },
  options?: StepHubsOptions,
): StepHubsResult {
  if (dtSec <= 0 || cells.length === 0) {
    return { meshDirty: false, tallyChanged: false, replicatorStoreChanged: false, hubRootGains: [] }
  }

  const nowMs = performance.now()
  const gridSize = options?.gridSize ?? 33

  const activeHubs: VoxelCell[] = []
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!
    if (isHubProcessing(c)) activeHubs.push(c)
  }
  if (activeHubs.length === 0) {
    return { meshDirty: false, tallyChanged: false, replicatorStoreChanged: false, hubRootGains: [] }
  }

  const attemptsPerHub = Math.min(
    64,
    Math.max(1, Math.ceil(dtSec * HUB_UNITS_PER_SEC * gameBalance.hubPullMult)),
  )

  // `simDt` shrinks with game speed; the raw cap can fall below one pull's cost (0.32), which
  // blocks all hub activity at low speed / short frames. Always allow at least one pull worth of
  // budget for the tick (still gated by `energyState` and stock).
  const scaledHubEnergyCap =
    HUB_MAX_ENERGY_SPEND_PER_SEC * dtSec * gameBalance.hubMaxEnergySpendMult * activeHubs.length
  const maxEnergyThisTick = Math.max(HUB_ENERGY_PER_UNIT, scaledHubEnergyCap)
  let energySpentHub = 0

  let meshDirty = false
  let tallyChanged = false
  let replicatorStoreChanged = false

  const hubGainByKey = new Map<
    number,
    { hubPos: VoxelPos; delta: Partial<Record<RootResourceId, number>> }
  >()

  const index = options?.posIndex ?? buildPosIndex(cells, gridSize)
  for (const hub of activeHubs) {
    const hubKey = packVoxelKey(hub.pos.x, hub.pos.y, hub.pos.z, gridSize)
    const mergeHubCredit = (credited: Partial<Record<RootResourceId, number>>): void => {
      let entry = hubGainByKey.get(hubKey)
      if (!entry) {
        entry = {
          hubPos: { x: hub.pos.x, y: hub.pos.y, z: hub.pos.z },
          delta: {},
        }
        hubGainByKey.set(hubKey, entry)
      }
      for (const id of ROOT_RESOURCE_IDS) {
        const v = credited[id]
        if (v === undefined || v <= 0) continue
        entry.delta[id] = (entry.delta[id] ?? 0) + v
      }
    }

    const distMap = buildDistanceMap(hub.pos, index, gridSize)

    for (let a = 0; a < attemptsPerHub; a++) {
      if (energyState.current < HUB_ENERGY_PER_UNIT) break
      if (energySpentHub + HUB_ENERGY_PER_UNIT > maxEnergyThisTick) break

      let best: VoxelCell | null = null
      let bestScore = 0
      for (let ci = 0; ci < cells.length; ci++) {
        const cell = cells[ci]!
        if (
          cell.kind === 'processedMatter' &&
          cell.lifterChargeStartMs != null &&
          nowMs - cell.lifterChargeStartMs < gameBalance.lifterChargeMs
        ) {
          continue
        }
        if (!cellHasRefinableStock(cell)) continue
        const dk = packVoxelKey(cell.pos.x, cell.pos.y, cell.pos.z, gridSize)
        const d = distMap.get(dk)
        if (d === undefined) continue
        const sc = scoreForPull(cell, d)
        if (sc > bestScore) {
          bestScore = sc
          best = cell
        }
      }
      if (!best || bestScore <= 0) break

      const pm = best.processedMatterUnits ?? 0
      if (pm > 0) {
        const spent = trySpendEnergy(energyState, HUB_ENERGY_PER_UNIT)
        if (spent < HUB_ENERGY_PER_UNIT) break
        if (!takeOneProcessedMatterUnit(best)) {
          energyState.current += spent
          break
        }
        energySpentHub += spent
        const comp = best.processedMatterRootComposition ?? defaultUniformRootComposition()
        const credited: Partial<Record<RootResourceId, number>> = {}
        addRootTalliesFromPmComposition(tallies, comp, credited)
        if (options?.onRootTalliesFromPm) {
          options.onRootTalliesFromPm(best, credited)
        }
        mergeHubCredit(credited)
        tallyChanged = true
        if (best.kind === 'processedMatter') {
          options?.onProcessedMatterUnitTaken?.(best)
        }
        if (best.kind === 'processedMatter' && (best.processedMatterUnits ?? 0) <= 0) {
          for (let i = 0; i < cells.length; i++) {
            if (cells[i] === best) {
              cells.splice(i, 1)
              break
            }
          }
          meshDirty = true
        }
        continue
      }

      let rid: RootResourceId | null = null
      for (const id of ROOT_RESOURCE_IDS) {
        if ((best.storedResources?.[id] ?? 0) > 0) {
          rid = id
          break
        }
      }
      if (rid === null) break

      const spent = trySpendEnergy(energyState, HUB_ENERGY_PER_UNIT)
      if (spent < HUB_ENERGY_PER_UNIT) break
      if (!takeOneResource(best, rid)) {
        energyState.current += spent
        break
      }
      energySpentHub += spent
      tallies[rid] = (tallies[rid] ?? 0) + 1
      mergeHubCredit({ [rid]: 1 })
      tallyChanged = true
      if (best.kind === 'replicator') replicatorStoreChanged = true
    }
  }

  const hubRootGains: HubRootGainBatch[] = []
  for (const v of hubGainByKey.values()) {
    let nonempty = false
    for (const id of ROOT_RESOURCE_IDS) {
      if ((v.delta[id] ?? 0) > 0) {
        nonempty = true
        break
      }
    }
    if (!nonempty) continue
    hubRootGains.push({
      hubPos: { x: v.hubPos.x, y: v.hubPos.y, z: v.hubPos.z },
      delta: { ...v.delta },
    })
  }

  return { meshDirty, tallyChanged, replicatorStoreChanged, hubRootGains }
}
