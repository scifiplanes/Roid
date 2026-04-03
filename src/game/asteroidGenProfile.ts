import type { RootResourceId } from './resources'
import { ROOT_RESOURCE_IDS } from './resources'

/**
 * Tholen-style spectral analog (main-belt composition prior).
 * Seven classes with renormalized weights (~C-heavy main belt + rare types).
 */
export type SpectralClass = 'C' | 'S' | 'M' | 'D' | 'V' | 'E' | 'X'

/** Physical / genetic regime — orthogonal to spectral class (rubble vs monolith, gardening, etc.). */
export type AsteroidRegime =
  | 'rubblePileLoose'
  | 'rubblePileCompact'
  | 'competentMonolith'
  | 'impactShattered'
  | 'gardenedAncient'
  | 'freshExposure'
  | 'thermallyProcessed'
  | 'volatileRichPrimitive'
  | 'contactBinaryRubble'
  | 'collisionalFamilyDebris'
  | 'outerBeltCold'

const REGIME_ORDER: readonly AsteroidRegime[] = [
  'rubblePileLoose',
  'rubblePileCompact',
  'competentMonolith',
  'impactShattered',
  'gardenedAncient',
  'freshExposure',
  'thermallyProcessed',
  'volatileRichPrimitive',
  'contactBinaryRubble',
  'collisionalFamilyDebris',
  'outerBeltCold',
] as const

/** C S M D V E X — sum = 1 */
const SPECTRAL_WEIGHTS: Record<SpectralClass, number> = {
  C: 0.55,
  S: 0.14,
  M: 0.07,
  D: 0.12,
  V: 0.05,
  E: 0.04,
  X: 0.03,
}

const SPECTRAL_ORDER: readonly SpectralClass[] = ['C', 'S', 'M', 'D', 'V', 'E', 'X'] as const

const SPECTRAL_LABEL: Record<SpectralClass, string> = {
  C: 'carbonaceous',
  S: 'stony',
  M: 'metallic',
  D: 'D-type',
  V: 'V-type',
  E: 'E-type',
  X: 'X-type',
}

const REGIME_SHORT: Record<AsteroidRegime, string> = {
  rubblePileLoose: 'rubble-loose',
  rubblePileCompact: 'rubble-tight',
  competentMonolith: 'monolith',
  impactShattered: 'shattered',
  gardenedAncient: 'gardened',
  freshExposure: 'fresh',
  thermallyProcessed: 'heated',
  volatileRichPrimitive: 'volatile-rich',
  contactBinaryRubble: 'contact-binary',
  collisionalFamilyDebris: 'family-debris',
  outerBeltCold: 'outer-cold',
}

/** Independent [0, 1) from seed + salt (uint32 mix). */
export function float01FromSeed(seed: number, salt: number): number {
  let n = seed * 2246822519 + salt * 3266489917 + 668265263
  n ^= n >>> 13
  n = Math.imul(n, 1274126177)
  n ^= n >>> 16
  return (n >>> 0) / 4294967296
}

function pickWeightedSpectral(u: number): SpectralClass {
  let c = u
  for (const cls of SPECTRAL_ORDER) {
    const w = SPECTRAL_WEIGHTS[cls]
    if (c < w) return cls
    c -= w
  }
  return 'X'
}

function pickRegime(u: number): AsteroidRegime {
  const n = REGIME_ORDER.length
  const i = Math.min(n - 1, Math.floor(Math.min(0.999999999, u) * n))
  return REGIME_ORDER[i]!
}

/** Voxel silhouette class (not rare-lode composition morphology). */
export type AsteroidShapeClass = 'ellipsoid' | 'contactBinary' | 'contactTrinary'

