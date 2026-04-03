import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import { createSparseSquareStarfield } from './starfield'

/** Baseline intensity for the key `DirectionalLight`; `main` multiplies per asteroid. */
export const KEY_LIGHT_INTENSITY_BASE = 1.15

export interface SceneBundle {
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  /** Main key light; position sets direction toward the scene origin. */
  sun: DirectionalLight
  /** Advance background star drift (world-space; rad/s supplied by main, synced with key light). */
  stepStarfield: (dtSeconds: number, omegaRadPerSec: number) => void
}

export function setupScene(container: HTMLElement): SceneBundle {
  const scene = new Scene()
  scene.background = new Color(0x000000)

  const { step: stepStarfield } = createSparseSquareStarfield(scene)

  const camera = new PerspectiveCamera(50, 1, 0.1, 500)
  camera.position.set(0, 0, 42)

  const renderer = new WebGLRenderer({ antialias: true, alpha: false })
  // Pixel ratio applied in main via `applyRendererPixelRatio` (Settings cap).
  renderer.outputColorSpace = SRGBColorSpace
  container.appendChild(renderer.domElement)

  const ambient = new AmbientLight(0x8a90a0, 0.55)
  scene.add(ambient)

  const sun = new DirectionalLight(0xfff4e6, KEY_LIGHT_INTENSITY_BASE)
  sun.position.set(8, 12, 10)
  scene.add(sun)
  sun.target.position.set(0, 0, 0)
  scene.add(sun.target)

  const fill = new DirectionalLight(0x6b8cce, 0.35)
  fill.position.set(-6, -4, -8)
  fill.target.position.set(0, 0, 0)
  scene.add(fill)
  scene.add(fill.target)

  return { scene, camera, renderer, sun, stepStarfield }
}
