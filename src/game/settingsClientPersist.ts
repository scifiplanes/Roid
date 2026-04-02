import type { AudioMasterDebug } from './audioMasterDebug'
import { createDefaultAudioMasterDebug } from './audioMasterDebug'
import { AUDIO_MASTER_DEBUG_STORAGE_KEY } from './audioMasterPersist'
import { DISCOVERY_AUTO_RESOLVE_STORAGE_KEY } from './discoveryUiPrefs'
import { MUSIC_VOLUME_STORAGE_KEY } from './musicVolume'
import { OVERLAY_VISUALIZATION_STORAGE_KEY } from './overlayVisualizationPrefs'
import { SCAN_VISUALIZATION_DEBUG_STORAGE_KEY } from './scanVisualizationPersist'
import type { ScanVisualizationDebug } from './scanVisualizationDebug'
import { createDefaultScanVisualizationDebug } from './scanVisualizationDebug'
import type { AsteroidMusicDebug } from './asteroidMusicDebug'
import type { SunLightDebug } from './sunLightDebug'
import { createStaticSunLightDebugForPersistenceMerge } from './sunLightDebug'
import { persistGameBalanceToProjectNow } from './gameBalance'
import { persistAsteroidMusicDebugToProjectNow } from './asteroidMusicPersist'
import { getDebugProjectAutosave } from './debugProjectAutosave'
import {
  loadOverlayLegendCollapsed,
  loadToolsBarCollapsed,
  OVERLAY_LEGEND_COLLAPSED_STORAGE_KEY,
  TOOLS_BAR_COLLAPSED_STORAGE_KEY,
  MATTER_HUD_COLLAPSED_STORAGE_KEY,
  MATTER_HUD_COMPACT_STORAGE_KEY,
} from '../ui/uiLayoutPrefs'
import type { ColorSchemeId } from '../ui/colorScheme'
import { COLOR_SCHEME_STORAGE_KEY, isColorSchemeId } from './colorSchemePrefs'
import type { FontId } from '../ui/fontTheme'
import { FONT_STORAGE_KEY, isFontId } from './fontPrefs'

export const SUN_LIGHT_ANGLES_STORAGE_KEY = 'roid:sunLightAngles'
export const SUN_LIGHT_DEBUG_STORAGE_KEY = 'roid:sunLightDebug'

export const SETTINGS_CLIENT_PERSIST_VERSION = 1 as const

const PERSIST_PATH = '/api/persist-settings-client'
const DEBOUNCE_MS = 450

let persistTimer: ReturnType<typeof setTimeout> | null = null

export interface SettingsClientPersistedV1 {
  v: typeof SETTINGS_CLIENT_PERSIST_VERSION
  sunAzimuthDeg?: number
  sunElevationDeg?: number
  sunLightDebug?: Partial<SunLightDebug>
  scanVisualizationDebug?: Partial<ScanVisualizationDebug>
  audioMasterDebug?: Partial<AudioMasterDebug>
  overlayVisualization?: {
    surfaceScanOverlayVisible?: boolean
    depthOverlayVisible?: boolean
  }
  discoveryAutoResolve?: boolean
  musicVolumeLinear?: number
  toolsBarCollapsed?: boolean
  overlayLegendCollapsed?: boolean
  matterHudCollapsed?: boolean
  matterHudCompact?: boolean
  colorScheme?: ColorSchemeId
  fontId?: FontId
}

export interface SettingsClientRuntimeSnapshot {
  sunAzimuthDeg: number
  sunElevationDeg: number
  sunLightDebug: SunLightDebug
  scanVisualizationDebug: ScanVisualizationDebug
  audioMasterDebug: AudioMasterDebug
  surfaceScanOverlayVisible: boolean
  depthOverlayVisible: boolean
  discoveryAutoResolve: boolean
  musicVolumeLinear: number
  matterHudCollapsed: boolean
  matterHudCompact: boolean
  colorScheme: ColorSchemeId
  fontId: FontId
}

let snapshotGetter: (() => SettingsClientRuntimeSnapshot) | null = null

export function registerSettingsClientSnapshot(getter: () => SettingsClientRuntimeSnapshot): void {
  snapshotGetter = getter
}

export function buildSettingsClientPayload(s: SettingsClientRuntimeSnapshot): SettingsClientPersistedV1 {
  return {
    v: SETTINGS_CLIENT_PERSIST_VERSION,
    sunAzimuthDeg: s.sunAzimuthDeg,
    sunElevationDeg: s.sunElevationDeg,
    sunLightDebug: { ...s.sunLightDebug },
    scanVisualizationDebug: { ...s.scanVisualizationDebug },
    audioMasterDebug: { ...s.audioMasterDebug },
    overlayVisualization: {
      surfaceScanOverlayVisible: s.surfaceScanOverlayVisible,
      depthOverlayVisible: s.depthOverlayVisible,
    },
    discoveryAutoResolve: s.discoveryAutoResolve,
    musicVolumeLinear: s.musicVolumeLinear,
    toolsBarCollapsed: loadToolsBarCollapsed(),
    overlayLegendCollapsed: loadOverlayLegendCollapsed(),
    matterHudCollapsed: s.matterHudCollapsed,
    matterHudCompact: s.matterHudCompact,
    colorScheme: s.colorScheme,
    fontId: s.fontId,
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x)
}

