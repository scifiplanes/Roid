export interface VoxelPos {
  x: number
  y: number
  z: number
}

export interface AsteroidGenParams {
  /** Odd integer; cells are 0 … gridSize − 1. */
  gridSize: number
  seed: number
  /** Nominal radius in voxel units from grid center. */
  baseRadius: number
  /** Noise sample spacing (smaller = lumpier low-frequency bumps). */
  noiseScale: number
  /** How much noise pushes the surface in/out (voxel units). */
  noiseAmplitude: number
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

/**
 * Procedural irregular asteroid: cells inside a noise-warped sphere in grid space.
 * Pure function — no Three.js.
 */
export function generateAsteroidVoxels(params: AsteroidGenParams): VoxelPos[] {
  const { gridSize, seed, baseRadius, noiseScale, noiseAmplitude } = params
  const g = Math.floor(gridSize)
  if (g < 3 || g % 2 === 0) {
    throw new Error('gridSize must be an odd integer ≥ 3')
  }

  const center = (g - 1) / 2
  const out: VoxelPos[] = []

  for (let iz = 0; iz < g; iz++) {
    for (let iy = 0; iy < g; iy++) {
      for (let ix = 0; ix < g; ix++) {
        const dx = ix - center
        const dy = iy - center
        const dz = iz - center
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

        const nx = ix * noiseScale
        const ny = iy * noiseScale
        const nz = iz * noiseScale
        const warp = fbmNoise3D(seed, nx, ny, nz) * noiseAmplitude

        if (dist < baseRadius + warp) {
          out.push({ x: ix, y: iy, z: iz })
        }
      }
    }
  }

  return out
}
