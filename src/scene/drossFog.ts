import { Color, FogExp2, Scene } from 'three'

const MASS_EPS = 1e-6
/** Clear color when dross fog is off (`setupScene`). */
const VOID_BACKGROUND_HEX = 0x000000

let fog: FogExp2 | null = null
const _fogRgb = new Color()
const _fogTintDisplay = new Color()
const _black = new Color(0x000000)
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
  drossFogDensityMult: number
  drossFogDensityMax: number
  drossFogColorR: number
  drossFogColorG: number
  drossFogColorB: number
  drossFogTintLerp01: number
}

export function updateDrossFog(
  scene: Scene,
  totalMass: number,
  balance: DrossFogBalance,
  zoomBlacken01 = 0,
  drossTint: Color | null = null,
): void {
  const perMassBase = balance.drossFogDensityPerMass
  const mult = Number.isFinite(balance.drossFogDensityMult) ? balance.drossFogDensityMult : 1
  const perMass = perMassBase * mult
  const cap = balance.drossFogDensityMax
  if (
    !Number.isFinite(totalMass) ||
    totalMass <= MASS_EPS ||
    !Number.isFinite(perMassBase) ||
    !Number.isFinite(mult) ||
    !Number.isFinite(perMass) ||
    !Number.isFinite(cap) ||
    perMassBase <= 0 ||
    mult <= 0 ||
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
  const zb = Number.isFinite(zoomBlacken01) ? Math.min(1, Math.max(0, zoomBlacken01)) : 0
  _fogRgb.setRGB(balance.drossFogColorR, balance.drossFogColorG, balance.drossFogColorB)
  if (drossTint) {
    const kRaw = balance.drossFogTintLerp01
    const k = Number.isFinite(kRaw) ? Math.min(1, Math.max(0, kRaw)) : 1
    _fogRgb.lerp(drossTint, k)
  }
  _fogTintDisplay.copy(_fogRgb).lerp(_black, zb)
  if (fog === null) {
    fog = new FogExp2(_fogTintDisplay, density)
    scene.fog = fog
  } else {
    fog.color.copy(_fogTintDisplay)
    fog.density = density
    scene.fog = fog
  }
  /**
   * Clear color isn’t fogged in the shader. Lerp void → fog tint by the same relative strength as
   * density vs cap so the backdrop ramps with dross instead of snapping to full fog immediately.
   */
  const bgMix = Math.min(1, density / cap)
  _bgBlend.setHex(VOID_BACKGROUND_HEX).lerp(_fogTintDisplay, bgMix)
  setSceneBackgroundColor(scene, _bgBlend)
}
