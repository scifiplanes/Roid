import type { VoxelPos } from '../scene/asteroid/generateAsteroidVoxels'
import { compositionToYields } from './compositionYields'
import { clearReplicatorTransformState } from './energyAndStructures'
import {
  defaultUniformRootComposition,
  ROOT_RESOURCE_IDS,
  type RootResourceId,
} from './resources'
import { clearDepthRevealState, clearSurfaceScanTint } from './scanVisualization'
import { hpForVoxelKind, type VoxelCell } from './voxelState'
import type { VoxelKind } from './voxelKinds'

/** Rock kinds that convert to processed matter (mining laser, mining drone). */
export const ROCK_LITHOLOGY_KINDS: ReadonlySet<VoxelKind> = new Set([
  'regolith',
  'silicateRock',
  'metalRich',
])

export type CoreAssetOriginKind = 'asteroid' | 'wreck'

export interface ConvertRockToPmOptions {
  originSource: CoreAssetOriginKind
  onDiscovery: (pos: VoxelPos) => void
}

export interface LithologyRockSnapshot {
  kind: VoxelKind
  bulkComposition?: Record<RootResourceId, number>
  rareLodeStrength01?: number
}

function normalizeRootSnapshot(bulk: Record<RootResourceId, number> | undefined): Record<RootResourceId, number> {
  if (!bulk) return defaultUniformRootComposition()
  let s = 0
  for (const r of ROOT_RESOURCE_IDS) s += bulk[r]
  if (s <= 0) return defaultUniformRootComposition()
  const o = defaultUniformRootComposition()
  for (const r of ROOT_RESOURCE_IDS) o[r] = bulk[r] / s
  return o
}

/**
 * Mutates `cell` into processed matter using a lithology snapshot (yields, root composition, rare lode).
 */
export function convertCellToProcessedMatterFromRockSnapshot(
  cell: VoxelCell,
  source: LithologyRockSnapshot,
  options: ConvertRockToPmOptions,
): void {
  const bulk = source.bulkComposition ?? defaultUniformRootComposition()
  const yields = compositionToYields(source.kind, bulk)
  let matterUnits = 0
  for (const r of ROOT_RESOURCE_IDS) matterUnits += yields[r] ?? 0
  matterUnits = Math.max(3, matterUnits)
  cell.kind = 'processedMatter'
  cell.hpRemaining = hpForVoxelKind('processedMatter')
  cell.processedMatterUnits = matterUnits
  cell.processedMatterRootComposition = normalizeRootSnapshot(source.bulkComposition)
  if (!cell.originSource) {
    cell.originSource = options.originSource === 'wreck' ? 'wreck' : 'asteroid'
  }
  if (source.rareLodeStrength01 !== undefined) {
    cell.rareLodeStrength01 = source.rareLodeStrength01
  } else {
    delete cell.rareLodeStrength01
  }
  cell.bulkComposition = undefined
  cell.replicatorActive = false
  cell.replicatorEating = false
  cell.replicatorEatAccumulatorMs = 0
  cell.replicatorMsPerHp = undefined
  cell.storedResources = undefined
  cell.passiveRemainder = undefined
  clearReplicatorTransformState(cell)
  clearSurfaceScanTint(cell)
  clearDepthRevealState(cell)
  options.onDiscovery(cell.pos)
}

/** Rock cell → PM using the cell’s own kind and bulk (orbital laser path). */
export function convertRockCellToProcessedMatterInPlace(cell: VoxelCell, options: ConvertRockToPmOptions): void {
  convertCellToProcessedMatterFromRockSnapshot(
    cell,
    {
      kind: cell.kind,
      bulkComposition: cell.bulkComposition,
      rareLodeStrength01: cell.rareLodeStrength01,
    },
    options,
  )
}