export interface AsteroidShapeParams {
  baseRadius: number
  noiseScale: number
  noiseAmplitude: number
  /**
   * Semi-axis multipliers vs `baseRadius`; geometric mean 1 (product = 1).
   * Aligned to grid axes (oblate/prolate variety).
   */
  axisMulX: number
  axisMulY: number
  axisMulZ: number
  shapeClass: AsteroidShapeClass
  /** Secondary lobe center offset (voxel units) for `contactBinary`; primary at grid center. */
  binaryOffsetX: number
  binaryOffsetY: number
  binaryOffsetZ: number
  /** Scales secondary lobe semi-axes relative to primary. */
  binarySecondaryScale: number
  /**
   * `contactTrinary`: three equal lobes in XY, 120° apart, centroid at grid center.
   * Base rotation (rad) of the first lobe direction; radius is distance from center to each lobe center.
   */
  trinaryAngleRad: number
  trinaryRadius: number
  /** Per-lobe semi-axis scale vs primary axes (each of the three lobes). */
  trinaryLobeAxisScale: number
}

/** Layer-3 continuous knobs (all in [0, 1)). */
export interface AsteroidAnalogDials {
  shapeRoughness: number
  shapeBulk: number
  compositionChaos: number
  lithologySharpness: number
  surfaceAlteration: number
  metalSegregation: number
  /** Independent noise-scale dial (decoupled slightly from roughness). */
  noiseScaleT: number
}

/** pickKind tuning derived from profile (see voxelState). */
export interface PickKindTuning {
  /** Added to regolith band edge (higher → more regolith). */
  regolithThresholdOffset: number
  /** Added to metal interior cutoff `crustProximity < threshold`. */
  metalThresholdOffset: number
  /** Scales `h * 0.12` and `h * 0.14` hash perturbation (monolith → lower). */
  hashScale: number
}

/** Multipliers on template roots before jitter (spectral × regime × L3 surface). */
export type RootMultiplierMap = Record<RootResourceId, number>

function unitRootBias(): RootMultiplierMap {
  const o = {} as RootMultiplierMap
  for (const r of ROOT_RESOURCE_IDS) o[r] = 1
  return o
}

export interface AsteroidGenProfile {
  seed: number
  spectralClass: SpectralClass
  regime: AsteroidRegime
  dials: AsteroidAnalogDials
  shape: AsteroidShapeParams
  pickKind: PickKindTuning
  /** Combined root biases for composition (excludes per-cell jitter). */
  rootTemplateBias: RootMultiplierMap
  /** Scales per-root jitter spread in computeBulkComposition (1 = default). */
  compositionJitterScale: number
  /** Tint / material hints for mesh (0–1 metalness bump). */
  rockMetalness: number
  rockBaseColorRgb: { r: number; g: number; b: number }
}

const SALT_SPECTRAL = 0x9e3779b1
const SALT_REGIME = 0x85ebca6b
const SALT_DIAL0 = 1
const SALT_DIAL1 = 2
const SALT_DIAL2 = 3
const SALT_DIAL3 = 4
const SALT_DIAL4 = 5
const SALT_DIAL5 = 6
const SALT_DIAL6 = 7
const SALT_DISCOVERY_DENSITY = 0x44495343
const SALT_CONTACT_BINARY = 0xcb10e771
const SALT_TRINARY_PICK = 0x7c4a7d91
const SALT_TRINARY_ANGLE = 0x8d1e9f2a
const SALT_TRINARY_RSCALE = 0x9e2f0a3b

function spectralRootBias(cls: SpectralClass): RootMultiplierMap {
  const o = unitRootBias()
  switch (cls) {
    case 'C':
      o.regolithMass = 1.22
      o.volatiles = 1.38
      o.carbonaceous = 1.25
      o.silicates = 0.95
      o.metals = 0.62
      break
    case 'S':
      o.silicates = 1.08
      o.metals = 0.95
      o.volatiles = 0.98
      o.sulfides = 1.06
      break
    case 'M':
      o.metals = 1.48
      o.refractories = 1.12
      o.volatiles = 0.68
      o.silicates = 0.88
      o.regolithMass = 0.82
      break
    case 'D':
      o.regolithMass = 1.2
      o.volatiles = 1.35
      o.carbonaceous = 1.32
      o.ices = 1.15
      o.metals = 0.55
      o.silicates = 0.9
      break
    case 'V':
      o.silicates = 1.15
      o.oxides = 1.18
      o.metals = 1.05
      o.volatiles = 0.75
      o.ices = 0.85
      break
    case 'E':
      o.silicates = 1.1
      o.metals = 0.92
      o.sulfides = 1.08
      o.volatiles = 0.82
      break
    case 'X':
      o.metals = 1.28
      o.sulfides = 1.1
      o.silicates = 0.92
      o.refractories = 1.06
      o.volatiles = 0.78
      break
    default:
      break
  }
  return o
}

