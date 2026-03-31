import type { ResourceId } from './resources'

export type SeedId = 'basicSeed' | 'efficientSeed' | 'longlifeSeed'

export interface SeedRecipeStackEntry {
  resourceId: ResourceId
}

export interface SeedDef {
  id: SeedId
  displayName: string
  description: string
  /** Lifetime for replicators instantiated from this seed (seconds of active operation). */
  lifetimeSec: number
  /** Maximum number of recipe stack entries this seed may hold. */
  maxRecipeStacks: number
  /**
   * Default recipe stack for this seed.
   * Each entry corresponds to one resource-conversion “slot” in the UI.
   */
  defaultRecipeStack: SeedRecipeStackEntry[]
  /**
   * Computronium research tier required to unlock this seed in normal progression.
   * 0 = available from start (no computronium needed).
   * 1+ = gated behind computronium tiers (see computroniumSim).
   */
  requiredComputroniumTier: 0 | 1 | 2 | 3 | 4 | 5 | 6
}

export const SEED_DEFS: Record<SeedId, SeedDef> = {
  basicSeed: {
    id: 'basicSeed',
    displayName: 'Basic Seed',
    description:
      'Entry-level programming for Replicators. Short-lived and limited stack depth, but available from the start.',
    lifetimeSec: 60,
    maxRecipeStacks: 1,
    defaultRecipeStack: [],
    requiredComputroniumTier: 0,
  },
  efficientSeed: {
    id: 'efficientSeed',
    displayName: 'Efficient Seed',
    description:
      'Improved routing and batching for Replicators. Moderate lifetime with a deeper recipe stack.',
    lifetimeSec: 180,
    maxRecipeStacks: 2,
    defaultRecipeStack: [],
    requiredComputroniumTier: 2,
  },
  longlifeSeed: {
    id: 'longlifeSeed',
    displayName: 'Longlife Seed',
    description:
      'Extended duty cycle firmware. Replicators seeded with this run for much longer before idling.',
    lifetimeSec: 420,
    maxRecipeStacks: 1,
    defaultRecipeStack: [],
    requiredComputroniumTier: 3,
  },
}

export function getSeedDef(id: SeedId): SeedDef {
  return SEED_DEFS[id]
}

