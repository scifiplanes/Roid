import type { VoxelPos } from '../scene/asteroid/generateAsteroidVoxels'
import type { VoxelCell } from './voxelState'
import { compositionToYields } from './compositionYields'
import { gameBalance } from './gameBalance'
import { addYieldsToCellStore } from './localStores'
import { defaultUniformRootComposition, type ResourceId } from './resources'
import type { SeedRuntimeState } from './voxelState'
import { clearDepthRevealState, clearSurfaceScanTint } from './scanVisualization'
import { packVoxelKey } from './spatialKey'

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

/** Hot path: only ids with a positive passive rate (avoid scanning full `RESOURCE_IDS_ORDERED`). */
const PASSIVE_RESOURCE_IDS = Object.keys(PASSIVE_PER_SEC) as ResourceId[]

/** Mature `kind === 'replicator'` cells; rebuilt with spatial index (see `rebuildReplicatorSimHotLists`). */
const matureReplicatorCells = new Set<VoxelCell>()
/** Rock (non-mature) cells currently being eaten; same rebuild policy. */
const eatingRockCells = new Set<VoxelCell>()

/**
 * Repopulates mature/eating sets from `cells` (full scan). Call when rebuilding the voxel position index.
 */
export function rebuildReplicatorSimHotLists(cells: readonly VoxelCell[]): void {
  matureReplicatorCells.clear()
  eatingRockCells.clear()
  for (const cell of cells) {
    if (cell.kind === 'replicator') {
      matureReplicatorCells.add(cell)
    }
    if (cell.replicatorEating && cell.kind !== 'replicator') {
      eatingRockCells.add(cell)
    }
  }
}

/** Test hook: hot-list cardinalities after `rebuildReplicatorSimHotLists`. */
export function getReplicatorSimHotListSizes(): { mature: number; eatingRock: number } {
  return { mature: matureReplicatorCells.size, eatingRock: eatingRockCells.size }
}

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

/** String key for persistence / discovery (not hot-path maps). */
export function posKey(p: VoxelPos): string {
  return `${p.x},${p.y},${p.z}`
}

export type ReplicatorNeighborIndex = Map<number, VoxelCell>

