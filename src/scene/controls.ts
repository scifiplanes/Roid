import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { PerspectiveCamera } from 'three'

export function createOrbitControls(
  camera: PerspectiveCamera,
  domElement: HTMLElement,
): OrbitControls {
  const controls = new OrbitControls(camera, domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.07
  controls.minDistance = 22
  controls.maxDistance = 140
  controls.target.set(0, 0, 0)
  controls.update()
  return controls
}
