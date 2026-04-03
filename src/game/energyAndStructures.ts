import type { ReplicatorTransformTarget, VoxelCell } from './voxelState'
import type { VoxelKind } from './voxelKinds'
import { clearDepthRevealState, clearSurfaceScanTint } from './scanVisualization'
import { gameBalance } from './gameBalance'
import { getKindDef } from './voxelKinds'
import { RESOURCE_IDS_ORDERED, ROOT_RESOURCE_IDS, type ResourceId, type RootResourceId } from './resources'
import { getSandboxModeEnabled } from './sandboxMode'

/** Energy storage before any battery voxels exist. */
export const ENERGY_BASE_CAP = 24

/** Global energy added per second per reactor voxel. */
export const REACTOR_ENERGY_PER_SEC = 2.2

/** Extra energy cap granted by each battery voxel. */
export const BATTERY_STORAGE_PER_CELL = 80

/**
 * Tier 1 — pre-refinery chain (reactor → hub → refinery): **roots only** so mining can pay placement
 * (refined children normally need a running refinery). Post-refinery structures may still mix refined.
 */
export const REACTOR_BUILD_COST: Partial<Record<ResourceId, number>> = {
  refractories: 4,
  metals: 4,
  silicates: 3,
}

/** Roots only — volatiles from crust; silicate/metal-band roots from interior (no ice-line or refined surface ices). */
export const BATTERY_BUILD_COST: Partial<Record<ResourceId, number>> = {
  volatiles: 2,
  metals: 2,
  silicates: 2,
  oxides: 2,
  refractories: 1,
  sulfides: 1,
}

/** Mature replicator → Hub (consolidates local network into global root tallies). */
export const HUB_BUILD_COST: Partial<Record<ResourceId, number>> = {
  silicates: 4,
  sulfides: 2,
  oxides: 2,
  metals: 1,
}

/**
 * Root commodities required across reactor + hub + battery placement (battery is roots-only).
 * Order: reactor-critical first, then hub-only roots, then battery-only additions — used for default Seed stacks and audits.
 */
export const STRUCTURE_CHAIN_ROOT_IDS_ORDERED: readonly RootResourceId[] = [
  'refractories',
  'metals',
  'silicates',
  'sulfides',
  'oxides',
  'volatiles',
] as const

/** Union of root keys from reactor / hub / battery build costs (for tests and drift checks). */
export function structureChainRootIdsFromBuildCosts(): RootResourceId[] {
  const costs = [REACTOR_BUILD_COST, HUB_BUILD_COST, BATTERY_BUILD_COST]
  const seen = new Set<RootResourceId>()
  const rootSet = new Set<ResourceId>(ROOT_RESOURCE_IDS)
  for (const c of costs) {
    for (const k of Object.keys(c) as ResourceId[]) {
      if (rootSet.has(k)) seen.add(k as RootResourceId)
    }
  }
  return [...seen]
}

/**
 * Default Seed recipe stack: structure-chain roots in order, then pad with `regolithMass` for replicator placement costs.
 */
export function defaultSeedRecipeStackForMaxStacks(maxStacks: number): ResourceId[] {
  const chain = STRUCTURE_CHAIN_ROOT_IDS_ORDERED
  if (maxStacks <= 0) return []
  if (maxStacks <= chain.length) return [...chain.slice(0, maxStacks)]
  const extra = maxStacks - chain.length
  const out: ResourceId[] = [...chain]
  for (let i = 0; i < extra; i++) out.push('regolithMass')
  return out
}

/** Mature replicator → Refinery (global roots → second-order resources). */
export const REFINERY_BUILD_COST: Partial<Record<ResourceId, number>> = {
  silicates: 4,
  metals: 4,
  sulfides: 2,
  oxides: 1,
}

/** Per placement when using the replicator tool on rock (spread from neighbors is free). Roots only. */
export const REPLICATOR_PLACE_COST: Partial<Record<ResourceId, number>> = {
  regolithMass: 2,
  silicates: 2,
  metals: 2,
  volatiles: 1,
}

/**
 * Tier 2 — depth / logic: stronger refined pull (optics, dopants) on top of diverse roots.
 */
