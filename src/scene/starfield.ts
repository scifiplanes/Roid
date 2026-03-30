import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  NearestFilter,
  Points,
  PointsMaterial,
  Scene,
  SRGBColorSpace,
  Vector3,
} from 'three'

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeSquareSpriteTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 8
  c.height = 8
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2d context required for starfield texture')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(2, 2, 4, 4)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  tex.needsUpdate = true
  return tex
}

export function createSparseSquareStarfield(
  scene: Scene,
  seed: number = 0x5f3759df,
): {
  group: Group
  /** World-axis spin; pass rad/s from the key light orbit (same rate as sun azimuth). */
  step: (dtSeconds: number, omegaRadPerSec: number) => void
} {
  const rng = mulberry32(seed >>> 0)
  const count = 96
  const radius = 320
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const u = rng() * 2 - 1
    const t = rng() * Math.PI * 2
    const s = Math.sqrt(Math.max(0, 1 - u * u))
    const j = i * 3
    positions[j] = radius * s * Math.cos(t)
    positions[j + 1] = radius * u
    positions[j + 2] = radius * s * Math.sin(t)
  }

  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const g = 0.55 + rng() * 0.4
    const j = i * 3
    colors[j] = g
    colors[j + 1] = g
    colors[j + 2] = g + rng() * 0.08
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))

  const map = makeSquareSpriteTexture()
  const material = new PointsMaterial({
    map,
    vertexColors: true,
    size: 2,
    sizeAttenuation: false,
    transparent: true,
    alphaTest: 0.5,
    depthWrite: false,
  })

  const points = new Points(geometry, material)
  const group = new Group()
  group.name = 'starfield'
  group.add(points)
  scene.add(group)

  const spinAxis = new Vector3(0.14, 1, 0.09).normalize()

  return {
    group,
    step(dtSeconds: number, omegaRadPerSec: number) {
      if (dtSeconds <= 0) return
      const w = Number(omegaRadPerSec)
      if (!Number.isFinite(w) || w === 0) return
      group.rotateOnWorldAxis(spinAxis, w * dtSeconds)
    },
  }
}
