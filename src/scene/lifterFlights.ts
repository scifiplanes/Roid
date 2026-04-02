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

const _m = new Matrix4()

const EDGE = 0.14
const MAX_LIFTER = 8

export interface LifterFlightsHandle {
  group: Group
  syncPositions: (positions: ReadonlyArray<{ x: number; y: number; z: number }>) => void
  dispose: () => void
}

export function createLifterFlightsGroup(): LifterFlightsHandle {
  const group = new Group()
  group.name = 'lifter-flights'

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
    color: new Color(0.75, 1.0, 0.92),
    metalness: 0.35,
    roughness: 0.32,
    emissive: new Color(0.2, 0.95, 0.75),
    emissiveIntensity: 0.55,
  })

  const mesh = new InstancedMesh(geo, mat, MAX_LIFTER)
  mesh.name = 'lifter-flights-instanced'
  mesh.count = 0
  mesh.visible = false
  mesh.frustumCulled = false
  group.add(mesh)

  return {
    group,
    syncPositions(positionsList: ReadonlyArray<{ x: number; y: number; z: number }>): void {
      const n = Math.min(positionsList.length, MAX_LIFTER)
      if (n === 0) {
        mesh.count = 0
        mesh.visible = false
        return
      }
      for (let i = 0; i < n; i++) {
        const p = positionsList[i]!
        _m.makeTranslation(p.x, p.y, p.z)
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
