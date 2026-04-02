import type { ResourceId } from './resources'

export type SeedId =
  | 'basicSeed'
  | 'efficientSeed'
  | 'longlifeSeed'
  | 'burstSeed'
  | 'schedulerSeed'
  | 'macroSeed'
  | 'expertSeed'

export interface SeedDef {
  id: SeedId
  displayName: string
  description: string
  /**
   * Legacy default lifetime for replicators instantiated from this seed (seconds of active operation).
   * Kept for backwards compatibility; new code should use `minLifetimeSec` / `maxLifetimeSec` and
   * per-stack chosen lifetimes instead.
   */
  lifetimeSec: number
  /** Minimum lifetime a Seed stack may choose for this seed type (seconds). */
  minLifetimeSec: number
  /** Maximum lifetime a Seed stack may choose for this seed type (seconds). */
  maxLifetimeSec: number
  /** Maximum number of recipe stack entries this seed may hold. */
  maxRecipeStacks: number
  /**
   * Default recipe stack for this seed.
   * Each entry corresponds to one resource-conversion “slot” in the UI.
   */
  defaultRecipeStack: ResourceId[]
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
      'Entry-level programming for Replicators. Simple, short-lived scripts with a couple of steps.',
    lifetimeSec: 60,
    minLifetimeSec: 20,
    maxLifetimeSec: 120,
    maxRecipeStacks: 2,
    defaultRecipeStack: ['regolithMass'],
    requiredComputroniumTier: 0,
  },
  efficientSeed: {
    id: 'efficientSeed',
    displayName: 'Efficient Seed',
    description:
      'Improved routing and batching for Replicators. Moderate lifetime with a small multistep stack.',
    lifetimeSec: 180,
    minLifetimeSec: 60,
    maxLifetimeSec: 360,
    maxRecipeStacks: 4,
    defaultRecipeStack: ['regolithMass', 'silicates'],
    requiredComputroniumTier: 0,
  },
  longlifeSeed: {
    id: 'longlifeSeed',
    displayName: 'Longlife Seed',
    description:
      'Extended duty cycle firmware. Longer-running scripts with room for several phases.',
    lifetimeSec: 420,
    minLifetimeSec: 120,
    maxLifetimeSec: 720,
    maxRecipeStacks: 5,
    defaultRecipeStack: ['regolithMass', 'silicates', 'metals'],
    requiredComputroniumTier: 0,
  },
  burstSeed: {
    id: 'burstSeed',
    displayName: 'Burst Seed',
    description:
      'Short, high-intensity bursts. Great for quick extra output that often ends in a deliberate die.',
    lifetimeSec: 60,
    minLifetimeSec: 15,
    maxLifetimeSec: 90,
    maxRecipeStacks: 4,
    defaultRecipeStack: ['metals', 'volatiles'],
    requiredComputroniumTier: 0,
  },
  schedulerSeed: {
    id: 'schedulerSeed',
    displayName: 'Scheduler Seed',
    description:
      'Pause-heavy scripts for staged production: alternate work and idle windows before a clean shutdown.',
    lifetimeSec: 360,
    minLifetimeSec: 120,
    maxLifetimeSec: 600,
    maxRecipeStacks: 7,
    defaultRecipeStack: ['regolithMass', 'silicates', 'volatiles'],
    requiredComputroniumTier: 4,
  },
  macroSeed: {
    id: 'macroSeed',
    displayName: 'Macro Seed',
    description:
      'Late-game macro-programming: deep, long-running sequences that choreograph many phases.',
    lifetimeSec: 900,
    minLifetimeSec: 240,
    maxLifetimeSec: 1200,
    maxRecipeStacks: 9,
    defaultRecipeStack: ['regolithMass', 'silicates', 'metals', 'volatiles'],
    requiredComputroniumTier: 5,
  },
  expertSeed: {
    id: 'expertSeed',
    displayName: 'Expert Seed',
    description:
      'Expert-only firmware with the deepest stack and longest lifetime for elaborate choreographies.',
    lifetimeSec: 1200,
    minLifetimeSec: 300,
    maxLifetimeSec: 1500,
    maxRecipeStacks: 10,
    defaultRecipeStack: ['regolithMass', 'silicates', 'metals', 'volatiles'],
    requiredComputroniumTier: 6,
  },
}

export function getSeedDef(id: SeedId): SeedDef {
  return SEED_DEFS[id]
}