export const DEPTH_SCANNER_BUILD_COST: Partial<Record<ResourceId, number>> = {
  metals: 2,
  oxides: 3,
  silicates: 3,
  carbonaceous: 2,
  phosphates: 1,
  spinelOxides: 1,
  magnetiteWeathering: 1,
}

/** Halide line omitted so metal-rich interiors can pay from silicate/oxide/metal refinery outputs. */
export const COMPUTRONIUM_BUILD_COST: Partial<Record<ResourceId, number>> = {
  metals: 3,
  silicates: 3,
  oxides: 2,
  phosphates: 2,
  refractories: 1,
  apatiteGrains: 1,
  feldspathicSilicates: 1,
  spinelOxides: 1,
}

/** Per-use cost to arm one explosive charge (scaled by `gameBalance.toolCostMult`). */
export const EXPLOSIVE_CHARGE_ARM_COST: Partial<Record<ResourceId, number>> = {
  regolithMass: 2,
  volatiles: 1,
  sulfides: 1,
  metals: 1,
  pyrrhotiteFraction: 1,
}

/** Per placement: mining drone voxel on rock (roots only; scaled by `gameBalance.toolCostMult`). */
export const MINING_DRONE_PLACE_COST: Partial<Record<ResourceId, number>> = {
  metals: 2,
  silicates: 2,
  volatiles: 1,
  regolithMass: 1,
}

/**
 * Tier 3 — laser / sat unlocks: full root spread + refined lines matching role (optics, abrasion, organics).
 */
export const ORBITAL_LASER_UNLOCK_COST: Partial<Record<ResourceId, number>> = {
  silicates: 4,
  metals: 3,
  refractories: 2,
  carbonaceous: 2,
  feldspathicSilicates: 1,
  titaniumCondensates: 1,
}

export const EXCAVATING_LASER_UNLOCK_COST: Partial<Record<ResourceId, number>> = {
  silicates: 4,
  metals: 3,
  sulfides: 2,
  oxides: 2,
  troiliteVeins: 1,
}

/** Base template for deploying an extra satellite; scales with existing count in `getScaledSatelliteDeployCost`. */
const SATELLITE_DEPLOY_BASE_ORBITAL: Partial<Record<ResourceId, number>> = {
  silicates: 2,
  metals: 2,
  refractories: 1,
  calciumAluminates: 1,
}

const SATELLITE_DEPLOY_BASE_EXCAVATING: Partial<Record<ResourceId, number>> = {
  silicates: 2,
  metals: 2,
  sulfides: 1,
  volatiles: 1,
  pyrrhotiteFraction: 1,
}

const SATELLITE_DEPLOY_BASE_SCANNER: Partial<Record<ResourceId, number>> = {
  silicates: 2,
  metals: 1,
  oxides: 2,
  carbonaceous: 1,
  spinelOxides: 1,
}

const SATELLITE_DEPLOY_BASE_DROSS_COLLECTOR: Partial<Record<ResourceId, number>> = {
  silicates: 2,
  metals: 2,
  refractories: 2,
  carbonaceous: 1,
  feldspathicSilicates: 1,
  titaniumCondensates: 1,
}

/** Cargo drone: automatic processed-matter → roots (orbit fleet). */
const SATELLITE_DEPLOY_BASE_CARGO_DRONE: Partial<Record<ResourceId, number>> = {
  silicates: 2,
  metals: 2,
  oxides: 1,
  sulfides: 1,
  regolithMass: 1,
  carbonaceous: 1,
}

/** One-time cost to enable the scanner satellite tool (includes first satellite). */
export const SCANNER_UNLOCK_COST: Partial<Record<ResourceId, number>> = {
  silicates: 3,
  metals: 2,
  oxides: 3,
  carbonaceous: 2,
  volatileOrganics: 1,
  macromolecularCarbon: 1,
}

export type StructureConvertKind = Extract<VoxelKind, 'reactor' | 'battery' | 'hub' | 'refinery'>
export type { ReplicatorTransformTarget } from './voxelState'
export type LaserSatelliteKind =
  | 'orbital'
  | 'excavating'
  | 'scanner'
  | 'drossCollector'
  | 'cargoDrone'