function regimeRootBias(reg: AsteroidRegime): RootMultiplierMap {
  const o = unitRootBias()
  switch (reg) {
    case 'rubblePileLoose':
      o.regolithMass = 1.12
      o.silicates = 1.05
      break
    case 'rubblePileCompact':
      o.regolithMass = 0.92
      o.silicates = 1.08
      break
    case 'competentMonolith':
      o.silicates = 1.06
      o.regolithMass = 0.9
      break
    case 'impactShattered':
      o.regolithMass = 1.08
      o.silicates = 1.1
      o.metals = 1.04
      break
    case 'gardenedAncient':
      o.regolithMass = 1.18
      o.silicates = 0.92
      break
    case 'freshExposure':
      o.regolithMass = 0.88
      o.silicates = 1.12
      break
    case 'thermallyProcessed':
      o.volatiles = 0.72
      o.silicates = 1.06
      o.hydrates = 0.85
      break
    case 'volatileRichPrimitive':
      o.volatiles = 1.28
      o.regolithMass = 1.06
      o.ices = 1.1
      break
    case 'contactBinaryRubble':
      o.regolithMass = 1.06
      o.silicates = 1.04
      o.ices = 1.05
      break
    case 'collisionalFamilyDebris':
      o.regolithMass = 1.1
      o.silicates = 1.08
      o.metals = 1.03
      break
    case 'outerBeltCold':
      o.volatiles = 1.2
      o.ices = 1.35
      o.hydrates = 1.1
      break
    default:
      break
  }
  return o
}

function regimePickKind(reg: AsteroidRegime): PickKindTuning {
  const t: PickKindTuning = {
    regolithThresholdOffset: 0,
    metalThresholdOffset: 0,
    hashScale: 1,
  }
  switch (reg) {
    case 'rubblePileLoose':
      t.regolithThresholdOffset = -0.055
      t.metalThresholdOffset = 0.04
      t.hashScale = 1.08
      break
    case 'rubblePileCompact':
      t.regolithThresholdOffset = 0.04
      t.metalThresholdOffset = -0.03
      t.hashScale = 0.98
      break
    case 'competentMonolith':
      t.hashScale = 0.62
      break
    case 'impactShattered':
      t.hashScale = 1.14
      t.regolithThresholdOffset = -0.03
      break
    case 'gardenedAncient':
      t.regolithThresholdOffset = -0.075
      break
    case 'freshExposure':
      t.regolithThresholdOffset = 0.055
      break
    case 'thermallyProcessed':
      t.regolithThresholdOffset = 0.02
      break
    case 'volatileRichPrimitive':
      t.regolithThresholdOffset = -0.02
      break
    case 'contactBinaryRubble':
      t.hashScale = 1.02
      t.regolithThresholdOffset = -0.015
      break
    case 'collisionalFamilyDebris':
      t.hashScale = 1.12
      t.regolithThresholdOffset = -0.035
      break
    case 'outerBeltCold':
      t.regolithThresholdOffset = -0.025
      t.metalThresholdOffset = -0.02
      break
    default:
      break
  }
  return t
}

function mergeRootBias(a: RootMultiplierMap, b: RootMultiplierMap): RootMultiplierMap {
  const o: RootMultiplierMap = { ...a }
  for (const r of ROOT_RESOURCE_IDS) {
    o[r] = (o[r] ?? 1) * (b[r] ?? 1)
  }
  return o
}

/** Surface alteration: space-weathering / hydration analog — volatiles vs silicates trade. */
function applySurfaceAlteration(m: RootMultiplierMap, surfaceAlteration: number): RootMultiplierMap {
  const volBoost = 0.88 + surfaceAlteration * 0.28
  const silBoost = 1.12 - surfaceAlteration * 0.22
  const o: RootMultiplierMap = { ...m }
  o.volatiles = (o.volatiles ?? 1) * volBoost
  o.silicates = (o.silicates ?? 1) * silBoost
  return o
}

