import type { GameBalance } from './gameBalance'
import { trySpendEnergy } from './energyAndStructures'
import {
  computroniumTierThresholdForRefinerySlot,
  isRefineryRootUnlockedByDefault,
  refineryRootComputroniumSlot,
} from './refineryRecipeUnlock'
import type { RootResourceId } from './resources'
import type { VoxelCell } from './voxelState'
import {
  applyLegacyTierAsResearchSteps,
  syncResearchFlagsFromPoints,
  type ComputroniumUnlockId,
  type LaserUnlockApply,
} from './computroniumResearchQueue'

export type {
  ComputroniumUnlockId,
  LaserUnlockApply,
} from './computroniumResearchQueue'
export {
  buildComputroniumResearchOrder,
  COMPUTRONIUM_RESEARCH_STEP_COUNT,
  getResearchPhaseForPlayerToolId,
  getResearchPhaseForUnlockId,
  researchStepsCompleted,
  type ResearchPhaseState,
  type ResearchToolUiPhase,
} from './computroniumResearchQueue'

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
  lifter: boolean
  cargoDrone: boolean
  emCatapult: boolean
}

let debugInitialToolConfig: InitialToolDebugConfig = {
  pick: true,
  inspect: true,
  hoover: true,
  replicator: true,
  seed: true,
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
  order: readonly ComputroniumUnlockId[],
): void {
  const cfg = debugInitialToolConfig

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

  applyLegacyTierAsResearchSteps(order, tier, unlockPoints, balance, flags)
}

export function countActiveComputronium(cells: VoxelCell[]): number {
  let n = 0
  for (const c of cells) {
    if (c.kind === 'computronium' && c.computroniumDisabled !== true) n++
  }
  return n
}

/**
 * @deprecated Use {@link getResearchPhaseForUnlockId} with shuffled {@link ResearchPhaseState}.
 * Kept for modules not yet migrated.
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
  debugUnlockAllRecipes: boolean
}

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
 * Active computronium drains energy; unlock points accrue proportional to paid drain.
 * Unlocks follow {@link syncResearchFlagsFromPoints} and the per-asteroid shuffled {@link order}.
 */
export function stepComputronium(
  dtSec: number,
  cells: VoxelCell[],
  energyState: { current: number },
  unlockPoints: { current: number },
  flags: LaserUnlockApply,
  balance: GameBalance,
  order: readonly ComputroniumUnlockId[],
): boolean {
  if (dtSec <= 0) return false

  const active = countActiveComputronium(cells)

  if (active > 0) {
    const desiredDrain = balance.computroniumEnergyDrainPerSecPerCell * active * dtSec
    const spent =
      desiredDrain > 0 ? trySpendEnergy(energyState, desiredDrain) : 0
    const scale = desiredDrain > 0 ? spent / desiredDrain : 0
    unlockPoints.current +=
      balance.computroniumUnlockPointsPerSecPerCell * active * dtSec * scale
  }

  return syncResearchFlagsFromPoints(order, unlockPoints.current, balance, flags)
}

/**
 * @deprecated Prefer {@link applyResearchStepsCompletedGrant} with shuffle {@link order}.
 * Grants legacy tier-style progress (tier T → 2T research steps, capped).
 */
export function applyResearchTierGrant(
  tier: 1 | 2 | 3 | 4 | 5 | 6,
  flags: LaserUnlockApply,
  unlockPoints: { current: number },
  balance: GameBalance,
  order: readonly ComputroniumUnlockId[],
): void {
  applyLegacyTierAsResearchSteps(order, tier, unlockPoints, balance, flags)
}
