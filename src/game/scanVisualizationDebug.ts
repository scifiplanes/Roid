/**
 * Debug tunables for surface-scan composition tint (Settings → Debug → Scan visualization).
 * Defaults favor a bright, saturated RGB read on rock and structures.
 */
export interface ScanVisualizationDebug {
  /** Blend toward scan tint after base instance color (1 = full replacement of diffuse path). */
  compositionLerp: number
  /** HSL saturation for per-refined-material anchor colors (0–1). */
  anchorSaturation: number
  /** HSL lightness for anchor colors (0–1). */
  anchorLightness: number
  /** Extra saturation boost after weighted anchor blend (`boostScanDisplayColor`). */
  boostSaturationMul: number
  boostSaturationAdd: number
  /** Clamp lightness after boost (min / max). */
  boostLightnessMin: number
  boostLightnessMax: number
  /** Lightness scaling/offset inside boost (matches prior `l * 0.96 + 0.03` style). */
  boostLightnessScale: number
  boostLightnessAdd: number
  /** Extra RGB gain when applying persisted scan tint in the mesh (`applyScannerTint`). */
  applyTintRgbMul: number
  /** When true, scanned instances on emissive structure meshes multiply emissive by 0 in the shader. */
  suppressEmissiveWhenScanned: boolean
  /**
   * Blend toward a low-saturation 12-root bulk hint on default rock (before scan/depth overlays).
   * 0 = lithology-only tint; higher = more visible material mix.
   */
  baseRockBulkHintLerp: number
  /** HSL saturation for the evenly spaced per-root hue ring used in the bulk hint. */
  baseRockBulkHintSaturation: number
  /** HSL lightness for the bulk hint color. */
  baseRockBulkHintLightness: number
  /** How much composite density (g/cm³ midpoint) darkens the bulk hint (0 = off). */
  baseRockDensityShade: number
}

export function createDefaultScanVisualizationDebug(): ScanVisualizationDebug {
  return {
    compositionLerp: 0.92,
    anchorSaturation: 1,
    anchorLightness: 0.56,
    boostSaturationMul: 1.42,
    boostSaturationAdd: 0.1,
    boostLightnessMin: 0.4,
    boostLightnessMax: 0.72,
    boostLightnessScale: 0.98,
    boostLightnessAdd: 0.04,
    applyTintRgbMul: 1.35,
    suppressEmissiveWhenScanned: true,
    baseRockBulkHintLerp: 0.14,
    baseRockBulkHintSaturation: 0.38,
    baseRockBulkHintLightness: 0.5,
    baseRockDensityShade: 0.45,
  }
}
