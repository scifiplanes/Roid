import { Color } from 'three'
import type { VoxelPos } from '../scene/asteroid/generateAsteroidVoxels'
import { compositeDensityMidpointGcm3, latticeHash } from './compositionYields'
import type { VoxelCell } from './voxelState'
import {
  createDefaultScanVisualizationDebug,
  type ScanVisualizationDebug,
} from './scanVisualizationDebug'
import { refinedScanHueSlotCount, refinedScanHueSlotForId } from './scanHuePermutation'
import {
  defaultUniformRootComposition,
  refinementYieldForParent,
  RESOURCE_DEFS,
  REFINED_MATERIAL_IDS_FOR_SCAN,
  ROOT_RESOURCE_IDS,
  type ResourceId,
  type RootResourceId,
} from './resources'

/**
 * Sharpen refined weights for HUD / economic preview (`refinedPreviewWeightsForCell`).
 * Slightly higher than tint-only sharpen so numbers stay meaningful.
 */
const SCAN_WEIGHT_SHARPNESS = 1.22

/** Softer sharpen for on-rock tint only — keeps more multi-material hue in the visual blend. */
const SCAN_TINT_WEIGHT_SHARPNESS = 1

/** Distinct from mining bulk jitter; scan-tint-only root spread (~±11% per root before renormalize). */
const SCAN_TINT_ROOT_JITTER_SEED = 71441

const _fallbackDebug = createDefaultScanVisualizationDebug()
let getScanVizDebug: () => ScanVisualizationDebug = () => _fallbackDebug

/** Wire the live debug object from `main` so `compositionToScanColor` / legend stay in sync. */
export function setScanVisualizationDebugGetter(get: () => ScanVisualizationDebug): void {
  getScanVizDebug = get
}

/** Current scan visualization debug (from `setScanVisualizationDebugGetter`, else defaults). */
export function getActiveScanVisualizationDebug(): ScanVisualizationDebug {
  return getScanVizDebug()
}

const _anchorBuild = new Color()

/**
 * Per-refined-material RGB anchors (HSL from debug). Hues use the full spectrum with slots chosen to
 * separate tech-tree siblings (see `scanHuePermutation.ts`).
 */
export function getChildAnchors(debug: ScanVisualizationDebug): Map<ResourceId, readonly [number, number, number]> {
  const m = new Map<ResourceId, readonly [number, number, number]>()
  const nSlot = refinedScanHueSlotCount()
  if (nSlot <= 0) return m
  for (const id of REFINED_MATERIAL_IDS_FOR_SCAN) {
    const slot = refinedScanHueSlotForId(id)
    const hue = (slot + 0.5) / nSlot
    _anchorBuild.setHSL(hue, debug.anchorSaturation, debug.anchorLightness)
    m.set(id, [_anchorBuild.r, _anchorBuild.g, _anchorBuild.b])
  }
  return m
}

const _legendSwatch = new Color()

/** Refined hue families for overlay legend (anchor + same `boostScanDisplayColor` as on-voxel tint). */
export interface ScanOverlayLegendFamily {
  familyLabel: string
  swatches: readonly { hudAbbrev: string; cssColor: string; fullName: string }[]
}

export function getScanOverlayLegendGrouped(): ScanOverlayLegendFamily[] {
  const debug = getScanVizDebug()
  const anchors = getChildAnchors(debug)
  const out: ScanOverlayLegendFamily[] = []
  for (const root of ROOT_RESOURCE_IDS) {
    const part = refinementYieldForParent(root)
    const children = REFINED_MATERIAL_IDS_FOR_SCAN.filter((id) => {
      const y = part[id]
      return y !== undefined && y > 0
    })
    if (children.length === 0) continue
    const swatches = children.map((id) => {
      const a = anchors.get(id)!
      _legendSwatch.setRGB(a[0], a[1], a[2])
      boostScanDisplayColor(_legendSwatch, debug)
      const cssColor = `rgb(${Math.round(_legendSwatch.r * 255)},${Math.round(_legendSwatch.g * 255)},${Math.round(_legendSwatch.b * 255)})`
      return {
        hudAbbrev: RESOURCE_DEFS[id].hudAbbrev,
        cssColor,
        fullName: RESOURCE_DEFS[id].displayName,
      }
    })
    out.push({ familyLabel: RESOURCE_DEFS[root].displayName, swatches })
  }
  return out
}

