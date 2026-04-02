import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Uint16BufferAttribute,
} from 'three'
import type { DebrisState } from '../game/debrisSim'

const _m = new Matrix4()

const EDGE = 0.12
const MAX_DEBRIS = 128

export interface DebrisShardsHandle {
  group: Group
  syncFromState: (state: DebrisState) => void
  dispose: () => void
}

export function createDebrisShardsGroup(): DebrisShardsHandle {
  const group = new Group()
  group.name = 'debris-shards'

  const geo = new BufferGeometry()
  const v = EDGE
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
    color: new Color(0.9, 0.92, 1),
    metalness: 0.22,
    roughness: 0.4,
    emissive: new Color(0.32, 0.55, 1),
    emissiveIntensity: 0.4,
  })

  const mesh = new InstancedMesh(geo, mat, MAX_DEBRIS)
  mesh.name = 'debris-instanced'
  mesh.count = 0
  mesh.visible = false
  mesh.frustumCulled = false
  group.add(mesh)

  return {
    group,
    syncFromState(state: DebrisState): void {
      const shards = state.shards
      const n = Math.min(shards.length, MAX_DEBRIS)
      if (n === 0) {
        mesh.count = 0
        mesh.visible = false
        return
      }
      for (let i = 0; i < n; i++) {
        const s = shards[i]!
        _m.makeTranslation(s.pos.x, s.pos.y, s.pos.z)
        mesh.setMatrixAt(i, _m)
      }
      mesh.count = n
      mesh.visible = true
      mesh.instanceMatrix.needsUpdate = true
    },
    dispose(): void {
      geo.dispose()
      mat.dispose()
    },
  }
}

