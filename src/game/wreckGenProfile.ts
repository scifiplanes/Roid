import type { WreckArchetype, WreckProfile } from './coreAssets'

export function deriveWreckProfile(seed: number): { archetype: WreckArchetype; profile: WreckProfile } {
  // Simple deterministic pick for now: use seed hash to choose an archetype.
  const h = (seed >>> 0) % 5
  const archetype: WreckArchetype =
    h === 0 ? 'hullChunk' : h === 1 ? 'truss' : h === 2 ? 'cargoPod' : h === 3 ? 'stationPanel' : 'antenna'

  // Lightweight tunables per archetype; can be expanded later.
  switch (archetype) {
    case 'truss':
      return {
        archetype,
        profile: {
          baseHalfExtent: 9,
          slabCountRange: [3, 6],
          voidCutChance: 0.18,
          fragmentJitter: 0.2,
        },
      }
    case 'cargoPod':
      return {
        archetype,
        profile: {
          baseHalfExtent: 7,
          slabCountRange: [2, 4],
          voidCutChance: 0.1,
          fragmentJitter: 0.18,
        },
      }
    case 'stationPanel':
      return {
        archetype,
        profile: {
          baseHalfExtent: 10,
          slabCountRange: [3, 5],
          voidCutChance: 0.16,
          fragmentJitter: 0.22,
        },
      }
    case 'antenna':
      return {
        archetype,
        profile: {
          baseHalfExtent: 8,
          slabCountRange: [2, 5],
          voidCutChance: 0.14,
          fragmentJitter: 0.24,
        },
      }
    case 'hullChunk':
    default:
      return {
        archetype: 'hullChunk',
        profile: {
          baseHalfExtent: 11,
          slabCountRange: [3, 6],
          voidCutChance: 0.14,
          fragmentJitter: 0.2,
        },
      }
  }
}

