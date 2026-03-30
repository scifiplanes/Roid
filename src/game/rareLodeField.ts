import type { VoxelPos } from '../scene/asteroid/generateAsteroidVoxels'
import {
  float01FromSeed,
  type AsteroidGenProfile,
  type AsteroidRegime,
  type SpectralClass,
} from './asteroidGenProfile'
import { latticeHash } from './compositionYields'
import { gameBalance } from './gameBalance'
import type { RootResourceId } from './resources'
import { ROOT_RESOURCE_IDS } from './resources'

const LODE_OCTAVE_SEED = 0x5f3759df
const SALT_VEIN_U = 0x2d9b3717
const SALT_VEIN_V = 0x5c4dd124
const SALT_VEIN_W = 0x7f4a7c91
const SALT_VEIN_PERIOD = 0x3b9aca07
const SALT_SPECKLE_POWER = 0x6a09e667

const TAU = Math.PI * 2

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

/** Coarse multi-octave noise: large regional pockets (few octaves, big cell steps). */
export function pocketField01(seed: number, pos: VoxelPos, pocketScale: number): number {
  let acc = 0
  let wsum = 0
  const scales = [4, 8, 16].map((d) => Math.max(2, Math.round(d * pocketScale)))
  for (let k = 0; k < scales.length; k++) {
    const div = scales[k]!
    const sx = Math.floor(pos.x / div)
    const sy = Math.floor(pos.y / div)
    const sz = Math.floor(pos.z / div)
    const h = latticeHash(seed + k * 7919 + LODE_OCTAVE_SEED + 0x51ed, sx, sy, sz)
    const weight = 1 / (1 + k * 0.35)
    acc += h * weight
    wsum += weight
  }
  return acc / wsum
}

function seedUnitVec3(seed: number, salt: number): { x: number; y: number; z: number } {
  const u = float01FromSeed(seed, salt)
  const v = float01FromSeed(seed, salt + 1)
  const th = u * TAU
  const ph = Math.acos(2 * v - 1)
  const sinPh = Math.sin(ph)
  return { x: sinPh * Math.cos(th), y: sinPh * Math.sin(th), z: Math.cos(ph) }
}

/** Slab / sinusoidal veins along two seed-fixed directions (intersection = sheet-like highs). */
export function veinField01(seed: number, pos: VoxelPos, profile: AsteroidGenProfile): number {
  const s = profile.seed
  const u = seedUnitVec3(s, SALT_VEIN_U)
  const v = seedUnitVec3(s, SALT_VEIN_V)
  const periodU = 2.8 + 4.2 * float01FromSeed(s + seed * 31, SALT_VEIN_PERIOD)
  const periodV = 2.6 + 4.0 * float01FromSeed(s + seed * 31, SALT_VEIN_PERIOD + 1)
  const phU = float01FromSeed(s, SALT_VEIN_PERIOD + 2) * TAU
  const phV = float01FromSeed(s, SALT_VEIN_PERIOD + 3) * TAU
  const du = pos.x * u.x + pos.y * u.y + pos.z * u.z
  const dv = pos.x * v.x + pos.y * v.y + pos.z * v.z
  const sU = 0.5 + 0.5 * Math.sin(du * (TAU / periodU) + phU)
  const sV = 0.5 + 0.5 * Math.sin(dv * (TAU / periodV) + phV)
  const third = float01FromSeed(s, SALT_VEIN_W)
  let w = third < 0.35 ? Math.max(sU, sV) : 0.55 * sU + 0.45 * sV
  if (profile.regime === 'impactShattered' || profile.regime === 'collisionalFamilyDebris') {
    w = 0.5 * w + 0.5 * Math.max(sU, sV)
  }
  return clamp01(w)
}

/** Sharp high-frequency speckle (isolated voxel-ish spikes after nonlinearity). */
export function speckleField01(seed: number, pos: VoxelPos, power: number): number {
  const h = latticeHash(seed + SALT_SPECKLE_POWER, pos.x, pos.y, pos.z)
  const p = Math.max(2, Math.min(24, power))
  return clamp01(Math.pow(h, p))
}

function pocketScaleForRegime(reg: AsteroidRegime): number {
  switch (reg) {
    case 'competentMonolith':
      return 1.35
    case 'impactShattered':
    case 'collisionalFamilyDebris':
      return 0.72
    case 'gardenedAncient':
      return 1.12
    default:
      return 1
  }
}

export interface MorphologyWeights {
  pocket: number
  vein: number
  speckle: number
}

function normalizeMorph(w: MorphologyWeights): MorphologyWeights {
  const s = w.pocket + w.vein + w.speckle
  if (s <= 1e-9) return { pocket: 1 / 3, vein: 1 / 3, speckle: 1 / 3 }
  return { pocket: w.pocket / s, vein: w.vein / s, speckle: w.speckle / s }
}

