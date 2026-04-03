/**
 * Debug tunables for post-process local star tint (Settings → Debug → Rendering).
 */
export interface LocalStarTintDebug {
  /** Center of the excluded hue band on the HSL wheel [0, 1). */
  excludedHueBandCenter: number
  /** Width of the excluded band [0, 1]. 0 = no hue exclusion. */
  excludedHueBandWidth: number
  /** Min HSL saturation for the stellar tint (per asteroid, seed-randomized between min/max). */
  starTintSaturationMin: number
  /** Max HSL saturation (≥ min). */
  starTintSaturationMax: number
}

export function createDefaultLocalStarTintDebug(): LocalStarTintDebug {
  return {
    excludedHueBandCenter: 0.345,
    excludedHueBandWidth: 0.25,
    starTintSaturationMin: 0.78,
    starTintSaturationMax: 0.78,
  }
}

/**
 * Maps center + width to a contiguous [g0, g1] subset of [0, 1], or null when exclusion is off / degenerate.
 */
export function excludedHueBandInterval(d: LocalStarTintDebug): { g0: number; g1: number } | null {
  const w = Math.max(0, Math.min(1, d.excludedHueBandWidth))
  if (w <= 1e-9) return null
  const c = ((d.excludedHueBandCenter % 1) + 1) % 1
  const half = w / 2
  let g0 = c - half
  let g1 = c + half
  g0 = Math.max(0, Math.min(1, g0))
  g1 = Math.max(0, Math.min(1, g1))
  if (g1 - g0 < 1e-6) return null
  return { g0, g1 }
}
