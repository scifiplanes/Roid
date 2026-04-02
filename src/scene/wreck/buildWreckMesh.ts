import type { Color } from 'three'
import type { VoxelCell } from '../../game/voxelState'
import {
  type AsteroidMeshOptions,
  type AsteroidRenderBundle,
  buildAsteroidMesh,
} from '../asteroid/buildAsteroidMesh'

export interface WreckMeshOptions {
  voxelSize: number
  gridSize: number
  /** Base hull color; defaults to a cooler, more metallic tint than rock. */
  baseColor?: Color
  hullMetalness?: number
}

/**
 * For now we reuse the asteroid instancing pipeline for wrecks but feed a
 * different base color / metalness; the angular wreck geometry comes from
 * the voxel generator.
 */
export function buildWreckMesh(cells: VoxelCell[], options: WreckMeshOptions): AsteroidRenderBundle {
  const { voxelSize, gridSize } = options
  const asteroidOpts: AsteroidMeshOptions = {
    voxelSize,
    gridSize,
    baseColor: options.baseColor,
    rockMetalness: options.hullMetalness ?? 0.16,
  }
  return buildAsteroidMesh(cells, asteroidOpts)
}