function combinePickKind(
  regime: AsteroidRegime,
  spectral: SpectralClass,
  dials: AsteroidAnalogDials,
): PickKindTuning {
  const base = regimePickKind(regime)
  const sharp = 0.55 + dials.lithologySharpness * 0.9
  base.hashScale *= sharp

  const metalSeg = (dials.metalSegregation - 0.5) * 0.14
  base.metalThresholdOffset += metalSeg
  if (spectral === 'M' || spectral === 'X') {
    base.metalThresholdOffset += 0.055
    base.regolithThresholdOffset += 0.04
  } else if (spectral === 'C' || spectral === 'D') {
    base.regolithThresholdOffset -= 0.025
  }

  return base
}

function deriveShape(dials: AsteroidAnalogDials): AsteroidShapeParams {
  const bulk = 10.6 + dials.shapeBulk * 2.85
  const rough = dials.shapeRoughness
  const noiseAmplitude = 1.75 + rough * 2.15
  const noiseScale = 0.105 + dials.noiseScaleT * 0.075 + rough * 0.025
  const mx0 = 0.78 + dials.shapeRoughness * 0.44
  const my0 = 0.78 + dials.noiseScaleT * 0.44
  const mz0 = 1 / (mx0 * my0)
  return {
    baseRadius: bulk,
    noiseScale,
    noiseAmplitude,
    axisMulX: mx0,
    axisMulY: my0,
    axisMulZ: mz0,
    shapeClass: 'ellipsoid',
    binaryOffsetX: 0,
    binaryOffsetY: 0,
    binaryOffsetZ: 0,
    binarySecondaryScale: 1,
    trinaryAngleRad: 0,
    trinaryRadius: 0,
    trinaryLobeAxisScale: 1,
  }
}

/** Bounded multipliers on base shape — regime (structure) × spectral (density prior). */
function regimeShapeMult(reg: AsteroidRegime): { br: number; amp: number; ns: number } {
  switch (reg) {
    case 'impactShattered':
    case 'collisionalFamilyDebris':
      return { br: 1, amp: 1.1, ns: 1.05 }
    case 'competentMonolith':
      return { br: 0.98, amp: 0.88, ns: 0.94 }
    case 'contactBinaryRubble':
      return { br: 1.02, amp: 1.06, ns: 1.03 }
    case 'gardenedAncient':
      return { br: 1.01, amp: 1.04, ns: 1.02 }
    case 'freshExposure':
      return { br: 1, amp: 0.93, ns: 0.97 }
    case 'outerBeltCold':
      return { br: 1.02, amp: 1.03, ns: 1.01 }
    case 'volatileRichPrimitive':
      return { br: 1.03, amp: 1.05, ns: 1.01 }
    case 'rubblePileLoose':
      return { br: 1.02, amp: 1.05, ns: 1.02 }
    case 'rubblePileCompact':
      return { br: 0.99, amp: 0.97, ns: 0.99 }
    case 'thermallyProcessed':
      return { br: 0.99, amp: 0.96, ns: 1 }
    default:
      return { br: 1, amp: 1, ns: 1 }
  }
}

function spectralShapeMult(cls: SpectralClass): { br: number; amp: number; ns: number } {
  switch (cls) {
    case 'C':
    case 'D':
      return { br: 1.03, amp: 1.025, ns: 1.01 }
    case 'M':
    case 'X':
      return { br: 0.98, amp: 0.97, ns: 0.99 }
    default:
      return { br: 1, amp: 1, ns: 1 }
  }
}

function modulateShapeForSpectralRegime(
  base: AsteroidShapeParams,
  spectralClass: SpectralClass,
  regime: AsteroidRegime,
): AsteroidShapeParams {
  const rm = regimeShapeMult(regime)
  const sm = spectralShapeMult(spectralClass)
  let mx = base.axisMulX
  let my = base.axisMulY
  switch (spectralClass) {
    case 'C':
    case 'D':
      mx *= 1.05
      my *= 1.05
      break
    case 'M':
    case 'X':
      mx *= 0.96
      my *= 0.96
      break
    default:
      break
  }
  const mz = 1 / (mx * my)
  return {
    ...base,
    baseRadius: Math.max(8.5, base.baseRadius * rm.br * sm.br),
    noiseAmplitude: Math.max(0.35, base.noiseAmplitude * rm.amp * sm.amp),
    noiseScale: Math.max(0.055, base.noiseScale * rm.ns * sm.ns),
    axisMulX: mx,
    axisMulY: my,
    axisMulZ: mz,
  }
}

