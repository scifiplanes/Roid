import type { GameBalance } from './gameBalance'
import { trySpendEnergy } from './energyAndStructures'
import type { VoxelCell } from './voxelState'

export interface LaserUnlockApply {
  orbitalLaserUnlocked: boolean
  excavatingLaserUnlocked: boolean
  scannerLaserUnlocked: boolean
  /** Fourth computronium stage (after scanner satellite); gates depth scan tool + passive reveal. */
  depthScanUnlocked: boolean
  /** Fifth stage: cleanup collector satellite deploy. */
  drossCollectorUnlocked: boolean
  orbitalSatelliteCount: number
  excavatingSatelliteCount: number
  scannerSatelliteCount: number
  drossCollectorSatelliteCount: number
}

export type LaserToolId = 'orbitalLaser' | 'excavatingLaser' | 'scanner'

export type LaserToolUiPhase = 'hidden' | 'researching' | 'unlocked'

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

  return unlocksChanged
}

/**
 * Force research tiers up to `tier` (inclusive), matching cumulative unlocks from {@link stepComputronium}
 * when crossing each threshold (satellite floors for laser tiers + cleanup collector at tier 5).
 */
export function applyResearchTierGrant(tier: 1 | 2 | 3 | 4 | 5, flags: LaserUnlockApply): void {
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
}
