import { Color } from 'three'
import type { ResourceId } from './resources'

/** Lithology buckets for procedural asteroids (inspired by regolith / mantle / core analogs). */
export type VoxelKind =
  | 'regolith'
  | 'silicateRock'
  | 'metalRich'
  | 'processedMatter'
  | 'replicator'
  | 'reactor'
  | 'battery'
  | 'hub'
  | 'refinery'
  | 'depthScanner'
  | 'computronium'

export interface VoxelKindDef {
  maxDurability: number
  /** Resources granted when the voxel is fully destroyed (one pop). */
  yields: Partial<Record<ResourceId, number>>
  /** Multiplier on the global base rock tint (RGB). */
  colorTint: Color
}

/**
 * Bright teal target while a replicator is still eating rock (emissive layer tints instance color).
 * Mature cells use `replicator.colorTint` instead.
 */
export const REPLICATOR_PROCESSING_TINT = new Color(0.1, 0.88, 0.78)

export const VOXEL_KIND_DEFS: Record<VoxelKind, VoxelKindDef> = {
  regolith: {
    maxDurability: 1,
    yields: {
      regolithMass: 4,
      silicates: 1,
      volatiles: 1,
      carbonaceous: 1,
      hydrates: 1,
      ices: 1,
    },
    colorTint: new Color(0.74, 0.68, 0.6),
  },
  silicateRock: {
    maxDurability: 2,
    yields: { silicates: 4, metals: 1, sulfides: 1, oxides: 1, phosphates: 1 },
    colorTint: new Color(0.54, 0.47, 0.42),
  },
  metalRich: {
    maxDurability: 4,
    yields: { metals: 5, silicates: 2, refractories: 1, oxides: 1 },
    colorTint: new Color(0.4, 0.41, 0.46),
  },
  processedMatter: {
    maxDurability: 1,
    yields: {},
    colorTint: new Color(0.22, 0.17, 0.28),
  },
  replicator: {
    maxDurability: 0,
    yields: {},
    colorTint: new Color(0.34, 0.5, 0.46),
  },
  reactor: {
    maxDurability: 0,
    yields: {},
    colorTint: new Color(0.06, 0.92, 0.88),
  },
  battery: {
    maxDurability: 0,
    yields: {},
    colorTint: new Color(0.12, 0.22, 0.55),
  },
  hub: {
    maxDurability: 0,
    yields: {},
    colorTint: new Color(0.98, 0.88, 0.18),
  },
  refinery: {
    maxDurability: 0,
    yields: {},
    colorTint: new Color(0.95, 0.32, 0.14),
  },
  depthScanner: {
    maxDurability: 0,
    yields: {},
    colorTint: new Color(0.42, 0.28, 0.62),
  },
  computronium: {
    maxDurability: 0,
    yields: {},
    colorTint: new Color(0.38, 0.14, 0.42),
  },
}

export function getKindDef(kind: VoxelKind): VoxelKindDef {
  return VOXEL_KIND_DEFS[kind]
}
