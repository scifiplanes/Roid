import type { DirectionalLight } from 'three'

const DEG = Math.PI / 180

/**
 * Y-up: azimuth 0° at +Z, increases toward +X; elevation 0° on xz plane, positive above, negative below.
 */
export function setSunFromAngles(
  sun: DirectionalLight,
  azimuthDeg: number,
  elevationDeg: number,
  radius: number,
): void {
  const el = elevationDeg * DEG
  const az = azimuthDeg * DEG
  const c = Math.cos(el)
  const x = radius * c * Math.sin(az)
  const z = radius * c * Math.cos(az)
  const y = radius * Math.sin(el)
  sun.position.set(x, y, z)
  sun.updateMatrixWorld(true)
  sun.target.updateMatrixWorld(true)
}

export function sunAnglesFromPosition(x: number, y: number, z: number): {
  azimuthDeg: number
  elevationDeg: number
} {
  const horiz = Math.hypot(x, z)
  const elevationDeg = (Math.atan2(y, horiz) * 180) / Math.PI

  let azimuthDeg = (Math.atan2(x, z) * 180) / Math.PI
  if (azimuthDeg < 0) azimuthDeg += 360

  return { azimuthDeg, elevationDeg }
}
