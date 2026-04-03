import type { GameBalance } from './gameBalance'

/** All computronium-driven unlock flags (single object synced from research points + shuffle order). */
export interface LaserUnlockApply {
  orbitalLaserUnlocked: boolean
  excavatingLaserUnlocked: boolean
  scannerLaserUnlocked: boolean
  depthScanUnlocked: boolean
  drossCollectorUnlocked: boolean
  emCatapultUnlocked: boolean
  orbitalSatelliteCount: number
  excavatingSatelliteCount: number
  scannerSatelliteCount: number
  drossCollectorSatelliteCount: number
  cargoDroneSatelliteCount: number
  explosiveChargeUnlocked: boolean
  scourgeUnlocked: boolean
  locustUnlocked: boolean
  miningDroneUnlocked: boolean
  lifterUnlocked: boolean
  cargoDroneToolUnlocked: boolean
}

/** One research step = one tool or satellite deploy tier unlocked (shuffled per asteroid). */
export type ComputroniumUnlockId =
  | 'orbitalLaser'
  | 'excavatingLaser'
  | 'scanner'
  | 'depthScan'
  | 'explosiveCharge'
  | 'drossCollector'
  | 'scourge'
  | 'locust'
  | 'miningDrone'
  | 'lifter'
  | 'cargoDrone'
  | 'emCatapult'

export const COMPUTRONIUM_UNLOCK_IDS: readonly ComputroniumUnlockId[] = [
  'orbitalLaser',
  'excavatingLaser',
  'scanner',
  'depthScan',
  'explosiveCharge',
  'drossCollector',
  'scourge',
  'locust',
  'miningDrone',
  'lifter',
  'cargoDrone',
  'emCatapult',
] as const

export const COMPUTRONIUM_RESEARCH_STEP_COUNT = COMPUTRONIUM_UNLOCK_IDS.length

function rngU32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 0x85ebca6b) + (s >>> 1)) >>> 0
    s ^= s >>> 13
    s = Math.imul(s, 0xc2b2ae35) >>> 0
    return (s >>> 0) / 0x1_0000_0000
  }
}

/**
 * Deterministic shuffle of the full computronium research tree for this asteroid seed.
 */
export function buildComputroniumResearchOrder(asteroidSeed: number): ComputroniumUnlockId[] {
  const a = COMPUTRONIUM_UNLOCK_IDS.slice() as ComputroniumUnlockId[]
  const rnd = rngU32(asteroidSeed ^ 0x524f4944)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const t = a[i]!
    a[i] = a[j]!
    a[j] = t
  }
  return a
}

export function researchStepsCompleted(unlockPoints: number, pointsPerStage: number): number {
  if (!Number.isFinite(pointsPerStage) || pointsPerStage <= 0) return 0
  return Math.min(
    COMPUTRONIUM_RESEARCH_STEP_COUNT,
    Math.floor(unlockPoints / pointsPerStage),
  )
}

export function thresholdPointsForStepIndex(stepIndex: number, pointsPerStage: number): number {
  return pointsPerStage * (stepIndex + 1)
}

/** Index of `id` in this asteroid's order, or -1. */
export function unlockIndexInOrder(order: readonly ComputroniumUnlockId[], id: ComputroniumUnlockId): number {
  return order.indexOf(id)
}

/**
 * Apply unlock flags implied by cumulative unlock points and this asteroid's shuffled order.
 * Returns whether any unlock flag changed.
 */
export function syncResearchFlagsFromPoints(
  order: readonly ComputroniumUnlockId[],
  unlockPoints: number,
  balance: GameBalance,
  flags: LaserUnlockApply,
): boolean {
  const per = balance.computroniumPointsPerStage
  const n = researchStepsCompleted(unlockPoints, per)
  let changed = false

  for (let j = 0; j < n; j++) {
    const id = order[j]
    if (!id) continue
    changed = applyUnlockId(id, flags) || changed
  }
  return changed
}

function applyUnlockId(id: ComputroniumUnlockId, flags: LaserUnlockApply): boolean {
  let changed = false
  switch (id) {
    case 'orbitalLaser':
      if (!flags.orbitalLaserUnlocked) {
        flags.orbitalLaserUnlocked = true
        flags.orbitalSatelliteCount = Math.max(1, flags.orbitalSatelliteCount)
        changed = true
      }
      break
    case 'excavatingLaser':
      if (!flags.excavatingLaserUnlocked) {
        flags.excavatingLaserUnlocked = true
        flags.excavatingSatelliteCount = Math.max(1, flags.excavatingSatelliteCount)
        changed = true
      }
      break
    case 'scanner':
      if (!flags.scannerLaserUnlocked) {
        flags.scannerLaserUnlocked = true
        flags.scannerSatelliteCount = Math.max(1, flags.scannerSatelliteCount)
        changed = true
      }
      break
    case 'depthScan':
      if (!flags.depthScanUnlocked) {
        flags.depthScanUnlocked = true
        changed = true
      }
      break
    case 'explosiveCharge':
      if (!flags.explosiveChargeUnlocked) {
        flags.explosiveChargeUnlocked = true
        changed = true
      }
      break
    case 'drossCollector':
      if (!flags.drossCollectorUnlocked) {
        flags.drossCollectorUnlocked = true
        flags.drossCollectorSatelliteCount = Math.max(1, flags.drossCollectorSatelliteCount)
        changed = true
      }
      break
    case 'scourge':
      if (!flags.scourgeUnlocked) {
        flags.scourgeUnlocked = true
        changed = true
      }
      break
    case 'locust':
      if (!flags.locustUnlocked) {
        flags.locustUnlocked = true
        changed = true
      }
      break
    case 'miningDrone':
      if (!flags.miningDroneUnlocked) {
        flags.miningDroneUnlocked = true
        changed = true
      }
      break
    case 'lifter':
      if (!flags.lifterUnlocked) {
        flags.lifterUnlocked = true
        changed = true
      }
      break
    case 'cargoDrone':
      if (!flags.cargoDroneToolUnlocked) {
        flags.cargoDroneToolUnlocked = true
        flags.cargoDroneSatelliteCount = Math.max(1, flags.cargoDroneSatelliteCount)
        changed = true
      }
      break
    case 'emCatapult':
      if (!flags.emCatapultUnlocked) {
        flags.emCatapultUnlocked = true
        changed = true
      }
      break
    default:
      break
  }
  return changed
}

