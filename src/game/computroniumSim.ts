import type { GameBalance } from './gameBalance'
import { trySpendEnergy } from './energyAndStructures'
import {
  computroniumTierThresholdForRefinerySlot,
  isRefineryRootUnlockedByDefault,
  refineryRootComputroniumSlot,
} from './refineryRecipeUnlock'
import type { RootResourceId } from './resources'
import type { VoxelCell } from './voxelState'

export interface LaserUnlockApply {
  orbitalLaserUnlocked: boolean
  excavatingLaserUnlocked: boolean
  scannerLaserUnlocked: boolean
  /** Fourth computronium stage (after scanner satellite); gates depth scan tool + passive reveal. */
  depthScanUnlocked: boolean
  /** Fifth stage: cleanup collector satellite deploy. */
  drossCollectorUnlocked: boolean
  /** Tier 6: EM Catapult tool (new asteroid while keeping research). */
  emCatapultUnlocked: boolean
  orbitalSatelliteCount: number
  excavatingSatelliteCount: number
  scannerSatelliteCount: number
  drossCollectorSatelliteCount: number
  /** Cargo drone orbit fleet: automatic PM → roots (persists with other satellite counts). */
  cargoDroneSatelliteCount: number
}

export type LaserToolId = 'orbitalLaser' | 'excavatingLaser' | 'scanner'

export type LaserToolUiPhase = 'hidden' | 'researching' | 'unlocked'

export interface InitialToolDebugConfig {
  pick: boolean
  inspect: boolean
  hoover: boolean
  replicator: boolean
  seed: boolean
  reactor: boolean
  battery: boolean
  hub: boolean
  refinery: boolean
  computronium: boolean
  orbitalLaser: boolean
  excavatingLaser: boolean
  scanner: boolean
  explosiveCharge: boolean
  depthScanner: boolean
  drossCollector: boolean
  scourge: boolean
  locust: boolean
  miningDrone: boolean
  /** Tier 5: PM flight tool (same research ladder as cleanup). */
  lifter: boolean
  /** Tier 5: cargo satellite fleet + PM → roots (same research ladder as cleanup). */
  cargoDrone: boolean
  emCatapult: boolean
}

let debugInitialToolConfig: InitialToolDebugConfig = {
  pick: true,
  inspect: true,
  hoover: true,
  replicator: false,
  seed: false,
  reactor: false,
  battery: false,
  hub: false,
  refinery: false,
  computronium: false,
  orbitalLaser: false,
  excavatingLaser: false,
  scanner: false,
  explosiveCharge: false,
  depthScanner: false,
  drossCollector: false,
  scourge: false,
  locust: false,
  miningDrone: false,
  lifter: false,
  cargoDrone: false,
  emCatapult: false,
}

export function getDebugInitialToolConfig(): InitialToolDebugConfig {
  return { ...debugInitialToolConfig }
}

export function setDebugInitialToolConfig(next: InitialToolDebugConfig): void {
  debugInitialToolConfig = { ...next }
}

/** Debug → Starting tools: unchecked = tool hidden / not selectable (unless main’s unlock-all cheat is on). */
export function isToolAllowedByInitialDebugConfig(tool: keyof InitialToolDebugConfig): boolean {
  return debugInitialToolConfig[tool] === true
}

export function applyInitialToolDebugConfigToResearch(
  unlockPoints: { current: number },
  flags: LaserUnlockApply,
  balance: GameBalance,
): void {
  const cfg = debugInitialToolConfig

  // Map requested unlocks on the research ladder to a minimum tier.
  // Earlier tiers are implied; eg, EM Catapult implies all prior tiers.
  let tier: 1 | 2 | 3 | 4 | 5 | 6 | null = null
  if (cfg.orbitalLaser || cfg.explosiveCharge) tier = Math.max(tier ?? 1, 1) as 1 | 2 | 3 | 4 | 5 | 6
  if (cfg.excavatingLaser) tier = Math.max(tier ?? 2, 2) as 1 | 2 | 3 | 4 | 5 | 6
  if (cfg.scanner) tier = Math.max(tier ?? 3, 3) as 1 | 2 | 3 | 4 | 5 | 6
  if (cfg.depthScanner) tier = Math.max(tier ?? 4, 4) as 1 | 2 | 3 | 4 | 5 | 6
  if (
    cfg.drossCollector ||
    cfg.scourge ||
    cfg.locust ||
    cfg.miningDrone ||
    cfg.lifter ||
    cfg.cargoDrone
  ) {
    tier = Math.max(tier ?? 5, 5) as 1 | 2 | 3 | 4 | 5 | 6
  }
  if (cfg.emCatapult) tier = Math.max(tier ?? 6, 6) as 1 | 2 | 3 | 4 | 5 | 6

  if (tier === null) {
    return
  }

  unlockPoints.current = balance.computroniumPointsPerStage * tier * 1.01
  applyResearchTierGrant(tier, flags)
}

