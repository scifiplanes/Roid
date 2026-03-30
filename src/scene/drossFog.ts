import { Color, FogExp2, Scene } from 'three'

const MASS_EPS = 1e-6
/** Clear color when dross fog is off (`setupScene`). */
const VOID_BACKGROUND_HEX = 0x000000

let fog: FogExp2 | null = null
const _fogRgb = new Color()
const _bgBlend = new Color()

function setSceneBackgroundColor(scene: Scene, c: Color): void {
  const bg = scene.background
  if (bg instanceof Color) {
    bg.copy(c)
  } else {
    scene.background = c.clone()
  }
}

function setSceneBackgroundVoid(scene: Scene): void {
  const bg = scene.background
  if (bg instanceof Color) {
    bg.setHex(VOID_BACKGROUND_HEX)
  } else {
    scene.background = new Color(VOID_BACKGROUND_HEX)
  }
}

export interface DrossFogBalance {
  drossFogDensityPerMass: number
  drossFogDensityMax: number
  drossFogColorR: number
  drossFogColorG: number
  drossFogColorB: number
}

export function updateDrossFog(scene: Scene, totalMass: number, balance: DrossFogBalance): void {
  const perMass = balance.drossFogDensityPerMass
  const cap = balance.drossFogDensityMax
  if (
    !Number.isFinite(totalMass) ||
    totalMass <= MASS_EPS ||
    !Number.isFinite(perMass) ||
    !Number.isFinite(cap) ||
    perMass <= 0 ||
    cap <= 0
  ) {
    scene.fog = null
    setSceneBackgroundVoid(scene)
    return
  }
  const density = Math.min(cap, totalMass * perMass)
  if (density <= 1e-9) {
    scene.fog = null
    setSceneBackgroundVoid(scene)
    return
  }
  _fogRgb.setRGB(balance.drossFogColorR, balance.drossFogColorG, balance.drossFogColorB)
  if (fog === null) {
    fog = new FogExp2(_fogRgb, density)
    scene.fog = fog
  } else {
    fog.color.copy(_fogRgb)
    fog.density = density
    scene.fog = fog
  }
  /**
   * Clear color isn’t fogged in the shader. Lerp void → fog tint by the same relative strength as
   * density vs cap so the backdrop ramps with dross instead of snapping to full fog immediately.
   */
  const bgMix = Math.min(1, density / cap)
  _bgBlend.setHex(VOID_BACKGROUND_HEX).lerp(_fogRgb, bgMix)
  setSceneBackgroundColor(scene, _bgBlend)
}