function spectralMorphBase(cls: SpectralClass): MorphologyWeights {
  switch (cls) {
    case 'M':
    case 'X':
      return { pocket: 0.46, vein: 0.44, speckle: 0.1 }
    case 'S':
    case 'E':
      return { pocket: 0.34, vein: 0.52, speckle: 0.14 }
    case 'C':
    case 'D':
      return { pocket: 0.56, vein: 0.26, speckle: 0.18 }
    case 'V':
      return { pocket: 0.4, vein: 0.45, speckle: 0.15 }
    default:
      return { pocket: 0.38, vein: 0.4, speckle: 0.22 }
  }
}

function regimeMorphDelta(reg: AsteroidRegime): MorphologyWeights {
  switch (reg) {
    case 'impactShattered':
    case 'collisionalFamilyDebris':
      return { pocket: -0.12, vein: -0.05, speckle: 0.17 }
    case 'competentMonolith':
      return { pocket: 0.14, vein: -0.06, speckle: -0.08 }
    case 'gardenedAncient':
      return { pocket: 0.1, vein: -0.08, speckle: -0.02 }
    case 'volatileRichPrimitive':
    case 'outerBeltCold':
      return { pocket: 0.06, vein: -0.04, speckle: -0.02 }
    case 'freshExposure':
      return { pocket: -0.04, vein: 0.06, speckle: -0.02 }
    case 'thermallyProcessed':
      return { pocket: 0.02, vein: 0.04, speckle: -0.06 }
    case 'contactBinaryRubble':
      return { pocket: 0.04, vein: 0.02, speckle: -0.06 }
    default:
      return { pocket: 0, vein: 0, speckle: 0 }
  }
}

/** Spectral × regime nonnegative weights (sum 1). Exported for tests. */
export function morphologyWeights(profile: AsteroidGenProfile): MorphologyWeights {
  const base = spectralMorphBase(profile.spectralClass)
  const d = regimeMorphDelta(profile.regime)
  return normalizeMorph({
    pocket: Math.max(0.02, base.pocket + d.pocket),
    vein: Math.max(0.02, base.vein + d.vein),
    speckle: Math.max(0.02, base.speckle + d.speckle),
  })
}

function specklePowerForRegime(reg: AsteroidRegime): number {
  switch (reg) {
    case 'impactShattered':
    case 'collisionalFamilyDebris':
      return 10
    case 'competentMonolith':
      return 6
    default:
      return 8
  }
}

function regimeLodeParams(reg: AsteroidRegime): { noiseExponent: number; mixScale: number } {
  switch (reg) {
    case 'impactShattered':
    case 'collisionalFamilyDebris':
      /** Lower exponent so merged field values are not crushed below the smoothstep band. */
      return { noiseExponent: 1.12, mixScale: 1.14 }
    case 'volatileRichPrimitive':
    case 'outerBeltCold':
      return { noiseExponent: 0.88, mixScale: 1.1 }
    case 'competentMonolith':
      return { noiseExponent: 1.08, mixScale: 0.84 }
    case 'gardenedAncient':
      return { noiseExponent: 0.72, mixScale: 0.9 }
    case 'freshExposure':
      return { noiseExponent: 1.08, mixScale: 1.05 }
    case 'thermallyProcessed':
      return { noiseExponent: 1.12, mixScale: 0.92 }
    default:
      return { noiseExponent: 1, mixScale: 1 }
  }
}

/**
 * Normalized rare-lode target composition per spectral class (convex mix toward these pockets).
 * Weights follow main-belt priors: C/D organics & volatiles, M/X metal-rich, S/E stony sulfides, etc.
 */