/**
 * Silhouette: contact-binary (`contactBinaryRubble`), trinary (impact / family debris + seed slice), or ellipsoid.
 */
function applySilhouetteFromProfile(shape: AsteroidShapeParams, seed: number, regime: AsteroidRegime): AsteroidShapeParams {
  if (regime === 'contactBinaryRubble') {
    const u = float01FromSeed(seed, SALT_CONTACT_BINARY)
    const v = float01FromSeed(seed, SALT_CONTACT_BINARY + 1)
    const w = float01FromSeed(seed, SALT_CONTACT_BINARY + 2)
    const theta = 2 * Math.PI * u
    const z = 2 * v - 1
    const r = Math.sqrt(Math.max(0, 1 - z * z))
    const ox = r * Math.cos(theta)
    const oy = r * Math.sin(theta)
    const oz = z
    const sep = 0.36 * shape.baseRadius
    return {
      ...shape,
      shapeClass: 'contactBinary',
      trinaryAngleRad: 0,
      trinaryRadius: 0,
      trinaryLobeAxisScale: 1,
      binaryOffsetX: ox * sep,
      binaryOffsetY: oy * sep,
      binaryOffsetZ: oz * sep,
      binarySecondaryScale: 0.78 + w * 0.14,
    }
  }

  if (regime === 'impactShattered' || regime === 'collisionalFamilyDebris') {
    if (float01FromSeed(seed, SALT_TRINARY_PICK) < 0.45) {
      const ua = float01FromSeed(seed, SALT_TRINARY_ANGLE)
      const ur = float01FromSeed(seed, SALT_TRINARY_RSCALE)
      const ul = float01FromSeed(seed, SALT_TRINARY_RSCALE + 1)
      const angle = ua * 2 * Math.PI
      const radius = (0.3 + ur * 0.1) * shape.baseRadius
      const lobeScale = 0.72 + ul * 0.14
      return {
        ...shape,
        shapeClass: 'contactTrinary',
        binaryOffsetX: 0,
        binaryOffsetY: 0,
        binaryOffsetZ: 0,
        binarySecondaryScale: 1,
        trinaryAngleRad: angle,
        trinaryRadius: radius,
        trinaryLobeAxisScale: lobeScale,
      }
    }
  }

  return {
    ...shape,
    shapeClass: 'ellipsoid',
    binaryOffsetX: 0,
    binaryOffsetY: 0,
    binaryOffsetZ: 0,
    binarySecondaryScale: 1,
    trinaryAngleRad: 0,
    trinaryRadius: 0,
    trinaryLobeAxisScale: 1,
  }
}

/**
 * Scales Debug → balance discovery site density per asteroid (spectral × regime priors).
 * Includes a per-asteroid deterministic random factor; clamped to a wider band relative to the balance slider.
 */
export function discoveryDensityScale(p: AsteroidGenProfile): number {
  let s = 1
  switch (p.regime) {
    case 'volatileRichPrimitive':
    case 'outerBeltCold':
      s *= 1.06
      break
    case 'competentMonolith':
      s *= 0.92
      break
    case 'impactShattered':
      s *= 1.04
      break
    default:
      break
  }
  if (p.spectralClass === 'X' || p.spectralClass === 'M') s *= 1.05
  if (p.spectralClass === 'C') s *= 0.97

  const u = float01FromSeed(p.seed, SALT_DISCOVERY_DENSITY)
  const centered = (u - 0.5) * 2
  const spread = 0.7
  const jitter = 1 + centered * spread
  s *= jitter

  return Math.min(1.9, Math.max(0.45, s))
}

