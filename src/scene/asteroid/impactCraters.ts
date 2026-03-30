import { float01FromSeed, type AsteroidGenProfile } from '../../game/asteroidGenProfile'
import type { VoxelPos } from './generateAsteroidVoxels'

/** Do not carve below this many voxels (roughly ~15% of a full 33³ sphere). */
const MIN_VOXELS_AFTER_CRATERS = 400

const CRATER_SALT = 0x1c4a7d00

function craterCountForProfile(
  seed: number,
  profile: AsteroidGenProfile,
  countMin: number,
  countMax: number,
): number {
  const lo = Math.min(countMin, countMax)
  const hi = Math.max(countMin, countMax)
  if (hi <= 0) return 0

  let n = 2 + Math.floor(float01FromSeed(seed, CRATER_SALT + 1) * 5)
  switch (profile.regime) {
    case 'impactShattered':
    case 'collisionalFamilyDebris':
      n += 2
      break
    case 'gardenedAncient':
      n += 1
      break
    case 'competentMonolith':
    case 'contactBinaryRubble':
      n -= 1
      break
    case 'freshExposure':
    case 'outerBeltCold':
      n -= 1
      break
    default:
      break
  }
  return Math.max(lo, Math.min(hi, n))
}

function unitSphereDirection(seed: number, craterIndex: number): { x: number; y: number; z: number } {
  const u = float01FromSeed(seed, CRATER_SALT + craterIndex * 31 + 2)
  const v = float01FromSeed(seed, CRATER_SALT + craterIndex * 31 + 3)
  const theta = 2 * Math.PI * u
  const z = 2 * v - 1
  const r = Math.sqrt(Math.max(0, 1 - z * z))
  return { x: r * Math.cos(theta), y: r * Math.sin(theta), z }
}

function findSurfaceAnchor(
  positions: VoxelPos[],
  gx: number,
  gy: number,
  gz: number,
  nx: number,
  ny: number,
  nz: number,
): VoxelPos {
  let best = positions[0]!
  let bestDot = -Infinity
  for (const p of positions) {
    const dot = (p.x - gx) * nx + (p.y - gy) * ny + (p.z - gz) * nz
    if (dot > bestDot) {
      bestDot = dot
      best = p
    }
  }
  return best
}

/** Uniform random in `[radiusMin, radiusMax]` per crater (deterministic), then × rangeMult. */
function craterRadiusVoxels(
  seed: number,
  craterIndex: number,
  radiusMinVox: number,
  radiusMaxVox: number,
  rangeMult: number,
): number {
  const lo = Math.min(radiusMinVox, radiusMaxVox)
  const hi = Math.max(radiusMinVox, radiusMaxVox)
  const u = float01FromSeed(seed, CRATER_SALT + craterIndex * 31 + 4)
  let r = lo + u * (hi - lo)
  r *= rangeMult
  return Math.max(1.25, Math.min(24, r))
}

/**
 * Deterministic spherical bowl cavities along seeded outward directions.
 * Runs after base `generateAsteroidVoxels`, before `enrichVoxelCells`.
 * @param rangeMult Debug balance multiplier on sampled radius; 0 skips craters.
 * @param radiusMinVox/radiusMaxVox Per-crater radius sampled uniformly in this range (voxels), then × rangeMult.
 * @param countMin/countMax Inclusive bounds on number of craters (debug balance).
 */
export function applyImpactCraters(
  positions: VoxelPos[],
  gridSize: number,
  seed: number,
  profile: AsteroidGenProfile,
  rangeMult: number,
  radiusMinVox: number,
  radiusMaxVox: number,
  countMin: number,
  countMax: number,
): VoxelPos[] {
  if (rangeMult <= 0) return positions
  if (positions.length <= MIN_VOXELS_AFTER_CRATERS) return positions

  const g = Math.floor(gridSize)
  const gx = (g - 1) / 2
  const gy = (g - 1) / 2
  const gz = (g - 1) / 2

  const nCraters = craterCountForProfile(seed, profile, countMin, countMax)
  if (nCraters <= 0) return positions
  let list = positions

  for (let ci = 0; ci < nCraters; ci++) {
    if (list.length <= MIN_VOXELS_AFTER_CRATERS) break

    const dir = unitSphereDirection(seed, ci)
    const anchor = findSurfaceAnchor(list, gx, gy, gz, dir.x, dir.y, dir.z)

    const R = craterRadiusVoxels(seed, ci, radiusMinVox, radiusMaxVox, rangeMult)
    const dFrac = 0.52 + 0.38 * float01FromSeed(seed, CRATER_SALT + ci * 31 + 5)
    const dOut = R * dFrac

    const ox = anchor.x + dir.x * dOut
    const oy = anchor.y + dir.y * dOut
    const oz = anchor.z + dir.z * dOut

    const r2 = R * R
    let removeCount = 0
    for (const p of list) {
      const dx = p.x - ox
      const dy = p.y - oy
      const dz = p.z - oz
      if (dx * dx + dy * dy + dz * dz < r2) removeCount++
    }

    if (list.length - removeCount < MIN_VOXELS_AFTER_CRATERS) continue

    list = list.filter((p) => {
      const dx = p.x - ox
      const dy = p.y - oy
      const dz = p.z - oz
      return dx * dx + dy * dy + dz * dz >= r2
    })
  }

  return list
}