export function countActiveComputronium(cells: VoxelCell[]): number {
  let n = 0
  for (const c of cells) {
    if (c.kind === 'computronium' && c.computroniumDisabled !== true) n++
  }
  return n
}

/**
 * UI visibility for the three computronium-gated laser tools. Thresholds match {@link stepComputronium}.
 */
export function getLaserToolUiPhase(
  tool: LaserToolId,
  state: {
    unlockPoints: number
    activeComputronium: number
    orbitalLaserUnlocked: boolean
    excavatingLaserUnlocked: boolean
    scannerLaserUnlocked: boolean
  },
  balance: GameBalance,
): LaserToolUiPhase {
  const { unlockPoints, activeComputronium, orbitalLaserUnlocked, excavatingLaserUnlocked, scannerLaserUnlocked } =
    state
  const per = balance.computroniumPointsPerStage
  const t1 = per
  const t2 = per * 2
  const t3 = per * 3

  if (tool === 'orbitalLaser') {
    if (orbitalLaserUnlocked) return 'unlocked'
    if (activeComputronium > 0 && unlockPoints < t1) return 'researching'
    return 'hidden'
  }
  if (tool === 'excavatingLaser') {
    if (excavatingLaserUnlocked) return 'unlocked'
    if (!orbitalLaserUnlocked) return 'hidden'
    if (activeComputronium > 0 && unlockPoints < t2) return 'researching'
    return 'hidden'
  }
  if (tool === 'scanner') {
    if (scannerLaserUnlocked) return 'unlocked'
    if (!excavatingLaserUnlocked) return 'hidden'
    if (activeComputronium > 0 && unlockPoints < t3) return 'researching'
    return 'hidden'
  }
  return 'hidden'
}

/**
 * Explosive charge (F9): same phase as computronium research tier 1 (mining laser unlock).
 * Thresholds match {@link getLaserToolUiPhase} for `orbitalLaser` and {@link stepComputronium}.
 */
export function getExplosiveChargeToolUiPhase(
  state: {
    unlockPoints: number
    activeComputronium: number
    orbitalLaserUnlocked: boolean
  },
  balance: GameBalance,
): LaserToolUiPhase {
  const { unlockPoints, activeComputronium, orbitalLaserUnlocked } = state
  const per = balance.computroniumPointsPerStage
  const t1 = per
  if (orbitalLaserUnlocked) return 'unlocked'
  if (activeComputronium > 0 && unlockPoints < t1) return 'researching'
  return 'hidden'
}

/**
 * Depth scan tool UI: fourth research tier after scanner satellite (t4 = 4 × points-per-stage).
 */
export function getDepthScanToolUiPhase(
  state: {
    unlockPoints: number
    activeComputronium: number
    scannerLaserUnlocked: boolean
    depthScanUnlocked: boolean
  },
  balance: GameBalance,
): LaserToolUiPhase {
  const { unlockPoints, activeComputronium, scannerLaserUnlocked, depthScanUnlocked } = state
  const per = balance.computroniumPointsPerStage
  const t4 = per * 4

  if (depthScanUnlocked) return 'unlocked'
  if (!scannerLaserUnlocked) return 'hidden'
  if (activeComputronium > 0 && unlockPoints < t4) return 'researching'
  return 'hidden'
}

/**
 * Cleanup collector satellite deploy UI: tier 5 (t5 = 5 × points-per-stage), after depth scan unlock.
 */
export function getDrossCollectorDeployUiPhase(
  state: {
    unlockPoints: number
    activeComputronium: number
    depthScanUnlocked: boolean
    drossCollectorUnlocked: boolean
  },
  balance: GameBalance,
): LaserToolUiPhase {
  const { unlockPoints, activeComputronium, depthScanUnlocked, drossCollectorUnlocked } = state
  const per = balance.computroniumPointsPerStage
  const t5 = per * 5

  if (drossCollectorUnlocked) return 'unlocked'
  if (!depthScanUnlocked) return 'hidden'
  if (activeComputronium > 0 && unlockPoints < t5) return 'researching'
  return 'hidden'
}

/**
 * EM Catapult tool UI: tier 6 (t6 = 6 × points-per-stage), after cleanup collector tier.
 */
export function getEmCatapultToolUiPhase(
  state: {
    unlockPoints: number
    activeComputronium: number
    drossCollectorUnlocked: boolean
    emCatapultUnlocked: boolean
  },
  balance: GameBalance,
): LaserToolUiPhase {
  const { unlockPoints, activeComputronium, drossCollectorUnlocked, emCatapultUnlocked } = state
  const per = balance.computroniumPointsPerStage
  const t6 = per * 6

  if (emCatapultUnlocked) return 'unlocked'
  if (!drossCollectorUnlocked) return 'hidden'
  if (activeComputronium > 0 && unlockPoints < t6) return 'researching'
  return 'hidden'
}

export interface RefineryRecipeUiState {
  unlockPoints: number
  activeComputronium: number
  /** When true (debug), all refinement recipes are treated as unlocked. */
  debugUnlockAllRecipes: boolean
}