function scaleToolCost(cost: Partial<Record<ResourceId, number>>): Partial<Record<ResourceId, number>> {
  const m = gameBalance.toolCostMult
  const out: Partial<Record<ResourceId, number>> = {}
  for (const id of RESOURCE_IDS_ORDERED) {
    const need = cost[id]
    if (need !== undefined && need > 0) {
      out[id] = Math.max(1, Math.round(need * m))
    }
  }
  return out
}

export function getScaledReactorBuildCost(): Partial<Record<ResourceId, number>> {
  return scaleToolCost(REACTOR_BUILD_COST)
}

export function getScaledBatteryBuildCost(): Partial<Record<ResourceId, number>> {
  return scaleToolCost(BATTERY_BUILD_COST)
}

export function getScaledHubBuildCost(): Partial<Record<ResourceId, number>> {
  return scaleToolCost(HUB_BUILD_COST)
}

export function getScaledRefineryBuildCost(): Partial<Record<ResourceId, number>> {
  return scaleToolCost(REFINERY_BUILD_COST)
}

export function getScaledReplicatorPlaceCost(): Partial<Record<ResourceId, number>> {
  return scaleToolCost(REPLICATOR_PLACE_COST)
}

export function getScaledDepthScannerBuildCost(): Partial<Record<ResourceId, number>> {
  return scaleToolCost(DEPTH_SCANNER_BUILD_COST)
}

export function getScaledComputroniumBuildCost(): Partial<Record<ResourceId, number>> {
  return scaleToolCost(COMPUTRONIUM_BUILD_COST)
}

export function getScaledExplosiveChargeArmCost(): Partial<Record<ResourceId, number>> {
  return scaleToolCost(EXPLOSIVE_CHARGE_ARM_COST)
}

export function getScaledMiningDronePlaceCost(): Partial<Record<ResourceId, number>> {
  return scaleToolCost(MINING_DRONE_PLACE_COST)
}

export function getScaledOrbitalLaserUnlockCost(): Partial<Record<ResourceId, number>> {
  return scaleToolCost(ORBITAL_LASER_UNLOCK_COST)
}

export function getScaledExcavatingLaserUnlockCost(): Partial<Record<ResourceId, number>> {
  return scaleToolCost(EXCAVATING_LASER_UNLOCK_COST)
}

export function getScaledScannerUnlockCost(): Partial<Record<ResourceId, number>> {
  return scaleToolCost(SCANNER_UNLOCK_COST)
}

/**
 * Cost to add another satellite. `currentSatelliteCount` is the count **before** the new one
 * (minimum 1 after unlock). Scales gently so later satellites cost more.
 */
export function getScaledSatelliteDeployCost(
  kind: LaserSatelliteKind,
  currentSatelliteCount: number,
): Partial<Record<ResourceId, number>> {
  const raw =
    kind === 'orbital'
      ? SATELLITE_DEPLOY_BASE_ORBITAL
      : kind === 'excavating'
        ? SATELLITE_DEPLOY_BASE_EXCAVATING
        : kind === 'scanner'
          ? SATELLITE_DEPLOY_BASE_SCANNER
          : kind === 'drossCollector'
            ? SATELLITE_DEPLOY_BASE_DROSS_COLLECTOR
            : SATELLITE_DEPLOY_BASE_CARGO_DRONE
  const base = scaleToolCost(raw)
  const mult = Math.max(1, currentSatelliteCount)
  const out: Partial<Record<ResourceId, number>> = {}
  for (const id of RESOURCE_IDS_ORDERED) {
    const need = base[id]
    if (need !== undefined && need > 0) {
      out[id] = Math.max(1, Math.round(need * mult))
    }
  }
  return out
}

function buildCostFor(kind: StructureConvertKind): Partial<Record<ResourceId, number>> {
  if (kind === 'reactor') return getScaledReactorBuildCost()
  if (kind === 'battery') return getScaledBatteryBuildCost()
  if (kind === 'hub') return getScaledHubBuildCost()
  return getScaledRefineryBuildCost()
}

/** Rock or processed matter that can be replaced by a depth scanner (not structures / not replicator-eating). */
const DEPTH_SCANNER_ELIGIBLE_KINDS: ReadonlySet<VoxelKind> = new Set([
  'regolith',
  'silicateRock',
  'metalRich',
  'wreckSalvage',
  'wreckStructure',
  'wreckDense',
  'processedMatter',
])

