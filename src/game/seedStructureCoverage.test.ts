import { describe, expect, it } from 'vitest'
import {
  BATTERY_BUILD_COST,
  defaultSeedRecipeStackForMaxStacks,
  HUB_BUILD_COST,
  REACTOR_BUILD_COST,
  structureChainRootIdsFromBuildCosts,
  STRUCTURE_CHAIN_ROOT_IDS_ORDERED,
} from './energyAndStructures'
import { SEED_DEFS, type SeedId } from './seedDefs'
import { SEED_RECIPE_DEFS } from './seedRecipes'
import { ROOT_RESOURCE_IDS, type RootResourceId } from './resources'

function sameSet(a: readonly RootResourceId[], b: readonly RootResourceId[]): boolean {
  if (a.length !== b.length) return false
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size !== sb.size) return false
  for (const x of sa) if (!sb.has(x)) return false
  return true
}

describe('structure chain roots vs build costs', () => {
  it('ordered list matches union of reactor/hub/battery root keys', () => {
    const fromCosts = structureChainRootIdsFromBuildCosts()
    expect(sameSet(STRUCTURE_CHAIN_ROOT_IDS_ORDERED, fromCosts)).toBe(true)
  })

  it('reactor/hub/battery costs only use roots covered by the ordered list (plus refined)', () => {
    const allowed = new Set<RootResourceId>(STRUCTURE_CHAIN_ROOT_IDS_ORDERED)
    for (const c of [REACTOR_BUILD_COST, HUB_BUILD_COST, BATTERY_BUILD_COST]) {
      for (const k of Object.keys(c)) {
        const id = k as RootResourceId
        if ((ROOT_RESOURCE_IDS as readonly string[]).includes(k)) {
          expect(allowed.has(id)).toBe(true)
        }
      }
    }
  })
})

describe('seed recipes for structure chain', () => {
  it('every structure-chain root is tier 0 and allows basicSeed', () => {
    for (const id of STRUCTURE_CHAIN_ROOT_IDS_ORDERED) {
      const def = SEED_RECIPE_DEFS[id]
      expect(def, `missing SEED_RECIPE_DEFS[${id}]`).toBeDefined()
      expect(def!.requiredComputroniumTier).toBe(0)
      expect(def!.allowedSeedTypes).toContain('basicSeed')
    }
  })

  it('tier-0 seed types can select every structure-chain recipe at tier 0', () => {
    const tier0SeedIds = (Object.keys(SEED_DEFS) as SeedId[]).filter((id) => SEED_DEFS[id].requiredComputroniumTier === 0)
    for (const seedId of tier0SeedIds) {
      for (const id of STRUCTURE_CHAIN_ROOT_IDS_ORDERED) {
        const def = SEED_RECIPE_DEFS[id]!
        expect(def.allowedSeedTypes).toContain(seedId)
      }
    }
  })
})

describe('defaultSeedRecipeStackForMaxStacks', () => {
  it('returns first maxStacks roots when maxStacks is at most chain length', () => {
    const chain = [...STRUCTURE_CHAIN_ROOT_IDS_ORDERED]
    expect(defaultSeedRecipeStackForMaxStacks(chain.length)).toEqual(chain)
    expect(defaultSeedRecipeStackForMaxStacks(chain.length - 1)).toEqual(chain.slice(0, chain.length - 1))
  })

  it('pads with regolithMass when maxStacks exceeds chain length', () => {
    const chain = [...STRUCTURE_CHAIN_ROOT_IDS_ORDERED]
    const pad = (n: number) => Array.from({ length: n }, () => 'regolithMass' as const)
    expect(defaultSeedRecipeStackForMaxStacks(chain.length + 1)).toEqual([...chain, ...pad(1)])
    expect(defaultSeedRecipeStackForMaxStacks(chain.length + 2)).toEqual([...chain, ...pad(2)])
    expect(defaultSeedRecipeStackForMaxStacks(8)).toEqual([...chain, ...pad(8 - chain.length)])
    expect(defaultSeedRecipeStackForMaxStacks(9)).toEqual([...chain, ...pad(9 - chain.length)])
    expect(defaultSeedRecipeStackForMaxStacks(10)).toEqual([...chain, ...pad(10 - chain.length)])
  })

  it('matches SEED_DEFS defaultRecipeStack for each seed type', () => {
    for (const id of Object.keys(SEED_DEFS) as SeedId[]) {
      const def = SEED_DEFS[id]
      expect(def.defaultRecipeStack).toEqual(defaultSeedRecipeStackForMaxStacks(def.maxRecipeStacks))
    }
  })
})
