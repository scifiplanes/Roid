/**
 * Packed integer keys for voxel grid coordinates (no per-lookup string allocation).
 * Coordinates must satisfy 0 <= x,y,z < gridSize (e.g. 33).
 */
export function packVoxelKey(x: number, y: number, z: number, gridSize: number): number {
  return x + y * gridSize + z * gridSize * gridSize
}

export function unpackVoxelKey(key: number, gridSize: number): { x: number; y: number; z: number } {
  const z = Math.floor(key / (gridSize * gridSize))
  const rem = key - z * gridSize * gridSize
  const y = Math.floor(rem / gridSize)
  const x = rem - y * gridSize
  return { x, y, z }
}