/**
 * Replaces an eligible voxel with a depth scanner; deducts build cost.
 * Returns false if the cell cannot be converted or payment fails.
 */
export function tryConvertCellToDepthScanner(
  cell: VoxelCell,
  tallies: Record<ResourceId, number>,
): boolean {
  if (cell.replicatorEating) return false
  if (!DEPTH_SCANNER_ELIGIBLE_KINDS.has(cell.kind)) return false

  const cost = getScaledDepthScannerBuildCost()
  if (!canAfford(tallies, cost)) return false
  payCost(tallies, cost)

  cell.kind = 'depthScanner'
  cell.hpRemaining = getKindDef('depthScanner').maxDurability
  cell.replicatorActive = false
  cell.replicatorEating = false
  cell.replicatorEatAccumulatorMs = 0
  cell.replicatorMsPerHp = undefined
  cell.passiveRemainder = undefined
  cell.storedResources = undefined
  cell.bulkComposition = undefined
  cell.rareLodeStrength01 = undefined
  cell.processedMatterUnits = undefined
  cell.processedMatterRootComposition = undefined
  cell.hubDisabled = undefined
  cell.refineryDisabled = undefined
  cell.explosiveFuseEndMs = undefined
  cell.lifterChargeStartMs = undefined
  clearReplicatorTransformState(cell)
  clearSurfaceScanTint(cell)
  clearDepthRevealState(cell)
  return true
}

/**
 * Converts to depth scanner when eligible; returns replaced kind on success (for discovery hooks).
 */
export function tryConvertCellToDepthScannerWithMeta(
  cell: VoxelCell,
  tallies: Record<ResourceId, number>,
): { ok: true; replacedKind: VoxelKind } | { ok: false } {
  const replacedKind = cell.kind
  if (!tryConvertCellToDepthScanner(cell, tallies)) return { ok: false }
  return { ok: true, replacedKind }
}

export function canAfford(
  tallies: Record<ResourceId, number>,
  cost: Partial<Record<ResourceId, number>>,
): boolean {
  if (getSandboxModeEnabled()) return true
  for (const id of RESOURCE_IDS_ORDERED) {
    const need = cost[id]
    if (need !== undefined && need > 0 && tallies[id] < need) return false
  }
  return true
}

function payCost(tallies: Record<ResourceId, number>, cost: Partial<Record<ResourceId, number>>): void {
  if (getSandboxModeEnabled()) return
  for (const id of RESOURCE_IDS_ORDERED) {
    const need = cost[id]
    if (need !== undefined && need > 0) tallies[id] -= need
  }
}

/** Deducts `cost` if affordable; returns whether payment happened. */
export function tryPayResources(
  tallies: Record<ResourceId, number>,
  cost: Partial<Record<ResourceId, number>>,
): boolean {
  if (getSandboxModeEnabled()) return true
  if (!canAfford(tallies, cost)) return false
  payCost(tallies, cost)
  return true
}

/** Spends up to `amount` energy; returns amount actually spent. */
export function trySpendEnergy(state: { current: number }, amount: number): number {
  if (getSandboxModeEnabled()) return amount
  if (amount <= 0) return 0
  const spent = Math.min(state.current, amount)
  state.current -= spent
  return spent
}

export function computeEnergyCap(cells: VoxelCell[], extraCap = 0): number {
  let batteries = 0
  for (const c of cells) {
    if (c.kind === 'battery') batteries++
  }
  return (
    ENERGY_BASE_CAP * gameBalance.energyBaseCapMult +
    batteries * BATTERY_STORAGE_PER_CELL * gameBalance.batteryStorageMult +
    extraCap
  )
}

export function stepEnergy(
  dtSec: number,
  cells: VoxelCell[],
  state: { current: number },
  extraCap = 0,
): void {
  const cap = computeEnergyCap(cells, extraCap)
  state.current = Math.min(state.current, cap)
  if (dtSec <= 0) return
  let reactors = 0
  for (const c of cells) {
    if (c.kind === 'reactor') reactors++
  }
  state.current += REACTOR_ENERGY_PER_SEC * gameBalance.reactorOutputMult * reactors * dtSec
  state.current = Math.min(state.current, cap)
}

