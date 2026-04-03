import type { VoxelPos } from '../scene/asteroid/generateAsteroidVoxels'
import { compositeDepthScanSusceptibility } from './compositionYields'
import type { GameBalance } from './gameBalance'
import type { VoxelCell } from './voxelState'

export function cellParticipatesInDepthReveal(cell: VoxelCell): boolean {
  const k = cell.kind
  return k === 'regolith' || k === 'silicateRock' || k === 'metalRich' || k === 'processedMatter'
}

function manhattan(a: VoxelPos, b: VoxelPos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)
}

function falloff(d: number, d0: number, p: number): number {
  return 1 / (1 + Math.pow(d / d0, p))
}

/**
 * Passive reveal from all `depthScanner` voxels. Returns true if any cell's progress increased
 * so the renderer can refresh instance colors while the depth overlay is on.
 *
 * @param gridSize Voxel grid edge length; used to cap negligible scanner–cell pairs (large grids / many scanners).
 */
export function stepDepthReveal(
  dtSec: number,
  cells: VoxelCell[],
  balance: GameBalance,
  depthScanUnlocked: boolean,
  gridSize = 33,
): boolean {
  if (dtSec <= 0 || !depthScanUnlocked) return false

  const scanners: VoxelPos[] = []
  for (const c of cells) {
    if (c.kind === 'depthScanner') scanners.push(c.pos)
  }
  if (scanners.length === 0) return false

  const rate0 = balance.depthRevealRate
  if (rate0 <= 0) return false
  const d0 = Math.max(0.25, balance.depthRevealDistanceScale)
  const p = Math.max(0.25, balance.depthRevealPower)

  /** Max Manhattan distance on the grid (two corners of the cube). */
  const maxGridManhattan = 3 * (gridSize - 1)
  /**
   * Skip distant scanner pairs when falloff is below ~1e-12 vs accumulated sum (safe on 33³; helps huge grids / extreme balance).
   */
  const pairMax = Math.min(
    maxGridManhattan,
    Math.ceil(d0 * Math.pow(Math.max(0, 1e12 - 1), 1 / p)),
  )
  const usePairPrune = pairMax < maxGridManhattan

  /** Precompute falloff(d) — avoids repeated pow in hot loops when many scanners exist. */
  const falloffByDist = new Float64Array(maxGridManhattan + 1)
  for (let d = 0; d <= maxGridManhattan; d++) {
    falloffByDist[d] = falloff(d, d0, p)
  }

  let changed = false

  const stepOneCell = (cell: VoxelCell, sum: number): void => {
    const prev = cell.depthRevealProgress ?? 0
    if (prev >= 1) return

    const S = compositeDepthScanSusceptibility(cell.bulkComposition)
    const floor = balance.depthRevealSusceptibilityFloor
    const mult = floor + (1 - floor) * S
    const delta = dtSec * rate0 * sum * mult
    const next = Math.min(1, prev + delta)
    if (next > prev) changed = true

    cell.depthRevealProgress = next
  }

  if (scanners.length === 1) {
    const s0 = scanners[0]!
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]
      if (!cellParticipatesInDepthReveal(cell)) continue
      const d = manhattan(cell.pos, s0)
      const sum = falloffByDist[d]!
      stepOneCell(cell, sum)
    }
    return changed
  }

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    if (!cellParticipatesInDepthReveal(cell)) continue

    const prev = cell.depthRevealProgress ?? 0
    if (prev >= 1) continue

    let sum = 0
    for (const s of scanners) {
      const d = manhattan(cell.pos, s)
      if (usePairPrune && d > pairMax) continue
      sum += falloffByDist[d]!
    }

    stepOneCell(cell, sum)
  }

  return changed
}
