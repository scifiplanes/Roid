/** Legacy keys (still written for debug preset import / older builds). */
const LEGACY_BALANCE_AUTOSAVE = 'roid:balanceAutoSaveToFile'
const LEGACY_MUSIC_AUTOSAVE = 'roid:musicAutoSaveToFile'

export const DEBUG_PROJECT_AUTOSAVE_KEY = 'roid:debugProjectAutosave'

/**
 * When true (default), dev debounced POSTs write balance, music debug, and client settings JSON.
 * `setDebugProjectAutosave` keeps legacy balance/music keys in sync for preset import.
 */
export function getDebugProjectAutosave(): boolean {
  try {
    const v = localStorage.getItem(DEBUG_PROJECT_AUTOSAVE_KEY)
    if (v !== null) return v === '1' || v === 'true'
    const b = localStorage.getItem(LEGACY_BALANCE_AUTOSAVE)
    const m = localStorage.getItem(LEGACY_MUSIC_AUTOSAVE)
    if (b === null && m === null) return true
    return (b !== '0' && b !== 'false') && (m !== '0' && m !== 'false')
  } catch {
    return true
  }
}

export function setDebugProjectAutosave(on: boolean): void {
  try {
    const s = on ? '1' : '0'
    localStorage.setItem(DEBUG_PROJECT_AUTOSAVE_KEY, s)
    localStorage.setItem(LEGACY_BALANCE_AUTOSAVE, s)
    localStorage.setItem(LEGACY_MUSIC_AUTOSAVE, s)
  } catch {
    /* ignore */
  }
}
