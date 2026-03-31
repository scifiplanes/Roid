import type { SeedId } from './seedDefs'
import type { ResourceId } from './resources'

export interface SeedRecipeDef {
  id: ResourceId
  /** True when this recipe is required for basic progression and available at tier 0. */
  progressionCritical: boolean
  /**
   * Computronium research tier required to unlock this recipe in normal progression.
   * 0 = available from start; 1+ = gated behind tiers (see computroniumSim).
   */
  requiredComputroniumTier: 0 | 1 | 2 | 3 | 4 | 5 | 6
  /** Seed types that may use this recipe. */
  allowedSeedTypes: readonly SeedId[]
}

export const SEED_RECIPE_DEFS: Partial<Record<ResourceId, SeedRecipeDef>> = {
  regolithMass: {
    id: 'regolithMass',
    progressionCritical: true,
    requiredComputroniumTier: 0,
    allowedSeedTypes: [
      'basicSeed',
      'efficientSeed',
      'longlifeSeed',
      'burstSeed',
      'schedulerSeed',
      'macroSeed',
      'expertSeed',
    ],
  },
  silicates: {
    id: 'silicates',
    progressionCritical: true,
    requiredComputroniumTier: 0,
    allowedSeedTypes: [
      'basicSeed',
      'efficientSeed',
      'longlifeSeed',
      'burstSeed',
      'schedulerSeed',
      'macroSeed',
      'expertSeed',
    ],
  },
  metals: {
    id: 'metals',
    progressionCritical: true,
    requiredComputroniumTier: 0,
    allowedSeedTypes: [
      'basicSeed',
      'efficientSeed',
      'longlifeSeed',
      'burstSeed',
      'schedulerSeed',
      'macroSeed',
      'expertSeed',
    ],
  },
  volatiles: {
    id: 'volatiles',
    progressionCritical: true,
    requiredComputroniumTier: 0,
    allowedSeedTypes: [
      'basicSeed',
      'efficientSeed',
      'longlifeSeed',
      'burstSeed',
      'schedulerSeed',
      'macroSeed',
      'expertSeed',
    ],
  },
  sulfides: {
    id: 'sulfides',
    progressionCritical: false,
    requiredComputroniumTier: 1,
    allowedSeedTypes: ['efficientSeed', 'longlifeSeed', 'burstSeed', 'schedulerSeed', 'macroSeed', 'expertSeed'],
  },
  oxides: {
    id: 'oxides',
    progressionCritical: false,
    requiredComputroniumTier: 1,
    allowedSeedTypes: ['efficientSeed', 'longlifeSeed', 'burstSeed', 'schedulerSeed', 'macroSeed', 'expertSeed'],
  },
  carbonaceous: {
    id: 'carbonaceous',
    progressionCritical: false,
    requiredComputroniumTier: 2,
    allowedSeedTypes: ['efficientSeed', 'longlifeSeed', 'burstSeed', 'schedulerSeed', 'macroSeed', 'expertSeed'],
  },
  hydrates: {
    id: 'hydrates',
    progressionCritical: false,
    requiredComputroniumTier: 2,
    allowedSeedTypes: ['efficientSeed', 'longlifeSeed', 'burstSeed', 'schedulerSeed', 'macroSeed', 'expertSeed'],
  },
  ices: {
    id: 'ices',
    progressionCritical: false,
    requiredComputroniumTier: 3,
    allowedSeedTypes: ['efficientSeed', 'longlifeSeed', 'burstSeed', 'schedulerSeed', 'macroSeed', 'expertSeed'],
  },
  refractories: {
    id: 'refractories',
    progressionCritical: false,
    requiredComputroniumTier: 3,
    allowedSeedTypes: ['efficientSeed', 'longlifeSeed', 'burstSeed', 'schedulerSeed', 'macroSeed', 'expertSeed'],
  },
  phosphates: {
    id: 'phosphates',
    progressionCritical: false,
    requiredComputroniumTier: 4,
    allowedSeedTypes: ['efficientSeed', 'longlifeSeed', 'burstSeed', 'schedulerSeed', 'macroSeed', 'expertSeed'],
  },
  halides: {
    id: 'halides',
    progressionCritical: false,
    requiredComputroniumTier: 6,
    allowedSeedTypes: ['efficientSeed', 'longlifeSeed', 'burstSeed', 'schedulerSeed', 'macroSeed', 'expertSeed'],
  },
}

export interface SeedRecipeAvailabilityState {
  /** Cumulative computronium unlock points. */
  unlockPoints: number
  /** Points required per research stage (mirrors `gameBalance.computroniumPointsPerStage`). */
  pointsPerStage: number
  /** When true (debug), treat all recipes as unlocked regardless of tier. */
  debugUnlockAllSeedRecipes?: boolean
}

export function currentComputroniumTier(
  unlockPoints: number,
  pointsPerStage: number,
): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  if (!Number.isFinite(pointsPerStage) || pointsPerStage <= 0) return 0
  const t = Math.floor(unlockPoints / pointsPerStage)
  if (t <= 0) return 0
  if (t >= 6) return 6
  return t as 1 | 2 | 3 | 4 | 5 | 6
}

export function isSeedRecipeUnlocked(
  id: ResourceId,
  seedId: SeedId,
  state: SeedRecipeAvailabilityState,
): boolean {
  const def = SEED_RECIPE_DEFS[id]
  if (!def) return false
  if (!def.allowedSeedTypes.includes(seedId)) return false
  if (state.debugUnlockAllSeedRecipes) return true
  const tier = currentComputroniumTier(state.unlockPoints, state.pointsPerStage)
  return tier >= def.requiredComputroniumTier
}

export function getAvailableSeedRecipesForSeed(
  seedId: SeedId,
  state: SeedRecipeAvailabilityState,
): ResourceId[] {
  const out: ResourceId[] = []
  for (const def of Object.values(SEED_RECIPE_DEFS)) {
    if (!def) continue
    if (!def.allowedSeedTypes.includes(seedId)) continue
    if (isSeedRecipeUnlocked(def.id, seedId, state)) {
      out.push(def.id)
    }
  }
  return out
}

