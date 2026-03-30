import {
  type GameBalance,
  cancelScheduledPersist,
  gameBalance,
  patchGameBalance,
  persistGameBalanceToProjectNow,
  resetGameBalance,
} from '../game/gameBalance'
import {
  type AsteroidMusicDebug,
  type MacroJitterMode,
  ASTEROID_MUSIC_VOICE_COUNT,
  PHRASE_AVG_LENGTH_MAX,
  PHRASE_AVG_LENGTH_MIN,
  PHRASE_DEPTH_MAX,
  PHRASE_RATE_HZ_MAX,
  PHRASE_RATE_HZ_MIN,
  VOICE_PITCH_SPREAD_MAX,
  VOICE_PITCH_SPREAD_MIN,
  applyVoiceMacrosToVoices,
} from '../game/asteroidMusicDebug'
import type { SunLightDebug } from '../game/sunLightDebug'
import type { ScanVisualizationDebug } from '../game/scanVisualizationDebug'
import type { AudioMasterDebug } from '../game/audioMasterDebug'
import { cancelScheduledMusicPersist, persistAsteroidMusicDebugToProjectNow } from '../game/asteroidMusicPersist'
import {
  getDebugProjectAutosave,
  setDebugProjectAutosave,
} from '../game/debugProjectAutosave'
import {
  cancelScheduledSettingsClientPersist,
  persistAllDebugSettingsToProjectNow,
} from '../game/settingsClientPersist'
import {
  type ScaleClampMode,
  type ScaleCycleDirection,
  parseScaleClampMode,
  parseScaleCycleDirection,
} from '../game/asteroidMusicScale'
import {
  applyDebugPresetFromJsonString,
  exportDebugPresetJson,
} from '../game/debugPreset'

export interface SettingsMenuOptions {
  /** Optional control(s) to the left of the Settings (F10) button (e.g. overlays menu). */
  leadingActions?: HTMLElement
  /** Opens the game tips modal (Settings panel). */
  onOpenTips?: () => void
  onRegenerate: () => void
  onLightAngleChange: (azimuthDeg: number, elevationDeg: number) => void
  initialAzimuthDeg: number
  initialElevationDeg: number
  onBalanceChange?: () => void
  /** When set, shows cheat buttons at the top of the Debug section (any combination). */
  onDebugAddResources?: () => void
  onDebugAddEnergy?: () => void
  onDebugIncreaseEnergyCap?: () => void
  /** Unlock all tools: research tiers, satellites, structure gates, explosive (debug). */
  onDebugUnlockAllTools?: () => void
  /** Highlight every voxel with rare-lode strength on the rock (heatmap). */
  onDebugShowAllLodes?: () => void
  /** Clear debug “show all lodes” rock highlighting. */
  onDebugClearLodeDisplay?: () => void
  /** Mutable debug state; sliders write into this object. */
  asteroidMusicDebug: AsteroidMusicDebug
  /** Current asteroid key root (MIDI); used when applying voice macros (diatonic note fold). */
  getMusicRootMidi: () => number
  onAsteroidMusicDebugChange?: () => void
  initialMusicVolumeLinear: number
  onMusicVolumeChange: (linear: number) => void
  /** When true, new discoveries open the modal immediately; when false, queue as HUD icons (persisted). */
  initialDiscoveryAutoResolve?: boolean
  onDiscoveryAutoResolveChange?: (value: boolean) => void
  /** Tighter typography and padding for the top-left resource HUD (persisted; default true). */
  initialMatterHudCompact?: boolean
  onMatterHudCompactChange?: (value: boolean) => void
  /** Key light azimuth/elevation while rotating (authoritative azimuth lives in main). */
  sunLightDebug: SunLightDebug
  getSunAnglesForLight: () => { az: number; el: number }
  onSunLightDebugChange?: () => void
  scanVisualizationDebug: ScanVisualizationDebug
  onScanVisualizationDebugChange?: () => void
  /** Music-only post EQ + high-pass (persisted). */
  audioMasterDebug: AudioMasterDebug
  onAudioMasterDebugChange?: () => void
  /** Live lines for in-progress replicator → structure timers (Debug panel). */
  getReplicatorTransformDebugLines?: () => string[]
}

export interface SettingsLightControlsApi {
  setAzimuthSliderDisabled: (disabled: boolean) => void
  syncAzimuthSlider: (azimuthDeg: number) => void
  /** Sync azimuth + elevation sliders from authoritative sun angles (e.g. after regenerate). */
  syncLightAngleSliders: (azimuthDeg: number, elevationDeg: number) => void
  /** Sync sun rotation speed range from `sunLightDebug.rotationDegPerSec` (e.g. after regenerate). */
  syncSunRotationSpeed: () => void
}

type SliderRow = {
  key: keyof GameBalance
  label: string
  min: number
  max: number
  step: number
  /** Decimal places for the value readout (default 2). */
  valueDecimals?: number
}

const GAMEPLAY_BALANCE_SLIDERS: SliderRow[] = [
  { key: 'durabilityMult', label: 'Rock durability', min: 0.1, max: 4, step: 0.05 },
  { key: 'replicatorFeedSpeedMult', label: 'Replicator feed speed', min: 0.1, max: 4, step: 0.05 },
  {
    key: 'replicatorTransformDurationSec',
    label: 'Replicator → structure transform time (sec)',
    min: 0,
    max: 30,
    step: 0.1,
    valueDecimals: 1,
  },
  {
    key: 'toolCostMult',
    label: 'Structure build costs (reactor / battery / hub / refinery / depth scanner / computronium)',
    min: 0.1,
    max: 4,
    step: 0.05,
  },
  { key: 'reactorOutputMult', label: 'Reactor energy output', min: 0.1, max: 4, step: 0.05 },
  { key: 'energyBaseCapMult', label: 'Base energy capacity', min: 0.1, max: 4, step: 0.05 },
  { key: 'batteryStorageMult', label: 'Energy per battery voxel', min: 0.1, max: 4, step: 0.05 },
  { key: 'passiveIncomeMult', label: 'Replicator passive income', min: 0.1, max: 4, step: 0.05 },
  { key: 'orbitalLaserEnergyMult', label: 'Mining laser energy cost', min: 0.1, max: 4, step: 0.05 },
  { key: 'excavatingLaserEnergyMult', label: 'Excavating laser energy cost', min: 0.1, max: 4, step: 0.05 },
  { key: 'scannerEnergyMult', label: 'Scanner satellite energy cost', min: 0.1, max: 4, step: 0.05 },
  {
    key: 'scannerScanRadius',
    label: 'Scanner neighborhood radius (voxels from center)',
    min: 0,
    max: 4,
    step: 1,
    valueDecimals: 0,
  },
  {
    key: 'explosiveChargeBlastRadius',
    label: 'Explosive charge blast radius (voxels from center)',
    min: 0,
    max: 4,
    step: 1,
    valueDecimals: 0,
  },
  {
    key: 'explosiveChargeEnergyPerArm',
    label: 'Explosive charge energy per arm (after unlock)',
    min: 0.2,
    max: 48,
    step: 0.1,
  },
  {
    key: 'impactCraterRangeMult',
    label: 'Impact crater radius multiplier (× sampled size; 0 = off; applies on Regenerate)',
    min: 0,
    max: 3,
    step: 0.05,
  },
  {
    key: 'impactCraterRadiusMinVoxels',
    label: 'Impact crater radius — min (voxels; per-crater size sampled uniformly min–max)',
    min: 0.5,
    max: 24,
    step: 0.25,
  },
  {
    key: 'impactCraterRadiusMaxVoxels',
    label: 'Impact crater radius — max (voxels)',
    min: 0.5,
    max: 24,
    step: 0.25,
  },
  {
    key: 'impactCraterCountMin',
    label: 'Impact crater count — min (inclusive; applies on Regenerate)',
    min: 0,
    max: 64,
    step: 1,
    valueDecimals: 0,
  },
  {
    key: 'impactCraterCountMax',
    label: 'Impact crater count — max (inclusive; 0 = none)',
    min: 0,
    max: 64,
    step: 1,
    valueDecimals: 0,
  },
  { key: 'hubPullMult', label: 'Hub pull throughput (local network → root tallies)', min: 0.1, max: 4, step: 0.05 },
  {
    key: 'hubMaxEnergySpendMult',
    label: 'Hub max energy / sec (× active hub count)',
    min: 0.1,
    max: 4,
    step: 0.05,
  },
  {
    key: 'refineryProcessMult',
    label: 'Refinery process throughput (roots → second-order in tallies)',
    min: 0.1,
    max: 4,
    step: 0.05,
  },
  {
    key: 'refineryMaxProcessEnergySpendMult',
    label: 'Refinery max energy / sec for processing (× active refinery count)',
    min: 0.1,
    max: 4,
    step: 0.05,
  },
  {
    key: 'computroniumEnergyDrainPerSecPerCell',
    label: 'Computronium energy drain (per second per active cell)',
    min: 0.02,
    max: 6,
    step: 0.02,
  },
  {
    key: 'computroniumUnlockPointsPerSecPerCell',
    label: 'Computronium unlock points (per second per active cell, scaled by energy paid)',
    min: 0.02,
    max: 3,
    step: 0.02,
  },
  {
    key: 'computroniumPointsPerStage',
    label: 'Computronium points per stage (thresholds at 1×…5× for research tiers)',
    min: 8,
    max: 400,
    step: 1,
    valueDecimals: 0,
  },
  {
    key: 'drossMassPerRemoval',
    label: 'Cleanup mass per removed voxel (voxel-equivalents before cleanup mass mult)',
    min: 0.02,
    max: 2,
    step: 0.02,
  },
  { key: 'drossMassMult', label: 'Cleanup spawn mass multiplier', min: 0.1, max: 4, step: 0.05 },
  {
    key: 'drossReplicatorSpawnChance',
    label: 'Replicator cleanup spawn chance (per rock HP tick; independent roll)',
    min: 0,
    max: 1,
    step: 0.02,
  },
  {
    key: 'drossMassPerReplicatorHp',
    label: 'Replicator cleanup mass when spawn succeeds (voxel-equiv before cleanup mass mult)',
    min: 0.001,
    max: 2,
    step: 0.005,
  },
  {
    key: 'drossCollectionRatePerSatellitePerSec',
    label: 'Cleanup collection rate per collector satellite (voxel-equiv / sec)',
    min: 0.001,
    max: 2,
    step: 0.005,
  },
  { key: 'drossCollectionMult', label: 'Cleanup collection rate multiplier', min: 0.1, max: 4, step: 0.05 },
  {
    key: 'drossFogDensityPerMass',
    label: 'Cleanup fog density per total mass (FogExp2; 0 = off)',
    min: 0,
    max: 0.002,
    step: 0.00002,
    valueDecimals: 5,
  },
  {
    key: 'drossFogDensityMax',
    label: 'Cleanup fog density cap (FogExp2 max)',
    min: 0,
    max: 0.12,
    step: 0.002,
    valueDecimals: 4,
  },
  {
    key: 'drossFogColorR',
    label: 'Cleanup fog color R (sRGB; light = bright haze)',
    min: 0,
    max: 1,
    step: 0.02,
    valueDecimals: 2,
  },
  {
    key: 'drossFogColorG',
    label: 'Cleanup fog color G (sRGB)',
    min: 0,
    max: 1,
    step: 0.02,
    valueDecimals: 2,
  },
  {
    key: 'drossFogColorB',
    label: 'Cleanup fog color B (sRGB)',
    min: 0,
    max: 1,
    step: 0.02,
    valueDecimals: 2,
  },
]

/** Discovery sites + offer archetypes — own Debug subsection (see also `discoveryDensityScale(profile)`). */
const DISCOVERY_DEBUG_SLIDERS: SliderRow[] = [
  {
    key: 'discoverySiteDensity',
    label: 'Discovery site density (fraction of voxels; × profile scale; red overlay when scanned)',
    min: 0,
    max: 1,
    step: 0.001,
    valueDecimals: 3,
  },
  { key: 'discoveryWeightWindfall', label: 'Discovery weight — windfall', min: 0, max: 8, step: 0.05 },
  { key: 'discoveryWeightDrain', label: 'Discovery weight — drain', min: 0, max: 8, step: 0.05 },
  { key: 'discoveryWeightLore', label: 'Discovery weight — lore', min: 0, max: 8, step: 0.05 },
  {
    key: 'discoveryWeightResearchBypass',
    label: 'Discovery weight — research bypass (computronium tiers)',
    min: 0,
    max: 8,
    step: 0.05,
  },
]

/** Depth scan sim + overlay appearance — same `gameBalance` keys as before; grouped under Debug. */
const DEPTH_SCAN_DEBUG_SLIDERS: SliderRow[] = [
  {
    key: 'depthRevealRate',
    label: 'Depth scan reveal rate (per second, before distance falloff)',
    min: 0.0005,
    max: 0.8,
    step: 0.002,
  },
  {
    key: 'depthRevealDistanceScale',
    label: 'Depth scan distance scale d0 (Manhattan steps)',
    min: 0.5,
    max: 32,
    step: 0.25,
  },
  { key: 'depthRevealPower', label: 'Depth scan distance power p', min: 0.5, max: 8, step: 0.05 },
  {
    key: 'depthRevealSusceptibilityFloor',
    label: 'Depth reveal min rate multiplier (when susceptibility S = 0)',
    min: 0.02,
    max: 1,
    step: 0.02,
  },
  {
    key: 'depthOverlayRockOpacity',
    label: 'Depth overlay unrevealed rock opacity (base)',
    min: 0.08,
    max: 0.92,
    step: 0.02,
  },
  {
    key: 'depthOverlayScannedVoxelOpacity',
    label: 'Depth overlay scanned voxel opacity (along reveal progress)',
    min: 0.08,
    max: 1,
    step: 0.02,
  },
  {
    key: 'depthOverlayDurabilityOpacityMix',
    label: 'Depth overlay durability opacity mix',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'depthOverlaySusceptibilityOpacityBoost',
    label: 'Depth overlay opacity boost when scan susceptibility is low',
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'depthOverlayScanSaturationMul',
    label: 'Depth overlay heatmap saturation (× refined RGB)',
    min: 0.6,
    max: 2.2,
    step: 0.02,
  },
  {
    key: 'depthOverlayScanLightnessMul',
    label: 'Depth overlay heatmap lightness (× refined RGB)',
    min: 0.65,
    max: 1.35,
    step: 0.02,
  },
  {
    key: 'depthOverlaySolidRevealProgress',
    label: 'Depth overlay full opacity at reveal progress ≥',
    min: 0.5,
    max: 1,
    step: 0.02,
  },
  {
    key: 'depthOverlayLodeOpaqueStrengthFloor',
    label: 'Rare lode — min strength (full opacity; heatmap ramp floor)',
    min: 0,
    max: 1,
    step: 0.02,
  },
  {
    key: 'surfaceScanRareLodeLerpBoostMax',
    label: 'Surface scan — max rare-lode tint lerp boost',
    min: 0,
    max: 1,
    step: 0.02,
  },
  {
    key: 'surfaceScanLodeHeatmapBlend',
    label: 'Surface scan — lode density heatmap blend (vs composition tint)',
    min: 0,
    max: 1,
    step: 0.02,
  },
  {
    key: 'rareLodeMixMax',
    label: 'Rare lode max blend toward spectral template',
    min: 0.15,
    max: 1,
    step: 0.02,
  },
  {
    key: 'rareLodeNoiseSmoothLow',
    label: 'Rare lode field smoothstep low',
    min: 0.05,
    max: 0.85,
    step: 0.02,
  },
  {
    key: 'rareLodeNoiseSmoothHigh',
    label: 'Rare lode field smoothstep high',
    min: 0.15,
    max: 0.99,
    step: 0.02,
  },
  {
    key: 'depthOverlayHeatmapBlend',
    label: 'Depth overlay heatmap blend (vs composition tint)',
    min: 0,
    max: 1,
    step: 0.02,
  },
  {
    key: 'depthOverlayHeatmapSaturationMul',
    label: 'Depth overlay heatmap saturation',
    min: 0.35,
    max: 1,
    step: 0.02,
  },
]

