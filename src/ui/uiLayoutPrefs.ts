export const TOOLS_BAR_COLLAPSED_STORAGE_KEY = 'roid:toolsBarCollapsed'
export const OVERLAY_LEGEND_COLLAPSED_STORAGE_KEY = 'roid:overlayLegendCollapsed'
export const MATTER_HUD_COLLAPSED_STORAGE_KEY = 'roid:matterHudCollapsed'
export const MATTER_HUD_COMPACT_STORAGE_KEY = 'roid:matterHudCompact'

function readBool(key: string, defaultValue: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return defaultValue
    if (raw === 'true') return true
    if (raw === 'false') return false
    const parsed = JSON.parse(raw) as unknown
    if (parsed === true) return true
    if (parsed === false) return false
  } catch {
    /* ignore */
  }
  return defaultValue
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

export function loadToolsBarCollapsed(): boolean {
  return readBool(TOOLS_BAR_COLLAPSED_STORAGE_KEY, false)
}

export function saveToolsBarCollapsed(collapsed: boolean): void {
  writeBool(TOOLS_BAR_COLLAPSED_STORAGE_KEY, collapsed)
}

export function loadOverlayLegendCollapsed(): boolean {
  return readBool(OVERLAY_LEGEND_COLLAPSED_STORAGE_KEY, false)
}

export function saveOverlayLegendCollapsed(collapsed: boolean): void {
  writeBool(OVERLAY_LEGEND_COLLAPSED_STORAGE_KEY, collapsed)
}

export function loadMatterHudCollapsed(): boolean {
  return readBool(MATTER_HUD_COLLAPSED_STORAGE_KEY, false)
}

export function saveMatterHudCollapsed(collapsed: boolean): void {
  writeBool(MATTER_HUD_COLLAPSED_STORAGE_KEY, collapsed)
}

/** Default true: tighter typography and padding for the top-left resource HUD. */
export function loadMatterHudCompact(): boolean {
  return readBool(MATTER_HUD_COMPACT_STORAGE_KEY, true)
}

export function saveMatterHudCompact(compact: boolean): void {
  writeBool(MATTER_HUD_COMPACT_STORAGE_KEY, compact)
}
