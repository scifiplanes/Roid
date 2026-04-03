import type { AsteroidShapeParams } from '../../game/asteroidGenProfile'

export interface VoxelPos {
  x: number
  y: number
  z: number
}

export type AsteroidGenParams = AsteroidShapeParams & {
  /** Odd integer; cells are 0 … gridSize − 1. */
  gridSize: number
  seed: number
}

/** Match `MIN_VOXELS_AFTER_CRATERS` — fallback to single lobe if union is too sparse. */
const MIN_VOXELS_FOR_SHAPE = 400

/** One noise-warped ellipsoid lobe in grid space. */
interface SilhouetteLobe {
  cx: number
  cy: number
  cz: number
  /** Scales semi-axes vs primary (1 = same as central ellipsoid). */
  axisScale: number
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

/** Deterministic [0, 1) hash at integer lattice (ix, iy, iz). */
function latticeHash(seed: number, ix: number, iy: number, iz: number): number {
  let n = ix * 374761393 + iy * 668265263 + iz * 1274126177 + seed * 1442695041
  n = (n ^ (n >>> 13)) * 1274126177
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

/** Trilinear value noise in continuous 3D space. */
function valueNoise3D(seed: number, x: number, y: number, z: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const z0 = Math.floor(z)
  const tx = smoothstep(x - x0)
  const ty = smoothstep(y - y0)
  const tz = smoothstep(z - z0)

  const c000 = latticeHash(seed, x0, y0, z0)
  const c100 = latticeHash(seed, x0 + 1, y0, z0)
  const c010 = latticeHash(seed, x0, y0 + 1, z0)
  const c110 = latticeHash(seed, x0 + 1, y0 + 1, z0)
  const c001 = latticeHash(seed, x0, y0, z0 + 1)
  const c101 = latticeHash(seed, x0 + 1, y0, z0 + 1)
  const c011 = latticeHash(seed, x0, y0 + 1, z0 + 1)
  const c111 = latticeHash(seed, x0 + 1, y0 + 1, z0 + 1)

  const x00 = c000 + tx * (c100 - c000)
  const x10 = c010 + tx * (c110 - c010)
  const x01 = c001 + tx * (c101 - c001)
  const x11 = c011 + tx * (c111 - c011)

  const y0v = x00 + ty * (x10 - x00)
  const y1v = x01 + ty * (x11 - x01)

  return y0v + tz * (y1v - y0v)
}

/** Two octaves, roughly −1 … 1. */
function fbmNoise3D(seed: number, x: number, y: number, z: number): number {
  const a = valueNoise3D(seed, x, y, z) * 2 - 1
  const b = valueNoise3D(seed + 101, x * 2, y * 2, z * 2) * 2 - 1
  return a * 0.65 + b * 0.35
}

/** Normalized ellipsoid distance: 1 on surface when semi-axes = baseRadius * (mx,my,mz). */
function ellipsoidNormalizedDistance(
  ix: number,
  iy: number,
  iz: number,
  baseRadius: number,
  mx: number,
  my: number,
  mz: number,
  cx: number,
  cy: number,
  cz: number,
  axisScale: number,
): number {
  const dx = ix - cx
  const dy = iy - cy
  const dz = iz - cz
  const ax = baseRadius * axisScale * mx
  const ay = baseRadius * axisScale * my
  const az = baseRadius * axisScale * mz
  const ex = dx / ax
  const ey = dy / ay
  const ez = dz / az
  return Math.sqrt(ex * ex + ey * ey + ez * ez)
}

/** Lobe centers for voxel union from silhouette params (grid center = `(gridSize-1)/2`). */
export function silhouetteLobesFromShape(shape: AsteroidShapeParams, center: number): SilhouetteLobe[] {
  const c = center
  switch (shape.shapeClass) {
    case 'ellipsoid':
      return [{ cx: c, cy: c, cz: c, axisScale: 1 }]
    case 'contactBinary':
      return [
        { cx: c, cy: c, cz: c, axisScale: 1 },
        {
          cx: c + shape.binaryOffsetX,
          cy: c + shape.binaryOffsetY,
          cz: c + shape.binaryOffsetZ,
          axisScale: shape.binarySecondaryScale,
        },
      ]
    case 'contactTrinary': {
      const R = shape.trinaryRadius
      const th = shape.trinaryAngleRad
      const s = shape.trinaryLobeAxisScale
      const third = (2 * Math.PI) / 3
      return [
        { cx: c + R * Math.cos(th), cy: c + R * Math.sin(th), cz: c, axisScale: s },
        { cx: c + R * Math.cos(th + third), cy: c + R * Math.sin(th + third), cz: c, axisScale: s },
        { cx: c + R * Math.cos(th + 2 * third), cy: c + R * Math.sin(th + 2 * third), cz: c, axisScale: s },
      ]
    }
    default:
      return [{ cx: c, cy: c, cz: c, axisScale: 1 }]
  }
}

function collectAsteroidVoxels(
  g: number,
  seed: number,
  baseRadius: number,
  noiseScale: number,
  noiseAmplitude: number,
  mx: number,
  my: number,
  mz: number,
  lobes: SilhouetteLobe[],
): VoxelPos[] {
  const out: VoxelPos[] = []
  const threshScale = 1 / baseRadius

  for (let iz = 0; iz < g; iz++) {
    for (let iy = 0; iy < g; iy++) {
      for (let ix = 0; ix < g; ix++) {
        const nx = ix * noiseScale
        const ny = iy * noiseScale
        const nz = iz * noiseScale
        const warp = fbmNoise3D(seed, nx, ny, nz) * noiseAmplitude
        const thresh = 1 + warp * threshScale

        let inside = false
        for (const L of lobes) {
          const e = ellipsoidNormalizedDistance(
            ix,
            iy,
            iz,
            baseRadius,
            mx,
            my,
            mz,
            L.cx,
            L.cy,
            L.cz,
            L.axisScale,
          )
          if (e < thresh) {
            inside = true
            break
          }
        }
        if (inside) {
          out.push({ x: ix, y: iy, z: iz })
        }
      }
    }
  }
  return out
}

/**
 * Procedural irregular asteroid: cells inside a noise-warped ellipsoid union in grid space.
 * Pure function — no Three.js.
 */
export function generateAsteroidVoxels(params: AsteroidGenParams): VoxelPos[] {
  const {
    gridSize,
    seed,
    baseRadius,
    noiseScale,
    noiseAmplitude,
    axisMulX,
    axisMulY,
    axisMulZ,
    shapeClass,
  } = params
  const g = Math.floor(gridSize)
  if (g < 3 || g % 2 === 0) {
    throw new Error('gridSize must be an odd integer ≥ 3')
  }

  const center = (g - 1) / 2
  const lobes = silhouetteLobesFromShape(params, center)

  let positions = collectAsteroidVoxels(
    g,
    seed,
    baseRadius,
    noiseScale,
    noiseAmplitude,
    axisMulX,
    axisMulY,
    axisMulZ,
    lobes,
  )

  if (shapeClass === 'contactBinary' && positions.length < MIN_VOXELS_FOR_SHAPE) {
    positions = collectAsteroidVoxels(
      g,
      seed,
      baseRadius,
      noiseScale,
      noiseAmplitude,
      axisMulX,
      axisMulY,
      axisMulZ,
      [{ cx: center, cy: center, cz: center, axisScale: 1 }],
    )
  }

  if (shapeClass === 'contactTrinary' && positions.length < MIN_VOXELS_FOR_SHAPE) {
    positions = collectAsteroidVoxels(
      g,
      seed,
      baseRadius,
      noiseScale,
      noiseAmplitude,
      axisMulX,
      axisMulY,
      axisMulZ,
      [{ cx: center, cy: center, cz: center, axisScale: 1 }],
    )
  }

  return positions
}