export function buildPosIndex(cells: VoxelCell[], gridSize: number): ReplicatorNeighborIndex {
  const m: ReplicatorNeighborIndex = new Map()
  for (const c of cells) {
    m.set(packVoxelKey(c.pos.x, c.pos.y, c.pos.z, gridSize), c)
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
  for (const id of PASSIVE_RESOURCE_IDS) {
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

function stepSeedRuntime(dtSec: number, cell: VoxelCell): boolean {
  const seed: SeedRuntimeState | undefined = cell.seedRuntime
  if (!seed) return false
  if (seed.lifetimeRemainingSec <= 0 || dtSec <= 0) return false
  seed.lifetimeRemainingSec = Math.max(0, seed.lifetimeRemainingSec - dtSec)
  if (seed.lifetimeRemainingSec <= 0) return false
  if (!cell.storedResources) cell.storedResources = {}
  let changed = false

  // New per-slot program: honor pause/die/recipe slots when present.
  if (Array.isArray(seed.slots) && seed.slots.length > 0) {
    if (seed.currentSlotIndex === undefined || seed.currentSlotIndex < 0) {
      seed.currentSlotIndex = 0
      const first = seed.slots[0]
      seed.currentSlotRemainingSec =
        typeof first.durationSec === 'number' && Number.isFinite(first.durationSec)
          ? first.durationSec
          : 0
    }

    let remainingDt = dtSec

    while (remainingDt > 0 && seed.currentSlotIndex! < seed.slots.length && seed.lifetimeRemainingSec > 0) {
      const slot = seed.slots[seed.currentSlotIndex!]!
      const slotRemaining =
        typeof seed.currentSlotRemainingSec === 'number' && Number.isFinite(seed.currentSlotRemainingSec)
          ? seed.currentSlotRemainingSec
          : Math.max(0, slot.durationSec)

      if (slotRemaining > remainingDt) {
        seed.currentSlotRemainingSec = slotRemaining - remainingDt
        remainingDt = 0
        break
      }

      remainingDt -= slotRemaining
      seed.currentSlotRemainingSec = 0

      if (slot.kind === 'die') {
        seed.lifetimeRemainingSec = 0
        break
      }

      seed.currentSlotIndex! += 1
      if (seed.currentSlotIndex! >= seed.slots.length) {
        break
      }
      const next = seed.slots[seed.currentSlotIndex!]!
      seed.currentSlotRemainingSec =
        typeof next.durationSec === 'number' && Number.isFinite(next.durationSec)
          ? next.durationSec
          : 0
    }

      if (seed.lifetimeRemainingSec > 0 && seed.currentSlotIndex !== undefined) {
        const activeSlot = seed.slots[seed.currentSlotIndex]!
        if (activeSlot.kind === 'recipe' && activeSlot.resourceId) {
          addYieldsToCellStore(cell, { [activeSlot.resourceId]: 1 })
          cell.replicatorRecipeResourceId = activeSlot.resourceId
          changed = true
        }
      }

    return changed
  }

  // Legacy behavior: flat recipe stack for seeds without slots.
  for (const id of seed.activeRecipes) {
    addYieldsToCellStore(cell, { [id]: 1 })
    cell.replicatorRecipeResourceId = id
    changed = true
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
    cell.kind === 'miningDrone' ||
    cell.kind === 'processedMatter'
  )
    return false
  if (cell.replicatorEating) return false
  return true
}

function spreadFromCell(origin: VoxelCell, index: ReplicatorNeighborIndex, gridSize: number): void {
  const { x, y, z } = origin.pos
  for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
    const key = packVoxelKey(x + dx, y + dy, z + dz, gridSize)
    const n = index.get(key)
    if (!n || !canSpreadTo(n)) continue
    n.replicatorActive = true
    n.replicatorEating = true
    n.replicatorEatAccumulatorMs = 0
    eatingRockCells.add(n)
  }
}

function finishEating(cell: VoxelCell, index: ReplicatorNeighborIndex, gridSize: number): void {
  eatingRockCells.delete(cell)
  const rockKind = cell.kind
  const bulk = cell.bulkComposition ?? defaultUniformRootComposition()
  addYieldsToCellStore(cell, compositionToYields(rockKind, bulk))
  cell.kind = 'replicator'
  cell.hpRemaining = 0
  cell.bulkComposition = undefined
  cell.rareLodeStrength01 = undefined
  clearSurfaceScanTint(cell)
  clearDepthRevealState(cell)
  cell.replicatorEating = false
  cell.replicatorEatAccumulatorMs = 0
  cell.replicatorMsPerHp = undefined
  cell.replicatorActive = true
  spreadFromCell(cell, index, gridSize)
}

const REPLICATOR_TAP_PULSE_MS = 260

export function pokeReplicator(cell: VoxelCell, nowMs: number): boolean {
  if (cell.kind !== 'replicator') return false
  cell.replicatorTapPulseEndMs = nowMs + REPLICATOR_TAP_PULSE_MS
  return true
}

export interface StepReplicatorsResult {
  /**
   * True when voxel→instanced-layer membership changed (e.g. rock→replicator, new eating neighbors).
   * Callers should run full `replaceAsteroidMesh`; do not conflate with HP-only tint updates.
   */
  meshDirty: boolean
  /**
   * True when eating-rock or cannibal HP changed but geometry layers are unchanged.
   * Callers should `markRockInstanceColorsDirty()` / `reapplyRockInstanceColors` only.
   */
  eatingVisualDirty: boolean
  tallyChanged: boolean
  /** HP steps consumed by replicators this frame (for subtle click SFX). */
  replicatorConsumeTicks: number
  /** HP steps drained between replicators this frame (cross-strain cannibalism). */
  replicatorCannibalTicks: number
}

export interface StepReplicatorsOptions {
  /** Fires once each time a replicator consumes 1 HP of rock (cell still rock until `finishEating`). */
  onReplicatorRockHpConsumed?: (cell: VoxelCell) => void
  /** When true, replicator rock feeding and passive income into local stores are frozen. */
  replicatorPaused?: boolean
  /**
   * Optional shared neighbor index to avoid rebuilding a fresh map each call.
   * Callers that already maintain a position→cell map can pass it here.
   */
  neighborIndex?: ReplicatorNeighborIndex
  /** Grid edge length for packed spatial keys (default 33). */
  gridSize?: number
}

/**
 * Advances replicator eating and passive income into per-cell stores. Mutates `cells`.
 */
export function stepReplicators(
  dtMs: number,
  cells: VoxelCell[],
  options?: StepReplicatorsOptions,
): StepReplicatorsResult {
  if (options && options.replicatorPaused) {
    return {
      meshDirty: false,
      eatingVisualDirty: false,
      tallyChanged: false,
      replicatorConsumeTicks: 0,
      replicatorCannibalTicks: 0,
    }
  }
  if (cells.length === 0 || dtMs <= 0) {
    return {
      meshDirty: false,
      eatingVisualDirty: false,
      tallyChanged: false,
      replicatorConsumeTicks: 0,
      replicatorCannibalTicks: 0,
    }
  }

  const dtSec = dtMs / 1000

  // Snapshot hot lists (maintained with spatial index rebuild + eating-cell updates in finishEating/spreadFromCell).
  const matureReplicators = Array.from(matureReplicatorCells)
  const eatingReplicators = Array.from(eatingRockCells)

  // Fast path: no active or eating replicators → nothing to do this frame.
  if (matureReplicators.length === 0 && eatingReplicators.length === 0) {
    return {
      meshDirty: false,
      eatingVisualDirty: false,
      tallyChanged: false,
      replicatorConsumeTicks: 0,
      replicatorCannibalTicks: 0,
    }
  }

  let meshDirty = false
  let eatingVisualDirty = false
  let tallyChanged = false
  let replicatorConsumeTicks = 0
  let replicatorCannibalTicks = 0

  // Passive income and seeds only depend on mature replicators.
  if (dtSec > 0 && matureReplicators.length > 0) {
    for (const cell of matureReplicators) {
      if (applyPassiveIncomePerCell(dtSec, cell)) {
        tallyChanged = true
      }
      if (stepSeedRuntime(dtSec, cell)) {
        tallyChanged = true
      }
    }
  }

  const gridSize = options?.gridSize ?? 33
  const index = options?.neighborIndex ?? buildPosIndex(cells, gridSize)

  // Cross-strain replicator-on-replicator feeding is a debug / balance feature.
  const cannibalEnabled = gameBalance.replicatorCannibalismEnabled === true

  // Reset per-frame feeding flags; they will be re-marked if any neighbor chooses this cell.
  if (cannibalEnabled && matureReplicators.length > 0) {
    for (const cell of matureReplicators) {
      cell.replicatorBeingFed = false
    }
  }

  /** Feeder cell → chosen victim from scoring pass (reused by drain pass; avoids a second 6-neighbor scan). */
  const cannibalVictimByFeeder = new Map<VoxelCell, VoxelCell>()

  // Decide which mature replicators are feeding other strains this frame.
  if (cannibalEnabled && matureReplicators.length > 0) {
    const minHpToFeed = 1
    for (const cell of matureReplicators) {
      // Only mature replicators with positive HP can act as feeders.
      if (cell.hpRemaining <= minHpToFeed) {
        cell.replicatorFeedingOther = false
        cell.replicatorFeedOtherAccumulatorMs = 0
        continue
      }
      const strain = cell.replicatorStrainId
      // Scan 6-neighbors for a different-strain replicator target.
      const { x, y, z } = cell.pos
      let bestTarget: VoxelCell | undefined
      let bestScore = -Infinity
      for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
        const n = index.get(packVoxelKey(x + dx, y + dy, z + dz, gridSize))
        if (!n) continue
        if (n.kind !== 'replicator') continue
        if (n.hpRemaining <= 0) continue
        if (strain !== undefined && n.replicatorStrainId === strain) continue
        // Prefer fatter neighbors (higher HP, then more stored resources).
        const hpScore = n.hpRemaining
        let resScore = 0
        if (n.storedResources) {
          for (const id in n.storedResources) {
            const v = n.storedResources[id as keyof typeof n.storedResources]
            if (typeof v === 'number' && Number.isFinite(v)) {
              resScore += v
            }
          }
        }
        const score = hpScore * 2 + resScore
        if (score > bestScore) {
          bestScore = score
          bestTarget = n
        }
      }
      if (!bestTarget) {
        cell.replicatorFeedingOther = false
        cell.replicatorFeedOtherAccumulatorMs = 0
        continue
      }
      cell.replicatorFeedingOther = true
      // Mark the victim as being fed this frame (for visuals).
      bestTarget.replicatorBeingFed = true
      cannibalVictimByFeeder.set(cell, bestTarget)
    }
  }

  // Rock-eating replicators (existing mechanic).
  if ((options && options.replicatorPaused) || eatingReplicators.length === 0) {
    return { meshDirty, eatingVisualDirty, tallyChanged, replicatorConsumeTicks, replicatorCannibalTicks }
  }

  for (const cell of eatingReplicators) {
    ensureReplicatorFeedJitter(cell)
    const baseMs = cell.replicatorMsPerHp ?? REPLICATOR_MS_PER_HP
    const speed = gameBalance.replicatorFeedSpeedMult
    const msPerHp = baseMs / Math.max(0.01, speed)

    let acc = (cell.replicatorEatAccumulatorMs ?? 0) + dtMs
    if (acc < msPerHp || cell.hpRemaining <= 0) {
      cell.replicatorEatAccumulatorMs = acc
      continue
    }

    // Bulk tick math: compute how many whole HP steps fit this frame.
    let ticks = Math.floor(acc / msPerHp)
    if (ticks > cell.hpRemaining) ticks = cell.hpRemaining

    acc -= ticks * msPerHp

    for (let k = 0; k < ticks; k++) {
      cell.hpRemaining -= 1
      replicatorConsumeTicks += 1
      eatingVisualDirty = true
      options && options.onReplicatorRockHpConsumed?.(cell)
      if (cell.hpRemaining <= 0) {
        finishEating(cell, index, gridSize)
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

  // Cross-strain drain-over-time between replicators.
  if (cannibalEnabled && matureReplicators.length > 0) {
    const baseMs = REPLICATOR_MS_PER_HP
    const speedMult = Math.max(0.01, gameBalance.replicatorCannibalFeedSpeedMult ?? 1)
    const msPerHp = baseMs / speedMult

    for (const cell of matureReplicators) {
      if (!cell.replicatorFeedingOther || cell.hpRemaining <= 0) {
        cell.replicatorFeedOtherAccumulatorMs = 0
        continue
      }

      // Prefer victim from scoring pass; fall back to first valid neighbor (legacy order).
      const strain = cell.replicatorStrainId
      let victim: VoxelCell | undefined = cannibalVictimByFeeder.get(cell)
      if (
        !victim ||
        victim.kind !== 'replicator' ||
        victim.hpRemaining <= 0 ||
        (strain !== undefined && victim.replicatorStrainId === strain)
      ) {
        victim = undefined
        const { x, y, z } = cell.pos
        for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
          const n = index.get(packVoxelKey(x + dx, y + dy, z + dz, gridSize))
          if (!n) continue
          if (n.kind !== 'replicator') continue
          if (n.hpRemaining <= 0) continue
          if (strain !== undefined && n.replicatorStrainId === strain) continue
          victim = n
          break
        }
      }
      if (!victim) {
        cell.replicatorFeedingOther = false
        cell.replicatorFeedOtherAccumulatorMs = 0
        continue
      }
      victim.replicatorBeingFed = true

      let acc = (cell.replicatorFeedOtherAccumulatorMs ?? 0) + dtMs
      if (acc < msPerHp) {
        cell.replicatorFeedOtherAccumulatorMs = acc
        continue
      }

      let ticks = Math.floor(acc / msPerHp)
      if (ticks <= 0) {
        cell.replicatorFeedOtherAccumulatorMs = acc
        continue
      }
      if (ticks > victim.hpRemaining) ticks = victim.hpRemaining

      acc -= ticks * msPerHp

      const efficiency = Math.max(0, Math.min(1, gameBalance.replicatorCannibalYieldEfficiency ?? 0))

      for (let k = 0; k < ticks; k++) {
        if (victim.hpRemaining <= 0 || cell.hpRemaining <= 0) break
        victim.hpRemaining -= 1
        replicatorCannibalTicks += 1
        eatingVisualDirty = true

        if (efficiency > 0 && victim.storedResources && victim.hpRemaining >= 0) {
          if (!cell.storedResources) cell.storedResources = {}
          const sr = victim.storedResources
          for (const id in sr) {
            const src = sr[id as ResourceId]
            if (!src || src <= 0) continue
            const siphon = src * efficiency * (1 / 32)
            if (siphon <= 0) continue
            sr[id as ResourceId] = src - siphon
            cell.storedResources[id as ResourceId] = (cell.storedResources[id as ResourceId] ?? 0) + siphon
          }
        }

        if (victim.hpRemaining <= 0) {
          victim.replicatorActive = false
          victim.replicatorFeedingOther = false
          victim.replicatorBeingFed = false
          victim.replicatorFeedOtherAccumulatorMs = 0
          victim.replicatorFeedOtherMsPerHp = undefined
          break
        }
      }

      cell.replicatorFeedOtherAccumulatorMs = acc
    }
  }

  return { meshDirty, eatingVisualDirty, tallyChanged, replicatorConsumeTicks, replicatorCannibalTicks }
}
