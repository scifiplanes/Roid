import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Vector3,
} from 'three'

const _m = new Matrix4()
const _p = new Vector3()

const MAX_DOTS = 128
/** Small cube edge length (world units). */
const DOT_CUBE = 0.16

function fibonacciPoint(i: number, n: number, radius: number, target: Vector3): void {
  if (n <= 0) return
  const inc = Math.PI * (3 - Math.sqrt(5))
  const y = 1 - (2 * i + 1) / n
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const ang = i * inc
  target.set(Math.cos(ang) * r * radius, y * radius, Math.sin(ang) * r * radius)
}

function updateDotInstances(
  mesh: InstancedMesh,
  count: number,
  radius: number,
  phaseRad: number,
): void {
  if (count <= 0) {
    mesh.count = 0
    mesh.visible = false
    return
  }
  mesh.visible = true
  mesh.count = Math.min(count, MAX_DOTS)
  const c = Math.min(count, MAX_DOTS)
  const cos = Math.cos(phaseRad)
  const sin = Math.sin(phaseRad)
  for (let i = 0; i < c; i++) {
    fibonacciPoint(i, c, radius, _p)
    const x = _p.x * cos - _p.z * sin
    const z = _p.x * sin + _p.z * cos
    _m.makeTranslation(x, _p.y, z)
    mesh.setMatrixAt(i, _m)
  }
  mesh.instanceMatrix.needsUpdate = true
  // Invalidate so InstancedMesh.raycast recomputes its bounding sphere from instance matrices
  // (otherwise the first cached sphere stays wrong after positions change every tick).
  mesh.boundingSphere = null
  mesh.boundingBox = null
}

export interface SatelliteDotsHandle {
  group: Group
  /** Raycast targets for Inspect-tool picking (mining laser, excavating, scanner, dross). */
  pickMeshes: readonly InstancedMesh[]
  setCounts: (
    orbital: number,
    excavating: number,
    scanner: number,
    drossCollector: number,
    orbitRadius: number,
  ) => void
  tick: (timeMs: number) => void
  dispose: () => void
}

export function createSatelliteDotsGroup(): SatelliteDotsHandle {
  const group = new Group()
  group.name = 'satellite-dots'

  const geo = new BoxGeometry(DOT_CUBE, DOT_CUBE, DOT_CUBE)

  const orbitalMat = new MeshStandardMaterial({
    color: new Color(0.35, 0.55, 0.95),
    emissive: new Color(0.12, 0.28, 0.65),
    emissiveIntensity: 0.85,
    metalness: 0.2,
    roughness: 0.35,
  })

  const excavMat = new MeshStandardMaterial({
    color: new Color(0.95, 0.62, 0.22),
    emissive: new Color(0.45, 0.22, 0.06),
    emissiveIntensity: 0.55,
    metalness: 0.15,
    roughness: 0.4,
  })

  const scannerMat = new MeshStandardMaterial({
    color: new Color(0.45, 0.95, 0.55),
    emissive: new Color(0.08, 0.45, 0.22),
    emissiveIntensity: 0.72,
    metalness: 0.18,
    roughness: 0.38,
  })

  const drossMat = new MeshStandardMaterial({
    color: new Color(0.82, 0.58, 0.28),
    emissive: new Color(0.35, 0.15, 0.04),
    emissiveIntensity: 0.48,
    metalness: 0.22,
    roughness: 0.42,
  })

  const orbitalMesh = new InstancedMesh(geo, orbitalMat, MAX_DOTS)
  orbitalMesh.name = 'orbital-satellites'
  orbitalMesh.count = 0
  orbitalMesh.visible = false
  orbitalMesh.frustumCulled = false

  const excavMesh = new InstancedMesh(geo, excavMat, MAX_DOTS)
  excavMesh.name = 'excavating-satellites'
  excavMesh.count = 0
  excavMesh.visible = false
  excavMesh.frustumCulled = false

  const scannerMesh = new InstancedMesh(geo, scannerMat, MAX_DOTS)
  scannerMesh.name = 'scanner-satellites'
  scannerMesh.count = 0
  scannerMesh.visible = false
  scannerMesh.frustumCulled = false

  const drossMesh = new InstancedMesh(geo, drossMat, MAX_DOTS)
  drossMesh.name = 'dross-collector-satellites'
  drossMesh.count = 0
  drossMesh.visible = false
  drossMesh.frustumCulled = false

  group.add(orbitalMesh, excavMesh, scannerMesh, drossMesh)

  const pickMeshes: readonly InstancedMesh[] = [orbitalMesh, excavMesh, scannerMesh, drossMesh]

  let orbitalN = 0
  let excavN = 0
  let scannerN = 0
  let drossN = 0
  let baseRadius = 20

  return {
    group,
    pickMeshes,
    setCounts(
      orbital: number,
      excavating: number,
      scanner: number,
      drossCollector: number,
      orbitRadius: number,
    ): void {
      orbitalN = orbital
      excavN = excavating
      scannerN = scanner
      drossN = drossCollector
      baseRadius = orbitRadius
      updateDotInstances(orbitalMesh, orbitalN, orbitRadius, 0)
      updateDotInstances(excavMesh, excavN, orbitRadius * 1.085, Math.PI * 0.31)
      updateDotInstances(scannerMesh, scannerN, orbitRadius * 1.17, Math.PI * 0.62)
      updateDotInstances(drossMesh, drossN, orbitRadius * 1.255, Math.PI * 0.93)
    },
    tick(timeMs: number): void {
      const t = timeMs * 0.00012
      group.rotation.y = t
      group.rotation.x = Math.sin(timeMs * 0.00004) * 0.08
      updateDotInstances(orbitalMesh, orbitalN, baseRadius, t * 0.7)
      updateDotInstances(excavMesh, excavN, baseRadius * 1.085, Math.PI * 0.31 + t * 0.55)
      updateDotInstances(scannerMesh, scannerN, baseRadius * 1.17, Math.PI * 0.62 + t * 0.41)
      updateDotInstances(drossMesh, drossN, baseRadius * 1.255, Math.PI * 0.93 + t * 0.33)
    },
    dispose(): void {
      geo.dispose()
      orbitalMat.dispose()
      excavMat.dispose()
      scannerMat.dispose()
      drossMat.dispose()
    },
  }
}
