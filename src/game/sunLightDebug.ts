/**
 * Random signed °/s for key light + stars on each new asteroid load.
 * Magnitude inclusive 0.00–10.00 (0.01 steps); sign is ± with equal probability (0 stays 0).
 */
export function randomRotationDegPerSecForAsteroid(): number {
  const mag = Math.floor(Math.random() * 1001) / 100
  if (mag === 0) return 0
  return mag * (Math.random() < 0.5 ? -1 : 1)
}

/** Slight per-asteroid intensity multiplier for the key directional light (e.g. 0.90–1.10). */
export function randomKeyLightIntensityFactorForAsteroid(): number {
  return 0.9 + Math.random() * 0.2
}

/** Random key light direction on load / new asteroid; elevation matches Settings slider range. */
export function randomSunAnglesForAsteroid(): { azimuthDeg: number; elevationDeg: number } {
  return {
    azimuthDeg: Math.random() * 360,
    elevationDeg: -85 + Math.random() * 170,
  }
}

/** Uniform random Euler rotation (radians) for the asteroid root group. */
export function randomAsteroidAxisRotationRad(): { x: number; y: number; z: number } {
  const t = Math.PI * 2
  return { x: Math.random() * t, y: Math.random() * t, z: Math.random() * t }
}

export interface SunLightDebug {
  /** When true, azimuth advances each frame; Settings azimuth slider is disabled. */
  rotateSunAzimuth: boolean
  /** Signed degrees per second (horizontal orbit); negative reverses direction vs positive. */
  rotationDegPerSec: number
  /** Show a DirectionalLightHelper for the key light (viewport debug). */
  showSunHelper: boolean
}

export function createDefaultSunLightDebug(): SunLightDebug {
  return {
    rotateSunAzimuth: true,
    rotationDegPerSec: randomRotationDegPerSecForAsteroid(),
    showSunHelper: false,
  }
}