/** @deprecated Use `ScanVisualizationDebug.compositionLerp`; kept for stray imports. */
export const SCAN_COMPOSITION_LERP = 0.92

const _hsl = { h: 0, s: 0, l: 0 }

function normalizeRoots(bulk: Record<RootResourceId, number> | undefined): Record<RootResourceId, number> {
  if (!bulk) return defaultUniformRootComposition()
  let s = 0
  for (const r of ROOT_RESOURCE_IDS) s += bulk[r] ?? 0
  if (s <= 1e-9) return defaultUniformRootComposition()
  const o = defaultUniformRootComposition()
  for (const r of ROOT_RESOURCE_IDS) o[r] = (bulk[r] ?? 0) / s
  return o
}

function sharpenNormalizedWeights(w: number[], k: number): number[] {
  const p = w.map((x) => Math.pow(Math.max(0, x), k))
  const s = p.reduce((a, b) => a + b, 0)
  if (s <= 1e-9) return w
  return p.map((x) => x / s)
}

/**
 * Display-only, **scan tint path only** (not HUD): spreads normalized root fractions so refined
 * hues diverge more on similar lithology; does not affect mining or `refinedPreviewWeightsForCell`.
 */
function applyScanTintOnlyRootJitter(comp: Record<RootResourceId, number>, pos: VoxelPos): Record<RootResourceId, number> {
  const o = defaultUniformRootComposition()
  let s = 0
  for (const r of ROOT_RESOURCE_IDS) {
    const ord = ROOT_RESOURCE_IDS.indexOf(r)
    const h = latticeHash(
      SCAN_TINT_ROOT_JITTER_SEED + ord * 31,
      pos.x + ord * 3,
      pos.y + ord * 5,
      pos.z + ord * 7,
    )
    const m = 0.87 + 0.26 * h
    o[r] = comp[r] * m
    s += o[r]
  }
  if (s <= 1e-9) return comp
  for (const r of ROOT_RESOURCE_IDS) o[r] /= s
  return o
}

/**
 * Display-only: breaks symmetric refinement splits so similarly composed voxels differ in hue.
 * Does not affect mining or hub/refinery sims.
 */
function perturbDisplayChildWeights(w: number[], pos: VoxelPos): number[] {
  const SCAN_DISPLAY_HASH_SEED = 90211
  const out = w.map((wi, i) => {
    const salt = i * 997 + 17
    const h = latticeHash(SCAN_DISPLAY_HASH_SEED, pos.x + salt, pos.y + salt * 3, pos.z + salt * 5)
    return wi * (0.72 + 0.52 * h)
  })
  const s = out.reduce((a, b) => a + b, 0)
  if (s <= 1e-9) return w
  return out.map((x) => x / s)
}

/** Push saturation/lightness so tints read on shaded rock. */
function boostScanDisplayColor(c: Color, debug: ScanVisualizationDebug): void {
  c.getHSL(_hsl)
  _hsl.s = Math.min(1, _hsl.s * debug.boostSaturationMul + debug.boostSaturationAdd)
  _hsl.l = Math.min(
    debug.boostLightnessMax,
    Math.max(debug.boostLightnessMin, _hsl.l * debug.boostLightnessScale + debug.boostLightnessAdd),
  )
  c.setHSL(_hsl.h, _hsl.s, _hsl.l)
}

/**
 * Expected-value blend over refined children: same continuous mix as the interior of
 * `blendedRefinementFromRootComposition` before largest-remainder rounding. Sharpened for display;
 * not perturbed (use for HUD preview); tint adds position perturbation after this.
 */
function rootCompositionToNormalizedChildWeights(
  comp: Record<RootResourceId, number>,
  sharpness: number,
): number[] {
  const ids = REFINED_MATERIAL_IDS_FOR_SCAN
  const acc = new Map<ResourceId, number>()
  for (const r of ROOT_RESOURCE_IDS) {
    const fr = comp[r] ?? 0
    if (fr <= 0) continue
    const part = refinementYieldForParent(r)
    let sum = 0
    for (const v of Object.values(part)) sum += v
    if (sum <= 0) continue
    for (const id of ids) {
      const y = part[id]
      if (y === undefined || y <= 0) continue
      acc.set(id, (acc.get(id) ?? 0) + fr * (y / sum))
    }
  }
  let total = 0
  for (const id of ids) total += acc.get(id) ?? 0
  if (total <= 1e-9) {
    return rootCompositionToNormalizedChildWeights(defaultUniformRootComposition(), sharpness)
  }
  const flat = ids.map((id) => (acc.get(id) ?? 0) / total)
  return sharpenNormalizedWeights(flat, sharpness)
}

