import type { ScanVisualizationDebug } from './scanVisualizationDebug'

export const SCAN_VISUALIZATION_DEBUG_STORAGE_KEY = 'roid:scanVisualizationDebug'

const DEBOUNCE_MS = 400

let persistTimer: ReturnType<typeof setTimeout> | null = null

const NUM_KEYS: (keyof ScanVisualizationDebug)[] = [
  'compositionLerp',
  'anchorSaturation',
  'anchorLightness',
  'boostSaturationMul',
  'boostSaturationAdd',
  'boostLightnessMin',
  'boostLightnessMax',
  'boostLightnessScale',
  'boostLightnessAdd',
  'applyTintRgbMul',
  'baseRockBulkHintLerp',
  'baseRockBulkHintSaturation',
  'baseRockBulkHintLightness',
  'baseRockDensityShade',
]

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/** Safe subset from localStorage to merge into defaults. */
export function loadPersistedScanVisualizationDebug(): Partial<ScanVisualizationDebug> {
  try {
    const raw = localStorage.getItem(SCAN_VISUALIZATION_DEBUG_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed === null || typeof parsed !== 'object') return {}
    const o = parsed as Record<string, unknown>
    const out: Partial<ScanVisualizationDebug> = {}
    for (const key of NUM_KEYS) {
      const v = o[key]
      if (isFiniteNumber(v)) {
        Object.assign(out, { [key]: v } as Partial<ScanVisualizationDebug>)
      }
    }
    if (typeof o.suppressEmissiveWhenScanned === 'boolean') {
      out.suppressEmissiveWhenScanned = o.suppressEmissiveWhenScanned
    }
    return out
  } catch {
    return {}
  }
}

export function schedulePersistScanVisualizationDebug(debug: ScanVisualizationDebug): void {
  if (persistTimer !== null) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      localStorage.setItem(SCAN_VISUALIZATION_DEBUG_STORAGE_KEY, JSON.stringify(debug))
    } catch {
      /* ignore */
    }
  }, DEBOUNCE_MS)
}
