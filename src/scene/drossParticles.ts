import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Uint16BufferAttribute,
  Vector3,
} from 'three'
import { latticeHash } from '../game/compositionYields'
import {
  compositionToBulkRockHintColor,
  scanVisualizationBulkHintKeyForDross,
} from '../game/scanVisualization'
import type { ScanVisualizationDebug } from '../game/scanVisualizationDebug'
import type { DrossCluster, DrossState } from '../game/drossSim'
import type { VoxelCell } from '../game/voxelState'

const _m = new Matrix4()
const _p = new Vector3()
const _bulkTint = new Color()
const _tmp = new Color()

/** Small tetrahedron edge (world units); smaller than voxels. */
const PARTICLE_EDGE = 0.11
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

  const geo = new BufferGeometry()
  const v = PARTICLE_EDGE
  // Simple 4‑vertex tetrahedron (very low poly).
  const positions = new Float32Array([
    0,
    0,
    0,
    v,
    0,
    0,
    0,
    v,
    0,
    0,
    0,
    v,
  ])
  const indices = new Uint16Array([
    0, 1, 2,
    0, 3, 1,
    0, 2, 3,
    1, 3, 2,
  ])
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.setIndex(new Uint16BufferAttribute(indices, 1))
  geo.computeVertexNormals()
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

  /** Base translation (no bob); reused when only `timeMs` changes. */
  const baseX = new Float32Array(MAX_INSTANCES)
  const baseY = new Float32Array(MAX_INSTANCES)
  const baseZ = new Float32Array(MAX_INSTANCES)
  /** Same phase offset as full build: `ci * 0.7 + j * 0.35`. */
  const bobPhaseK = new Float32Array(MAX_INSTANCES)
  let lastSyncKey = ''

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
      const clusters = state.clusters
      const parts: string[] = []
      for (let ci = 0; ci < clusters.length; ci++) {
        const c = clusters[ci]!
        const n = Math.min(
          MAX_PER_CLUSTER,
          Math.max(1, Math.ceil(c.mass * PARTICLES_PER_MASS_UNIT)),
        )
        parts.push(`${c.pos.x},${c.pos.y},${c.pos.z}:${c.mass.toFixed(5)}:${c.kind}:${n}`)
      }
      const clusterKey = parts.join(';')
      const vizKey = scanVisualizationBulkHintKeyForDross(scanViz)
      const fullKey = `${clusterKey}|${vizKey}|${seed}|${gridSize}|${voxelSize}`
      const fastBobOnly = fullKey === lastSyncKey && mesh.count > 0

      if (fastBobOnly) {
        const n = mesh.count
        const amp = 0.04 * voxelSize
        const wt = timeMs * 0.0011
        for (let i = 0; i < n; i++) {
          const bob = Math.sin(wt + bobPhaseK[i]!) * amp
          _p.set(baseX[i]!, baseY[i]! + bob, baseZ[i]!)
          _m.makeTranslation(_p.x, _p.y, _p.z)
          mesh.setMatrixAt(i, _m)
        }
        mesh.instanceMatrix.needsUpdate = true
        return
      }

      lastSyncKey = fullKey

      let idx = 0
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
          const bx = px + ox
          const by = py + oy
          const bz = pz + oz
          baseX[idx] = bx
          baseY[idx] = by
          baseZ[idx] = bz
          bobPhaseK[idx] = ci * 0.7 + j * 0.35
          const bob = Math.sin(timeMs * 0.0011 + bobPhaseK[idx]!) * 0.04 * voxelSize
          _p.set(bx, by + bob, bz)
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
