import {
  MATTER_HUD_COLLAPSED_STORAGE_KEY,
  MATTER_HUD_COMPACT_STORAGE_KEY,
  OVERLAY_LEGEND_COLLAPSED_STORAGE_KEY,
  TOOLS_BAR_COLLAPSED_STORAGE_KEY,
} from '../ui/uiLayoutPrefs'
import { AUDIO_MASTER_DEBUG_STORAGE_KEY } from './audioMasterPersist'
import { COLOR_SCHEME_STORAGE_KEY } from './colorSchemePrefs'
import { DEBUG_PROJECT_AUTOSAVE_KEY } from './debugProjectAutosave'
import { DISCOVERY_AUTO_RESOLVE_STORAGE_KEY } from './discoveryUiPrefs'
import { FONT_STORAGE_KEY } from './fontPrefs'
import { BALANCE_AUTO_SAVE_FILE_KEY, LOCAL_STORAGE_KEY } from './gameBalance'
import {
  ASTEROID_MUSIC_LOCAL_STORAGE_KEY,
  MUSIC_AUTO_SAVE_FILE_KEY,
} from './asteroidMusicPersist'
import { MUSIC_VOLUME_STORAGE_KEY } from './musicVolume'
import { SFX_VOLUME_STORAGE_KEY } from './sfxVolume'
import { PICK_THUD_DEBUG_STORAGE_KEY } from './pickThudPersist'
import { OVERLAY_VISUALIZATION_STORAGE_KEY } from './overlayVisualizationPrefs'
import { SCAN_VISUALIZATION_DEBUG_STORAGE_KEY } from './scanVisualizationPersist'
import { GAME_SPEED_MULT_STORAGE_KEY } from './gameSpeedDebug'
import { SUN_LIGHT_ANGLES_STORAGE_KEY, SUN_LIGHT_DEBUG_STORAGE_KEY } from './settingsClientPersist'

/** Debug subsection text filter; persisted per browser. */
export const DEBUG_FILTER_STORAGE_KEY = 'roid:debugFilterQuery'

/** Snapshot of browser-only debug/settings keys for sharing across machines or repos. */
export const DEBUG_PRESET_VERSION = 1 as const

const PRESET_KEYS: readonly string[] = [
  LOCAL_STORAGE_KEY,
  BALANCE_AUTO_SAVE_FILE_KEY,
  ASTEROID_MUSIC_LOCAL_STORAGE_KEY,
  MUSIC_AUTO_SAVE_FILE_KEY,
  DEBUG_PROJECT_AUTOSAVE_KEY,
  SUN_LIGHT_ANGLES_STORAGE_KEY,
  SUN_LIGHT_DEBUG_STORAGE_KEY,
  SCAN_VISUALIZATION_DEBUG_STORAGE_KEY,
  AUDIO_MASTER_DEBUG_STORAGE_KEY,
  OVERLAY_VISUALIZATION_STORAGE_KEY,
  DISCOVERY_AUTO_RESOLVE_STORAGE_KEY,
  MUSIC_VOLUME_STORAGE_KEY,
  SFX_VOLUME_STORAGE_KEY,
  TOOLS_BAR_COLLAPSED_STORAGE_KEY,
  OVERLAY_LEGEND_COLLAPSED_STORAGE_KEY,
  MATTER_HUD_COLLAPSED_STORAGE_KEY,
  MATTER_HUD_COMPACT_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  FONT_STORAGE_KEY,
  PICK_THUD_DEBUG_STORAGE_KEY,
  DEBUG_FILTER_STORAGE_KEY,
  GAME_SPEED_MULT_STORAGE_KEY,
]

const presetKeySet = new Set(PRESET_KEYS)

export interface DebugPresetFileV1 {
  v: typeof DEBUG_PRESET_VERSION
  /** localStorage key → raw string value (only keys that had a value at export). */
  entries: Record<string, string>
}

export function exportDebugPresetJson(): string {
  const entries: Record<string, string> = {}
  for (const key of PRESET_KEYS) {
    try {
      const v = localStorage.getItem(key)
      if (v !== null) entries[key] = v
    } catch {
      /* ignore */
    }
  }
  const payload: DebugPresetFileV1 = { v: DEBUG_PRESET_VERSION, entries }
  return `${JSON.stringify(payload, null, 2)}\n`
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x)
}

/**
 * Writes allowed keys from a preset into localStorage. Caller should reload the page
 * so in-memory game state matches storage.
 */
export function applyDebugPresetFromParsed(parsed: unknown): { ok: true } | { ok: false; error: string } {
  if (!isRecord(parsed)) return { ok: false, error: 'Preset must be a JSON object.' }
  const v = parsed.v
  if (v !== DEBUG_PRESET_VERSION) {
    return { ok: false, error: `Unsupported preset version (expected ${DEBUG_PRESET_VERSION}).` }
  }
  const rawEntries = parsed.entries
  if (!isRecord(rawEntries)) return { ok: false, error: 'Missing or invalid "entries" object.' }
  let n = 0
  for (const [key, val] of Object.entries(rawEntries)) {
    if (!presetKeySet.has(key)) continue
    if (typeof val !== 'string') continue
    try {
      localStorage.setItem(key, val)
      n += 1
    } catch {
      /* quota / private mode */
    }
  }
  if (n === 0) return { ok: false, error: 'No recognized keys to apply.' }
  return { ok: true }
}

export function applyDebugPresetFromJsonString(json: string): { ok: true } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json) as unknown
  } catch {
    return { ok: false, error: 'Invalid JSON.' }
  }
  return applyDebugPresetFromParsed(parsed)
}

/** Wipes origin `localStorage` and reloads. Caller should confirm with the user first. */
export function clearLocalStorageAndReload(): void {
  try {
    localStorage.clear()
  } catch {
    /* quota / private mode */
  }
  location.reload()
}