/** Rare-lode depth overlay opacity threshold — paired with Debug lode visualization. */
const LODE_DEBUG_BALANCE_SLIDERS: SliderRow[] = [
  {
    key: 'depthOverlayLodeFullOpacityMinDensity',
    label: 'Depth overlay — full opacity when graded density ≥ (warm vs green band)',
    min: 0,
    max: 1,
    step: 0.02,
  },
]

const LASER_AUDIO_SLIDERS: SliderRow[] = [
  {
    key: 'laserZapPitchStartFreqMult',
    label: 'Laser zap pitch frequency (× C5 start)',
    min: 0.1,
    max: 4,
    step: 0.05,
  },
  {
    key: 'laserZapPitchDepthMult',
    label: 'Laser zap pitch depth (× octave span)',
    min: 0.1,
    max: 4,
    step: 0.05,
  },
  {
    key: 'laserZapPitchDurMult',
    label: 'Laser zap pitch envelope length (× 1 s)',
    min: 0.1,
    max: 4,
    step: 0.05,
  },
  { key: 'laserZapVolumeMult', label: 'Laser zap volume', min: 0.1, max: 4, step: 0.05 },
  { key: 'laserZapLfoHzMult', label: 'Laser zap tremolo speed', min: 0.1, max: 4, step: 0.05 },
  { key: 'laserZapLfoDepthMult', label: 'Laser zap tremolo depth', min: 0.1, max: 4, step: 0.05 },
]

/** Dig laser held-beam (noise + bandpass) — all engine parameters. */
const DIG_LASER_SUSTAIN_AUDIO_SLIDERS: SliderRow[] = [
  {
    key: 'digLaserVolumeMult',
    label: 'Dig laser — volume (× peak)',
    min: 0.1,
    max: 20,
    step: 0.05,
  },
  {
    key: 'digLaserNoiseBufferSec',
    label: 'Dig laser — noise loop length (s)',
    min: 0.04,
    max: 0.65,
    step: 0.01,
    valueDecimals: 3,
  },
  {
    key: 'digLaserBandpassHz',
    label: 'Dig laser — bandpass frequency (Hz, low range)',
    min: 80,
    max: 2600,
    step: 10,
    valueDecimals: 0,
  },
  {
    key: 'digLaserBandpassQ',
    label: 'Dig laser — bandpass Q',
    min: 0.08,
    max: 12,
    step: 0.02,
    valueDecimals: 2,
  },
  {
    key: 'digLaserSustainPeak',
    label: 'Dig laser — sustain peak gain',
    min: 0.02,
    max: 0.48,
    step: 0.01,
    valueDecimals: 2,
  },
  {
    key: 'digLaserSustainAttackSec',
    label: 'Dig laser — attack (s)',
    min: 0.002,
    max: 0.35,
    step: 0.005,
    valueDecimals: 3,
  },
  {
    key: 'digLaserSustainReleaseSec',
    label: 'Dig laser — release (s)',
    min: 0.02,
    max: 0.55,
    step: 0.01,
    valueDecimals: 3,
  },
  { key: 'digLaserLfoHzMult', label: 'Dig laser — tremolo speed', min: 0.1, max: 4, step: 0.05 },
  { key: 'digLaserLfoDepthMult', label: 'Dig laser — tremolo depth', min: 0.1, max: 4, step: 0.05 },
]

/** HP-by-HP clicks while a replicator eats rock (triangle + highpass). */
const REPLICATOR_FEED_AUDIO_SLIDERS: SliderRow[] = [
  {
    key: 'replicatorFeedAudioMaxVoices',
    label: 'Replicator feed — max voices / frame',
    min: 1,
    max: 8,
    step: 1,
    valueDecimals: 0,
  },
  {
    key: 'replicatorFeedAudioStepSec',
    label: 'Replicator feed — voice spacing (s)',
    min: 0.012,
    max: 0.12,
    step: 0.003,
    valueDecimals: 3,
  },
  {
    key: 'replicatorFeedAudioVolumeMult',
    label: 'Replicator feed — volume (× peak)',
    min: 0.1,
    max: 4,
    step: 0.05,
  },
  {
    key: 'replicatorFeedAudioBaseHz',
    label: 'Replicator feed — base frequency (Hz)',
    min: 400,
    max: 8000,
    step: 20,
    valueDecimals: 0,
  },
  {
    key: 'replicatorFeedAudioPitchSpread',
    label: 'Replicator feed — pitch spread (Hz, 0 = fixed)',
    min: 0,
    max: 800,
    step: 10,
    valueDecimals: 0,
  },
  {
    key: 'replicatorFeedAudioTailSec',
    label: 'Replicator feed — envelope tail (s)',
    min: 0.004,
    max: 0.055,
    step: 0.001,
    valueDecimals: 3,
  },
  {
    key: 'replicatorFeedAudioAttackSec',
    label: 'Replicator feed — attack (s)',
    min: 0.001,
    max: 0.035,
    step: 0.001,
    valueDecimals: 3,
  },
]

/** Shared convolver on all tool SFX (parallel dry). */
const SFX_REVERB_SLIDERS: SliderRow[] = [
  {
    key: 'sfxReverbWetSend',
    label: 'SFX reverb — wet send (into convolver)',
    min: 0,
    max: 0.95,
    step: 0.01,
    valueDecimals: 2,
  },
  {
    key: 'sfxReverbWetOut',
    label: 'SFX reverb — wet out (after convolver)',
    min: 0,
    max: 0.95,
    step: 0.01,
    valueDecimals: 2,
  },
  {
    key: 'sfxReverbDurationSec',
    label: 'SFX reverb — impulse length (s)',
    min: 0.35,
    max: 2.5,
    step: 0.05,
    valueDecimals: 2,
  },
  {
    key: 'sfxReverbDecayPerSec',
    label: 'SFX reverb — IR decay rate (higher = shorter tail)',
    min: 1.5,
    max: 12,
    step: 0.1,
    valueDecimals: 1,
  },
]

const ALL_DEBUG_SLIDERS: SliderRow[] = [
  ...GAMEPLAY_BALANCE_SLIDERS,
  ...DISCOVERY_DEBUG_SLIDERS,
  ...DEPTH_SCAN_DEBUG_SLIDERS,
  ...LODE_DEBUG_BALANCE_SLIDERS,
  ...LASER_AUDIO_SLIDERS,
  ...DIG_LASER_SUSTAIN_AUDIO_SLIDERS,
  ...REPLICATOR_FEED_AUDIO_SLIDERS,
  ...SFX_REVERB_SLIDERS,
]

