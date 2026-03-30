import type { VoxelPos } from '../scene/asteroid/generateAsteroidVoxels'
import type { AsteroidGenProfile } from './asteroidGenProfile'
import type { VoxelKind } from './voxelKinds'
import { getKindDef } from './voxelKinds'
import type { RootResourceId } from './resources'
import { defaultUniformRootComposition, RESOURCE_DEFS, ROOT_RESOURCE_IDS } from './resources'

/** Deterministic [0, 1); exported for scan display variance (same formula as bulk jitter). */
export function latticeHash(seed: number, ix: number, iy: number, iz: number): number {
  let n = ix * 374761393 + iy * 668265263 + iz * 1274126177 + seed * 1442695041
  n = (n ^ (n >>> 13)) * 1274126177
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

/** Per-root jitter around 1; spread scales with `compositionJitterScale` (1 = legacy 0.82–1.18). */
function jitterForRoot(
  seed: number,
  pos: VoxelPos,
  root: RootResourceId,
  salt: number,
  compositionJitterScale: number,
): number {
  const ord = ROOT_RESOURCE_IDS.indexOf(root)
  const h = latticeHash(seed + salt * 31, pos.x + ord * 7, pos.y + ord * 13, pos.z + ord * 19)
  return 1 + (h - 0.5) * 0.36 * compositionJitterScale
}

/**
 * Normalized mass fractions over root categories (sum ≈ 1).
 * Biased by lithology template, asteroid profile (spectral × regime × dials), then per-cell jitter.
 */
export function computeBulkComposition(
  seed: number,
  pos: VoxelPos,
  kind: VoxelKind,
  profile?: AsteroidGenProfile,
): Record<RootResourceId, number> {
  const template = getKindDef(kind).yields
  const jitterScale = profile?.compositionJitterScale ?? 1
  const bias = profile?.rootTemplateBias
  const w = {} as Record<RootResourceId, number>
  for (const r of ROOT_RESOURCE_IDS) w[r] = 0
  let sum = 0
  for (const r of ROOT_RESOURCE_IDS) {
    const v = (template[r] ?? 0) * (bias?.[r] ?? 1)
    w[r] = v
    sum += v
  }
  if (sum <= 0) {
    return defaultUniformRootComposition()
  }
  for (const r of ROOT_RESOURCE_IDS) {
    w[r] = (w[r] / sum) * jitterForRoot(seed, pos, r, 401, jitterScale)
  }
  let s2 = 0
  for (const r of ROOT_RESOURCE_IDS) s2 += w[r]
  for (const r of ROOT_RESOURCE_IDS) w[r] /= s2
  return w
}

/**
 * Integer root bundles for a full break (mining, replicator finish).
 * Total unit count follows kind template scale, split by bulk composition (largest-remainder).
 */
export function compositionToYields(
  kind: VoxelKind,
  bulk: Record<RootResourceId, number>,
): Partial<Record<RootResourceId, number>> {
  const template = getKindDef(kind).yields
  let total = 0
  for (const r of ROOT_RESOURCE_IDS) total += template[r] ?? 0
  total = Math.max(1, Math.round(total))

  const parts: { r: RootResourceId; exact: number; floor: number; frac: number }[] = []
  for (const r of ROOT_RESOURCE_IDS) {
    const exact = total * bulk[r]
    const fl = Math.floor(exact)
    parts.push({ r, exact, floor: fl, frac: exact - fl })
  }
  let allocated = 0
  for (const p of parts) allocated += p.floor
  const rem = total - allocated
  parts.sort((a, b) => b.frac - a.frac)
  const out: Partial<Record<RootResourceId, number>> = {}
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!
    const n = p.floor + (i < rem ? 1 : 0)
    if (n > 0) out[p.r] = n
  }
  return out
}

function normalizeBulkSnapshot(bulk: Record<RootResourceId, number> | undefined): Record<RootResourceId, number> {
  if (!bulk) return defaultUniformRootComposition()
  let s = 0
  for (const r of ROOT_RESOURCE_IDS) s += bulk[r] ?? 0
  if (s <= 0) return defaultUniformRootComposition()
  const o = {} as Record<RootResourceId, number>
  for (const r of ROOT_RESOURCE_IDS) o[r] = (bulk[r] ?? 0) / s
  return o
}

/**
 * Blended depth-scan susceptibility in [0, 1] from normalized root fractions (higher = faster reveal).
 */
export function compositeDepthScanSusceptibility(
  bulk: Record<RootResourceId, number> | undefined,
): number {
  const b = normalizeBulkSnapshot(bulk)
  let s = 0
  for (const r of ROOT_RESOURCE_IDS) {
    const sus = RESOURCE_DEFS[r].depthScanSusceptibility ?? 0.5
    s += b[r] * sus
  }
  return Math.min(1, Math.max(0, s))
}

/** Approximate bulk density (g/cm³) from normalized root fractions and per-root midpoints. */
export function compositeDensityMidpointGcm3(bulk: Record<RootResourceId, number> | undefined): number {
  const b = normalizeBulkSnapshot(bulk)
  let d = 0
  for (const r of ROOT_RESOURCE_IDS) {
    const range = RESOURCE_DEFS[r].densityRangeGcm3
    if (!range) continue
    const mid = 0.5 * (range[0] + range[1])
    d += b[r] * mid
  }
  return d
}