/**
 * Per-root refinement recipe: same phase rules as laser tools (tier 6+ thresholds in
 * {@link refineryRootComputroniumSlot} / {@link computroniumTierThresholdForRefinerySlot}).
 */
export function getRefineryRecipeUiPhase(
  root: RootResourceId,
  state: RefineryRecipeUiState,
  balance: GameBalance,
): LaserToolUiPhase {
  if (state.debugUnlockAllRecipes) return 'unlocked'
  if (isRefineryRootUnlockedByDefault(root)) return 'unlocked'
  const slot = refineryRootComputroniumSlot(root)
  if (slot === null) return 'unlocked'
  const threshold = computroniumTierThresholdForRefinerySlot(balance, slot)
  if (state.unlockPoints >= threshold) return 'unlocked'
  if (state.activeComputronium > 0 && state.unlockPoints < threshold) return 'researching'
  return 'hidden'
}

export function isRefineryRecipeUnlocked(
  root: RootResourceId,
  state: RefineryRecipeUiState,
  balance: GameBalance,
): boolean {
  return getRefineryRecipeUiPhase(root, state, balance) === 'unlocked'
}

/**
 * Active computronium drains energy; unlock points accrue proportional to how much of that
 * drain was actually paid. No progress when the pool is empty (scale 0).
 */
export function stepComputronium(
  dtSec: number,
  cells: VoxelCell[],
  energyState: { current: number },
  unlockPoints: { current: number },
  flags: LaserUnlockApply,
  balance: GameBalance,
): boolean {
  if (dtSec <= 0) return false

  const active = countActiveComputronium(cells)
  let unlocksChanged = false

  if (active > 0) {
    const desiredDrain = balance.computroniumEnergyDrainPerSecPerCell * active * dtSec
    const spent =
      desiredDrain > 0 ? trySpendEnergy(energyState, desiredDrain) : 0
    const scale = desiredDrain > 0 ? spent / desiredDrain : 0
    unlockPoints.current +=
      balance.computroniumUnlockPointsPerSecPerCell * active * dtSec * scale
  }

  const per = balance.computroniumPointsPerStage
  const t1 = per
  const t2 = per * 2
  const t3 = per * 3
  const t4 = per * 4
  const t5 = per * 5
  const t6 = per * 6

  if (!flags.orbitalLaserUnlocked && unlockPoints.current >= t1) {
    flags.orbitalLaserUnlocked = true
    flags.orbitalSatelliteCount = Math.max(1, flags.orbitalSatelliteCount)
    unlocksChanged = true
  }
  if (!flags.excavatingLaserUnlocked && unlockPoints.current >= t2) {
    flags.excavatingLaserUnlocked = true
    flags.excavatingSatelliteCount = Math.max(1, flags.excavatingSatelliteCount)
    unlocksChanged = true
  }
  if (!flags.scannerLaserUnlocked && unlockPoints.current >= t3) {
    flags.scannerLaserUnlocked = true
    flags.scannerSatelliteCount = Math.max(1, flags.scannerSatelliteCount)
    unlocksChanged = true
  }
  if (!flags.depthScanUnlocked && unlockPoints.current >= t4) {
    flags.depthScanUnlocked = true
    unlocksChanged = true
  }
  if (!flags.drossCollectorUnlocked && unlockPoints.current >= t5) {
    flags.drossCollectorUnlocked = true
    flags.drossCollectorSatelliteCount = Math.max(1, flags.drossCollectorSatelliteCount)
    unlocksChanged = true
  }
  if (!flags.emCatapultUnlocked && unlockPoints.current >= t6) {
    flags.emCatapultUnlocked = true
    unlocksChanged = true
  }

  return unlocksChanged
}

/**
 * Force research tiers up to `tier` (inclusive), matching cumulative unlocks from {@link stepComputronium}
 * when crossing each threshold (satellite floors for laser tiers + cleanup collector at tier 5 + EM Catapult at tier 6).
 */
export function applyResearchTierGrant(tier: 1 | 2 | 3 | 4 | 5 | 6, flags: LaserUnlockApply): void {
  if (tier >= 1) {
    flags.orbitalLaserUnlocked = true
    flags.orbitalSatelliteCount = Math.max(1, flags.orbitalSatelliteCount)
  }
  if (tier >= 2) {
    flags.excavatingLaserUnlocked = true
    flags.excavatingSatelliteCount = Math.max(1, flags.excavatingSatelliteCount)
  }
  if (tier >= 3) {
    flags.scannerLaserUnlocked = true
    flags.scannerSatelliteCount = Math.max(1, flags.scannerSatelliteCount)
  }
  if (tier >= 4) {
    flags.depthScanUnlocked = true
  }
  if (tier >= 5) {
    flags.drossCollectorUnlocked = true
    flags.drossCollectorSatelliteCount = Math.max(1, flags.drossCollectorSatelliteCount)
  }
  if (tier >= 6) {
    flags.emCatapultUnlocked = true
  }
}
