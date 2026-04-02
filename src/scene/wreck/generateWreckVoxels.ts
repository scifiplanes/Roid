import type { VoxelPos } from '../asteroid/generateAsteroidVoxels'
import type { WreckProfile } from '../../game/coreAssets'

export interface WreckGenParams {
  /** Odd integer; cells are 0 … gridSize − 1. */
  gridSize: number
  seed: number
  profile: WreckProfile
}

function hash(seed: number, x: number, y: number, z: number): number {
  let n = x * 374761393 + y * 668265263 + z * 1274126177 + seed * 1442695041
  n = (n ^ (n >>> 13)) * 1274126177
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function rand(seed: number, i: number): number {
  return hash(seed, i * 17, i * 31, i * 47)
}

interface Slab {
  cx: number
  cy: number
  cz: number
  hx: number
  hy: number
  hz: number
}

/**
 * Deterministic angular wreck: union of a few box-like hull slabs with
 * small seed-driven offsets and aspect ratios. Pure data, no Three.js.
 */
export function generateWreckVoxels(params: WreckGenParams): VoxelPos[] {
  const { gridSize, seed, profile } = params
  const g = Math.floor(gridSize)
  if (g < 3 || g % 2 === 0) {
    throw new Error('gridSize must be an odd integer ≥ 3')
  }

  const center = (g - 1) / 2
  const slabs: Slab[] = []

  const baseHalfExtent = profile.baseHalfExtent
  const [slabMin, slabMax] = profile.slabCountRange
  const slabCountBase = Math.max(1, Math.floor(slabMax - slabMin + 1))
  const slabCount = slabMin + Math.floor(rand(seed, 0) * slabCountBase)
  for (let i = 0; i < slabCount; i++) {
    const r0 = rand(seed, 10 + i)
    const r1 = rand(seed, 20 + i)
    const r2 = rand(seed, 30 + i)
    const r3 = rand(seed, 40 + i)

    // Center offset within a band around the main origin.
    const offRadius = baseHalfExtent * 0.4
    const ox = (r0 * 2 - 1) * offRadius
    const oy = (r1 * 2 - 1) * offRadius
    const oz = (r2 * 2 - 1) * offRadius

    // Anisotropic half-extents so slabs read as panels / girders.
    const hx = baseHalfExtent * (0.8 + 0.8 * r3)
    const hy = baseHalfExtent * (0.35 + 0.4 * r1)
    const hz = baseHalfExtent * (0.5 + 0.7 * r2)

    slabs.push({
      cx: center + ox,
      cy: center + oy,
      cz: center + oz,
      hx,
      hy,
      hz,
    })
  }

  const out: VoxelPos[] = []

  for (let iz = 0; iz < g; iz++) {
    for (let iy = 0; iy < g; iy++) {
      for (let ix = 0; ix < g; ix++) {
        let inside = false
        for (let s = 0; s < slabs.length; s++) {
          const slab = slabs[s]!
          const dx = ix - slab.cx
          const dy = iy - slab.cy
          const dz = iz - slab.cz
          if (Math.abs(dx) <= slab.hx && Math.abs(dy) <= slab.hy && Math.abs(dz) <= slab.hz) {
            inside = true
            break
          }
        }

        if (!inside) continue

        // Cut a few jagged voids to make the wreck feel torn.
        const h0 = hash(seed + 101, ix, iy, iz)
        const h1 = hash(seed + 211, ix, iy, iz)
        const voidChance = profile.voidCutChance + profile.fragmentJitter * h1
        if (h0 < voidChance) continue

        out.push({ x: ix, y: iy, z: iz })
      }
    }
  }

  return out
}

