import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Vector3,
} from 'three'
import { latticeHash } from '../game/compositionYields'
import { compositionToBulkRockHintColor } from '../game/scanVisualization'
import type { ScanVisualizationDebug } from '../game/scanVisualizationDebug'
import type { DrossCluster, DrossState } from '../game/drossSim'
import type { VoxelCell } from '../game/voxelState'

const _m = new Matrix4()
const _p = new Vector3()
const _bulkTint = new Color()
const _tmp = new Color()

/** Small cube edge (world units); smaller than voxels. */
const PARTICLE_CUBE = 0.11
const MAX_INSTANCES = 768
/** Max particles per cluster; scales with mass. */
const PARTICLES_PER_MASS_UNIT = 4
const MAX_PER_CLUSTER = 24

const JITTER = 0.38
/** Per-particle hue jitter vs bulk hint (keeps clusters readable). */
const PARTICLE_COLOR_JITTER = 0.1

function stubCellForDrossTint(cluster: DrossCluster): VoxelCell {
  return {
    pos: cluster.pos,
    kind: cluster.kind,
    hpRemaining: 1,
    bulkComposition: cluster.bulk,
  } as VoxelCell
}

export interface DrossParticlesHandle {
  group: Group
  syncFromState: (
    state: DrossState,
    gridSize: number,
    voxelSize: number,
    seed: number,
    timeMs: number,
    scanViz: ScanVisualizationDebug,
  ) => void
  dispose: () => void
}

export function createDrossParticlesGroup(): DrossParticlesHandle {
  const group = new Group()
  group.name = 'dross-particles'

  const geo = new BoxGeometry(PARTICLE_CUBE, PARTICLE_CUBE, PARTICLE_CUBE)
  const mat = new MeshStandardMaterial({
    color: new Color(1, 1, 1),
    vertexColors: true,
    metalness: 0.15,
    roughness: 0.55,
  })

  const mesh = new InstancedMesh(geo, mat, MAX_INSTANCES)
  mesh.name = 'dross-instanced'
  mesh.count = 0
  mesh.visible = false
  mesh.frustumCulled = false
  group.add(mesh)

  return {
    group,
    syncFromState(
      state: DrossState,
      gridSize: number,
      voxelSize: number,
      seed: number,
      timeMs: number,
      scanViz: ScanVisualizationDebug,
    ): void {
      const center = (gridSize - 1) / 2
      let idx = 0
      const clusters = state.clusters
      for (let ci = 0; ci < clusters.length && idx < MAX_INSTANCES; ci++) {
        const c = clusters[ci]!
        const n = Math.min(
          MAX_PER_CLUSTER,
          Math.max(1, Math.ceil(c.mass * PARTICLES_PER_MASS_UNIT)),
        )
        const px = (c.pos.x - center) * voxelSize
        const py = (c.pos.y - center) * voxelSize
        const pz = (c.pos.z - center) * voxelSize
        const cellStub = stubCellForDrossTint(c)
        for (let j = 0; j < n && idx < MAX_INSTANCES; j++) {
          const h1 = latticeHash(seed + 901, c.pos.x, c.pos.y * 17 + j, c.pos.z)
          const h2 = latticeHash(seed + 503, c.pos.x + j, c.pos.y, c.pos.z * 13)
          const h3 = latticeHash(seed + 307, c.pos.x * 11 + j, c.pos.y, c.pos.z)
          const ox = (h1 - 0.5) * 2 * JITTER * voxelSize
          const oy = (h2 - 0.5) * 2 * JITTER * voxelSize
          const oz = (h3 - 0.5) * 2 * JITTER * voxelSize
          const bob = Math.sin(timeMs * 0.0011 + ci * 0.7 + j * 0.35) * 0.04 * voxelSize
          _p.set(px + ox, py + oy + bob, pz + oz)
          _m.makeTranslation(_p.x, _p.y, _p.z)
          mesh.setMatrixAt(idx, _m)

          compositionToBulkRockHintColor(cellStub, _bulkTint, scanViz)
          const jt = (latticeHash(seed + 701, c.pos.x + j * 3, c.pos.y, c.pos.z + ci) - 0.5) * 2 * PARTICLE_COLOR_JITTER
          _tmp.copy(_bulkTint)
          _tmp.r = Math.min(1, Math.max(0, _tmp.r * (1 + jt)))
          _tmp.g = Math.min(1, Math.max(0, _tmp.g * (1 - jt * 0.4)))
          _tmp.b = Math.min(1, Math.max(0, _tmp.b * (1 + jt * 0.25)))
          mesh.setColorAt(idx, _tmp)

          idx++
        }
      }
      mesh.count = idx
      mesh.visible = idx > 0
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true
      }
    },
    dispose(): void {
      geo.dispose()
      mat.dispose()
    },
  }
}