function spectralLodeTarget(cls: SpectralClass): Record<RootResourceId, number> {
  const o = {} as Record<RootResourceId, number>
  for (const r of ROOT_RESOURCE_IDS) o[r] = 0
  switch (cls) {
    case 'C':
      o.regolithMass = 0.03
      o.silicates = 0.06
      o.metals = 0.08
      o.volatiles = 0.16
      o.sulfides = 0.07
      o.oxides = 0.04
      o.carbonaceous = 0.24
      o.hydrates = 0.22
      o.ices = 0.02
      o.refractories = 0.02
      o.phosphates = 0.03
      o.halides = 0.03
      break
    case 'S':
      o.regolithMass = 0.04
      o.silicates = 0.18
      o.metals = 0.17
      o.volatiles = 0.08
      o.sulfides = 0.24
      o.oxides = 0.13
      o.carbonaceous = 0.05
      o.hydrates = 0.04
      o.ices = 0.02
      o.refractories = 0.02
      o.phosphates = 0.02
      o.halides = 0.01
      break
    case 'M':
      o.regolithMass = 0.02
      o.silicates = 0.1
      o.metals = 0.47
      o.volatiles = 0.01
      o.sulfides = 0.11
      o.oxides = 0.06
      o.carbonaceous = 0.01
      o.hydrates = 0.01
      o.ices = 0
      o.refractories = 0.21
      o.phosphates = 0
      o.halides = 0
      break
    case 'D':
      o.regolithMass = 0.02
      o.silicates = 0.06
      o.metals = 0.04
      o.volatiles = 0.2
      o.sulfides = 0.02
      o.oxides = 0.02
      o.carbonaceous = 0.2
      o.hydrates = 0.12
      o.ices = 0.28
      o.refractories = 0.02
      o.phosphates = 0.01
      o.halides = 0.01
      break
    case 'V':
      o.regolithMass = 0.03
      o.silicates = 0.28
      o.metals = 0.14
      o.volatiles = 0.06
      o.sulfides = 0.08
      o.oxides = 0.31
      o.carbonaceous = 0.03
      o.hydrates = 0.02
      o.ices = 0.01
      o.refractories = 0.02
      o.phosphates = 0.01
      o.halides = 0.01
      break
    case 'E':
      o.regolithMass = 0.04
      o.silicates = 0.24
      o.metals = 0.2
      o.volatiles = 0.06
      o.sulfides = 0.32
      o.oxides = 0.08
      o.carbonaceous = 0.02
      o.hydrates = 0.02
      o.ices = 0.01
      o.refractories = 0.01
      o.phosphates = 0
      o.halides = 0
      break
    case 'X':
      o.regolithMass = 0.02
      o.silicates = 0.12
      o.metals = 0.36
      o.volatiles = 0.02
      o.sulfides = 0.2
      o.oxides = 0.06
      o.carbonaceous = 0.02
      o.hydrates = 0.02
      o.ices = 0.02
      o.refractories = 0.14
      o.phosphates = 0.01
      o.halides = 0.01
      break
    default:
      for (const r of ROOT_RESOURCE_IDS) o[r] = 1 / ROOT_RESOURCE_IDS.length
      break
  }
  let s = 0
  for (const r of ROOT_RESOURCE_IDS) s += o[r]
  if (s <= 1e-12) {
    for (const r of ROOT_RESOURCE_IDS) o[r] = 1 / ROOT_RESOURCE_IDS.length
  } else {
    for (const r of ROOT_RESOURCE_IDS) o[r] /= s
  }
  return o
}

export interface RareLodeEnrichmentResult {
  bulk: Record<RootResourceId, number>
  /** 0 = background; 1 = strongest merged lode field (graded). */
  rareLodeStrength01: number
}

/**
 * Convex blend from baseline bulk toward a spectral rare-lode template where merged morphology field is high.
 */
export function applyRareLodeEnrichment(
  seed: number,
  pos: VoxelPos,
  baseBulk: Record<RootResourceId, number>,
  profile: AsteroidGenProfile,
): RareLodeEnrichmentResult {
  const pocketScale = pocketScaleForRegime(profile.regime)
  const pocket = pocketField01(seed + profile.seed * 31, pos, pocketScale)
  const vein = veinField01(seed, pos, profile)
  const speckle = speckleField01(seed + profile.seed * 17, pos, specklePowerForRegime(profile.regime))
  const mw = morphologyWeights(profile)
  /** Weighted sum alone averages toward ~0.4 and kills peaks; blend with max(pocket,vein,speckle) so veins/speckles stay visible. */
  const blended = mw.pocket * pocket + mw.vein * vein + mw.speckle * speckle
  const peak = Math.max(pocket, vein, speckle)
  const nRaw = clamp01(0.4 * blended + 0.6 * peak)

  const { noiseExponent, mixScale } = regimeLodeParams(profile.regime)
  const n = Math.pow(Math.max(1e-9, nRaw), noiseExponent)
  const lo = Math.min(gameBalance.rareLodeNoiseSmoothLow, gameBalance.rareLodeNoiseSmoothHigh)
  const hi = Math.max(gameBalance.rareLodeNoiseSmoothLow, gameBalance.rareLodeNoiseSmoothHigh)
  const t = smoothstep(lo, hi, n)
  const lodeVec = spectralLodeTarget(profile.spectralClass)
  const mixMax = gameBalance.rareLodeMixMax * mixScale
  const mixAmount = Math.min(1, t * mixMax)

  const out = {} as Record<RootResourceId, number>
  for (const r of ROOT_RESOURCE_IDS) {
    out[r] = baseBulk[r] * (1 - mixAmount) + lodeVec[r] * mixAmount
  }
  let s = 0
  for (const r of ROOT_RESOURCE_IDS) s += out[r]
  if (s <= 1e-12) {
    return { bulk: baseBulk, rareLodeStrength01: 0 }
  }
  for (const r of ROOT_RESOURCE_IDS) out[r] /= s

  return { bulk: out, rareLodeStrength01: t }
}
