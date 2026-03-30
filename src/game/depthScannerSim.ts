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

/**
 * Passive reveal from all `depthScanner` voxels. Returns true if any cell's progress increased
 * so the renderer can refresh instance colors while the depth overlay is on.
 */
export function stepDepthReveal(
  dtSec: number,
  cells: VoxelCell[],
  balance: GameBalance,
  depthScanUnlocked: boolean,
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

  let changed = false
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    if (!cellParticipatesInDepthReveal(cell)) continue

    const prev = cell.depthRevealProgress ?? 0
    if (prev >= 1) continue

    let sum = 0
    for (const s of scanners) {
      const d = manhattan(cell.pos, s)
      sum += 1 / (1 + Math.pow(d / d0, p))
    }

    const S = compositeDepthScanSusceptibility(cell.bulkComposition)
    const floor = balance.depthRevealSusceptibilityFloor
    const mult = floor + (1 - floor) * S
    const delta = dtSec * rate0 * sum * mult
    const next = Math.min(1, prev + delta)
    if (next > prev) changed = true

    cell.depthRevealProgress = next
  }

  return changed
}