/** Mature replicators with an in-progress structure/computronium timer (sparse; avoids scanning all voxels each tick). */
const cellsPendingReplicatorTransform = new Set<VoxelCell>()

export function getReplicatorTransformPendingCount(): number {
  return cellsPendingReplicatorTransform.size
}

export function clearReplicatorTransformState(cell: VoxelCell): void {
  cellsPendingReplicatorTransform.delete(cell)
  cell.replicatorTransformTarget = undefined
  cell.replicatorTransformElapsedMs = undefined
  cell.replicatorTransformTotalMs = undefined
}

function finalizeReplicatorToStructureKind(cell: VoxelCell, kind: StructureConvertKind): void {
  cell.kind = kind
  cell.hpRemaining = getKindDef(kind).maxDurability
  cell.replicatorActive = false
  cell.replicatorEating = false
  cell.replicatorEatAccumulatorMs = 0
  cell.replicatorMsPerHp = undefined
  cell.passiveRemainder = undefined
  if (kind === 'hub') cell.hubDisabled = undefined
  if (kind === 'refinery') cell.refineryDisabled = undefined
  clearReplicatorTransformState(cell)
  clearSurfaceScanTint(cell)
  clearDepthRevealState(cell)
}

function finalizeReplicatorToComputronium(cell: VoxelCell): void {
  cell.kind = 'computronium'
  cell.hpRemaining = getKindDef('computronium').maxDurability
  cell.replicatorActive = false
  cell.replicatorEating = false
  cell.replicatorEatAccumulatorMs = 0
  cell.replicatorMsPerHp = undefined
  cell.passiveRemainder = undefined
  cell.computroniumDisabled = undefined
  clearReplicatorTransformState(cell)
  clearSurfaceScanTint(cell)
  clearDepthRevealState(cell)
}

function costForReplicatorTransformTarget(target: ReplicatorTransformTarget): Partial<Record<ResourceId, number>> {
  if (target === 'computronium') return getScaledComputroniumBuildCost()
  return buildCostFor(target)
}

/**
 * Starts a timed conversion of a mature replicator into a structure or computronium; deducts build cost.
 * Returns false if not eligible, already transforming, or payment fails.
 */
export function tryStartReplicatorTransform(
  cell: VoxelCell,
  target: ReplicatorTransformTarget,
  tallies: Record<ResourceId, number>,
): boolean {
  if (cell.kind !== 'replicator') return false
  if (cell.replicatorTransformTarget !== undefined) return false
  const cost = costForReplicatorTransformTarget(target)
  if (!canAfford(tallies, cost)) return false
  payCost(tallies, cost)
  const totalSec = gameBalance.replicatorTransformDurationSec
  cell.replicatorTransformTarget = target
  cell.replicatorTransformElapsedMs = 0
  cell.replicatorTransformTotalMs = Math.max(0, totalSec * 1000)
  cellsPendingReplicatorTransform.add(cell)
  return true
}

/**
 * Advances in-progress replicator → structure timers. Mutates `cells`.
 */
export function stepReplicatorTransforms(
  dtMs: number,
  _cells: VoxelCell[],
  options?: { paused?: boolean },
): {
  meshDirty: boolean
  completedTransforms: number
} {
  if (options?.paused) {
    return { meshDirty: false, completedTransforms: 0 }
  }
  if (cellsPendingReplicatorTransform.size === 0 || dtMs <= 0) {
    return { meshDirty: false, completedTransforms: 0 }
  }
  let meshDirty = false
  let completedTransforms = 0
  const pending = Array.from(cellsPendingReplicatorTransform)
  for (const cell of pending) {
    const target = cell.replicatorTransformTarget
    if (target === undefined) {
      cellsPendingReplicatorTransform.delete(cell)
      continue
    }
    const total = cell.replicatorTransformTotalMs ?? 0
    let elapsed = (cell.replicatorTransformElapsedMs ?? 0) + dtMs
    if (elapsed < total) {
      cell.replicatorTransformElapsedMs = elapsed
      continue
    }
    if (target === 'computronium') {
      finalizeReplicatorToComputronium(cell)
    } else {
      finalizeReplicatorToStructureKind(cell, target)
    }
    completedTransforms += 1
    meshDirty = true
  }
  return { meshDirty, completedTransforms }
}
