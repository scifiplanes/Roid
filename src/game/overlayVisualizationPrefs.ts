/** Eye menu: Surface scan + Depth overlay visibility (survives reload). */
export const OVERLAY_VISUALIZATION_STORAGE_KEY = 'roid:overlayVisualization'

export interface OverlayVisualizationPrefs {
  surfaceScanOverlayVisible: boolean
  depthOverlayVisible: boolean
}

const DEFAULTS: OverlayVisualizationPrefs = {
  surfaceScanOverlayVisible: true,
  depthOverlayVisible: false,
}

export function loadOverlayVisualizationPrefs(): OverlayVisualizationPrefs {
  try {
    const raw = localStorage.getItem(OVERLAY_VISUALIZATION_STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as unknown
    if (parsed === null || typeof parsed !== 'object') return { ...DEFAULTS }
    const o = parsed as Record<string, unknown>
    return {
      surfaceScanOverlayVisible:
        typeof o.surfaceScanOverlayVisible === 'boolean'
          ? o.surfaceScanOverlayVisible
          : DEFAULTS.surfaceScanOverlayVisible,
      depthOverlayVisible:
        typeof o.depthOverlayVisible === 'boolean' ? o.depthOverlayVisible : DEFAULTS.depthOverlayVisible,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveOverlayVisualizationPrefs(prefs: OverlayVisualizationPrefs): void {
  try {
    localStorage.setItem(OVERLAY_VISUALIZATION_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore quota / private mode */
  }
}
