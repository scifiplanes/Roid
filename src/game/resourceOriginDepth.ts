import { VOXEL_KIND_DEFS } from './voxelKinds'
import { RESOURCE_DEFS, type ResourceId, type RootResourceId } from './resources'

/** Lithology band depth weights: regolith shell → silicate mantle → metal-rich interior. */
const BAND_DEPTH = {
  regolith: 0,
  silicateRock: 0.5,
  metalRich: 1,
} as const

/**
 * Roots absent from all three mining templates (e.g. halides): shallow evaporite / fracture fill.
 * Mid-depth used when no explicit entry.
 */
const ROOT_DEPTH_FALLBACK: Partial<Record<RootResourceId, number>> = {
  halides: 0.22,
}

/**
 * Expected origin depth in [0, 1] from yield-weighted lithology bands (same templates as bulk composition).
 */
export function usualOriginDepth01ForRoot(root: RootResourceId): number {
  let wSum = 0
  let depthSum = 0
  for (const kind of ['regolith', 'silicateRock', 'metalRich'] as const) {
    const y = VOXEL_KIND_DEFS[kind].yields[root] ?? 0
    if (y <= 0) continue
    depthSum += y * BAND_DEPTH[kind]
    wSum += y
  }
  if (wSum <= 0) {
    return ROOT_DEPTH_FALLBACK[root] ?? 0.5
  }
  return Math.min(1, Math.max(0, depthSum / wSum))
}

function rootAncestor(id: ResourceId): RootResourceId {
  let cur: ResourceId = id
  for (;;) {
    const p = RESOURCE_DEFS[cur].parent
    if (p === null) return cur as RootResourceId
    cur = p
  }
}

/** Usual depth for any commodity: roots from lithology; refined inherit their parent root. */
export function usualOriginDepth01(id: ResourceId): number {
  return usualOriginDepth01ForRoot(rootAncestor(id))
}

/**
 * HUD text color on the VGA blue panel: shallow → warm yellow, deep → cool magenta (HSL lerp).
 */
export function resourceHudCssColorForId(id: ResourceId): string {
  const d = usualOriginDepth01(id)
  const h = 52 + d * (278 - 52)
  const s = 90 - d * 18
  const l = 72 - d * 10
  return `hsl(${h}, ${s}%, ${l}%)`
}
