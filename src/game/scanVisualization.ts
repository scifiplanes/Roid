import { Color } from 'three'
import type { VoxelPos } from '../scene/asteroid/generateAsteroidVoxels'
import { compositeDensityMidpointGcm3, latticeHash } from './compositionYields'
import { gameBalance } from './gameBalance'
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

/** Display-only bulk rock hint: wider per-root spread than scan tint (~0.72–1.28× before renormalize). */
const BULK_ROCK_HINT_DISPLAY_JITTER_SEED = 52817

/** Micro-variance for saturation envelope (acid ↔ gray). */
const BULK_ENVELOPE_HASH_SEED = 48293

/** Extra lightness on high-envelope cells so acid reads fluorescent. */
const BULK_ACID_LIGHTNESS_BUMP = 0.055

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

/**
 * Display-only: spreads normalized root fractions for default bulk rock tint (not scan/HUD).
 * Wider than `applyScanTintOnlyRootJitter` so neighboring voxels diverge more.
 */
function applyBulkRockHintDisplayJitter(comp: Record<RootResourceId, number>, pos: VoxelPos): Record<RootResourceId, number> {
  const o = defaultUniformRootComposition()
  let s = 0
  for (const r of ROOT_RESOURCE_IDS) {
    const ord = ROOT_RESOURCE_IDS.indexOf(r)
    const h = latticeHash(
      BULK_ROCK_HINT_DISPLAY_JITTER_SEED + ord * 37,
      pos.x + ord * 3,
      pos.y + ord * 5,
      pos.z + ord * 7,
    )
    const m = 0.72 + 0.56 * h
    o[r] = comp[r] * m
    s += o[r]
  }
  if (s <= 1e-9) return comp
  for (const r of ROOT_RESOURCE_IDS) o[r] /= s
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
 * HSL hue [0,1) per root: **full-wheel coverage** — one sector per root at `(slot + 0.5) / 12`,
 * permuted to rough material reads (warm crust → cool metals → magenta/red oxides). Keeps blends
 * from collapsing into a narrow brown band. Saturation is `baseRockBulkHintSaturation` × per-root mul.
 */
const ROOT_BULK_HINT_HUE: Record<RootResourceId, number> = {
  regolithMass: 0.042,
  carbonaceous: 0.125,
  silicates: 0.208,
  volatiles: 0.292,
  sulfides: 0.375,
  halides: 0.458,
  hydrates: 0.542,
  ices: 0.625,
  metals: 0.708,
  refractories: 0.792,
  phosphates: 0.875,
  oxides: 0.958,
}

const BULK_HINT_DOMINANT_FRAC_THRESHOLD = 0.26
const BULK_HINT_DOMINANT_LERP = 0.31

/** Per-root saturation multiplier vs `baseRockBulkHintSaturation` (material character + spread). */
const ROOT_BULK_HINT_SAT_MUL: Record<RootResourceId, number> = {
  regolithMass: 0.72,
  silicates: 0.82,
  metals: 0.28,
  volatiles: 1.88,
  sulfides: 1.15,
  oxides: 1.22,
  carbonaceous: 1.58,
  hydrates: 1.62,
  ices: 1.92,
  refractories: 0.32,
  phosphates: 1.08,
  halides: 1.38,
}

/** Extra weight on hue vs S/L so linear-RGB lerp does not mute composition (warm base × kind). */
const BULK_HINT_HUE_BLEND_MUL = 1.62

/** Saturation from bulk hint pulls harder than lightness onto the lithology base. */
const BULK_HINT_SAT_BLEND_MUL = 1.62

const _hslBase = { h: 0, s: 0, l: 0 }
const _hslBulk = { h: 0, s: 0, l: 0 }
const _hslBulkRock = { h: 0, s: 0, l: 0 }

const BULK_HUE_TAU = Math.PI * 2

function bulkSatForRoot(debug: ScanVisualizationDebug, rid: RootResourceId): number {
  const m = ROOT_BULK_HINT_SAT_MUL[rid]
  return Math.min(1, Math.max(0, debug.baseRockBulkHintSaturation * m))
}

/** Normalized Shannon entropy in [0,1]; 0 = single root, 1 = uniform mix. */
function bulkCompositionEntropy01(comp: Record<RootResourceId, number>): number {
  let h = 0
  for (const rid of ROOT_RESOURCE_IDS) {
    const w = comp[rid] ?? 0
    if (w > 1e-12) h -= w * Math.log(w)
  }
  const hMax = Math.log(ROOT_RESOURCE_IDS.length)
  return hMax > 1e-12 ? Math.min(1, Math.max(0, h / hMax)) : 0
}

/**
 * Maps composition (+ hash) to [0, 1]: 0 = achromatic gray, 1 = full acid saturation.
 * Volatile-rich fractions push up; metals/refractories and high-entropy mixes push down.
 */
function saturationEnvelope01(comp: Record<RootResourceId, number>, pos: VoxelPos): number {
  const e01 = bulkCompositionEntropy01(comp)
  const w = (rid: RootResourceId) => comp[rid] ?? 0
  const acidScore =
    w('volatiles') +
    w('ices') +
    0.95 * w('hydrates') +
    0.88 * w('carbonaceous') +
    0.52 * w('halides') +
    0.32 * w('sulfides') +
    0.18 * w('phosphates')
  const metalGrayScore = w('metals') + w('refractories')
  const chromaRaw = acidScore * 1.38 - metalGrayScore * 1.06 - e01 * e01 * 0.94
  let env = 0.45 + chromaRaw * 0.82
  const hj = latticeHash(BULK_ENVELOPE_HASH_SEED, pos.x, pos.y, pos.z)
  env += (hj - 0.5) * 0.16
  return Math.min(1, Math.max(0, env))
}

function lerpHueShortest(h0: number, h1: number, t: number): number {
  let d = h1 - h0
  if (d > 0.5) d -= 1
  if (d < -0.5) d += 1
  let h = h0 + d * t
  h %= 1
  if (h < 0) h += 1
  return h
}

/**
 * Blend bulk composition hint onto the lithology base using HSL (hue moves more than RGB `lerp`).
 * `t` is the same as former `baseRockBulkHintLerp` (0 = base only, 1 = full hint).
 */
export function blendBulkRockHintOntoBase(base: Color, bulkHint: Color, t: number, out: Color): void {
  if (t <= 0) {
    out.copy(base)
    return
  }
  if (t >= 1) {
    out.copy(bulkHint)
    return
  }
  out.copy(base)
  out.getHSL(_hslBase)
  bulkHint.getHSL(_hslBulk)
  const tHue = Math.min(1, t * BULK_HINT_HUE_BLEND_MUL)
  const tSat = Math.min(1, t * BULK_HINT_SAT_BLEND_MUL)
  const h = lerpHueShortest(_hslBase.h, _hslBulk.h, tHue)
  const s = _hslBase.s + (_hslBulk.s - _hslBase.s) * tSat
  const l = _hslBase.l + (_hslBulk.l - _hslBase.l) * t
  out.setHSL(h, s, l)
}

/**
 * Compact key for caches (e.g. dross particles) that only depend on bulk-hint tint fields from
 * {@link compositionToBulkRockHintColor}.
 */
export function scanVisualizationBulkHintKeyForDross(debug: ScanVisualizationDebug): string {
  return `${debug.baseRockBulkHintLerp}|${debug.baseRockBulkHintSaturation}|${debug.baseRockBulkHintLightness}|${debug.baseRockDensityShade}`
}

function bulkRockHintFromJitteredComposition(
  comp: Record<RootResourceId, number>,
  pos: VoxelPos,
  debug: ScanVisualizationDebug,
  out: Color,
): Color {
  const n = ROOT_RESOURCE_IDS.length
  let sx = 0
  let sy = 0
  let satW = 0
  let maxW = 0
  let maxRid: RootResourceId | null = null
  for (let i = 0; i < n; i++) {
    const rid = ROOT_RESOURCE_IDS[i]!
    const wi = comp[rid] ?? 0
    if (wi > maxW) {
      maxW = wi
      maxRid = rid
    }
    const hue = ROOT_BULK_HINT_HUE[rid]
    sx += wi * Math.cos(hue * BULK_HUE_TAU)
    sy += wi * Math.sin(hue * BULK_HUE_TAU)
    satW += wi * bulkSatForRoot(debug, rid)
  }
  let hue = Math.atan2(sy, sx) / BULK_HUE_TAU
  if (hue < 0) hue += 1
  const L0 = debug.baseRockBulkHintLightness
  _hslBulkRock.h = hue
  _hslBulkRock.s = satW
  _hslBulkRock.l = L0
  if (maxRid !== null && maxW >= BULK_HINT_DOMINANT_FRAC_THRESHOLD) {
    const dh = ROOT_BULK_HINT_HUE[maxRid]
    const ds = bulkSatForRoot(debug, maxRid)
    _hslBulkRock.h = lerpHueShortest(_hslBulkRock.h, dh, BULK_HINT_DOMINANT_LERP)
    _hslBulkRock.s += (ds - _hslBulkRock.s) * BULK_HINT_DOMINANT_LERP
    _hslBulkRock.l += (L0 - _hslBulkRock.l) * BULK_HINT_DOMINANT_LERP * 0.28
  }
  const envelope = saturationEnvelope01(comp, pos)
  _hslBulkRock.s *= envelope
  if (envelope > 1e-5) {
    _hslBulkRock.l = Math.min(1, _hslBulkRock.l + BULK_ACID_LIGHTNESS_BUMP * envelope * envelope)
  }
  out.setHSL(_hslBulkRock.h, Math.min(1, Math.max(0, _hslBulkRock.s)), _hslBulkRock.l)
  const rho = compositeDensityMidpointGcm3(comp)
  const t = Math.min(1, Math.max(0, (rho - 1.2) / (8.0 - 1.2)))
  const shade = 1 - debug.baseRockDensityShade * t
  out.multiplyScalar(Math.max(0.75, Math.min(1.05, shade)))
  return out
}

/**
 * HSL-first bulk hint: circular mean hue, weighted semantic saturation, dominant-root nudge,
 * then acid/gray saturation envelope (display-only jitter on fractions). Darkens slightly toward
 * higher composite bulk density (g/cm³).
 */
export function compositionToBulkRockHintColor(
  cell: VoxelCell,
  out: Color,
  debug: ScanVisualizationDebug,
): Color {
  const bulk = cell.bulkComposition ?? cell.processedMatterRootComposition
  const comp0 = normalizeRoots(bulk)
  const comp = applyBulkRockHintDisplayJitter(comp0, cell.pos)
  return bulkRockHintFromJitteredComposition(comp, cell.pos, debug, out)
}

/**
 * Bulk-rock hint color from an already-aggregated bulk composition record. Uses the same semantics
 * as {@link compositionToBulkRockHintColor} but does not depend on a full `VoxelCell`.
 */
export function bulkCompositionToRockHintColor(
  bulk: Record<RootResourceId, number>,
  pos: VoxelPos,
  out: Color,
  debug: ScanVisualizationDebug,
): Color {
  const comp0 = normalizeRoots(bulk)
  const comp = applyBulkRockHintDisplayJitter(comp0, pos)
  return bulkRockHintFromJitteredComposition(comp, pos, debug, out)
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

/**
 * Depth overlay: same refined RGB blend as surface scan, then extra saturation/lightness for heatmap readability.
 */
export function compositionToDepthScanColor(cell: VoxelCell, out: Color): Color {
  compositionToScanColor(cell, out)
  out.getHSL(_hsl)
  _hsl.s = Math.min(1, _hsl.s * gameBalance.depthOverlayScanSaturationMul)
  _hsl.l = Math.min(1, Math.max(0, _hsl.l * gameBalance.depthOverlayScanLightnessMul))
  out.setHSL(_hsl.h, _hsl.s, _hsl.l)
  return out
}

const _heatHsl = { h: 0, s: 0, l: 0 }

/**
 * Classic cool→warm heatmap: low density → blue, high → red (HSL sweep 240°→0°).
 * `d` in [0, 1] is graded lode density (e.g. `rareLodeStrength01 * depthRevealProgress`).
 */
export function densityToHeatmapRgb(d: number, out: Color): Color {
  const t = Math.min(1, Math.max(0, d))
  _heatHsl.h = (1 - t) * (240 / 360)
  _heatHsl.s = Math.min(1, Math.max(0, gameBalance.depthOverlayHeatmapSaturationMul))
  _heatHsl.l = 0.4 + 0.14 * t
  out.setHSL(_heatHsl.h, _heatHsl.s, _heatHsl.l)
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
