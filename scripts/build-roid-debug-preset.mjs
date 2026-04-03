/**
 * Builds public/roid-debug-preset.json from committed persisted JSON snapshots.
 * Run from repo root: node scripts/build-roid-debug-preset.mjs
 *
 * Merge rules mirror seedSettingsClientLocalStorageFromBundleIfMissing in settingsClientPersist.ts.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function clampSunAngleDeg(n) {
  if (!Number.isFinite(n)) return 0
  return ((n % 360) + 360) % 360
}
function clampElevationDeg(n) {
  if (!Number.isFinite(n)) return 0
  return Math.min(90, Math.max(-90, n))
}

function createDefaultScanVisualizationDebug() {
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
    baseRockBulkHintLerp: 0.58,
    baseRockBulkHintSaturation: 0.9,
    baseRockBulkHintLightness: 0.5,
    baseRockDensityShade: 0.45,
  }
}

function createDefaultAudioMasterDebug() {
  return {
    masterHighPassHz: 40,
    eqLowShelfHz: 200,
    eqHighShelfHz: 4000,
    eqLowDb: 0,
    eqMidDb: 0,
    eqHighDb: 0,
    hooverLowpassBaseHz: 120,
    hooverLowpassLfoDepthHz: 140,
    hooverLowpassLfoRateHz: 1.6,
  }
}

function createStaticSunLightDebugForPersistenceMerge() {
  return {
    rotateSunAzimuth: true,
    rotationDegPerSec: 2,
    showSunHelper: false,
  }
}

function isRecord(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x)
}

function mergeSunLightDebugFromUnknown(p) {
  if (!isRecord(p)) return {}
  const out = {}
  if (typeof p.rotateSunAzimuth === 'boolean') out.rotateSunAzimuth = p.rotateSunAzimuth
  if (typeof p.rotationDegPerSec === 'number' && Number.isFinite(p.rotationDegPerSec)) {
    out.rotationDegPerSec = Math.min(120, Math.max(-120, p.rotationDegPerSec))
  }
  if (typeof p.showSunHelper === 'boolean') out.showSunHelper = p.showSunHelper
  return out
}

function mergeScanFromUnknown(p) {
  if (!isRecord(p)) return {}
  const base = createDefaultScanVisualizationDebug()
  const out = {}
  for (const key of Object.keys(base)) {
    const v = p[key]
    if (key === 'suppressEmissiveWhenScanned') {
      if (typeof v === 'boolean') out[key] = v
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = v
    }
  }
  return out
}

function mergeAudioFromUnknown(p) {
  if (!isRecord(p)) return {}
  const base = createDefaultAudioMasterDebug()
  const out = {}
  for (const key of Object.keys(base)) {
    const v = p[key]
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = v
    }
  }
  return out
}

function createDefaultLocalStarTintDebug() {
  return {
    excludedHueBandCenter: 0.345,
    excludedHueBandWidth: 0.25,
    starTintSaturationMin: 0.78,
    starTintSaturationMax: 0.78,
  }
}

function mergeLocalStarTintFromUnknown(p) {
  if (!isRecord(p)) return {}
  const base = createDefaultLocalStarTintDebug()
  const out = {}
  for (const key of Object.keys(base)) {
    const v = p[key]
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = v
    }
  }
  return out
}

const defaultPickThudDebug = {
  regolith: {
    tailSecBase: 0.042,
    tailSecPopped: 0.07,
    peakBase: 0.12,
    peakPopped: 0.2,
    bandpassHzBase: 2200,
    bandpassHzPopped: 1650,
    bandpassQ: 0.65,
    decayShapeBase: 0.09,
    decayShapePopped: 0.14,
  },
  silicate: {
    tailSecBase: 0.075,
    tailSecPopped: 0.13,
    peakBase: 0.14,
    peakPopped: 0.22,
    oscHzBase: 142,
    oscHzPopped: 98,
    lowpassHzBase: 780,
    lowpassHzPopped: 520,
    lowpassQ: 0.7,
  },
  metal: {
    tailSecBase: 0.11,
    tailSecPopped: 0.22,
    peakBase: 0.16,
    peakPopped: 0.26,
    f0Base: 88,
    f0Popped: 62,
    lowpassHzBase: 620,
    lowpassHzPopped: 420,
    lowpassQ: 1.1,
    harmonicGainBase: 0.22,
    harmonicGainPopped: 0.38,
  },
}

const balance = JSON.parse(
  fs.readFileSync(path.join(root, 'src/game/gameBalance.persisted.json'), 'utf8'),
)
const music = JSON.parse(
  fs.readFileSync(path.join(root, 'src/game/asteroidMusicDebug.persisted.json'), 'utf8'),
)
const client = JSON.parse(
  fs.readFileSync(path.join(root, 'src/game/settingsClient.persisted.json'), 'utf8'),
)

const sunDbg = mergeSunLightDebugFromUnknown(client.sunLightDebug)
const mergedSun =
  Object.keys(sunDbg).length > 0
    ? { ...createStaticSunLightDebugForPersistenceMerge(), ...sunDbg }
    : null

const scanM = mergeScanFromUnknown(client.scanVisualizationDebug)
const mergedScan =
  Object.keys(scanM).length > 0
    ? { ...createDefaultScanVisualizationDebug(), ...scanM }
    : null

const starTintM = mergeLocalStarTintFromUnknown(client.localStarTintDebug)
const mergedStarTint =
  Object.keys(starTintM).length > 0
    ? { ...createDefaultLocalStarTintDebug(), ...starTintM }
    : null

const audioM = mergeAudioFromUnknown(client.audioMasterDebug)
const mergedAudio =
  Object.keys(audioM).length > 0
    ? { ...createDefaultAudioMasterDebug(), ...audioM }
    : null

const entries = {
  'roid:gameBalance': JSON.stringify(balance),
  'roid:balanceAutoSaveToFile': '1',
  'roid:asteroidMusicDebug': JSON.stringify(music),
  'roid:musicAutoSaveToFile': '1',
  'roid:debugProjectAutosave': '1',
}

if (typeof client.sunAzimuthDeg === 'number' && typeof client.sunElevationDeg === 'number') {
  entries['roid:sunLightAngles'] = JSON.stringify({
    azimuthDeg: clampSunAngleDeg(client.sunAzimuthDeg),
    elevationDeg: clampElevationDeg(client.sunElevationDeg),
  })
}
if (mergedSun) {
  entries['roid:sunLightDebug'] = JSON.stringify(mergedSun)
}
if (mergedScan) {
  entries['roid:scanVisualizationDebug'] = JSON.stringify(mergedScan)
}
if (mergedStarTint) {
  entries['roid:localStarTintDebug'] = JSON.stringify(mergedStarTint)
}
if (mergedAudio) {
  entries['roid:audioMasterDebug'] = JSON.stringify(mergedAudio)
}

const ov = client.overlayVisualization
if (ov && typeof ov === 'object') {
  entries['roid:overlayVisualization'] = JSON.stringify({
    surfaceScanOverlayVisible:
      typeof ov.surfaceScanOverlayVisible === 'boolean' ? ov.surfaceScanOverlayVisible : true,
    depthOverlayVisible: typeof ov.depthOverlayVisible === 'boolean' ? ov.depthOverlayVisible : false,
  })
}

if (typeof client.discoveryAutoResolve === 'boolean') {
  entries['roid:discoveryAutoResolve'] = JSON.stringify(client.discoveryAutoResolve)
}
if (typeof client.musicVolumeLinear === 'number' && Number.isFinite(client.musicVolumeLinear)) {
  entries['roid:musicVolume'] = String(Math.min(1, Math.max(0, client.musicVolumeLinear)))
}
if (typeof client.sfxVolumeLinear === 'number' && Number.isFinite(client.sfxVolumeLinear)) {
  entries['roid:sfxVolume'] = String(Math.min(1, Math.max(0, client.sfxVolumeLinear)))
}
if (typeof client.toolsBarCollapsed === 'boolean') {
  entries['roid:toolsBarCollapsed'] = JSON.stringify(client.toolsBarCollapsed)
}
if (typeof client.overlayLegendCollapsed === 'boolean') {
  entries['roid:overlayLegendCollapsed'] = JSON.stringify(client.overlayLegendCollapsed)
}
if (typeof client.matterHudCollapsed === 'boolean') {
  entries['roid:matterHudCollapsed'] = JSON.stringify(client.matterHudCollapsed)
}
if (typeof client.matterHudCompact === 'boolean') {
  entries['roid:matterHudCompact'] = JSON.stringify(client.matterHudCompact)
}
if (client.colorScheme === 'blue' || client.colorScheme === 'gray' || client.colorScheme === 'orange') {
  entries['roid:colorScheme'] = client.colorScheme
}
if (client.fontId === 'disketMono' || client.fontId === 'perfectDosVga') {
  entries['roid:font'] = client.fontId
}

entries['roid:pickThudDebug'] = JSON.stringify(defaultPickThudDebug)

const out = { v: 1, entries }
const outPath = path.join(root, 'public/roid-debug-preset.json')
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8')
console.log(`Wrote ${outPath}`)
