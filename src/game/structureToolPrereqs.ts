import type { VoxelCell } from './voxelState'
import type { VoxelKind } from './voxelKinds'

/**
 * Structure tools with placement prerequisites (progression: mature replicator → reactor → hub →
 * refinery → battery & computronium).
 */
export type StructureToolId = 'reactor' | 'hub' | 'refinery' | 'battery' | 'computronium'

export function asteroidHasKind(cells: readonly VoxelCell[], kind: VoxelKind): boolean {
  for (const c of cells) {
    if (c.kind === kind) return true
  }
  return false
}

/** Reactor tool (5): requires at least one mature replicator voxel on the asteroid. */
export function reactorToolUnlocked(cells: readonly VoxelCell[]): boolean {
  return asteroidHasKind(cells, 'replicator')
}

/** Hub tool (7): requires at least one reactor on the asteroid. */
export function hubToolUnlocked(cells: readonly VoxelCell[]): boolean {
  return asteroidHasKind(cells, 'reactor')
}

/** Refinery tool (8): requires at least one hub on the asteroid. */
export function refineryToolUnlocked(cells: readonly VoxelCell[]): boolean {
  return asteroidHasKind(cells, 'hub')
}

/** Battery (6) and Computronium (A) tools: require at least one refinery. */
export function batteryToolUnlocked(cells: readonly VoxelCell[]): boolean {
  return asteroidHasKind(cells, 'refinery')
}

export function computroniumToolUnlocked(cells: readonly VoxelCell[]): boolean {
  return asteroidHasKind(cells, 'refinery')
}

export function getStructureToolUiPhase(
  tool: StructureToolId,
  cells: readonly VoxelCell[],
): 'hidden' | 'unlocked' {
  if (tool === 'reactor') return reactorToolUnlocked(cells) ? 'unlocked' : 'hidden'
  if (tool === 'hub') return hubToolUnlocked(cells) ? 'unlocked' : 'hidden'
  if (tool === 'refinery') return refineryToolUnlocked(cells) ? 'unlocked' : 'hidden'
  if (tool === 'battery') return batteryToolUnlocked(cells) ? 'unlocked' : 'hidden'
  return computroniumToolUnlocked(cells) ? 'unlocked' : 'hidden'
}