function clampSunAngleDeg(n: number): number {
  if (!Number.isFinite(n)) return 0
  return ((n % 360) + 360) % 360
}

function clampElevationDeg(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(90, Math.max(-90, n))
}

export function writeSunAnglesToLocalStorage(azimuthDeg: number, elevationDeg: number): void {
  try {
    const payload = {
      azimuthDeg: clampSunAngleDeg(azimuthDeg),
      elevationDeg: clampElevationDeg(elevationDeg),
    }
    localStorage.setItem(SUN_LIGHT_ANGLES_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function loadSunAnglesFromLocalStorage(): { azimuthDeg: number; elevationDeg: number } | null {
  try {
    const raw = localStorage.getItem(SUN_LIGHT_ANGLES_STORAGE_KEY)
    if (!raw) return null
    const p: unknown = JSON.parse(raw)
    if (!isRecord(p)) return null
    const az = p.azimuthDeg
    const el = p.elevationDeg
    if (typeof az !== 'number' || typeof el !== 'number') return null
    if (!Number.isFinite(az) || !Number.isFinite(el)) return null
    return { azimuthDeg: clampSunAngleDeg(az), elevationDeg: clampElevationDeg(el) }
  } catch {
    return null
  }
}

export function writeSunLightDebugToLocalStorage(debug: SunLightDebug): void {
  try {
    localStorage.setItem(SUN_LIGHT_DEBUG_STORAGE_KEY, JSON.stringify(debug))
  } catch {
    /* ignore */
  }
}

function mergeSunLightDebugFromUnknown(p: unknown): Partial<SunLightDebug> {
  if (!isRecord(p)) return {}
  const out: Partial<SunLightDebug> = {}
  if (typeof p.rotateSunAzimuth === 'boolean') out.rotateSunAzimuth = p.rotateSunAzimuth
  if (typeof p.rotationDegPerSec === 'number' && Number.isFinite(p.rotationDegPerSec)) {
    out.rotationDegPerSec = Math.min(120, Math.max(-120, p.rotationDegPerSec))
  }
  if (typeof p.showSunHelper === 'boolean') out.showSunHelper = p.showSunHelper
  return out
}

export function loadSunLightDebugPartialFromLocalStorage(): Partial<SunLightDebug> {
  try {
    const raw = localStorage.getItem(SUN_LIGHT_DEBUG_STORAGE_KEY)
    if (!raw) return {}
    return mergeSunLightDebugFromUnknown(JSON.parse(raw) as unknown)
  } catch {
    return {}
  }
}

function mergeScanFromUnknown(p: unknown): Partial<ScanVisualizationDebug> {
  if (!isRecord(p)) return {}
  const base = createDefaultScanVisualizationDebug()
  const out: Partial<ScanVisualizationDebug> = {}
  for (const key of Object.keys(base) as (keyof ScanVisualizationDebug)[]) {
    const v = p[key as string]
    if (key === 'suppressEmissiveWhenScanned') {
      if (typeof v === 'boolean') out[key] = v
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      ;(out as Record<string, number>)[key] = v
    }
  }
  return out
}

function mergeAudioFromUnknown(p: unknown): Partial<AudioMasterDebug> {
  if (!isRecord(p)) return {}
  const base = createDefaultAudioMasterDebug()
  const out: Partial<AudioMasterDebug> = {}
  for (const key of Object.keys(base) as (keyof AudioMasterDebug)[]) {
    const v = p[key as string]
    if (typeof v === 'number' && Number.isFinite(v)) {
      ;(out as Record<string, number>)[key] = v
    }
  }
  return out
}

function seedStringIfAbsent(key: string, value: string): void {
  try {
    if (localStorage.getItem(key) !== null) return
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

/**
 * First-run / fresh browser: copy bundled repo defaults into `localStorage` when a key is absent.
 * Order elsewhere remains defaults ← bundled JSON ← localStorage (local wins once set).
 */
export function seedSettingsClientLocalStorageFromBundleIfMissing(imported: unknown): void {
  if (!isRecord(imported) || imported.v !== SETTINGS_CLIENT_PERSIST_VERSION) return

  const az = imported.sunAzimuthDeg
  const el = imported.sunElevationDeg
  if (typeof az === 'number' && typeof el === 'number' && Number.isFinite(az) && Number.isFinite(el)) {
    seedStringIfAbsent(
      SUN_LIGHT_ANGLES_STORAGE_KEY,
      JSON.stringify({
        azimuthDeg: clampSunAngleDeg(az),
        elevationDeg: clampElevationDeg(el),
      }),
    )
  }

  const sunDbg = mergeSunLightDebugFromUnknown(imported.sunLightDebug)
  if (Object.keys(sunDbg).length > 0) {
    const merged = { ...createStaticSunLightDebugForPersistenceMerge(), ...sunDbg }
    seedStringIfAbsent(SUN_LIGHT_DEBUG_STORAGE_KEY, JSON.stringify(merged))
  }

  const scanM = mergeScanFromUnknown(imported.scanVisualizationDebug)
  if (Object.keys(scanM).length > 0) {
    const merged = { ...createDefaultScanVisualizationDebug(), ...scanM }
    seedStringIfAbsent(SCAN_VISUALIZATION_DEBUG_STORAGE_KEY, JSON.stringify(merged))
  }

  const audioM = mergeAudioFromUnknown(imported.audioMasterDebug)
  if (Object.keys(audioM).length > 0) {
    const merged = { ...createDefaultAudioMasterDebug(), ...audioM }
    seedStringIfAbsent(AUDIO_MASTER_DEBUG_STORAGE_KEY, JSON.stringify(merged))
  }

  const ov = imported.overlayVisualization
  if (isRecord(ov)) {
    const surface = ov.surfaceScanOverlayVisible
    const depth = ov.depthOverlayVisible
    if (typeof surface === 'boolean' || typeof depth === 'boolean') {
      seedStringIfAbsent(
        OVERLAY_VISUALIZATION_STORAGE_KEY,
        JSON.stringify({
          surfaceScanOverlayVisible:
            typeof surface === 'boolean' ? surface : true,
          depthOverlayVisible: typeof depth === 'boolean' ? depth : false,
        }),
      )
    }
  }

  const disc = imported.discoveryAutoResolve
  if (typeof disc === 'boolean') {
    seedStringIfAbsent(DISCOVERY_AUTO_RESOLVE_STORAGE_KEY, JSON.stringify(disc))
  }

  const vol = imported.musicVolumeLinear
  if (typeof vol === 'number' && Number.isFinite(vol)) {
    seedStringIfAbsent(MUSIC_VOLUME_STORAGE_KEY, String(Math.min(1, Math.max(0, vol))))
  }

  const tbc = imported.toolsBarCollapsed
  if (typeof tbc === 'boolean') {
    seedStringIfAbsent(TOOLS_BAR_COLLAPSED_STORAGE_KEY, JSON.stringify(tbc))
  }

  const olc = imported.overlayLegendCollapsed
  if (typeof olc === 'boolean') {
    seedStringIfAbsent(OVERLAY_LEGEND_COLLAPSED_STORAGE_KEY, JSON.stringify(olc))
  }

  const mhc = imported.matterHudCollapsed
  if (typeof mhc === 'boolean') {
    seedStringIfAbsent(MATTER_HUD_COLLAPSED_STORAGE_KEY, JSON.stringify(mhc))
  }

  const mhcomp = imported.matterHudCompact
  if (typeof mhcomp === 'boolean') {
    seedStringIfAbsent(MATTER_HUD_COMPACT_STORAGE_KEY, JSON.stringify(mhcomp))
  }

  const cs = imported.colorScheme
  if (isColorSchemeId(cs)) {
    seedStringIfAbsent(COLOR_SCHEME_STORAGE_KEY, cs)
  }

  const font = imported.fontId
  if (isFontId(font)) {
    seedStringIfAbsent(FONT_STORAGE_KEY, font)
  }
}

export function cancelScheduledSettingsClientPersist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
}

export function schedulePersistSettingsClient(): void {
  cancelScheduledSettingsClientPersist()
  if (!getDebugProjectAutosave()) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    if (!import.meta.env.DEV || !snapshotGetter) return
    const body = JSON.stringify(buildSettingsClientPayload(snapshotGetter()))
    void fetch(PERSIST_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {})
  }, DEBOUNCE_MS)
}

export async function persistSettingsClientToProjectNow(): Promise<boolean> {
  if (!import.meta.env.DEV || !snapshotGetter) return false
  try {
    const res = await fetch(PERSIST_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSettingsClientPayload(snapshotGetter())),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function persistAllDebugSettingsToProjectNow(
  asteroidMusicDebug: AsteroidMusicDebug,
): Promise<{ balance: boolean; music: boolean; client: boolean }> {
  const [balance, music, client] = await Promise.all([
    persistGameBalanceToProjectNow(),
    persistAsteroidMusicDebugToProjectNow(asteroidMusicDebug),
    persistSettingsClientToProjectNow(),
  ])
  return { balance, music, client }
}
