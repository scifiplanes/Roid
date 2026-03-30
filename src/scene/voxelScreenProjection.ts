import { Vector3 } from 'three'
import type { Camera } from 'three'
import type { Group } from 'three'
import type { VoxelPos } from './asteroid/generateAsteroidVoxels'

const _world = new Vector3()

export interface VoxelScreenProjectResult {
  clientX: number
  clientY: number
  /** Roughly in view frustum (NDC) — use for anchoring HUD; hide connector when false. */
  onScreen: boolean
}

/**
 * World center of a grid cell in asteroid local space (matches `buildAsteroidMesh` instancing).
 */
export function voxelCenterLocal(
  pos: VoxelPos,
  gridSize: number,
  voxelSize: number,
  out: Vector3 = _world,
): Vector3 {
  const center = (gridSize - 1) / 2
  return out.set((pos.x - center) * voxelSize, (pos.y - center) * voxelSize, (pos.z - center) * voxelSize)
}

/**
 * Project voxel center to client (canvas) coordinates. Call after `asteroidGroup` transforms are current.
 */
export function projectVoxelPosToClient(
  pos: VoxelPos,
  gridSize: number,
  voxelSize: number,
  asteroidGroup: Group,
  camera: Camera,
  canvasRect: DOMRectReadOnly,
): VoxelScreenProjectResult {
  voxelCenterLocal(pos, gridSize, voxelSize, _world)
  asteroidGroup.updateMatrixWorld(true)
  _world.applyMatrix4(asteroidGroup.matrixWorld)
  _world.project(camera)

  const clientX = (_world.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left
  const clientY = (-_world.y * 0.5 + 0.5) * canvasRect.height + canvasRect.top

  const onScreen =
    Math.abs(_world.x) <= 1.02 &&
    Math.abs(_world.y) <= 1.02 &&
    _world.z >= -1 &&
    _world.z <= 1

  return { clientX, clientY, onScreen }
}

/** Segment V→C vs edge E1→E2; returns hit on V→C with param t ∈ [0,1]. */
function intersectSegSeg(
  vx: number,
  vy: number,
  cx: number,
  cy: number,
  ex1: number,
  ey1: number,
  ex2: number,
  ey2: number,
): { x: number; y: number; t: number } | null {
  const rpx = cx - vx
  const rpy = cy - vy
  const spx = ex2 - ex1
  const spy = ey2 - ey1
  const qpqx = ex1 - vx
  const qpqy = ey1 - vy
  const denom = rpx * spy - rpy * spx
  if (Math.abs(denom) < 1e-12) return null
  const t = (qpqx * spy - qpqy * spx) / denom
  const u = (qpqx * rpy - qpqy * rpx) / denom
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null
  return { x: vx + t * rpx, y: vy + t * rpy, t }
}

/**
 * First intersection of segment V→C with axis-aligned `rect` border (from voxel toward rect center).
 */
export function segmentFirstBorderHitTowardRect(
  vx: number,
  vy: number,
  cx: number,
  cy: number,
  rect: DOMRect,
): { x: number; y: number } {
  const edges: Array<[number, number, number, number]> = [
    [rect.left, rect.top, rect.right, rect.top],
    [rect.right, rect.top, rect.right, rect.bottom],
    [rect.right, rect.bottom, rect.left, rect.bottom],
    [rect.left, rect.bottom, rect.left, rect.top],
  ]
  let best: { x: number; y: number; t: number } | null = null
  for (const [x1, y1, x2, y2] of edges) {
    const hit = intersectSegSeg(vx, vy, cx, cy, x1, y1, x2, y2)
    if (!hit) continue
    if (hit.t < 1e-5) continue
    if (hit.t > 1 + 1e-5) continue
    if (!best || hit.t < best.t) best = hit
  }
  if (best) return { x: best.x, y: best.y }
  // Degenerate: use nearest corner
  const corners = [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
  ]
  let minD = Infinity
  let out = corners[0]!
  for (const c of corners) {
    const d = Math.hypot(c.x - vx, c.y - vy)
    if (d < minD) {
      minD = d
      out = c
    }
  }
  return out
}