function deriveRockVisuals(cls: SpectralClass, regime: AsteroidRegime, dials: AsteroidAnalogDials): {
  rockMetalness: number
  rockBaseColorRgb: { r: number; g: number; b: number }
} {
  let r = 0.58
  let g = 0.52
  let b = 0.48
  if (cls === 'C' || cls === 'D') {
    r *= cls === 'D' ? 0.72 : 0.82
    g *= cls === 'D' ? 0.7 : 0.78
    b *= cls === 'D' ? 0.68 : 0.74
  } else if (cls === 'S' || cls === 'V') {
    r *= cls === 'V' ? 1.12 : 1.05
    g *= cls === 'V' ? 0.92 : 0.98
    b *= cls === 'V' ? 0.78 : 0.9
  } else if (cls === 'E') {
    r *= 0.98
    g *= 1.02
    b *= 0.94
  } else {
    r *= 0.92
    g *= 0.94
    b *= 1.02
  }
  if (regime === 'thermallyProcessed') {
    r += 0.04
    g += 0.02
  }
  if (regime === 'volatileRichPrimitive' || regime === 'outerBeltCold') {
    b += 0.03
    g += 0.02
  }

  const tint = dials.surfaceAlteration * 0.06
  r += tint * 0.2
  g += tint * 0.15
  b += tint * -0.1

  let rockMetalness = 0.045
  if (cls === 'M' || cls === 'X') rockMetalness += 0.1
  if (cls === 'X') rockMetalness += 0.02
  if (regime === 'competentMonolith') rockMetalness += 0.02
  rockMetalness += dials.metalSegregation * 0.04
  rockMetalness = Math.min(0.28, rockMetalness)

  return { rockMetalness, rockBaseColorRgb: { r, g, b } }
}

/**
 * Full deterministic profile for one asteroid seed — layers combine multiplicatively.
 */
export function deriveAsteroidProfile(seed: number): AsteroidGenProfile {
  const spectralClass = pickWeightedSpectral(float01FromSeed(seed, SALT_SPECTRAL))
  const regime = pickRegime(float01FromSeed(seed, SALT_REGIME))

  const dials: AsteroidAnalogDials = {
    shapeRoughness: float01FromSeed(seed, SALT_DIAL0),
    shapeBulk: float01FromSeed(seed, SALT_DIAL1),
    compositionChaos: float01FromSeed(seed, SALT_DIAL2),
    lithologySharpness: float01FromSeed(seed, SALT_DIAL3),
    surfaceAlteration: float01FromSeed(seed, SALT_DIAL4),
    metalSegregation: float01FromSeed(seed, SALT_DIAL5),
    noiseScaleT: float01FromSeed(seed, SALT_DIAL6),
  }

  const shape = applySilhouetteFromProfile(
    modulateShapeForSpectralRegime(deriveShape(dials), spectralClass, regime),
    seed,
    regime,
  )

  let rootTemplateBias = mergeRootBias(spectralRootBias(spectralClass), regimeRootBias(regime))
  rootTemplateBias = applySurfaceAlteration(rootTemplateBias, dials.surfaceAlteration)

  const pickKind = combinePickKind(regime, spectralClass, dials)

  const compositionJitterScale = 0.55 + dials.compositionChaos * 0.95

  const { rockMetalness, rockBaseColorRgb } = deriveRockVisuals(spectralClass, regime, dials)

  return {
    seed,
    spectralClass,
    regime,
    dials,
    shape,
    pickKind,
    rootTemplateBias,
    compositionJitterScale,
    rockMetalness,
    rockBaseColorRgb,
  }
}

/** Compact HUD line: spectral · regime · radius · seed tail. */
export function formatProfileFingerprint(p: AsteroidGenProfile): string {
  const spec = p.spectralClass
  const reg = REGIME_SHORT[p.regime]
  const r = p.shape.baseRadius.toFixed(1)
  const tail = (p.seed >>> 0).toString(16).slice(-4).padStart(4, '0')
  const shapeTag =
    p.shape.shapeClass === 'contactBinary' ? 'bin' : p.shape.shapeClass === 'contactTrinary' ? 'tri' : 'ell'
  return `${spec}-type · ${reg} · ${shapeTag} · r=${r} · ${tail}`
}

export function spectralClassDisplayName(cls: SpectralClass): string {
  return SPECTRAL_LABEL[cls]
}
