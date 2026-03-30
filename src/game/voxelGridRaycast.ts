/**
 * Grid DDA raycast in asteroid local space (same cell layout as `setCellMatrixAt`).
 * Returns the first occupied cell index along the ray — stable when the camera is
 * near or inside mesh geometry, unlike triangle `InstancedMesh` picking.
 */

const EPS = 1e-9

function posKey(ix: number, iy: number, iz: number): string {
  return `${ix},${iy},${iz}`
}

function rayAabbInterval(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  zMin: number,
  zMax: number,
): { t0: number; t1: number } | null {
  let tMin = -Infinity
  let tMax = Infinity

  const slab = (o: number, d: number, min: number, max: number) => {
    if (Math.abs(d) < EPS) {
      if (o < min || o > max) {
        tMin = 1
        tMax = 0
      }
      return
    }
    const inv = 1 / d
    let t0 = (min - o) * inv
    let t1 = (max - o) * inv
    if (t0 > t1) {
      const s = t0
      t0 = t1
      t1 = s
    }
    tMin = Math.max(tMin, t0)
    tMax = Math.min(tMax, t1)
  }

  slab(ox, dx, xMin, xMax)
  slab(oy, dy, yMin, yMax)
  slab(oz, dz, zMin, zMax)

  if (tMin > tMax) return null
  return { t0: tMin, t1: tMax }
}

/**
 * @param originLocal - Ray origin in asteroid group local space
 * @param dirLocal - Ray direction in local space (need not be normalized)
 * @param posMap - `voxelPosKey` → index in `voxelCells`
 */
export function raycastFirstOccupiedCellIndex(
  originLocal: { x: number; y: number; z: number },
  dirLocal: { x: number; y: number; z: number },
  voxelSize: number,
  gridSize: number,
  posMap: Map<string, number>,
): number | null {
  const center = (gridSize - 1) / 2
  let dx = dirLocal.x
  let dy = dirLocal.y
  let dz = dirLocal.z
  const len = Math.hypot(dx, dy, dz)
  if (len < 1e-15) return null
  dx /= len
  dy /= len
  dz /= len

  const xMin = (-center - 0.5) * voxelSize
  const xMax = (gridSize - 1 - center + 0.5) * voxelSize
  const yMin = xMin
  const yMax = xMax
  const zMin = xMin
  const zMax = xMax

  const ox = originLocal.x
  const oy = originLocal.y
  const oz = originLocal.z

  const interval = rayAabbInterval(ox, oy, oz, dx, dy, dz, xMin, xMax, yMin, yMax, zMin, zMax)
  if (!interval || interval.t1 < 0) return null

  let tStart = interval.t0 < 0 ? 0 : interval.t0
  if (tStart > interval.t1) return null

  let sx = ox + dx * tStart
  let sy = oy + dy * tStart
  let sz = oz + dz * tStart

  const cellAt = (x: number, y: number, z: number) => {
    const ix = Math.floor(x / voxelSize + center + 0.5 - 1e-12)
    const iy = Math.floor(y / voxelSize + center + 0.5 - 1e-12)
    const iz = Math.floor(z / voxelSize + center + 0.5 - 1e-12)
    return [ix, iy, iz] as const
  }

  let [ix, iy, iz] = cellAt(sx, sy, sz)

  const inBounds = (i: number) => i >= 0 && i < gridSize

  const tryHit = (): number | null => {
    if (!inBounds(ix) || !inBounds(iy) || !inBounds(iz)) return null
    const k = posKey(ix, iy, iz)
    const idx = posMap.get(k)
    return idx === undefined ? null : idx
  }

  const hit0 = tryHit()
  if (hit0 !== null) return hit0

  const stepX = dx > EPS ? 1 : dx < -EPS ? -1 : 0
  const stepY = dy > EPS ? 1 : dy < -EPS ? -1 : 0
  const stepZ = dz > EPS ? 1 : dz < -EPS ? -1 : 0

  const tDeltaX = Math.abs(dx) > EPS ? voxelSize / Math.abs(dx) : Infinity
  const tDeltaY = Math.abs(dy) > EPS ? voxelSize / Math.abs(dy) : Infinity
  const tDeltaZ = Math.abs(dz) > EPS ? voxelSize / Math.abs(dz) : Infinity

  let tMaxX: number
  let tMaxY: number
  let tMaxZ: number

  if (dx > EPS) {
    tMaxX = ((ix - center + 0.5) * voxelSize - sx) / dx
  } else if (dx < -EPS) {
    tMaxX = ((ix - center - 0.5) * voxelSize - sx) / dx
  } else {
    tMaxX = Infinity
  }

  if (dy > EPS) {
    tMaxY = ((iy - center + 0.5) * voxelSize - sy) / dy
  } else if (dy < -EPS) {
    tMaxY = ((iy - center - 0.5) * voxelSize - sy) / dy
  } else {
    tMaxY = Infinity
  }

  if (dz > EPS) {
    tMaxZ = ((iz - center + 0.5) * voxelSize - sz) / dz
  } else if (dz < -EPS) {
    tMaxZ = ((iz - center - 0.5) * voxelSize - sz) / dz
  } else {
    tMaxZ = Infinity
  }

  const maxSteps = gridSize * 4 + 32

  for (let step = 0; step < maxSteps; step++) {
    const minT = Math.min(tMaxX, tMaxY, tMaxZ)
    if (!Number.isFinite(minT)) break

    if (tMaxX <= minT + EPS) {
      ix += stepX
      tMaxX += tDeltaX
    }
    if (tMaxY <= minT + EPS) {
      iy += stepY
      tMaxY += tDeltaY
    }
    if (tMaxZ <= minT + EPS) {
      iz += stepZ
      tMaxZ += tDeltaZ
    }

    const hit = tryHit()
    if (hit !== null) return hit

    if (!inBounds(ix) || !inBounds(iy) || !inBounds(iz)) return null
  }

  return null
}
