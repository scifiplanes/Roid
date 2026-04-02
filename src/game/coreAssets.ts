export type CoreAssetKind = 'asteroid' | 'wreck'

export type WreckId = string

export type WreckArchetype = 'hullChunk' | 'truss' | 'cargoPod' | 'stationPanel' | 'antenna'

export interface WreckProfile {
  baseHalfExtent: number
  slabCountRange: readonly [number, number]
  voidCutChance: number
  fragmentJitter: number
}

/**
 * Shared fields for top-level voxel assets (asteroids, wrecks, etc.).
 */
export interface CoreAssetBase {
  id: string
  kind: CoreAssetKind
  seed: number
  gridSize: number
}

export interface AsteroidAsset extends CoreAssetBase {
  kind: 'asteroid'
  /** Procedural profile for this asteroid's shape and composition. */
  // Narrowed import in consumers; kept loose here to avoid a hard dependency cycle.
  profile: unknown
}

export interface WreckAsset extends CoreAssetBase {
  kind: 'wreck'
  archetype: WreckArchetype
  profile: WreckProfile
}

export type CoreAsset = AsteroidAsset | WreckAsset