export function createSettingsMenu(
  container: HTMLElement,
  {
    leadingActions,
    onOpenTips,
    onRegenerate,
    onLightAngleChange,
    initialAzimuthDeg,
    initialElevationDeg,
    onBalanceChange,
    onDebugAddResources,
    onDebugAddEnergy,
    onDebugIncreaseEnergyCap,
    onDebugUnlockAllTools,
    onDebugShowAllLodes,
    onDebugClearLodeDisplay,
    asteroidMusicDebug,
    getMusicRootMidi,
    onAsteroidMusicDebugChange,
    initialMusicVolumeLinear,
    onMusicVolumeChange,
    initialDiscoveryAutoResolve = false,
    onDiscoveryAutoResolveChange,
    initialMatterHudCompact = true,
    onMatterHudCompactChange,
    sunLightDebug,
    getSunAnglesForLight,
    onSunLightDebugChange,
    scanVisualizationDebug,
    onScanVisualizationDebugChange,
    audioMasterDebug,
    onAudioMasterDebugChange,
    getReplicatorTransformDebugLines,
  }: SettingsMenuOptions,
): SettingsLightControlsApi {
  const overlay = document.createElement('div')
  overlay.className = 'settings-overlay'

  const topBar = document.createElement('div')
  topBar.className = 'settings-top-actions'
  if (leadingActions) topBar.appendChild(leadingActions)

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'settings-toggle'
  toggle.setAttribute('aria-expanded', 'false')
  toggle.setAttribute('aria-controls', 'settings-panel')
  toggle.title = 'Settings'
  toggle.textContent = 'F10'
  toggle.setAttribute('aria-label', 'Settings')

  const panel = document.createElement('div')
  panel.id = 'settings-panel'
  panel.className = 'settings-panel'
  panel.hidden = true
  panel.setAttribute('role', 'region')
  panel.setAttribute('aria-label', 'Settings')

  const heading = document.createElement('h2')
  heading.className = 'settings-heading'
  heading.textContent = 'Settings'

  const regenBtn = document.createElement('button')
  regenBtn.type = 'button'
  regenBtn.className = 'settings-primary'
  regenBtn.textContent = 'Regenerate asteroid'

  const azRow = document.createElement('div')
  azRow.className = 'settings-row'
  const azLabel = document.createElement('label')
  azLabel.className = 'settings-label'
  azLabel.htmlFor = 'settings-azimuth'
  const azimuthInput = document.createElement('input')
  azimuthInput.id = 'settings-azimuth'
  azimuthInput.type = 'range'
  azimuthInput.min = '0'
  azimuthInput.max = '360'
  azimuthInput.step = '1'
  azimuthInput.value = String(Math.round(initialAzimuthDeg))
  const azValue = document.createElement('span')
  azValue.className = 'settings-value'
  azValue.textContent = `${azimuthInput.value}°`
  azLabel.textContent = 'Light azimuth'
  azRow.append(azLabel, azimuthInput, azValue)

  const elRow = document.createElement('div')
  elRow.className = 'settings-row'
  const elLabel = document.createElement('label')
  elLabel.className = 'settings-label'
  elLabel.htmlFor = 'settings-elevation'
  const elevationInput = document.createElement('input')
  elevationInput.id = 'settings-elevation'
  elevationInput.type = 'range'
  elevationInput.min = '-85'
  elevationInput.max = '85'
  elevationInput.step = '1'
  elevationInput.value = String(
    Math.min(85, Math.max(-85, Math.round(initialElevationDeg))),
  )
  const elValue = document.createElement('span')
  elValue.className = 'settings-value'
  elValue.textContent = `${elevationInput.value}°`
  elLabel.textContent = 'Light elevation (above / below horizon)'
  elRow.append(elLabel, elevationInput, elValue)

  const musicVolRow = document.createElement('div')
  musicVolRow.className = 'settings-row'
  const musicVolLabel = document.createElement('label')
  musicVolLabel.className = 'settings-label'
  musicVolLabel.htmlFor = 'settings-music-volume'
  musicVolLabel.textContent = 'Music volume (ambient)'
  const musicVolInput = document.createElement('input')
  musicVolInput.id = 'settings-music-volume'
  musicVolInput.type = 'range'
  musicVolInput.min = '0'
  musicVolInput.max = '100'
  musicVolInput.step = '1'
  musicVolInput.value = String(
    Math.round(Math.min(1, Math.max(0, initialMusicVolumeLinear)) * 100),
  )
  const musicVolValue = document.createElement('span')
  musicVolValue.className = 'settings-value'
  musicVolValue.textContent = `${musicVolInput.value}%`
  musicVolInput.addEventListener('input', () => {
    musicVolValue.textContent = `${musicVolInput.value}%`
    onMusicVolumeChange(Number(musicVolInput.value) / 100)
  })
  musicVolRow.append(musicVolLabel, musicVolInput, musicVolValue)

  const discoveryAutoResolveRow = document.createElement('div')
  discoveryAutoResolveRow.className = 'settings-row'
  const discoveryAutoResolveLabel = document.createElement('label')
  discoveryAutoResolveLabel.className = 'settings-checkbox-label'
  const discoveryAutoResolveInput = document.createElement('input')
  discoveryAutoResolveInput.type = 'checkbox'
  discoveryAutoResolveInput.id = 'settings-discovery-auto-resolve'
  discoveryAutoResolveInput.checked = initialDiscoveryAutoResolve
  const discoveryAutoResolveText = document.createElement('span')
  discoveryAutoResolveText.textContent = 'Resolve discoveries immediately'
  discoveryAutoResolveLabel.append(discoveryAutoResolveInput, discoveryAutoResolveText)
  discoveryAutoResolveRow.appendChild(discoveryAutoResolveLabel)
  discoveryAutoResolveInput.addEventListener('change', () => {
    onDiscoveryAutoResolveChange?.(discoveryAutoResolveInput.checked)
  })

  const matterHudCompactRow = document.createElement('div')
  matterHudCompactRow.className = 'settings-row'
  const matterHudCompactLabel = document.createElement('label')
  matterHudCompactLabel.className = 'settings-checkbox-label'
  const matterHudCompactInput = document.createElement('input')
  matterHudCompactInput.type = 'checkbox'
  matterHudCompactInput.id = 'settings-matter-hud-compact'
  matterHudCompactInput.checked = initialMatterHudCompact
  const matterHudCompactText = document.createElement('span')
  matterHudCompactText.textContent = 'Compact resource HUD'
  matterHudCompactLabel.append(matterHudCompactInput, matterHudCompactText)
  matterHudCompactRow.appendChild(matterHudCompactLabel)
  matterHudCompactInput.addEventListener('change', () => {
    onMatterHudCompactChange?.(matterHudCompactInput.checked)
  })

  const debugDetails = document.createElement('details')
  debugDetails.className = 'settings-details'

  function createDebugSection(
    title: string,
    opts?: { open?: boolean; id?: string },
  ): HTMLDetailsElement {
    const det = document.createElement('details')
    det.className = 'settings-details settings-debug-subsection'
    if (opts?.id) det.id = opts.id
    if (opts?.open) det.open = true
    const sum = document.createElement('summary')
    sum.className = 'settings-details-summary'
    sum.textContent = title
    det.appendChild(sum)
    return det
  }

  const debugSummary = document.createElement('summary')
  debugSummary.className = 'settings-details-summary'
  debugSummary.textContent = 'Debug'

  const debugHint = document.createElement('p')
  debugHint.className = 'settings-debug-hint'
  debugHint.textContent =
    'Rock durability applies after Regenerate. All Settings / Debug tunables mirror to localStorage on change. In dev, enable auto-save or use Save to write gameBalance.persisted.json, asteroidMusicDebug.persisted.json, and settingsClient.persisted.json (light angles, key-light debug, scan viz, music post-EQ, overlays, discovery/HUD layout, music volume). Debug preset export/import still works for moving keys between browsers.'

  const autoSaveRow = document.createElement('div')
  autoSaveRow.className = 'settings-row settings-debug-row settings-save-row'
  const autoSaveLabel = document.createElement('label')
  autoSaveLabel.className = 'settings-checkbox-label'
  const autoSaveInput = document.createElement('input')
  autoSaveInput.type = 'checkbox'
  autoSaveInput.id = 'settings-debug-autosave'
  autoSaveInput.checked = getDebugProjectAutosave()
  const autoSaveText = document.createElement('span')
  autoSaveText.textContent = 'Auto-save debug/settings to project files (dev)'
  autoSaveLabel.append(autoSaveInput, autoSaveText)
  autoSaveRow.appendChild(autoSaveLabel)
  autoSaveInput.addEventListener('change', () => {
    const on = autoSaveInput.checked
    setDebugProjectAutosave(on)
    if (!on) {
      cancelScheduledPersist()
      cancelScheduledMusicPersist()
      cancelScheduledSettingsClientPersist()
    }
  })

  const saveAllRow = document.createElement('div')
  saveAllRow.className = 'settings-row settings-debug-row settings-save-row'
  const saveAllBtn = document.createElement('button')
  saveAllBtn.type = 'button'
  saveAllBtn.className = 'settings-secondary'
  saveAllBtn.textContent = 'Save all settings to project'
  const saveAllStatus = document.createElement('span')
  saveAllStatus.className = 'settings-save-status'
  saveAllStatus.setAttribute('aria-live', 'polite')
  saveAllRow.append(saveAllBtn, saveAllStatus)

  let saveAllStatusClear: ReturnType<typeof setTimeout> | null = null
  function flashSaveAllStatus(message: string): void {
    if (saveAllStatusClear !== null) clearTimeout(saveAllStatusClear)
    saveAllStatus.textContent = message
    saveAllStatusClear = setTimeout(() => {
      saveAllStatus.textContent = ''
      saveAllStatusClear = null
    }, 4200)
  }

  saveAllBtn.addEventListener('click', () => {
    void (async () => {
      if (!import.meta.env.DEV) {
        flashSaveAllStatus('Dev server only for project files.')
        return
      }
      const { balance, music, client } = await persistAllDebugSettingsToProjectNow(asteroidMusicDebug)
      const parts: string[] = []
      if (balance) parts.push('balance')
      if (music) parts.push('music')
      if (client) parts.push('client')
      flashSaveAllStatus(
        parts.length === 3
          ? 'Saved balance, music, and settingsClient JSON.'
          : parts.length > 0
            ? `Partial save: ${parts.join(', ')} OK; some writes failed.`
            : 'Save failed.',
      )
    })()
  })

  const saveRow = document.createElement('div')
  saveRow.className = 'settings-row settings-debug-row settings-save-row'
  const saveBtn = document.createElement('button')
  saveBtn.type = 'button'
  saveBtn.className = 'settings-secondary'
  saveBtn.textContent = 'Save balance to project'
  const saveStatus = document.createElement('span')
  saveStatus.className = 'settings-save-status'
  saveStatus.setAttribute('aria-live', 'polite')
  saveRow.append(saveBtn, saveStatus)

  const musicSaveRow = document.createElement('div')
  musicSaveRow.className = 'settings-row settings-debug-row settings-save-row'
  const musicSaveBtn = document.createElement('button')
  musicSaveBtn.type = 'button'
  musicSaveBtn.className = 'settings-secondary'
  musicSaveBtn.textContent = 'Save music debug to project'
  const musicSaveStatus = document.createElement('span')
  musicSaveStatus.className = 'settings-save-status'
  musicSaveStatus.setAttribute('aria-live', 'polite')
  musicSaveRow.append(musicSaveBtn, musicSaveStatus)

  let musicSaveStatusClear: ReturnType<typeof setTimeout> | null = null
  function flashMusicSaveStatus(message: string): void {
    if (musicSaveStatusClear !== null) clearTimeout(musicSaveStatusClear)
    musicSaveStatus.textContent = message
    musicSaveStatusClear = setTimeout(() => {
      musicSaveStatus.textContent = ''
      musicSaveStatusClear = null
    }, 3200)
  }

  musicSaveBtn.addEventListener('click', () => {
    void (async () => {
      if (!import.meta.env.DEV) {
        flashMusicSaveStatus('Dev server only for project file.')
        return
      }
      const ok = await persistAsteroidMusicDebugToProjectNow(asteroidMusicDebug)
      flashMusicSaveStatus(
        ok ? 'Saved to asteroidMusicDebug.persisted.json.' : 'Save failed.',
      )
    })()
  })

  let saveStatusClear: ReturnType<typeof setTimeout> | null = null
  function flashSaveStatus(message: string): void {
    if (saveStatusClear !== null) clearTimeout(saveStatusClear)
    saveStatus.textContent = message
    saveStatusClear = setTimeout(() => {
      saveStatus.textContent = ''
      saveStatusClear = null
    }, 3200)
  }

  saveBtn.addEventListener('click', () => {
    void (async () => {
      if (!import.meta.env.DEV) {
        flashSaveStatus('Dev server only for project file.')
        return
      }
      const ok = await persistGameBalanceToProjectNow()
      flashSaveStatus(ok ? 'Saved to gameBalance.persisted.json.' : 'Save failed.')
    })()
  })

  const presetRow = document.createElement('div')
  presetRow.className = 'settings-row settings-debug-row settings-save-row'
  const presetDownloadBtn = document.createElement('button')
  presetDownloadBtn.type = 'button'
  presetDownloadBtn.className = 'settings-secondary'
  presetDownloadBtn.textContent = 'Download debug preset (.json)'
  const presetCopyBtn = document.createElement('button')
  presetCopyBtn.type = 'button'
  presetCopyBtn.className = 'settings-secondary'
  presetCopyBtn.textContent = 'Copy preset to clipboard'
  const presetFileInput = document.createElement('input')
  presetFileInput.type = 'file'
  presetFileInput.accept = 'application/json,.json'
  presetFileInput.className = 'settings-preset-file-input'
  presetFileInput.id = 'settings-debug-preset-import'
  const presetFileLabel = document.createElement('label')
  presetFileLabel.className = 'settings-secondary settings-preset-file-label'
  presetFileLabel.htmlFor = presetFileInput.id
  presetFileLabel.textContent = 'Import debug preset…'
  const presetStatus = document.createElement('span')
  presetStatus.className = 'settings-save-status'
  presetStatus.setAttribute('aria-live', 'polite')
  presetRow.append(presetDownloadBtn, presetCopyBtn, presetFileInput, presetFileLabel, presetStatus)

  let presetStatusClear: ReturnType<typeof setTimeout> | null = null
  function flashPresetStatus(message: string): void {
    if (presetStatusClear !== null) clearTimeout(presetStatusClear)
    presetStatus.textContent = message
    presetStatusClear = setTimeout(() => {
      presetStatus.textContent = ''
      presetStatusClear = null
    }, 4200)
  }

  presetDownloadBtn.addEventListener('click', () => {
    const json = exportDebugPresetJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'roid-debug-preset.json'
    a.rel = 'noopener'
    a.click()
    URL.revokeObjectURL(url)
    flashPresetStatus('Download started.')
  })

  presetCopyBtn.addEventListener('click', () => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(exportDebugPresetJson())
        flashPresetStatus('Copied JSON to clipboard.')
      } catch {
        flashPresetStatus('Copy failed (clipboard permission).')
      }
    })()
  })

  presetFileInput.addEventListener('change', () => {
    const file = presetFileInput.files?.[0]
    presetFileInput.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const result = applyDebugPresetFromJsonString(text)
      if (!result.ok) {
        flashPresetStatus(result.error)
        return
      }
      location.reload()
    }
    reader.onerror = () => flashPresetStatus('Could not read file.')
    reader.readAsText(file)
  })

  const balanceInputs = new Map<keyof GameBalance, HTMLInputElement>()

  function formatSliderValue(spec: SliderRow, n: number): string {
    return n.toFixed(spec.valueDecimals ?? 2)
  }

  function syncBalanceSliders(): void {
    for (const spec of ALL_DEBUG_SLIDERS) {
      const input = balanceInputs.get(spec.key)
      if (!input) continue
      const v = gameBalance[spec.key]
      input.value = String(v)
      const span = input.nextElementSibling
      if (span?.classList.contains('settings-value')) {
        span.textContent = formatSliderValue(spec, Number(v))
      }
    }
  }

  const resetBalanceBtn = document.createElement('button')
  resetBalanceBtn.type = 'button'
  resetBalanceBtn.className = 'settings-secondary'
  resetBalanceBtn.textContent = 'Reset balance defaults'
  resetBalanceBtn.addEventListener('click', () => {
    resetGameBalance()
    syncBalanceSliders()
    onBalanceChange?.()
  })

  const sectionPersist = createDebugSection('Persistence & cheats', {
    open: true,
    id: 'debug-section-persist',
  })
  const sectionLodeDebug = createDebugSection('Lodes', {
    id: 'debug-section-lodes',
  })
  const sectionKeyLight = createDebugSection('Key light', { id: 'debug-section-keylight' })
  const sectionScanDepth = createDebugSection('Scan & depth', { id: 'debug-section-scan' })
  const sectionDiscovery = createDebugSection('Discovery', { id: 'debug-section-discovery' })
  const sectionLaserSfx = createDebugSection('Laser & SFX audio', { id: 'debug-section-laser-sfx' })
  const sectionMusicMaster = createDebugSection('Music output (master)', {
    id: 'debug-section-music-master',
  })
  const sectionAsteroidMusic = createDebugSection('Asteroid music', {
    id: 'debug-section-asteroid-music',
  })
  const sectionGameBalance = createDebugSection('Game balance', { id: 'debug-section-balance' })

  const debugNav = document.createElement('div')
  debugNav.className = 'settings-debug-nav'
  debugNav.setAttribute('role', 'navigation')
  debugNav.setAttribute('aria-label', 'Debug subsections')

  const navTargets: { label: string; el: HTMLDetailsElement }[] = [
    { label: 'Persist', el: sectionPersist },
    { label: 'Lodes', el: sectionLodeDebug },
    { label: 'Light', el: sectionKeyLight },
    { label: 'Scan', el: sectionScanDepth },
    { label: 'Discovery', el: sectionDiscovery },
    { label: 'SFX', el: sectionLaserSfx },
    { label: 'Master', el: sectionMusicMaster },
    { label: 'Music', el: sectionAsteroidMusic },
    { label: 'Balance', el: sectionGameBalance },
  ]
  for (const { label, el } of navTargets) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'settings-debug-nav-btn'
    btn.textContent = label
    btn.addEventListener('click', () => {
      el.open = true
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
    debugNav.appendChild(btn)
  }

  debugDetails.append(
    debugSummary,
    debugNav,
    sectionPersist,
    sectionLodeDebug,
    sectionKeyLight,
    sectionScanDepth,
    sectionDiscovery,
    sectionLaserSfx,
    sectionMusicMaster,
    sectionAsteroidMusic,
    sectionGameBalance,
  )

  if (
    onDebugAddResources ||
    onDebugAddEnergy ||
    onDebugIncreaseEnergyCap ||
    onDebugUnlockAllTools ||
    onDebugShowAllLodes ||
    onDebugClearLodeDisplay
  ) {
    const cheatRow = document.createElement('div')
    cheatRow.className = 'settings-row settings-debug-row'
    function appendCheatButton(label: string, onClick: () => void): void {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'settings-secondary'
      btn.textContent = label
      btn.addEventListener('click', onClick)
      cheatRow.appendChild(btn)
    }
    if (onDebugAddResources) appendCheatButton('Add resources', onDebugAddResources)
    if (onDebugAddEnergy) appendCheatButton('Add energy', onDebugAddEnergy)
    if (onDebugIncreaseEnergyCap) {
      appendCheatButton('Increase energy cap', onDebugIncreaseEnergyCap)
    }
    if (onDebugUnlockAllTools) {
      appendCheatButton(
        'Unlock all tools',
        onDebugUnlockAllTools,
      )
    }
    if (onDebugShowAllLodes) appendCheatButton('Show all lodes', onDebugShowAllLodes)
    if (onDebugClearLodeDisplay) appendCheatButton('Clear lode display', onDebugClearLodeDisplay)
    sectionPersist.appendChild(cheatRow)
  }
  sectionPersist.append(debugHint, autoSaveRow, saveAllRow, saveRow, musicSaveRow, presetRow)

  function setAzimuthSliderDisabled(disabled: boolean): void {
    azimuthInput.disabled = disabled
  }

  function syncAzimuthSlider(azimuthDeg: number): void {
    const a = ((azimuthDeg % 360) + 360) % 360
    const clamped = Math.round(a) % 360
    azimuthInput.value = String(clamped)
    azValue.textContent = `${clamped}°`
  }

  function syncLightAngleSliders(azimuthDeg: number, elevationDeg: number): void {
    syncAzimuthSlider(azimuthDeg)
    const el = Math.min(85, Math.max(-85, Math.round(elevationDeg)))
    elevationInput.value = String(el)
    elValue.textContent = `${el}°`
  }

  const keyLightHeading = document.createElement('h3')
  keyLightHeading.className = 'settings-debug-subheading'
  keyLightHeading.textContent = 'Key light (debug)'
  sectionKeyLight.appendChild(keyLightHeading)

  const sunRotRow = document.createElement('div')
  sunRotRow.className = 'settings-row settings-debug-row'
  const sunRotLabel = document.createElement('label')
  sunRotLabel.className = 'settings-checkbox-label'
  const sunRotInput = document.createElement('input')
  sunRotInput.type = 'checkbox'
  sunRotInput.id = 'settings-sun-rotate-azimuth'
  sunRotInput.checked = sunLightDebug.rotateSunAzimuth
  const sunRotText = document.createElement('span')
  sunRotText.textContent = 'Rotate sun azimuth (around asteroid)'
  sunRotLabel.append(sunRotInput, sunRotText)
  sunRotRow.appendChild(sunRotLabel)
  sectionKeyLight.appendChild(sunRotRow)

  const sunSpeedRow = document.createElement('div')
  sunSpeedRow.className = 'settings-row settings-debug-row'
  const sunSpeedLabel = document.createElement('label')
  sunSpeedLabel.className = 'settings-label'
  sunSpeedLabel.htmlFor = 'settings-sun-rotation-speed'
  sunSpeedLabel.textContent = 'Sun rotation speed (°/s)'
  const sunSpeedInput = document.createElement('input')
  sunSpeedInput.id = 'settings-sun-rotation-speed'
  sunSpeedInput.type = 'range'
  sunSpeedInput.min = '-120'
  sunSpeedInput.max = '120'
  sunSpeedInput.step = '0.05'
  sunSpeedInput.value = String(sunLightDebug.rotationDegPerSec)
  const sunSpeedValue = document.createElement('span')
  sunSpeedValue.className = 'settings-value'
  sunSpeedValue.textContent = Number(sunSpeedInput.value).toFixed(2)
  sunSpeedRow.append(sunSpeedLabel, sunSpeedInput, sunSpeedValue)
  sectionKeyLight.appendChild(sunSpeedRow)

  const sunHelperRow = document.createElement('div')
  sunHelperRow.className = 'settings-row settings-debug-row'
  const sunHelperLabel = document.createElement('label')
  sunHelperLabel.className = 'settings-checkbox-label'
  const sunHelperInput = document.createElement('input')
  sunHelperInput.type = 'checkbox'
  sunHelperInput.id = 'settings-sun-direction-helper'
  sunHelperInput.checked = sunLightDebug.showSunHelper
  const sunHelperText = document.createElement('span')
  sunHelperText.textContent = 'Show key light direction (helper)'
  sunHelperLabel.append(sunHelperInput, sunHelperText)
  sunHelperRow.appendChild(sunHelperLabel)
  sectionKeyLight.appendChild(sunHelperRow)

  sunHelperInput.addEventListener('change', () => {
    sunLightDebug.showSunHelper = sunHelperInput.checked
    onSunLightDebugChange?.()
  })

  sunRotInput.addEventListener('change', () => {
    sunLightDebug.rotateSunAzimuth = sunRotInput.checked
    setAzimuthSliderDisabled(sunLightDebug.rotateSunAzimuth)
    sunSpeedInput.disabled = !sunLightDebug.rotateSunAzimuth
    if (!sunLightDebug.rotateSunAzimuth) {
      syncAzimuthSlider(getSunAnglesForLight().az)
    }
    emitLight()
    onSunLightDebugChange?.()
  })

  sunSpeedInput.addEventListener('input', () => {
    sunLightDebug.rotationDegPerSec = Number(sunSpeedInput.value)
    sunSpeedValue.textContent = sunLightDebug.rotationDegPerSec.toFixed(2)
  })

  const scanVizHeading = document.createElement('h3')
  scanVizHeading.className = 'settings-debug-subheading'
  scanVizHeading.textContent = 'Scan visualization (debug)'
  sectionScanDepth.appendChild(scanVizHeading)

  type ScanVizNumKey = {
    key: keyof ScanVisualizationDebug
    label: string
    min: number
    max: number
    step: number
    decimals?: number
  }

  const scanVizSliders: ScanVizNumKey[] = [
    { key: 'compositionLerp', label: 'Tint blend (1 = opaque on diffuse)', min: 0.85, max: 1, step: 0.01 },
    { key: 'anchorSaturation', label: 'Anchor saturation (HSL)', min: 0.5, max: 1, step: 0.01 },
    { key: 'anchorLightness', label: 'Anchor lightness (HSL)', min: 0.35, max: 0.75, step: 0.01 },
    { key: 'applyTintRgbMul', label: 'Scan tint RGB gain', min: 0.8, max: 2, step: 0.01 },
    {
      key: 'baseRockBulkHintLerp',
      label: 'Base rock bulk hint blend (1 = full hint)',
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      key: 'baseRockBulkHintSaturation',
      label: 'Base rock bulk hint saturation (HSL, 1 = max)',
      min: 0.12,
      max: 1,
      step: 0.01,
    },
    {
      key: 'baseRockBulkHintLightness',
      label: 'Base rock bulk hint lightness (HSL)',
      min: 0.35,
      max: 0.62,
      step: 0.01,
    },
    {
      key: 'baseRockDensityShade',
      label: 'Base rock density darkening (composite ρ)',
      min: 0,
      max: 1,
      step: 0.02,
    },
    { key: 'boostSaturationMul', label: 'Boost saturation ×', min: 1, max: 2, step: 0.01 },
    { key: 'boostSaturationAdd', label: 'Boost saturation +', min: 0, max: 0.25, step: 0.005 },
    { key: 'boostLightnessMin', label: 'Boost lightness min', min: 0.2, max: 0.55, step: 0.01 },
    { key: 'boostLightnessMax', label: 'Boost lightness max', min: 0.5, max: 0.95, step: 0.01 },
    { key: 'boostLightnessScale', label: 'Boost lightness scale', min: 0.85, max: 1.15, step: 0.005 },
    { key: 'boostLightnessAdd', label: 'Boost lightness +', min: 0, max: 0.12, step: 0.005 },
  ]

  for (const spec of scanVizSliders) {
    const row = document.createElement('div')
    row.className = 'settings-row settings-debug-row'
    const label = document.createElement('label')
    label.className = 'settings-label'
    label.htmlFor = `settings-scan-viz-${spec.key}`
    label.textContent = spec.label
    const input = document.createElement('input')
    input.id = `settings-scan-viz-${spec.key}`
    input.type = 'range'
    input.min = String(spec.min)
    input.max = String(spec.max)
    input.step = String(spec.step)
    const v = scanVisualizationDebug[spec.key] as number
    input.value = String(v)
    const valSpan = document.createElement('span')
    valSpan.className = 'settings-value'
    const dec = spec.decimals ?? 2
    valSpan.textContent = v.toFixed(dec)
    input.addEventListener('input', () => {
      const n = Number(input.value)
      ;(scanVisualizationDebug as unknown as Record<string, number>)[spec.key] = n
      valSpan.textContent = n.toFixed(dec)
      onScanVisualizationDebugChange?.()
    })
    row.append(label, input, valSpan)
    sectionScanDepth.appendChild(row)
  }

  const scanSuppressRow = document.createElement('div')
  scanSuppressRow.className = 'settings-row settings-debug-row'
  const scanSuppressLabel = document.createElement('label')
  scanSuppressLabel.className = 'settings-checkbox-label'
  const scanSuppressInput = document.createElement('input')
  scanSuppressInput.type = 'checkbox'
  scanSuppressInput.id = 'settings-scan-viz-suppress-emissive'
  scanSuppressInput.checked = scanVisualizationDebug.suppressEmissiveWhenScanned
  const scanSuppressText = document.createElement('span')
  scanSuppressText.textContent = 'Suppress structure emissive when scan tint active'
  scanSuppressLabel.append(scanSuppressInput, scanSuppressText)
  scanSuppressRow.appendChild(scanSuppressLabel)
  sectionScanDepth.appendChild(scanSuppressRow)
  scanSuppressInput.addEventListener('change', () => {
    scanVisualizationDebug.suppressEmissiveWhenScanned = scanSuppressInput.checked
    onScanVisualizationDebugChange?.()
  })

  const depthScanHeading = document.createElement('h3')
  depthScanHeading.className = 'settings-debug-subheading'
  depthScanHeading.textContent = 'Depth scan (debug)'
  sectionScanDepth.appendChild(depthScanHeading)

  function appendBalanceSliderRow(parent: HTMLElement, spec: SliderRow): void {
    const row = document.createElement('div')
    row.className = 'settings-row settings-debug-row'
    const label = document.createElement('label')
    label.className = 'settings-label'
    label.htmlFor = `settings-balance-${spec.key}`
    label.textContent = spec.label
    const input = document.createElement('input')
    input.id = `settings-balance-${spec.key}`
    input.type = 'range'
    input.min = String(spec.min)
    input.max = String(spec.max)
    input.step = String(spec.step)
    input.value = String(gameBalance[spec.key])
    const valSpan = document.createElement('span')
    valSpan.className = 'settings-value'
    valSpan.textContent = formatSliderValue(spec, Number(input.value))
    balanceInputs.set(spec.key, input)
    input.addEventListener('input', () => {
      valSpan.textContent = formatSliderValue(spec, Number(input.value))
      patchGameBalance({ [spec.key]: Number(input.value) } as Partial<GameBalance>)
      onBalanceChange?.()
    })
    row.append(label, input, valSpan)
    parent.appendChild(row)
  }

  const lodeDebugHint = document.createElement('p')
  lodeDebugHint.className = 'settings-debug-hint'
  lodeDebugHint.textContent =
    'Depth overlay: at or above this graded density, rare-lode voxels use full opacity (same axis as Show all lodes; green band stays faint).'
  sectionLodeDebug.appendChild(lodeDebugHint)
  for (const spec of LODE_DEBUG_BALANCE_SLIDERS) {
    appendBalanceSliderRow(sectionLodeDebug, spec)
  }

  for (const spec of DEPTH_SCAN_DEBUG_SLIDERS) {
    appendBalanceSliderRow(sectionScanDepth, spec)
  }

  for (const spec of GAMEPLAY_BALANCE_SLIDERS) {
    appendBalanceSliderRow(sectionScanDepth, spec)
  }

  const discoveryHint = document.createElement('p')
  discoveryHint.className = 'settings-debug-hint'
  discoveryHint.textContent =
    'Site density is multiplied by spectral/regime `discoveryDensityScale` from the asteroid profile. Zero density hides red discovery hints. Claiming a site rolls an offer from the weights below (or False Signal if all weights are zero).'
  sectionDiscovery.appendChild(discoveryHint)
  for (const spec of DISCOVERY_DEBUG_SLIDERS) {
    appendBalanceSliderRow(sectionDiscovery, spec)
  }

  if (getReplicatorTransformDebugLines) {
    const transformLiveHeading = document.createElement('h3')
    transformLiveHeading.className = 'settings-debug-subheading'
    transformLiveHeading.textContent = 'Replicator transforms (live)'
    sectionScanDepth.appendChild(transformLiveHeading)
    const transformLivePre = document.createElement('pre')
    transformLivePre.className = 'settings-debug-replicator-transforms'
    transformLivePre.style.whiteSpace = 'pre-wrap'
    transformLivePre.style.margin = '0.35rem 0 0'
    transformLivePre.style.fontSize = '0.78rem'
    transformLivePre.style.opacity = '0.92'
    transformLivePre.textContent = '(open Debug to refresh)'
    sectionScanDepth.appendChild(transformLivePre)
    let transformDebugRaf: number | null = null
    const tickReplicatorTransformDebug = (): void => {
      if (!debugDetails.open || !getReplicatorTransformDebugLines) {
        transformDebugRaf = null
        return
      }
      const lines = getReplicatorTransformDebugLines()
      transformLivePre.textContent = lines.length > 0 ? lines.join('\n') : '(none active)'
      transformDebugRaf = requestAnimationFrame(tickReplicatorTransformDebug)
    }
    debugDetails.addEventListener('toggle', () => {
      if (debugDetails.open) {
        if (transformDebugRaf == null) transformDebugRaf = requestAnimationFrame(tickReplicatorTransformDebug)
      } else if (transformDebugRaf != null) {
        cancelAnimationFrame(transformDebugRaf)
        transformDebugRaf = null
      }
    })
  }

  const laserAudioHeading = document.createElement('h3')
  laserAudioHeading.className = 'settings-debug-subheading'
  laserAudioHeading.textContent = 'Laser audio'
  sectionLaserSfx.appendChild(laserAudioHeading)

  for (const spec of LASER_AUDIO_SLIDERS) {
    appendBalanceSliderRow(sectionLaserSfx, spec)
  }

  const digLaserAudioHeading = document.createElement('h3')
  digLaserAudioHeading.className = 'settings-debug-subheading'
  digLaserAudioHeading.textContent = 'Dig laser sustain (audio)'
  sectionLaserSfx.appendChild(digLaserAudioHeading)

  for (const spec of DIG_LASER_SUSTAIN_AUDIO_SLIDERS) {
    appendBalanceSliderRow(sectionLaserSfx, spec)
  }

  const replicatorFeedAudioHeading = document.createElement('h3')
  replicatorFeedAudioHeading.className = 'settings-debug-subheading'
  replicatorFeedAudioHeading.textContent = 'Replicator feed (audio)'
  sectionLaserSfx.appendChild(replicatorFeedAudioHeading)

  for (const spec of REPLICATOR_FEED_AUDIO_SLIDERS) {
    appendBalanceSliderRow(sectionLaserSfx, spec)
  }

  const sfxReverbHeading = document.createElement('h3')
  sfxReverbHeading.className = 'settings-debug-subheading'
  sfxReverbHeading.textContent = 'SFX reverb (global)'
  sectionLaserSfx.appendChild(sfxReverbHeading)

  for (const spec of SFX_REVERB_SLIDERS) {
    appendBalanceSliderRow(sectionLaserSfx, spec)
  }

  const asteroidMusicHeading = document.createElement('h3')
  asteroidMusicHeading.className = 'settings-debug-subheading'
  asteroidMusicHeading.textContent = 'Asteroid music (debug)'

  const MASTER_HP_HZ_LO = 20
  const MASTER_HP_HZ_HI = 200
  const MASTER_HP_HZ_STEPS = 1000

  function masterHpHzToSliderPos(hz: number): number {
    const h = Math.min(MASTER_HP_HZ_HI, Math.max(MASTER_HP_HZ_LO, hz))
    const t = Math.log(h / MASTER_HP_HZ_LO) / Math.log(MASTER_HP_HZ_HI / MASTER_HP_HZ_LO)
    return Math.round(t * MASTER_HP_HZ_STEPS)
  }

  function masterHpSliderPosToHz(pos: number): number {
    const t = Math.min(1, Math.max(0, pos / MASTER_HP_HZ_STEPS))
    return MASTER_HP_HZ_LO * (MASTER_HP_HZ_HI / MASTER_HP_HZ_LO) ** t
  }

  const musicPostHeading = document.createElement('p')
  musicPostHeading.className = 'settings-debug-subheading'
  musicPostHeading.textContent = 'Output EQ + high-pass (end of music chain)'
  sectionMusicMaster.appendChild(musicPostHeading)

  const masterHpRow = document.createElement('div')
  masterHpRow.className = 'settings-row settings-debug-row'
  const masterHpLabel = document.createElement('label')
  masterHpLabel.className = 'settings-label'
  const masterHpId = 'settings-master-hp-hz'
  masterHpLabel.htmlFor = masterHpId
  masterHpLabel.textContent =
    'High-pass frequency (Hz, log slider; 20–200 Hz, travel biased low)'
  const masterHpInput = document.createElement('input')
  masterHpInput.id = masterHpId
  masterHpInput.type = 'range'
  masterHpInput.min = '0'
  masterHpInput.max = String(MASTER_HP_HZ_STEPS)
  masterHpInput.step = '1'
  masterHpInput.value = String(masterHpHzToSliderPos(audioMasterDebug.masterHighPassHz))
  const masterHpVal = document.createElement('span')
  masterHpVal.className = 'settings-value'
  masterHpVal.textContent = `${Math.round(audioMasterDebug.masterHighPassHz)} Hz`
  masterHpInput.addEventListener('input', () => {
    const hz = masterHpSliderPosToHz(Number(masterHpInput.value))
    audioMasterDebug.masterHighPassHz = hz
    masterHpVal.textContent = `${Math.round(hz)} Hz`
    onAudioMasterDebugChange?.()
  })
  masterHpRow.append(masterHpLabel, masterHpInput, masterHpVal)
  sectionMusicMaster.appendChild(masterHpRow)

  type MasterEqKey = 'eqLowDb' | 'eqMidDb' | 'eqHighDb'
  const masterEqSpecs: { id: string; label: string; key: MasterEqKey }[] = [
    { id: 'settings-master-eq-low', label: 'EQ — low (~200 Hz shelf, dB)', key: 'eqLowDb' },
    { id: 'settings-master-eq-mid', label: 'EQ — mid (~1 kHz peaking, dB)', key: 'eqMidDb' },
    { id: 'settings-master-eq-high', label: 'EQ — high (~4 kHz shelf, dB)', key: 'eqHighDb' },
  ]
  for (const eqSpec of masterEqSpecs) {
    const row = document.createElement('div')
    row.className = 'settings-row settings-debug-row'
    const label = document.createElement('label')
    label.className = 'settings-label'
    label.htmlFor = eqSpec.id
    label.textContent = eqSpec.label
    const input = document.createElement('input')
    input.id = eqSpec.id
    input.type = 'range'
    input.min = '-12'
    input.max = '12'
    input.step = '0.5'
    input.value = String(audioMasterDebug[eqSpec.key])
    const valSpan = document.createElement('span')
    valSpan.className = 'settings-value'
    valSpan.textContent = `${audioMasterDebug[eqSpec.key].toFixed(1)} dB`
    input.addEventListener('input', () => {
      const n = Number(input.value)
      audioMasterDebug[eqSpec.key] = n
      valSpan.textContent = `${n.toFixed(1)} dB`
      onAudioMasterDebugChange?.()
    })
    row.append(label, input, valSpan)
    sectionMusicMaster.appendChild(row)
  }

  sectionAsteroidMusic.appendChild(asteroidMusicHeading)

  type MusicSliderSpec = {
    label: string
    min: number
    max: number
    step: number
    decimals?: number
    id: string
    read: () => number
    write: (n: number) => void
  }

  function appendMusicSliderRow(parent: HTMLElement, spec: MusicSliderSpec): void {
    const row = document.createElement('div')
    row.className = 'settings-row settings-debug-row'
    const label = document.createElement('label')
    label.className = 'settings-label'
    label.htmlFor = spec.id
    label.textContent = spec.label
    const input = document.createElement('input')
    input.id = spec.id
    input.type = 'range'
    input.min = String(spec.min)
    input.max = String(spec.max)
    input.step = String(spec.step)
    input.value = String(spec.read())
    const valSpan = document.createElement('span')
    valSpan.className = 'settings-value'
    valSpan.textContent = Number(input.value).toFixed(spec.decimals ?? 2)
    input.addEventListener('input', () => {
      const n = Number(input.value)
      spec.write(n)
      valSpan.textContent = n.toFixed(spec.decimals ?? 2)
      onAsteroidMusicDebugChange?.()
    })
    row.append(label, input, valSpan)
    parent.appendChild(row)
  }

  /** Slider 0…1000 maps logarithmically to Hz so most travel is sub‑1 Hz. */
  const AMP_LFO_HZ_LO = 0.005
  const AMP_LFO_HZ_HI = 22
  const AMP_LFO_HZ_SLIDER_STEPS = 1000

  /** Log Hz for macro LFO/pan rate jitter + note jitter rate-of-rate — biased to slow modulation. */
  const JITTER_HZ_LO = 0.002
  const JITTER_HZ_HI = 0.25

  /** Log Hz range for macro note offset jitter only (wider max for fast vibrato). */
  const NOTE_JITTER_HZ_LO = 0.002
  const NOTE_JITTER_HZ_HI = 4

  const PAN_LFO_HZ_LO = 0.0005
  const PAN_LFO_HZ_HI = 0.05

  /** Glide base (s): most slider travel is 0…4s; remainder is 4…60s. */
  const GLIDE_BASE_KNEE_SEC = 4
  const GLIDE_BASE_MAX_SEC = 60
  const GLIDE_BASE_SLIDER_STEPS = 1000
  const GLIDE_BASE_FAST_FRACTION = 0.75

  function glideBaseSecToSliderPos(sec: number): number {
    const s = Math.min(GLIDE_BASE_MAX_SEC, Math.max(0, sec))
    if (s <= GLIDE_BASE_KNEE_SEC) {
      return Math.round((s / GLIDE_BASE_KNEE_SEC) * GLIDE_BASE_FAST_FRACTION * GLIDE_BASE_SLIDER_STEPS)
    }
    const u = (s - GLIDE_BASE_KNEE_SEC) / (GLIDE_BASE_MAX_SEC - GLIDE_BASE_KNEE_SEC)
    return Math.round(
      (GLIDE_BASE_FAST_FRACTION + u * (1 - GLIDE_BASE_FAST_FRACTION)) * GLIDE_BASE_SLIDER_STEPS,
    )
  }

  function sliderPosToGlideBaseSec(pos: number): number {
    const t = Math.min(1, Math.max(0, pos / GLIDE_BASE_SLIDER_STEPS))
    let sec: number
    if (t <= GLIDE_BASE_FAST_FRACTION) {
      sec = (t / GLIDE_BASE_FAST_FRACTION) * GLIDE_BASE_KNEE_SEC
    } else {
      const u = (t - GLIDE_BASE_FAST_FRACTION) / (1 - GLIDE_BASE_FAST_FRACTION)
      sec = GLIDE_BASE_KNEE_SEC + u * (GLIDE_BASE_MAX_SEC - GLIDE_BASE_KNEE_SEC)
    }
    return Math.round(sec * 1000) / 1000
  }

  function fmtGlideBaseSec(s: number): string {
    if (s <= 0) return '0.00'
    if (s < 0.1) return s.toFixed(3)
    return s.toFixed(2)
  }

  function appendGlideBaseSliderRow(parent: HTMLElement): void {
    const row = document.createElement('div')
    row.className = 'settings-row settings-debug-row'
    const lab = document.createElement('label')
    lab.className = 'settings-label'
    lab.htmlFor = 'settings-music-note-pitch-slide-base'
    lab.textContent =
      'Carrier pitch glide — base time constant (s); 0 with jitter 0 = instant'
    const input = document.createElement('input')
    input.id = 'settings-music-note-pitch-slide-base'
    input.type = 'range'
    input.min = '0'
    input.max = String(GLIDE_BASE_SLIDER_STEPS)
    input.step = '1'
    input.value = String(glideBaseSecToSliderPos(asteroidMusicDebug.notePitchSlideBaseSec))
    const valSpan = document.createElement('span')
    valSpan.className = 'settings-value'
    valSpan.textContent = fmtGlideBaseSec(asteroidMusicDebug.notePitchSlideBaseSec)
    input.addEventListener('input', () => {
      const n = sliderPosToGlideBaseSec(Number(input.value))
      asteroidMusicDebug.notePitchSlideBaseSec = n
      valSpan.textContent = fmtGlideBaseSec(n)
      onAsteroidMusicDebugChange?.()
    })
    row.append(lab, input, valSpan)
    parent.appendChild(row)
  }

  function logHzToSliderPos(hz: number, lo: number, hi: number, steps: number): number {
    const h = Math.min(hi, Math.max(lo, hz))
    const t = Math.log(h / lo) / Math.log(hi / lo)
    return Math.round(t * steps)
  }

  function logSliderPosToHz(pos: number, lo: number, hi: number, steps: number): number {
    const t = Math.min(1, Math.max(0, pos / steps))
    return lo * (hi / lo) ** t
  }

  function fmtVoiceHz(hz: number): string {
    return hz < 0.01 ? hz.toFixed(5) : hz.toFixed(3)
  }

  function appendVoiceLogHzSliderRow(
    parent: HTMLElement,
    label: string,
    id: string,
    hzLo: number,
    hzHi: number,
    getHz: () => number,
    setHz: (hz: number) => void,
  ): void {
    const row = document.createElement('div')
    row.className = 'settings-row settings-debug-row'
    const lab = document.createElement('label')
    lab.className = 'settings-label'
    lab.htmlFor = id
    lab.textContent = label
    const input = document.createElement('input')
    input.id = id
    input.type = 'range'
    input.min = '0'
    input.max = String(AMP_LFO_HZ_SLIDER_STEPS)
    input.step = '1'
    input.value = String(logHzToSliderPos(getHz(), hzLo, hzHi, AMP_LFO_HZ_SLIDER_STEPS))
    const valSpan = document.createElement('span')
    valSpan.className = 'settings-value'
    valSpan.textContent = fmtVoiceHz(getHz())
    input.addEventListener('input', () => {
      const hz = logSliderPosToHz(Number(input.value), hzLo, hzHi, AMP_LFO_HZ_SLIDER_STEPS)
      setHz(hz)
      valSpan.textContent = fmtVoiceHz(hz)
      onAsteroidMusicDebugChange?.()
    })
    row.append(lab, input, valSpan)
    parent.appendChild(row)
  }

  /** Log Hz with slider position 0 → phrase rate off (same mapping as other macro log Hz rows). */
  function appendPhraseRateLogHzSliderRow(
    parent: HTMLElement,
    label: string,
    id: string,
    hzLo: number,
    hzHi: number,
    getHz: () => number,
    setHz: (hz: number) => void,
  ): void {
    const row = document.createElement('div')
    row.className = 'settings-row settings-debug-row'
    const lab = document.createElement('label')
    lab.className = 'settings-label'
    lab.htmlFor = id
    lab.textContent = label
    const input = document.createElement('input')
    input.id = id
    input.type = 'range'
    input.min = '0'
    input.max = String(AMP_LFO_HZ_SLIDER_STEPS)
    input.step = '1'
    const hz0 = getHz()
    input.value = String(
      hz0 <= 0 ? 0 : logHzToSliderPos(hz0, hzLo, hzHi, AMP_LFO_HZ_SLIDER_STEPS),
    )
    const valSpan = document.createElement('span')
    valSpan.className = 'settings-value'
    valSpan.textContent = hz0 <= 0 ? '0 (off)' : fmtVoiceHz(hz0)
    input.addEventListener('input', () => {
      const pos = Number(input.value)
      const hz = pos <= 0 ? 0 : logSliderPosToHz(pos, hzLo, hzHi, AMP_LFO_HZ_SLIDER_STEPS)
      setHz(hz)
      valSpan.textContent = hz <= 0 ? '0 (off)' : fmtVoiceHz(hz)
      onAsteroidMusicDebugChange?.()
    })
    row.append(lab, input, valSpan)
    parent.appendChild(row)
  }

  function appendMacroJitterModeRow(
    parent: HTMLElement,
    label: string,
    id: string,
    getMode: () => MacroJitterMode,
    setMode: (m: MacroJitterMode) => void,
  ): void {
    const row = document.createElement('div')
    row.className = 'settings-row settings-debug-row'
    const lab = document.createElement('label')
    lab.className = 'settings-label'
    lab.htmlFor = id
    lab.textContent = label
    const sel = document.createElement('select')
    sel.id = id
    for (const opt of ['sine', 'step'] as const) {
      const o = document.createElement('option')
      o.value = opt
      o.textContent = opt
      sel.appendChild(o)
    }
    sel.value = getMode() === 'step' ? 'step' : 'sine'
    sel.addEventListener('change', () => {
      setMode(sel.value === 'step' ? 'step' : 'sine')
      onAsteroidMusicDebugChange?.()
    })
    row.append(lab, sel)
    parent.appendChild(row)
  }

  function appendScaleClampModeRow(parent: HTMLElement): void {
    const row = document.createElement('div')
    row.className = 'settings-row settings-debug-row'
    const lab = document.createElement('label')
    lab.className = 'settings-label'
    lab.htmlFor = 'settings-music-scale-clamp'
    lab.textContent = 'Note pitch — scale clamp'
    const sel = document.createElement('select')
    sel.id = 'settings-music-scale-clamp'
    const opts: { value: ScaleClampMode; label: string }[] = [
      { value: 'major', label: 'Major' },
      { value: 'minor', label: 'Minor' },
      { value: 'iwato', label: 'Iwato' },
      { value: 'hirajoshi', label: 'Hirajoshi' },
      { value: 'majorPentatonic', label: 'Major Pentatonic' },
      { value: 'locrian', label: 'Locrian' },
    ]
    for (const { value, label } of opts) {
      const o = document.createElement('option')
      o.value = value
      o.textContent = label
      sel.appendChild(o)
    }
    sel.value = parseScaleClampMode(asteroidMusicDebug.scaleClampMode, 'major')
    sel.addEventListener('change', () => {
      asteroidMusicDebug.scaleClampMode = parseScaleClampMode(sel.value, 'major')
      applyVoiceMacrosToVoices(asteroidMusicDebug, getMusicRootMidi())
      onAsteroidMusicDebugChange?.()
    })
    row.append(lab, sel)
    parent.appendChild(row)
  }

  function appendScaleCycleSection(parent: HTMLElement): void {
    const rowEn = document.createElement('div')
    rowEn.className = 'settings-row settings-debug-row'
    const labEn = document.createElement('label')
    labEn.className = 'settings-checkbox-label'
    const inpEn = document.createElement('input')
    inpEn.type = 'checkbox'
    inpEn.id = 'settings-music-scale-cycle-enabled'
    inpEn.checked = asteroidMusicDebug.scaleCycleEnabled !== false
    const spanEn = document.createElement('span')
    spanEn.textContent = 'Scale cycle — advance tonic along circle (timer)'
    labEn.append(inpEn, spanEn)
    rowEn.appendChild(labEn)
    inpEn.addEventListener('change', () => {
      asteroidMusicDebug.scaleCycleEnabled = inpEn.checked
      onAsteroidMusicDebugChange?.()
    })
    parent.appendChild(rowEn)

    appendMusicSliderRow(parent, {
      id: 'settings-music-scale-cycle-interval',
      label: 'Scale cycle — interval (s) between advances',
      min: 30,
      max: 3600,
      step: 1,
      decimals: 0,
      read: () => asteroidMusicDebug.scaleCycleIntervalSec,
      write: (n) => {
        asteroidMusicDebug.scaleCycleIntervalSec = n
      },
    })

    appendMusicSliderRow(parent, {
      id: 'settings-music-scale-cycle-jitter',
      label: 'Scale cycle — jitter (±s on each interval, deterministic)',
      min: 0,
      max: 120,
      step: 1,
      decimals: 0,
      read: () => asteroidMusicDebug.scaleCycleJitterSec,
      write: (n) => {
        asteroidMusicDebug.scaleCycleJitterSec = n
      },
    })

    const rowDir = document.createElement('div')
    rowDir.className = 'settings-row settings-debug-row'
    const labDir = document.createElement('label')
    labDir.className = 'settings-label'
    labDir.htmlFor = 'settings-music-scale-cycle-direction'
    labDir.textContent = 'Scale cycle — direction'
    const selDir = document.createElement('select')
    selDir.id = 'settings-music-scale-cycle-direction'
    const dirOpts: { value: ScaleCycleDirection; label: string }[] = [
      { value: 'fifths', label: 'Circle of fifths (+7 semitones/step)' },
      { value: 'fourths', label: 'Circle of fourths (+5 semitones/step)' },
    ]
    for (const { value, label } of dirOpts) {
      const o = document.createElement('option')
      o.value = value
      o.textContent = label
      selDir.appendChild(o)
    }
    selDir.value = parseScaleCycleDirection(asteroidMusicDebug.scaleCycleDirection, 'fifths')
    selDir.addEventListener('change', () => {
      asteroidMusicDebug.scaleCycleDirection = parseScaleCycleDirection(selDir.value, 'fifths')
      applyVoiceMacrosToVoices(asteroidMusicDebug, getMusicRootMidi())
      onAsteroidMusicDebugChange?.()
    })
    rowDir.append(labDir, selDir)
    parent.appendChild(rowDir)
  }

  /** Log scale 80 Hz … 20 kHz — slider travel concentrates on the low/mid range. */
  const BUS_LP_HZ_LO = 80
  const BUS_LP_HZ_HI = 20000
  const BUS_LP_HZ_SLIDER_STEPS = 1000

  function busLpHzToSliderPos(hz: number): number {
    const h = Math.min(BUS_LP_HZ_HI, Math.max(BUS_LP_HZ_LO, hz))
    const t = Math.log(h / BUS_LP_HZ_LO) / Math.log(BUS_LP_HZ_HI / BUS_LP_HZ_LO)
    return Math.round(t * BUS_LP_HZ_SLIDER_STEPS)
  }

  function busLpSliderPosToHz(pos: number): number {
    const t = Math.min(1, Math.max(0, pos / BUS_LP_HZ_SLIDER_STEPS))
    return BUS_LP_HZ_LO * (BUS_LP_HZ_HI / BUS_LP_HZ_LO) ** t
  }

  /** Log Hz 1e-8 … 0.28 — travel concentrates on very slow wander rates. */
  const PRE_DELAY_JIT_SPEED_HZ_LO = 1e-8
  const PRE_DELAY_JIT_SPEED_HZ_HI = 0.28
  const PRE_DELAY_JIT_SPEED_SLIDER_STEPS = 1000

  function fmtPreDelayJitSpeedHz(hz: number): string {
    if (!Number.isFinite(hz) || hz <= 0) return '0'
    if (hz < 0.0001) return hz.toExponential(2)
    if (hz < 0.01) return hz.toFixed(5)
    return hz.toFixed(3)
  }

  function appendPreDelayJitSpeedLogSliderRow(parent: HTMLElement): void {
    const row = document.createElement('div')
    row.className = 'settings-row settings-debug-row'
    const label = document.createElement('label')
    label.className = 'settings-label'
    const id = 'settings-music-pre-reverb-stereo-delay-rate-jitter-speed'
    label.htmlFor = id
    label.textContent =
      'Bus — pre-reverb delay rate jitter speed (Hz; log slider; biased to slow wander)'
    const input = document.createElement('input')
    input.id = id
    input.type = 'range'
    input.min = '0'
    input.max = String(PRE_DELAY_JIT_SPEED_SLIDER_STEPS)
    input.step = '1'
    input.value = String(
      logHzToSliderPos(
        asteroidMusicDebug.preReverbStereoDelayRateJitterSpeedHz,
        PRE_DELAY_JIT_SPEED_HZ_LO,
        PRE_DELAY_JIT_SPEED_HZ_HI,
        PRE_DELAY_JIT_SPEED_SLIDER_STEPS,
      ),
    )
    const valSpan = document.createElement('span')
    valSpan.className = 'settings-value'
    valSpan.textContent = `${fmtPreDelayJitSpeedHz(asteroidMusicDebug.preReverbStereoDelayRateJitterSpeedHz)} Hz`
    input.addEventListener('input', () => {
      const hz = logSliderPosToHz(
        Number(input.value),
        PRE_DELAY_JIT_SPEED_HZ_LO,
        PRE_DELAY_JIT_SPEED_HZ_HI,
        PRE_DELAY_JIT_SPEED_SLIDER_STEPS,
      )
      asteroidMusicDebug.preReverbStereoDelayRateJitterSpeedHz = hz
      valSpan.textContent = `${fmtPreDelayJitSpeedHz(hz)} Hz`
      onAsteroidMusicDebugChange?.()
    })
    row.append(label, input, valSpan)
    parent.appendChild(row)
  }

  function appendBusLowpassHzLogSliderRow(parent: HTMLElement): void {
    const row = document.createElement('div')
    row.className = 'settings-row settings-debug-row'
    const label = document.createElement('label')
    label.className = 'settings-label'
    const id = 'settings-music-bus-lp-hz'
    label.htmlFor = id
    label.textContent = 'Bus — lowpass frequency (Hz, log slider; travel biased low)'
    const input = document.createElement('input')
    input.id = id
    input.type = 'range'
    input.min = '0'
    input.max = String(BUS_LP_HZ_SLIDER_STEPS)
    input.step = '1'
    input.value = String(busLpHzToSliderPos(asteroidMusicDebug.busLowPassHz))
    const valSpan = document.createElement('span')
    valSpan.className = 'settings-value'
    const fmt = (hz: number): string => `${Math.round(hz)} Hz`
    valSpan.textContent = fmt(asteroidMusicDebug.busLowPassHz)
    input.addEventListener('input', () => {
      const hz = busLpSliderPosToHz(Number(input.value))
      asteroidMusicDebug.busLowPassHz = hz
      valSpan.textContent = fmt(hz)
      onAsteroidMusicDebugChange?.()
    })
    row.append(label, input, valSpan)
    parent.appendChild(row)
  }

  function appendAmpLfoHzLogSliderRow(
    parent: HTMLElement,
    vi: number,
    voice: AsteroidMusicDebug['voices'][number],
  ): void {
    appendVoiceLogHzSliderRow(
      parent,
      `V${vi + 1} — amp LFO speed (Hz, log slider)`,
      `settings-music-v${vi}-lfo-hz`,
      AMP_LFO_HZ_LO,
      AMP_LFO_HZ_HI,
      () => voice.ampLfoHz,
      (hz) => {
        voice.ampLfoHz = hz
      },
    )
  }

  const musicMapSpecs: MusicSliderSpec[] = [
    {
      id: 'settings-music-influence',
      label: 'Voice count — influence rate (1/s)',
      min: 0.15,
      max: 14,
      step: 0.05,
      decimals: 2,
      read: () => asteroidMusicDebug.influenceRate,
      write: (n) => {
        asteroidMusicDebug.influenceRate = n
      },
    },
    {
      id: 'settings-music-activity-scale',
      label: 'Voice count — activity scale (× weighted voxels+sats)',
      min: 0.05,
      max: 2.2,
      step: 0.05,
      decimals: 2,
      read: () => asteroidMusicDebug.activityScale,
      write: (n) => {
        asteroidMusicDebug.activityScale = n
      },
    },
    {
      id: 'settings-music-min-voices',
      label: 'Voice count — min (0–12)',
      min: 0,
      max: 12,
      step: 1,
      decimals: 0,
      read: () => asteroidMusicDebug.minVoices,
      write: (n) => {
        asteroidMusicDebug.minVoices = Math.round(n)
      },
    },
    {
      id: 'settings-music-max-voices',
      label: 'Voice count — max (0–12)',
      min: 0,
      max: 12,
      step: 1,
      decimals: 0,
      read: () => asteroidMusicDebug.maxVoices,
      write: (n) => {
        asteroidMusicDebug.maxVoices = Math.round(n)
      },
    },
    {
      id: 'settings-music-avg-voice-lifetime',
      label: 'Voice count — average voice lifetime (s), 0 = fixed first-N voices',
      min: 0,
      max: 300,
      step: 1,
      decimals: 0,
      read: () => asteroidMusicDebug.averageVoiceLifetimeSec,
      write: (n) => {
        asteroidMusicDebug.averageVoiceLifetimeSec = n
      },
    },
    {
      id: 'settings-music-voice-lifetime-jitter',
      label: 'Voice count — lifetime jitter (0–1, × spread around mean; death rate per slot)',
      min: 0,
      max: 1,
      step: 0.05,
      decimals: 2,
      read: () => asteroidMusicDebug.voiceLifetimeJitter,
      write: (n) => {
        asteroidMusicDebug.voiceLifetimeJitter = n
      },
    },
    {
      id: 'settings-music-voxel-w',
      label: 'Activity weight — structure voxels',
      min: 0,
      max: 3,
      step: 0.05,
      decimals: 2,
      read: () => asteroidMusicDebug.voxelWeight,
      write: (n) => {
        asteroidMusicDebug.voxelWeight = n
      },
    },
    {
      id: 'settings-music-sat-w',
      label: 'Activity weight — satellites (each)',
      min: 0,
      max: 3,
      step: 0.05,
      decimals: 2,
      read: () => asteroidMusicDebug.satelliteWeight,
      write: (n) => {
        asteroidMusicDebug.satelliteWeight = n
      },
    },
    {
      id: 'settings-music-voice-fade-in',
      label: 'Voice level — fade-in duration (s), all voices',
      min: 0.05,
      max: 30,
      step: 0.05,
      decimals: 2,
      read: () => asteroidMusicDebug.voiceFadeInSec,
      write: (n) => {
        asteroidMusicDebug.voiceFadeInSec = n
      },
    },
    {
      id: 'settings-music-voice-fade-out',
      label: 'Voice level — fade-out duration (s), all voices',
      min: 0.05,
      max: 30,
      step: 0.05,
      decimals: 2,
      read: () => asteroidMusicDebug.voiceFadeOutSec,
      write: (n) => {
        asteroidMusicDebug.voiceFadeOutSec = n
      },
    },
    {
      id: 'settings-music-note-pitch-slide-jitter',
      label: 'Carrier pitch glide — extra duration (s) per voice (0…value, deterministic spread)',
      min: 0,
      max: 30,
      step: 0.1,
      decimals: 2,
      read: () => asteroidMusicDebug.notePitchSlideJitterSec,
      write: (n) => {
        asteroidMusicDebug.notePitchSlideJitterSec = n
      },
    },
    {
      id: 'settings-music-voice-pitch-spread',
      label: 'Voices — pitch spread (× static + note jitter; 1 = default)',
      min: VOICE_PITCH_SPREAD_MIN,
      max: VOICE_PITCH_SPREAD_MAX,
      step: 0.05,
      decimals: 2,
      read: () => asteroidMusicDebug.voicePitchSpread,
      write: (n) => {
        asteroidMusicDebug.voicePitchSpread = n
      },
    },
  ]

  for (const spec of musicMapSpecs) {
    appendMusicSliderRow(sectionAsteroidMusic, spec)
    if (spec.id === 'settings-music-voice-fade-out') {
      appendGlideBaseSliderRow(sectionAsteroidMusic)
    }
  }

  appendScaleClampModeRow(sectionAsteroidMusic)
  appendScaleCycleSection(sectionAsteroidMusic)

  const pitchBpRow = document.createElement('div')
  pitchBpRow.className = 'settings-row settings-debug-row'
  const pitchBpLabel = document.createElement('label')
  pitchBpLabel.className = 'settings-checkbox-label'
  const pitchBpInput = document.createElement('input')
  pitchBpInput.type = 'checkbox'
  pitchBpInput.id = 'settings-music-voice-pitch-bandpass'
  pitchBpInput.checked = asteroidMusicDebug.voicePitchBandpassEnabled
  const pitchBpText = document.createElement('span')
  pitchBpText.textContent =
    'Per-voice pitch-tracking bandpass (center follows carrier glide)'
  pitchBpLabel.append(pitchBpInput, pitchBpText)
  pitchBpRow.appendChild(pitchBpLabel)
  pitchBpInput.addEventListener('change', () => {
    asteroidMusicDebug.voicePitchBandpassEnabled = pitchBpInput.checked
    onAsteroidMusicDebugChange?.()
  })
  sectionAsteroidMusic.appendChild(pitchBpRow)

  appendMusicSliderRow(sectionAsteroidMusic, {
    id: 'settings-music-voice-pitch-bandpass-center',
    label: 'Pitch bandpass — center offset (semitones vs fundamental)',
    min: -36,
    max: 36,
    step: 1,
    decimals: 0,
    read: () => asteroidMusicDebug.voicePitchBandpassCenterSemitones,
    write: (n) => {
      asteroidMusicDebug.voicePitchBandpassCenterSemitones = Math.round(n)
    },
  })

  appendMusicSliderRow(sectionAsteroidMusic, {
    id: 'settings-music-voice-pitch-bandpass-q',
    label: 'Pitch bandpass — resonance (Q), macro for all voices',
    min: 0.25,
    max: 30,
    step: 0.05,
    decimals: 2,
    read: () => asteroidMusicDebug.voicePitchBandpassQ,
    write: (n) => {
      asteroidMusicDebug.voicePitchBandpassQ = n
    },
  })

  const macroMusicHeading = document.createElement('h4')
  macroMusicHeading.className = 'settings-debug-subheading'
  macroMusicHeading.style.marginTop = '14px'
  macroMusicHeading.textContent = 'Voice timbre — macros (all 12 voices)'
  sectionAsteroidMusic.appendChild(macroMusicHeading)
  const macroVoiceHint = document.createElement('p')
  macroVoiceHint.className = 'settings-debug-hint'
  macroVoiceHint.textContent =
    'Each control sets a center value; all voices are updated with small deterministic spread. Changing a macro overwrites per-voice tweaks below until you edit them again.'
  sectionAsteroidMusic.appendChild(macroVoiceHint)

  const applyVoiceMacros = (): void => {
    applyVoiceMacrosToVoices(asteroidMusicDebug, getMusicRootMidi())
  }

  const vm = () => asteroidMusicDebug.voiceMacros
  const macroMusicSpecs: MusicSliderSpec[] = [
    {
      id: 'settings-music-macro-amp',
      label: 'Macro — amp',
      min: 0,
      max: 0.85,
      step: 0.02,
      decimals: 2,
      read: () => vm().amp,
      write: (n) => {
        vm().amp = n
        applyVoiceMacros()
      },
    },
    {
      id: 'settings-music-macro-lfo-depth',
      label: 'Macro — amp LFO depth',
      min: 0,
      max: 1.6,
      step: 0.02,
      decimals: 2,
      read: () => vm().ampLfoDepth,
      write: (n) => {
        vm().ampLfoDepth = n
        applyVoiceMacros()
      },
    },
    {
      id: 'settings-music-macro-speedmod-depth',
      label: 'Macro — amp LFO speed mod depth (Hz)',
      min: 0,
      max: 5,
      step: 0.05,
      decimals: 2,
      read: () => vm().ampLfoSpeedModDepthHz,
      write: (n) => {
        vm().ampLfoSpeedModDepthHz = n
        applyVoiceMacros()
      },
    },
    {
      id: 'settings-music-macro-speedmod-hz',
      label: 'Macro — amp LFO speed LFO (Hz)',
      min: 0.02,
      max: 0.35,
      step: 0.005,
      decimals: 3,
      read: () => vm().ampLfoSpeedModHz,
      write: (n) => {
        vm().ampLfoSpeedModHz = n
        applyVoiceMacros()
      },
    },
    {
      id: 'settings-music-macro-lfo2-depth',
      label: 'Macro — amp LFO 2 depth',
      min: 0,
      max: 1.6,
      step: 0.02,
      decimals: 2,
      read: () => vm().ampLfo2Depth,
      write: (n) => {
        vm().ampLfo2Depth = n
        applyVoiceMacros()
      },
    },
    {
      id: 'settings-music-macro-speedmod2-depth',
      label: 'Macro — amp LFO 2 speed mod depth (Hz)',
      min: 0,
      max: 5,
      step: 0.05,
      decimals: 2,
      read: () => vm().ampLfo2SpeedModDepthHz,
      write: (n) => {
        vm().ampLfo2SpeedModDepthHz = n
        applyVoiceMacros()
      },
    },
    {
      id: 'settings-music-macro-speedmod2-hz',
      label: 'Macro — amp LFO 2 speed LFO (Hz)',
      min: 0.02,
      max: 0.35,
      step: 0.005,
      decimals: 3,
      read: () => vm().ampLfo2SpeedModHz,
      write: (n) => {
        vm().ampLfo2SpeedModHz = n
        applyVoiceMacros()
      },
    },
    {
      id: 'settings-music-macro-pan-depth',
      label: 'Macro — pan LFO depth (stereo width)',
      min: 0,
      max: 0.95,
      step: 0.02,
      decimals: 2,
      read: () => vm().panLfoDepth,
      write: (n) => {
        vm().panLfoDepth = n
        applyVoiceMacros()
      },
    },
    {
      id: 'settings-music-macro-note-offset',
      label: 'Macro — note offset (semitones; each voice gets small jitter)',
      min: -12,
      max: 24,
      step: 1,
      decimals: 0,
      read: () => vm().noteOffset,
      write: (n) => {
        vm().noteOffset = Math.round(n)
        applyVoiceMacros()
      },
    },
    {
      id: 'settings-music-macro-note-jitter-depth',
      label: 'Macro — note offset jitter depth (semitones; 0 = static spread only)',
      min: 0,
      max: 6,
      step: 1,
      decimals: 0,
      read: () => vm().noteJitterDepthSemitones,
      write: (n) => {
        vm().noteJitterDepthSemitones = n
        applyVoiceMacros()
      },
    },
    {
      id: 'settings-music-macro-phrase-avg-length',
      label: 'Macro — music phrase avg length (sec)',
      min: PHRASE_AVG_LENGTH_MIN,
      max: PHRASE_AVG_LENGTH_MAX,
      step: 0.05,
      decimals: 2,
      read: () => vm().phraseAvgLengthSec,
      write: (n) => {
        vm().phraseAvgLengthSec = n
        applyVoiceMacros()
      },
    },
    {
      id: 'settings-music-macro-phrase-depth',
      label: 'Macro — music phrase depth (jitter boost; 0 = off)',
      min: 0,
      max: PHRASE_DEPTH_MAX,
      step: 0.05,
      decimals: 2,
      read: () => vm().phraseDepth,
      write: (n) => {
        vm().phraseDepth = n
        applyVoiceMacros()
      },
    },
    {
      id: 'settings-music-macro-rate-jitter-depth',
      label: 'Macro — LFO/pan rate jitter depth (0 = static spread only)',
      min: 0,
      max: 0.5,
      step: 0.02,
      decimals: 2,
      read: () => vm().rateJitterDepth,
      write: (n) => {
        vm().rateJitterDepth = n
        applyVoiceMacros()
      },
    },
  ]
  for (const spec of macroMusicSpecs) {
    appendMusicSliderRow(sectionAsteroidMusic, spec)
    if (spec.id === 'settings-music-macro-note-jitter-depth') {
      appendPhraseRateLogHzSliderRow(
        sectionAsteroidMusic,
        'Macro — music phrase rate (starts/sec, log; 0 = off)',
        'settings-music-macro-phrase-rate-hz',
        PHRASE_RATE_HZ_MIN,
        PHRASE_RATE_HZ_MAX,
        () => vm().phraseRateHz,
        (hz) => {
          vm().phraseRateHz = hz
          applyVoiceMacros()
        },
      )
      appendMusicSliderRow(sectionAsteroidMusic, {
        id: 'settings-music-macro-phrase-rate-jitter-depth',
        label: 'Macro — music phrase rate jitter depth (0 = static phrase rate)',
        min: 0,
        max: 0.5,
        step: 0.02,
        decimals: 2,
        read: () => vm().phraseRateJitterDepth,
        write: (n) => {
          vm().phraseRateJitterDepth = n
          applyVoiceMacros()
        },
      })
      appendVoiceLogHzSliderRow(
        sectionAsteroidMusic,
        'Macro — music phrase rate jitter rate (Hz, log slider; slow)',
        'settings-music-macro-phrase-rate-jitter-hz',
        JITTER_HZ_LO,
        JITTER_HZ_HI,
        () => vm().phraseRateJitterHz,
        (hz) => {
          vm().phraseRateJitterHz = hz
          applyVoiceMacros()
        },
      )
      appendMacroJitterModeRow(
        sectionAsteroidMusic,
        'Macro — music phrase rate jitter mode',
        'settings-music-macro-phrase-rate-jitter-mode',
        () => vm().phraseRateJitterMode,
        (m) => {
          vm().phraseRateJitterMode = m
          applyVoiceMacros()
        },
      )
    }
  }
  appendVoiceLogHzSliderRow(
    sectionAsteroidMusic,
    'Macro — note offset jitter rate (Hz, log slider)',
    'settings-music-macro-note-jitter-hz',
    NOTE_JITTER_HZ_LO,
    NOTE_JITTER_HZ_HI,
    () => vm().noteJitterHz,
    (hz) => {
      vm().noteJitterHz = hz
      applyVoiceMacros()
    },
  )
  appendMacroJitterModeRow(
    sectionAsteroidMusic,
    'Macro — note offset jitter mode',
    'settings-music-macro-note-jitter-mode',
    () => vm().noteJitterMode,
    (m) => {
      vm().noteJitterMode = m
      applyVoiceMacros()
    },
  )
  appendMusicSliderRow(sectionAsteroidMusic, {
    id: 'settings-music-macro-note-jitter-rate-jitter-depth',
    label: 'Macro — note jitter rate jitter depth (0 = static note jitter rate)',
    min: 0,
    max: 0.5,
    step: 0.02,
    decimals: 2,
    read: () => vm().noteJitterRateJitterDepth,
    write: (n) => {
      vm().noteJitterRateJitterDepth = n
      applyVoiceMacros()
    },
  })
  appendVoiceLogHzSliderRow(
    sectionAsteroidMusic,
    'Macro — note jitter rate jitter rate (Hz, log slider; slow)',
    'settings-music-macro-note-jitter-rate-jitter-hz',
    JITTER_HZ_LO,
    JITTER_HZ_HI,
    () => vm().noteJitterRateJitterHz,
    (hz) => {
      vm().noteJitterRateJitterHz = hz
      applyVoiceMacros()
    },
  )
  appendMacroJitterModeRow(
    sectionAsteroidMusic,
    'Macro — note jitter rate jitter mode',
    'settings-music-macro-note-jitter-rate-jitter-mode',
    () => vm().noteJitterRateJitterMode,
    (m) => {
      vm().noteJitterRateJitterMode = m
      applyVoiceMacros()
    },
  )
  appendVoiceLogHzSliderRow(
    sectionAsteroidMusic,
    'Macro — rate jitter rate (Hz, log slider; slow)',
    'settings-music-macro-rate-jitter-hz',
    JITTER_HZ_LO,
    JITTER_HZ_HI,
    () => vm().rateJitterHz,
    (hz) => {
      vm().rateJitterHz = hz
      applyVoiceMacros()
    },
  )
  appendMacroJitterModeRow(
    sectionAsteroidMusic,
    'Macro — rate jitter mode',
    'settings-music-macro-rate-jitter-mode',
    () => vm().rateJitterMode,
    (m) => {
      vm().rateJitterMode = m
      applyVoiceMacros()
    },
  )
  appendVoiceLogHzSliderRow(
    sectionAsteroidMusic,
    'Macro — amp LFO speed (Hz, log slider)',
    'settings-music-macro-lfo-hz',
    AMP_LFO_HZ_LO,
    AMP_LFO_HZ_HI,
    () => vm().ampLfoHz,
    (hz) => {
      vm().ampLfoHz = hz
      applyVoiceMacros()
    },
  )
  appendVoiceLogHzSliderRow(
    sectionAsteroidMusic,
    'Macro — amp LFO 2 speed (Hz, log slider)',
    'settings-music-macro-lfo2-hz',
    AMP_LFO_HZ_LO,
    AMP_LFO_HZ_HI,
    () => vm().ampLfo2Hz,
    (hz) => {
      vm().ampLfo2Hz = hz
      applyVoiceMacros()
    },
  )
  appendVoiceLogHzSliderRow(
    sectionAsteroidMusic,
    'Macro — pan LFO speed (Hz, log slider)',
    'settings-music-macro-pan-lfo-hz',
    PAN_LFO_HZ_LO,
    PAN_LFO_HZ_HI,
    () => vm().panLfoHz,
    (hz) => {
      vm().panLfoHz = hz
      applyVoiceMacros()
    },
  )

  const perVoiceOuter = document.createElement('details')
  perVoiceOuter.className = 'settings-details settings-music-voice-details'
  const perVoiceSummary = document.createElement('summary')
  perVoiceSummary.className = 'settings-details-summary'
  perVoiceSummary.textContent = 'Asteroid music — per-voice overrides (advanced)'
  perVoiceOuter.appendChild(perVoiceSummary)

  for (let vi = 0; vi < ASTEROID_MUSIC_VOICE_COUNT; vi++) {
    const det = document.createElement('details')
    det.className = 'settings-details settings-music-voice-details'
    const sum = document.createElement('summary')
    sum.className = 'settings-details-summary'
    sum.textContent = `Voice ${vi + 1}`
    det.appendChild(sum)
    const voice = asteroidMusicDebug.voices[vi]
    const voiceSpecs: MusicSliderSpec[] = [
      {
        id: `settings-music-v${vi}-amp`,
        label: `V${vi + 1} — amp`,
        min: 0,
        max: 0.85,
        step: 0.02,
        decimals: 2,
        read: () => voice.amp,
        write: (n) => {
          voice.amp = n
        },
      },
      {
        id: `settings-music-v${vi}-lfo-depth`,
        label: `V${vi + 1} — amp LFO depth`,
        min: 0,
        max: 1.6,
        step: 0.02,
        decimals: 2,
        read: () => voice.ampLfoDepth,
        write: (n) => {
          voice.ampLfoDepth = n
        },
      },
      {
        id: `settings-music-v${vi}-speedmod-depth`,
        label: `V${vi + 1} — amp LFO speed mod depth (Hz)`,
        min: 0,
        max: 5,
        step: 0.05,
        decimals: 2,
        read: () => voice.ampLfoSpeedModDepthHz,
        write: (n) => {
          voice.ampLfoSpeedModDepthHz = n
        },
      },
      {
        id: `settings-music-v${vi}-speedmod-hz`,
        label: `V${vi + 1} — amp LFO speed LFO (Hz)`,
        min: 0.02,
        max: 0.35,
        step: 0.005,
        decimals: 3,
        read: () => voice.ampLfoSpeedModHz,
        write: (n) => {
          voice.ampLfoSpeedModHz = n
        },
      },
      {
        id: `settings-music-v${vi}-lfo2-depth`,
        label: `V${vi + 1} — amp LFO 2 depth`,
        min: 0,
        max: 1.6,
        step: 0.02,
        decimals: 2,
        read: () => voice.ampLfo2Depth,
        write: (n) => {
          voice.ampLfo2Depth = n
        },
      },
      {
        id: `settings-music-v${vi}-speedmod2-depth`,
        label: `V${vi + 1} — amp LFO 2 speed mod depth (Hz)`,
        min: 0,
        max: 5,
        step: 0.05,
        decimals: 2,
        read: () => voice.ampLfo2SpeedModDepthHz,
        write: (n) => {
          voice.ampLfo2SpeedModDepthHz = n
        },
      },
      {
        id: `settings-music-v${vi}-speedmod2-hz`,
        label: `V${vi + 1} — amp LFO 2 speed LFO (Hz)`,
        min: 0.02,
        max: 0.35,
        step: 0.005,
        decimals: 3,
        read: () => voice.ampLfo2SpeedModHz,
        write: (n) => {
          voice.ampLfo2SpeedModHz = n
        },
      },
      {
        id: `settings-music-v${vi}-pan-depth`,
        label: `V${vi + 1} — pan LFO depth (stereo width)`,
        min: 0,
        max: 0.95,
        step: 0.02,
        decimals: 2,
        read: () => voice.panLfoDepth,
        write: (n) => {
          voice.panLfoDepth = n
        },
      },
      {
        id: `settings-music-v${vi}-note`,
        label: `V${vi + 1} — note (semitones, then scale snap)`,
        min: -12,
        max: 24,
        step: 1,
        decimals: 0,
        read: () => voice.note,
        write: (n) => {
          voice.note = Math.round(n)
        },
      },
    ]
    for (const spec of voiceSpecs) {
      appendMusicSliderRow(det, spec)
    }
    appendAmpLfoHzLogSliderRow(det, vi, voice)
    appendVoiceLogHzSliderRow(
      det,
      `V${vi + 1} — amp LFO 2 speed (Hz, log slider)`,
      `settings-music-v${vi}-lfo2-hz`,
      AMP_LFO_HZ_LO,
      AMP_LFO_HZ_HI,
      () => voice.ampLfo2Hz,
      (hz) => {
        voice.ampLfo2Hz = hz
      },
    )
    appendVoiceLogHzSliderRow(
      det,
      `V${vi + 1} — pan LFO speed (Hz, log slider)`,
      `settings-music-v${vi}-pan-lfo-hz`,
      PAN_LFO_HZ_LO,
      PAN_LFO_HZ_HI,
      () => voice.panLfoHz,
      (hz) => {
        voice.panLfoHz = hz
      },
    )
    perVoiceOuter.appendChild(det)
  }
  sectionAsteroidMusic.appendChild(perVoiceOuter)

  function appendMusicBusSubheading(text: string): void {
    const h = document.createElement('h4')
    h.className = 'settings-debug-subheading'
    h.style.marginTop = '14px'
    h.textContent = text
    sectionAsteroidMusic.appendChild(h)
  }

  const musicBusChorusSpecs: MusicSliderSpec[] = [
    {
      id: 'settings-music-chorus-mix',
      label: 'Bus — chorus mix (0 = dry)',
      min: 0,
      max: 1,
      step: 0.02,
      decimals: 2,
      read: () => asteroidMusicDebug.chorusMix,
      write: (n) => {
        asteroidMusicDebug.chorusMix = n
      },
    },
    {
      id: 'settings-music-chorus-rate',
      label: 'Bus — chorus LFO rate (Hz)',
      min: 0.05,
      max: 6,
      step: 0.05,
      decimals: 2,
      read: () => asteroidMusicDebug.chorusRateHz,
      write: (n) => {
        asteroidMusicDebug.chorusRateHz = n
      },
    },
    {
      id: 'settings-music-chorus-depth',
      label: 'Bus — chorus depth (ms)',
      min: 0,
      max: 20,
      step: 0.1,
      decimals: 1,
      read: () => asteroidMusicDebug.chorusDepthMs,
      write: (n) => {
        asteroidMusicDebug.chorusDepthMs = n
      },
    },
    {
      id: 'settings-music-chorus-base',
      label: 'Bus — chorus delay base (ms)',
      min: 4,
      max: 45,
      step: 0.5,
      decimals: 1,
      read: () => asteroidMusicDebug.chorusDelayBaseMs,
      write: (n) => {
        asteroidMusicDebug.chorusDelayBaseMs = n
      },
    },
  ]

  const musicBusPreSpecs: MusicSliderSpec[] = [
    {
      id: 'settings-music-pre-drive',
      label: 'Bus — pre-filter drive (into waveshaper)',
      min: 0.2,
      max: 6,
      step: 0.05,
      decimals: 2,
      read: () => asteroidMusicDebug.busPreDrive,
      write: (n) => {
        asteroidMusicDebug.busPreDrive = n
      },
    },
  ]

  const musicBusFilterSpecs: MusicSliderSpec[] = [
    {
      id: 'settings-music-bus-lp-q',
      label: 'Bus — lowpass Q',
      min: 0.1,
      max: 18,
      step: 0.1,
      decimals: 2,
      read: () => asteroidMusicDebug.busLowPassQ,
      write: (n) => {
        asteroidMusicDebug.busLowPassQ = n
      },
    },
    {
      id: 'settings-music-bus-lp-lfo-hz',
      label: 'Bus — lowpass LFO rate (Hz; independent of voice tremolo)',
      min: 0.0001,
      max: 4,
      step: 0.0005,
      decimals: 4,
      read: () => asteroidMusicDebug.busLowPassLfoHz,
      write: (n) => {
        asteroidMusicDebug.busLowPassLfoHz = n
      },
    },
    {
      id: 'settings-music-bus-lp-lfo-depth',
      label: 'Bus — lowpass LFO depth (Hz peak; 0 = off)',
      min: 0,
      max: 8000,
      step: 10,
      decimals: 0,
      read: () => asteroidMusicDebug.busLowPassLfoDepthHz,
      write: (n) => {
        asteroidMusicDebug.busLowPassLfoDepthHz = n
      },
    },
    {
      id: 'settings-music-bus-lp-lfo-speed-mod-hz',
      label: 'Bus — lowpass LFO speed drift rate (Hz)',
      min: 0.02,
      max: 0.35,
      step: 0.005,
      decimals: 3,
      read: () => asteroidMusicDebug.busLowPassLfoSpeedModHz,
      write: (n) => {
        asteroidMusicDebug.busLowPassLfoSpeedModHz = n
      },
    },
    {
      id: 'settings-music-bus-lp-lfo-speed-mod-depth',
      label: 'Bus — lowpass LFO speed drift depth (Hz)',
      min: 0,
      max: 0.12,
      step: 0.001,
      decimals: 4,
      read: () => asteroidMusicDebug.busLowPassLfoSpeedModDepthHz,
      write: (n) => {
        asteroidMusicDebug.busLowPassLfoSpeedModDepthHz = n
      },
    },
  ]

  const musicBusPreReverbStereoDelaySpecs: MusicSliderSpec[] = [
    {
      id: 'settings-music-pre-reverb-stereo-delay-time',
      label: 'Bus — pre-reverb stereo delay time (ms; L/R; up to 16 s)',
      min: 1,
      max: 16000,
      step: 1,
      decimals: 0,
      read: () => asteroidMusicDebug.preReverbStereoDelayTimeMs,
      write: (n) => {
        asteroidMusicDebug.preReverbStereoDelayTimeMs = n
      },
    },
    {
      id: 'settings-music-pre-reverb-stereo-delay-feedback',
      label: 'Bus — pre-reverb stereo delay feedback (HPF in loop)',
      min: 0,
      max: 0.92,
      step: 0.02,
      decimals: 2,
      read: () => asteroidMusicDebug.preReverbStereoDelayFeedback,
      write: (n) => {
        asteroidMusicDebug.preReverbStereoDelayFeedback = n
      },
    },
    {
      id: 'settings-music-pre-reverb-stereo-delay-hpf',
      label: 'Bus — pre-reverb stereo delay feedback highpass (Hz)',
      min: 20,
      max: 8000,
      step: 1,
      decimals: 0,
      read: () => asteroidMusicDebug.preReverbStereoDelayHighpassHz,
      write: (n) => {
        asteroidMusicDebug.preReverbStereoDelayHighpassHz = n
      },
    },
    {
      id: 'settings-music-pre-reverb-stereo-delay-lpf',
      label: 'Bus — pre-reverb stereo delay feedback lowpass (Hz)',
      min: 200,
      max: 20000,
      step: 10,
      decimals: 0,
      read: () => asteroidMusicDebug.preReverbStereoDelayLowpassHz,
      write: (n) => {
        asteroidMusicDebug.preReverbStereoDelayLowpassHz = n
      },
    },
    {
      id: 'settings-music-pre-reverb-stereo-delay-volume',
      label: 'Bus — pre-reverb stereo delay send (0 = delay off; direct wet unchanged)',
      min: 0,
      max: 1,
      step: 0.02,
      decimals: 2,
      read: () => asteroidMusicDebug.preReverbStereoDelayVolume,
      write: (n) => {
        asteroidMusicDebug.preReverbStereoDelayVolume = n
      },
    },
    {
      id: 'settings-music-pre-reverb-stereo-delay-2-time',
      label: 'Bus — pre-reverb stereo delay tap 2 time (ms; L/R; parallel loop, up to 16 s)',
      min: 1,
      max: 16000,
      step: 1,
      decimals: 0,
      read: () => asteroidMusicDebug.preReverbStereoDelay2TimeMs,
      write: (n) => {
        asteroidMusicDebug.preReverbStereoDelay2TimeMs = n
      },
    },
    {
      id: 'settings-music-pre-reverb-stereo-delay-2-volume',
      label: 'Bus — pre-reverb stereo delay tap 2 send (0 = tap off; shares feedback/HPF/LPF with tap 1)',
      min: 0,
      max: 1,
      step: 0.02,
      decimals: 2,
      read: () => asteroidMusicDebug.preReverbStereoDelay2Volume,
      write: (n) => {
        asteroidMusicDebug.preReverbStereoDelay2Volume = n
      },
    },
    {
      id: 'settings-music-pre-reverb-stereo-delay-rate-jitter-depth',
      label: 'Bus — pre-reverb delay rate jitter depth (ms peak; both taps; up to 8 s)',
      min: 0,
      max: 8000,
      step: 1,
      decimals: 0,
      read: () => asteroidMusicDebug.preReverbStereoDelayRateJitterDepthMs,
      write: (n) => {
        asteroidMusicDebug.preReverbStereoDelayRateJitterDepthMs = n
      },
    },
    {
      id: 'settings-music-pre-reverb-stereo-delay-rate-jitter-randomness',
      label: 'Bus — pre-reverb delay rate jitter randomness (wander-rate drift; 0–1)',
      min: 0,
      max: 1,
      step: 0.02,
      decimals: 2,
      read: () => asteroidMusicDebug.preReverbStereoDelayRateJitterRandomness,
      write: (n) => {
        asteroidMusicDebug.preReverbStereoDelayRateJitterRandomness = n
      },
    },
  ]

  const musicBusReverbSpecs: MusicSliderSpec[] = [
    {
      id: 'settings-music-reverb-mix',
      label: 'Bus — reverb wet/dry mix (0 = all dry; 1 = wet only)',
      min: 0,
      max: 1,
      step: 0.02,
      decimals: 2,
      read: () => asteroidMusicDebug.reverbMix,
      write: (n) => {
        asteroidMusicDebug.reverbMix = n
      },
    },
    {
      id: 'settings-music-reverb-wet-trim',
      label: 'Bus — reverb wet trim (scales wet level; lower if IR is loud)',
      min: 0,
      max: 1,
      step: 0.02,
      decimals: 2,
      read: () => asteroidMusicDebug.reverbWetTrim,
      write: (n) => {
        asteroidMusicDebug.reverbWetTrim = n
      },
    },
    {
      id: 'settings-music-reverb-ir-duration',
      label: 'Bus — IR buffer length (s; regenerates impulse)',
      min: 0.35,
      max: 6,
      step: 0.05,
      decimals: 2,
      read: () => asteroidMusicDebug.reverbIrDurationSec,
      write: (n) => {
        asteroidMusicDebug.reverbIrDurationSec = n
      },
    },
    {
      id: 'settings-music-reverb-ir-decay',
      label: 'Bus — IR decay rate (higher = shorter tail; regenerates impulse)',
      min: 0.4,
      max: 24,
      step: 0.05,
      decimals: 2,
      read: () => asteroidMusicDebug.reverbIrDecayPerSec,
      write: (n) => {
        asteroidMusicDebug.reverbIrDecayPerSec = n
      },
    },
    {
      id: 'settings-music-reverb-pre-delay',
      label: 'Bus — pre-delay before reverb (ms, wet path only)',
      min: 0,
      max: 150,
      step: 1,
      decimals: 0,
      read: () => asteroidMusicDebug.reverbPreDelayMs,
      write: (n) => {
        asteroidMusicDebug.reverbPreDelayMs = n
      },
    },
    {
      id: 'settings-music-reverb-ir-decorrelate',
      label: 'Bus — IR stereo decorrelation (0 = mono; 1 = wide)',
      min: 0,
      max: 1,
      step: 0.02,
      decimals: 2,
      read: () => asteroidMusicDebug.reverbIrDecorrelate,
      write: (n) => {
        asteroidMusicDebug.reverbIrDecorrelate = n
      },
    },
    {
      id: 'settings-music-reverb-ir-damping',
      label: 'Bus — IR high-frequency damping (0 = bright; 1 = dark tail)',
      min: 0,
      max: 1,
      step: 0.02,
      decimals: 2,
      read: () => asteroidMusicDebug.reverbIrDamping,
      write: (n) => {
        asteroidMusicDebug.reverbIrDamping = n
      },
    },
    {
      id: 'settings-music-reverb-ir-early-density',
      label: 'Bus — IR early reflection density (sparse taps in first ~80 ms)',
      min: 0,
      max: 1,
      step: 0.02,
      decimals: 2,
      read: () => asteroidMusicDebug.reverbIrEarlyDensity,
      write: (n) => {
        asteroidMusicDebug.reverbIrEarlyDensity = n
      },
    },
    {
      id: 'settings-music-reverb-wet-fb-delay',
      label: 'Bus — wet feedback delay (ms; smear loop after convolver)',
      min: 4,
      max: 120,
      step: 1,
      decimals: 0,
      read: () => asteroidMusicDebug.reverbWetFeedbackMs,
      write: (n) => {
        asteroidMusicDebug.reverbWetFeedbackMs = n
      },
    },
    {
      id: 'settings-music-reverb-wet-fb',
      label: 'Bus — wet feedback amount (0 = off)',
      min: 0,
      max: 0.92,
      step: 0.02,
      decimals: 2,
      read: () => asteroidMusicDebug.reverbWetFeedback,
      write: (n) => {
        asteroidMusicDebug.reverbWetFeedback = n
      },
    },
    {
      id: 'settings-music-reverb-normalize',
      label: 'Bus — convolver normalize IR energy (0 = off; 1 = on)',
      min: 0,
      max: 1,
      step: 1,
      decimals: 0,
      read: () => (asteroidMusicDebug.reverbConvolverNormalize ? 1 : 0),
      write: (n) => {
        asteroidMusicDebug.reverbConvolverNormalize = n >= 0.5
      },
    },
  ]

  const musicBusWetSatSpecs: MusicSliderSpec[] = [
    {
      id: 'settings-music-wet-sat',
      label: 'Bus — wet saturation (0=linear, post-reverb)',
      min: 0,
      max: 1,
      step: 0.02,
      decimals: 2,
      read: () => asteroidMusicDebug.busWetSaturatorAmount,
      write: (n) => {
        asteroidMusicDebug.busWetSaturatorAmount = n
      },
    },
  ]

  appendMusicBusSubheading('Music bus — chorus')
  for (const spec of musicBusChorusSpecs) {
    appendMusicSliderRow(sectionAsteroidMusic, spec)
  }
  appendMusicBusSubheading('Music bus — pre-filter drive')
  for (const spec of musicBusPreSpecs) {
    appendMusicSliderRow(sectionAsteroidMusic, spec)
  }
  appendMusicBusSubheading('Music bus — filter')
  const musicBusFilterHint = document.createElement('p')
  musicBusFilterHint.className = 'settings-debug-hint'
  musicBusFilterHint.textContent =
    'Pure sine voices only change when cutoff is near or below the note; raise pre-filter drive to add harmonics, then sweep Hz. The Hz slider is logarithmic so most of its range maps to lower cutoffs.'
  sectionAsteroidMusic.appendChild(musicBusFilterHint)
  appendBusLowpassHzLogSliderRow(sectionAsteroidMusic)
  for (const spec of musicBusFilterSpecs) {
    appendMusicSliderRow(sectionAsteroidMusic, spec)
  }
  appendMusicBusSubheading('Music bus — pre-reverb stereo delay')
  const musicBusPreReverbStereoDelayHint = document.createElement('p')
  musicBusPreReverbStereoDelayHint.className = 'settings-debug-hint'
  musicBusPreReverbStereoDelayHint.textContent =
    'Stereo delay sits on the wet path after the bus lowpass and before the short reverb pre-delay and convolver. Feedback runs HPF then LPF (darken repeats). Direct wet is always mixed in; raise send to add delayed taps. Tap 2 is a second parallel L/R loop with a longer allowed time; it uses the same feedback and filter sliders as tap 1. Rate jitter adds slow delay-time wander per tap (separate LFOs, unsynced); the wander-speed slider is logarithmic toward the slow end; randomness modulates how much each wander rate drifts over time.'
  sectionAsteroidMusic.appendChild(musicBusPreReverbStereoDelayHint)
  for (const spec of musicBusPreReverbStereoDelaySpecs) {
    appendMusicSliderRow(sectionAsteroidMusic, spec)
    if (spec.id === 'settings-music-pre-reverb-stereo-delay-rate-jitter-depth') {
      appendPreDelayJitSpeedLogSliderRow(sectionAsteroidMusic)
    }
  }
  appendMusicBusSubheading('Music bus — reverb')
  const musicBusReverbHint = document.createElement('p')
  musicBusReverbHint.className = 'settings-debug-hint'
  musicBusReverbHint.textContent =
    'Impulse buffers regenerate when IR length, decay, or density sliders change. Pre-delay is wet-only; feedback loops the wet path after the convolver (main wet path stays direct for zero feedback).'
  sectionAsteroidMusic.appendChild(musicBusReverbHint)
  for (const spec of musicBusReverbSpecs) {
    appendMusicSliderRow(sectionAsteroidMusic, spec)
  }
  appendMusicBusSubheading('Music bus — wet saturation')
  for (const spec of musicBusWetSatSpecs) {
    appendMusicSliderRow(sectionAsteroidMusic, spec)
  }

  sectionGameBalance.appendChild(resetBalanceBtn)

  let tipsRow: HTMLDivElement | undefined
  if (onOpenTips) {
    const openTips = onOpenTips
    tipsRow = document.createElement('div')
    tipsRow.className = 'settings-row'
    const tipsBtn = document.createElement('button')
    tipsBtn.type = 'button'
    tipsBtn.className = 'settings-secondary'
    tipsBtn.title = 'Game tips'
    tipsBtn.textContent = 'Tips'
    tipsBtn.setAttribute('aria-label', 'Tips')
    tipsBtn.addEventListener('click', () => {
      openTips()
    })
    tipsRow.appendChild(tipsBtn)
  }

  panel.append(
    heading,
    ...(tipsRow ? [tipsRow] : []),
    regenBtn,
    azRow,
    elRow,
    musicVolRow,
    discoveryAutoResolveRow,
    matterHudCompactRow,
    debugDetails,
  )
  topBar.appendChild(toggle)
  overlay.append(topBar, panel)
  container.appendChild(overlay)

  function readAngles(): { az: number; el: number } {
    const el = Number(elevationInput.value)
    if (sunLightDebug.rotateSunAzimuth) {
      return { az: getSunAnglesForLight().az, el }
    }
    return { az: Number(azimuthInput.value), el }
  }

  function emitLight(): void {
    const { az, el } = readAngles()
    onLightAngleChange(az, el)
  }

  function setOpen(open: boolean): void {
    panel.hidden = !open
    toggle.setAttribute('aria-expanded', String(open))
  }

  toggle.addEventListener('click', () => {
    setOpen(panel.hidden)
  })

  regenBtn.addEventListener('click', () => {
    onRegenerate()
  })

  azimuthInput.addEventListener('input', () => {
    azValue.textContent = `${azimuthInput.value}°`
    emitLight()
  })

  elevationInput.addEventListener('input', () => {
    elValue.textContent = `${elevationInput.value}°`
    emitLight()
  })

  function syncSunRotationSpeed(): void {
    sunSpeedInput.value = String(sunLightDebug.rotationDegPerSec)
    sunSpeedValue.textContent = sunLightDebug.rotationDegPerSec.toFixed(2)
  }

  emitLight()
  setAzimuthSliderDisabled(sunLightDebug.rotateSunAzimuth)
  sunSpeedInput.disabled = !sunLightDebug.rotateSunAzimuth

  return { setAzimuthSliderDisabled, syncAzimuthSlider, syncLightAngleSliders, syncSunRotationSpeed }
}