export interface ResearchPhaseState {
  order: readonly ComputroniumUnlockId[]
  unlockPoints: number
  activeComputronium: number
  flags: LaserUnlockApply
}

function nextPendingStepIndex(order: readonly ComputroniumUnlockId[], unlockPoints: number, per: number): number {
  for (let i = 0; i < order.length; i++) {
    if (unlockPoints < thresholdPointsForStepIndex(i, per)) return i
  }
  return order.length
}

/**
 * UI phase for one computronium-gated unlock, using shuffled order (no fixed F7→F9 chain).
 */
export type ResearchToolUiPhase = 'hidden' | 'researching' | 'unlocked'

export function getResearchPhaseForUnlockId(
  id: ComputroniumUnlockId,
  balance: GameBalance,
  state: ResearchPhaseState,
): ResearchToolUiPhase {
  const per = balance.computroniumPointsPerStage
  const i = unlockIndexInOrder(state.order, id)
  if (i < 0) return 'hidden'

  const flagUnlocked = isFlagTrueForId(id, state.flags)
  if (flagUnlocked) return 'unlocked'

  const need = thresholdPointsForStepIndex(i, per)
  const next = nextPendingStepIndex(state.order, state.unlockPoints, per)
  if (i !== next) return 'hidden'
  if (state.activeComputronium > 0 && state.unlockPoints < need) return 'researching'
  return 'hidden'
}

function isFlagTrueForId(id: ComputroniumUnlockId, flags: LaserUnlockApply): boolean {
  switch (id) {
    case 'orbitalLaser':
      return flags.orbitalLaserUnlocked
    case 'excavatingLaser':
      return flags.excavatingLaserUnlocked
    case 'scanner':
      return flags.scannerLaserUnlocked
    case 'depthScan':
      return flags.depthScanUnlocked
    case 'explosiveCharge':
      return flags.explosiveChargeUnlocked
    case 'drossCollector':
      return flags.drossCollectorUnlocked
    case 'scourge':
      return flags.scourgeUnlocked
    case 'locust':
      return flags.locustUnlocked
    case 'miningDrone':
      return flags.miningDroneUnlocked
    case 'lifter':
      return flags.lifterUnlocked
    case 'cargoDrone':
      return flags.cargoDroneToolUnlocked
    case 'emCatapult':
      return flags.emCatapultUnlocked
    default:
      return false
  }
}

const UNLOCK_ID_TO_PLAYER_TOOL: Partial<Record<ComputroniumUnlockId, string>> = {
  orbitalLaser: 'orbitalLaser',
  excavatingLaser: 'excavatingLaser',
  scanner: 'scanner',
  depthScan: 'depthScanner',
  explosiveCharge: 'explosiveCharge',
  drossCollector: 'drossCollector',
  scourge: 'scourge',
  locust: 'locust',
  miningDrone: 'miningDrone',
  lifter: 'lifter',
  cargoDrone: 'cargoDrone',
  emCatapult: 'emCatapult',
}

export function getResearchPhaseForPlayerToolId(
  toolId: string,
  balance: GameBalance,
  state: ResearchPhaseState,
): ResearchToolUiPhase | undefined {
  const entry = Object.entries(UNLOCK_ID_TO_PLAYER_TOOL).find(([, t]) => t === toolId)
  if (!entry) return undefined
  return getResearchPhaseForUnlockId(entry[0] as ComputroniumUnlockId, balance, state)
}

/** Grant research progress: `steps` completed unlocks worth of minimum unlock points (syncs flags). */
export function applyResearchStepsCompletedGrant(
  order: readonly ComputroniumUnlockId[],
  steps: number,
  unlockPoints: { current: number },
  balance: GameBalance,
  flags: LaserUnlockApply,
): void {
  const per = balance.computroniumPointsPerStage
  const clamped = Math.max(0, Math.min(COMPUTRONIUM_RESEARCH_STEP_COUNT, steps))
  unlockPoints.current = Math.max(unlockPoints.current, per * clamped * 1.01)
  syncResearchFlagsFromPoints(order, unlockPoints.current, balance, flags)
}

/** Full clear for debug tier-style grants (maps old tier 1..6 to step counts). */
export function applyLegacyTierAsResearchSteps(
  order: readonly ComputroniumUnlockId[],
  tier: 1 | 2 | 3 | 4 | 5 | 6,
  unlockPoints: { current: number },
  balance: GameBalance,
  flags: LaserUnlockApply,
): void {
  const steps = Math.min(COMPUTRONIUM_RESEARCH_STEP_COUNT, tier * 2)
  applyResearchStepsCompletedGrant(order, steps, unlockPoints, balance, flags)
}
