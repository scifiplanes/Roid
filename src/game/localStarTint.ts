import { Color } from 'three'

import { float01FromSeed } from './asteroidGenProfile'
import type { LocalStarTintDebug } from './localStarTintDebug'
import { excludedHueBandInterval } from './localStarTintDebug'

/** Salt for hue — independent of spectral class / geology. */
export const SALT_LOCAL_STAR_HUE = 0x7c9b3a2d

/** Salt for saturation (orthogonal to hue salt). */
export const SALT_LOCAL_STAR_SATURATION = 0x4f2a9c1e

/** HSL lightness for the notional stellar photosphere color. */
const STAR_HSL_L = 0.52

/**
 * How strongly the star biases the per-channel multiply away from white.
 * `mix(vec3(1), starRgb, strength)` in the shader equivalent.
 */
export const LOCAL_STAR_TINT_MIX_STRENGTH = 0.58

const _color = new Color()

/**
 * Map u ∈ [0,1) uniformly onto hue ∈ [0,1) \\ [g0, g1). When g1 <= g0, returns u (no exclusion).
 */
export function hue01ExcludingHueBand(u: number, g0: number, g1: number): number {
  if (!Number.isFinite(g0) || !Number.isFinite(g1) || g1 <= g0) return u
  const span = g0 + (1 - g1)
  if (span <= 0) return u
  const t = u * span
  if (t < g0) return t
  return g1 + (t - g0)
}

/**
 * Per-channel multiplier in linear-ish sRGB space (Three `Color` convention).
 * Deterministic from asteroid seed and debug sliders.
 */
export function localStarTintMultiplierFromSeed(
  seed: number,
  d: LocalStarTintDebug,
): { r: number; g: number; b: number } {
  const uHue = float01FromSeed(seed, SALT_LOCAL_STAR_HUE)
  const band = excludedHueBandInterval(d)
  const hue01 = band ? hue01ExcludingHueBand(uHue, band.g0, band.g1) : uHue

  const smin = Math.min(d.starTintSaturationMin, d.starTintSaturationMax)
  const smax = Math.max(d.starTintSaturationMin, d.starTintSaturationMax)
  const sat01 =
    smin + float01FromSeed(seed, SALT_LOCAL_STAR_SATURATION) * Math.max(0, smax - smin)
  const sat = Math.min(1, Math.max(0, sat01))

  _color.setHSL(hue01, sat, STAR_HSL_L)
  const s = LOCAL_STAR_TINT_MIX_STRENGTH
  return {
    r: 1 + (_color.r - 1) * s,
    g: 1 + (_color.g - 1) * s,
    b: 1 + (_color.b - 1) * s,
  }
}