/**
 * Sharpened expected refined mix (parallel to `REFINED_MATERIAL_IDS_FOR_SCAN`), no display perturbation.
 * Matches the basis of scan tint before positional hash variance.
 */
export function refinedPreviewWeightsForCell(cell: VoxelCell): number[] {
  const bulk = cell.bulkComposition ?? cell.processedMatterRootComposition
  const comp = normalizeRoots(bulk)
  return rootCompositionToNormalizedChildWeights(comp, SCAN_WEIGHT_SHARPNESS)
}

/** Compact line: dominant refined materials with approximate shares (hit voxel). */
export function formatScanRefinedPreviewLine(cell: VoxelCell): string {
  const w = refinedPreviewWeightsForCell(cell)
  const ids = REFINED_MATERIAL_IDS_FOR_SCAN
  const entries = ids
    .map((id, i) => ({ id, w: w[i] ?? 0 }))
    .filter((e) => e.w > 0.02)
    .sort((a, b) => b.w - a.w)
    .slice(0, 5)
  if (entries.length === 0) return '—'
  return entries.map((e) => `${RESOURCE_DEFS[e.id].hudAbbrev} ${Math.round(e.w * 100)}%`).join(' · ')
}

/**
 * Low-saturation RGB from normalized root fractions (evenly spaced hue per root in `ROOT_RESOURCE_IDS`
 * order) for default rock tint. Darkens slightly toward higher composite bulk density (g/cm³).
 */
export function compositionToBulkRockHintColor(
  cell: VoxelCell,
  out: Color,
  debug: ScanVisualizationDebug,
): Color {
  const comp = normalizeRoots(cell.bulkComposition ?? cell.processedMatterRootComposition)
  const n = ROOT_RESOURCE_IDS.length
  let r = 0
  let g = 0
  let b = 0
  for (let i = 0; i < n; i++) {
    const rid = ROOT_RESOURCE_IDS[i]!
    const w = comp[rid] ?? 0
    const hue = (i + 0.5) / n
    _anchorBuild.setHSL(hue, debug.baseRockBulkHintSaturation, debug.baseRockBulkHintLightness)
    r += w * _anchorBuild.r
    g += w * _anchorBuild.g
    b += w * _anchorBuild.b
  }
  out.setRGB(r, g, b)
  const rho = compositeDensityMidpointGcm3(cell.bulkComposition ?? cell.processedMatterRootComposition)
  const t = Math.min(1, Math.max(0, (rho - 1.2) / (8.0 - 1.2)))
  const shade = 1 - debug.baseRockDensityShade * t
  out.multiplyScalar(Math.max(0.75, Math.min(1.05, shade)))
  return out
}

/**
 * Scan tint RGB from bulk / processed root snapshot — refined-material preview (continuous recipe blend).
 * Uses display-only root micro-jitter and softer child sharpen vs HUD (`refinedPreviewWeightsForCell`).
 */
export function compositionToScanColor(cell: VoxelCell, out: Color): Color {
  const debug = getScanVizDebug()
  const anchors = getChildAnchors(debug)
  const bulk = cell.bulkComposition ?? cell.processedMatterRootComposition
  const comp0 = normalizeRoots(bulk)
  const comp = applyScanTintOnlyRootJitter(comp0, cell.pos)
  const w0 = rootCompositionToNormalizedChildWeights(comp, SCAN_TINT_WEIGHT_SHARPNESS)
  const w = perturbDisplayChildWeights(w0, cell.pos)
  const ids = REFINED_MATERIAL_IDS_FOR_SCAN
  let r = 0
  let g = 0
  let b = 0
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!
    const a = anchors.get(id)
    if (!a) continue
    const wi = w[i] ?? 0
    r += wi * a[0]
    g += wi * a[1]
    b += wi * a[2]
  }
  out.setRGB(r, g, b)
  boostScanDisplayColor(out, debug)
  return out
}

/** Clear persisted scan tint when voxel identity/composition pipeline changes. */
export function clearSurfaceScanTint(cell: VoxelCell): void {
  cell.surfaceScanTintRgb = undefined
}

/** Clear depth-scan progress and cached tint when voxel identity changes. */
export function clearDepthRevealState(cell: VoxelCell): void {
  cell.depthRevealProgress = undefined
  cell.depthTintRgb = undefined
}
