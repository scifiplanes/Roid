import type { VoxelCell } from './voxelState'
import { RESOURCE_IDS_ORDERED, ROOT_RESOURCE_IDS, type ResourceId } from './resources'

export function addYieldsToCellStore(
  cell: VoxelCell,
  yields: Partial<Record<ResourceId, number>>,
): void {
  if (!cell.storedResources) cell.storedResources = {}
  for (const id of RESOURCE_IDS_ORDERED) {
    const v = yields[id]
    if (v !== undefined && v > 0) {
      cell.storedResources[id] = (cell.storedResources[id] ?? 0) + v
    }
  }
}

export function cellHasRefinableStock(cell: VoxelCell): boolean {
  const u = cell.processedMatterUnits ?? 0
  if (u > 0) return true
  if (!cell.storedResources) return false
  for (const id of ROOT_RESOURCE_IDS) {
    if ((cell.storedResources[id] ?? 0) > 0) return true
  }
  return false
}

export function totalStoredResourceUnits(cell: VoxelCell): number {
  let n = cell.processedMatterUnits ?? 0
  if (cell.storedResources) {
    for (const id of ROOT_RESOURCE_IDS) {
      n += cell.storedResources[id] ?? 0
    }
  }
  return n
}

/** Take one unit of a specific resource id from cell store. Returns true if taken. */
export function takeOneResource(cell: VoxelCell, id: ResourceId): boolean {
  if (!cell.storedResources) return false
  const have = cell.storedResources[id] ?? 0
  if (have < 1) return false
  cell.storedResources[id] = have - 1
  if (cell.storedResources[id] <= 0) delete cell.storedResources[id]
  if (Object.keys(cell.storedResources).length === 0) delete cell.storedResources
  return true
}

export function takeOneProcessedMatterUnit(cell: VoxelCell): boolean {
  const u = cell.processedMatterUnits ?? 0
  if (u < 1) return false
  if (u <= 1) delete cell.processedMatterUnits
  else cell.processedMatterUnits = u - 1
  return true
}
