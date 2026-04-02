import type { GameBalance } from './gameBalance'
import { ROOT_RESOURCE_IDS, type RootResourceId } from './resources'

export type InitialRefineryRecipesPreset = 'default' | 'none' | 'basicBand'

/**
 * Roots that can refine from game start (covers replicator/reactor/hub/refinery/battery/depth costs
 * across the whole progression).
 */
export const INITIALLY_UNLOCKED_REFINERY_ROOTS: ReadonlySet<RootResourceId> = new Set([
  'regolithMass',
  'silicates',
  'metals',
  'volatiles',
  'sulfides',
  'oxides',
  'carbonaceous',
  'hydrates',
  'ices',
  'refractories',
  'phosphates',
  'halides',
])

let debugInitialUnlockedPreset: InitialRefineryRecipesPreset = 'default'
let debugInitialUnlockedOverride: ReadonlySet<RootResourceId> | null = null

export function getDebugInitialRefineryRecipesPreset(): InitialRefineryRecipesPreset {
  return debugInitialUnlockedPreset
}

export function setDebugInitialRefineryRecipesPreset(preset: InitialRefineryRecipesPreset): void {
  debugInitialUnlockedPreset = preset
  if (preset === 'default') {
    debugInitialUnlockedOverride = null
  } else if (preset === 'none') {
    debugInitialUnlockedOverride = new Set<RootResourceId>()
  } else if (preset === 'basicBand') {
    debugInitialUnlockedOverride = new Set<RootResourceId>(['regolithMass', 'silicates', 'metals'])
  }
}

/**
 * Roots that require computronium research (tier index 6..12 → one root each). Order matters.
 * Currently empty; all refinery roots are available without additional computronium tiers so that
 * halide-line refinement (NaCl / Fl) does not form a cycle with computronium progression.
 */
export const REFINERY_ROOT_COMPUTRONIUM_TIER_ORDER: readonly RootResourceId[] = []

export function isRefineryRootUnlockedByDefault(root: RootResourceId): boolean {
  if (debugInitialUnlockedOverride) {
    return debugInitialUnlockedOverride.has(root)
  }
  return INITIALLY_UNLOCKED_REFINERY_ROOTS.has(root)
}

export function computroniumTierThresholdForRefinerySlot(balance: GameBalance, slotIndex: number): number {
  const tier = 6 + slotIndex
  return balance.computroniumPointsPerStage * tier
}

export function refineryRootComputroniumSlot(root: RootResourceId): number | null {
  const i = REFINERY_ROOT_COMPUTRONIUM_TIER_ORDER.indexOf(root)
  return i >= 0 ? i : null
}

/** First root in display order that is unlocked (for default selection). */
export function defaultRefineryRecipeSelection(
  unlocked: (root: RootResourceId) => boolean,
): RootResourceId {
  for (const root of ROOT_RESOURCE_IDS) {
    if (unlocked(root)) return root
  }
  return 'silicates'
}
