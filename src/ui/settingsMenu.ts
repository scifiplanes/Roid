import {
  type GameBalance,
  gameBalance,
  getBalanceAutoSaveToFile,
  patchGameBalance,
  persistGameBalanceToProjectNow,
  resetGameBalance,
  setBalanceAutoSaveToFile,
} from '../game/gameBalance'
import {
  type AsteroidMusicDebug,
  ASTEROID_MUSIC_VOICE_COUNT,
  applyVoiceMacrosToVoices,
} from '../game/asteroidMusicDebug'
import type { SunLightDebug } from '../game/sunLightDebug'
import type { ScanVisualizationDebug } from '../game/scanVisualizationDebug'
import type { AudioMasterDebug } from '../game/audioMasterDebug'
import {
  getMusicAutoSaveToFile,
  persistAsteroidMusicDebugToProjectNow,
  setMusicAutoSaveToFile,
} from '../game/asteroidMusicPersist'

export interface SettingsMenuOptions {
  /** Optional control(s) to the left of the Settings (F10) button (e.g. overlays menu). */
  leadingActions?: HTMLElement
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
  /** Mutable debug state; sliders write into this object. */
  asteroidMusicDebug: AsteroidMusicDebug
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
    label: 'Dross mass per removed voxel (voxel-equivalents before dross mass mult)',
    min: 0.02,
    max: 2,
    step: 0.02,
  },
  { key: 'drossMassMult', label: 'Dross spawn mass multiplier', min: 0.1, max: 4, step: 0.05 },
  {
    key: 'drossReplicatorSpawnChance',
    label: 'Replicator dross spawn chance (per rock HP tick; independent roll)',
    min: 0,
    max: 1,
    step: 0.02,
  },
  {
    key: 'drossMassPerReplicatorHp',
    label: 'Replicator dross mass when spawn succeeds (voxel-equiv before dross mass mult)',
    min: 0.001,
    max: 2,
    step: 0.005,
  },
  {
    key: 'drossCollectionRatePerSatellitePerSec',
    label: 'Dross collection rate per collector satellite (voxel-equiv / sec)',
    min: 0.001,
    max: 2,
    step: 0.005,
  },
  { key: 'drossCollectionMult', label: 'Dross collection rate multiplier', min: 0.1, max: 4, step: 0.05 },
  {
    key: 'drossFogDensityPerMass',
    label: 'Dross fog density per total mass (FogExp2; 0 = off)',
    min: 0,
    max: 0.002,
    step: 0.00002,
    valueDecimals: 5,
  },
  {
    key: 'drossFogDensityMax',
    label: 'Dross fog density cap (FogExp2 max)',
    min: 0,
    max: 0.12,
    step: 0.002,
    valueDecimals: 4,
  },
  {
    key: 'drossFogColorR',
    label: 'Dross fog color R (sRGB; light = bright haze)',
    min: 0,
    max: 1,
    step: 0.02,
    valueDecimals: 2,
  },
  {
    key: 'drossFogColorG',
    label: 'Dross fog color G (sRGB)',
    min: 0,
    max: 1,
    step: 0.02,
    valueDecimals: 2,
  },
  {
    key: 'drossFogColorB',
    label: 'Dross fog color B (sRGB)',
    min: 0,
    max: 1,
    step: 0.02,
    valueDecimals: 2,
  },
  {
    key: 'discoveryChanceOnRockDepthScanner',
    label: 'Discovery modal chance (after claiming a discovery site)',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'discoverySiteDensity',
    label: 'Discovery site density (scan hint white voxels; claim once per site)',
    min: 0,
    max: 1,
    step: 0.01,
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
  ...DEPTH_SCAN_DEBUG_SLIDERS,
  ...LASER_AUDIO_SLIDERS,
  ...DIG_LASER_SUSTAIN_AUDIO_SLIDERS,
  ...REPLICATOR_FEED_AUDIO_SLIDERS,
  ...SFX_REVERB_SLIDERS,
]

export function createSettingsMenu(
  container: HTMLElement,
  {
    leadingActions,
    onRegenerate,
    onLightAngleChange,
    initialAzimuthDeg,
    initialElevationDeg,
    onBalanceChange,
    onDebugAddResources,
    onDebugAddEnergy,
    onDebugIncreaseEnergyCap,
    onDebugUnlockAllTools,
    asteroidMusicDebug,
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

  const debugSummary = document.createElement('summary')
  debugSummary.className = 'settings-details-summary'
  debugSummary.textContent = 'Debug — balance'

  const debugHint = document.createElement('p')
  debugHint.className = 'settings-debug-hint'
  debugHint.textContent =
    'Rock durability applies after Regenerate. Balance and asteroid music debug are stored in localStorage on change. In dev, use Save or enable auto-save to write gameBalance.persisted.json and asteroidMusicDebug.persisted.json.'

  const autoSaveRow = document.createElement('div')
  autoSaveRow.className = 'settings-row settings-debug-row settings-save-row'
  const autoSaveLabel = document.createElement('label')
  autoSaveLabel.className = 'settings-checkbox-label'
  const autoSaveInput = document.createElement('input')
  autoSaveInput.type = 'checkbox'
  autoSaveInput.id = 'settings-balance-autosave'
  autoSaveInput.checked = getBalanceAutoSaveToFile()
  const autoSaveText = document.createElement('span')
  autoSaveText.textContent = 'Auto-save balance to project file (dev)'
  autoSaveLabel.append(autoSaveInput, autoSaveText)
  autoSaveRow.appendChild(autoSaveLabel)
  autoSaveInput.addEventListener('change', () => {
    setBalanceAutoSaveToFile(autoSaveInput.checked)
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
  const musicAutoSaveLabel = document.createElement('label')
  musicAutoSaveLabel.className = 'settings-checkbox-label'
  const musicAutoSaveInput = document.createElement('input')
  musicAutoSaveInput.type = 'checkbox'
  musicAutoSaveInput.id = 'settings-music-autosave'
  musicAutoSaveInput.checked = getMusicAutoSaveToFile()
  const musicAutoSaveText = document.createElement('span')
  musicAutoSaveText.textContent = 'Auto-save asteroid music debug to project file (dev)'
  musicAutoSaveLabel.append(musicAutoSaveInput, musicAutoSaveText)
  musicSaveRow.appendChild(musicAutoSaveLabel)

  const musicSaveBtn = document.createElement('button')
  musicSaveBtn.type = 'button'
  musicSaveBtn.className = 'settings-secondary'
  musicSaveBtn.textContent = 'Save music debug to project'
  const musicSaveStatus = document.createElement('span')
  musicSaveStatus.className = 'settings-save-status'
  musicSaveStatus.setAttribute('aria-live', 'polite')
  musicSaveRow.append(musicSaveBtn, musicSaveStatus)

  musicAutoSaveInput.addEventListener('change', () => {
    setMusicAutoSaveToFile(musicAutoSaveInput.checked)
  })

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

  debugDetails.append(debugSummary)
  if (
    onDebugAddResources ||
    onDebugAddEnergy ||
    onDebugIncreaseEnergyCap ||
    onDebugUnlockAllTools
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
    debugDetails.appendChild(cheatRow)
  }
  debugDetails.append(debugHint, autoSaveRow, saveRow, musicSaveRow)

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
  debugDetails.appendChild(keyLightHeading)

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
  debugDetails.appendChild(sunRotRow)

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
  debugDetails.appendChild(sunSpeedRow)

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
  debugDetails.appendChild(sunHelperRow)

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
  debugDetails.appendChild(scanVizHeading)

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
      label: 'Base rock bulk hint blend (12 roots, no overlay)',
      min: 0,
      max: 0.45,
      step: 0.01,
    },
    {
      key: 'baseRockBulkHintSaturation',
      label: 'Base rock bulk hint saturation (HSL)',
      min: 0.12,
      max: 0.65,
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
    debugDetails.appendChild(row)
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
  debugDetails.appendChild(scanSuppressRow)
  scanSuppressInput.addEventListener('change', () => {
    scanVisualizationDebug.suppressEmissiveWhenScanned = scanSuppressInput.checked
    onScanVisualizationDebugChange?.()
  })

  const depthScanHeading = document.createElement('h3')
  depthScanHeading.className = 'settings-debug-subheading'
  depthScanHeading.textContent = 'Depth scan (debug)'
  debugDetails.appendChild(depthScanHeading)

  function appendBalanceSliderRow(spec: SliderRow): void {
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
    debugDetails.appendChild(row)
  }

  for (const spec of DEPTH_SCAN_DEBUG_SLIDERS) {
    appendBalanceSliderRow(spec)
  }

  for (const spec of GAMEPLAY_BALANCE_SLIDERS) {
    appendBalanceSliderRow(spec)
  }

  const laserAudioHeading = document.createElement('h3')
  laserAudioHeading.className = 'settings-debug-subheading'
  laserAudioHeading.textContent = 'Laser audio'
  debugDetails.appendChild(laserAudioHeading)

  for (const spec of LASER_AUDIO_SLIDERS) {
    appendBalanceSliderRow(spec)
  }

  const digLaserAudioHeading = document.createElement('h3')
  digLaserAudioHeading.className = 'settings-debug-subheading'
  digLaserAudioHeading.textContent = 'Dig laser sustain (audio)'
  debugDetails.appendChild(digLaserAudioHeading)

  for (const spec of DIG_LASER_SUSTAIN_AUDIO_SLIDERS) {
    appendBalanceSliderRow(spec)
  }

  const replicatorFeedAudioHeading = document.createElement('h3')
  replicatorFeedAudioHeading.className = 'settings-debug-subheading'
  replicatorFeedAudioHeading.textContent = 'Replicator feed (audio)'
  debugDetails.appendChild(replicatorFeedAudioHeading)

  for (const spec of REPLICATOR_FEED_AUDIO_SLIDERS) {
    appendBalanceSliderRow(spec)
  }

  const sfxReverbHeading = document.createElement('h3')
  sfxReverbHeading.className = 'settings-debug-subheading'
  sfxReverbHeading.textContent = 'SFX reverb (global)'
  debugDetails.appendChild(sfxReverbHeading)

  for (const spec of SFX_REVERB_SLIDERS) {
    appendBalanceSliderRow(spec)
  }

  const asteroidMusicHeading = document.createElement('h3')
  asteroidMusicHeading.className = 'settings-debug-subheading'
  asteroidMusicHeading.textContent = 'Asteroid music (debug)'
  debugDetails.appendChild(asteroidMusicHeading)

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
  debugDetails.appendChild(musicPostHeading)

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
  debugDetails.appendChild(masterHpRow)

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
    debugDetails.appendChild(row)
  }

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

  const PAN_LFO_HZ_LO = 0.0005
  const PAN_LFO_HZ_HI = 0.05

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
  ]

  for (const spec of musicMapSpecs) {
    appendMusicSliderRow(debugDetails, spec)
  }

  const macroMusicHeading = document.createElement('h4')
  macroMusicHeading.className = 'settings-debug-subheading'
  macroMusicHeading.style.marginTop = '14px'
  macroMusicHeading.textContent = 'Voice timbre — macros (all 12 voices)'
  debugDetails.appendChild(macroMusicHeading)
  const macroVoiceHint = document.createElement('p')
  macroVoiceHint.className = 'settings-debug-hint'
  macroVoiceHint.textContent =
    'Each control sets a center value; all voices are updated with small deterministic spread. Changing a macro overwrites per-voice tweaks below until you edit them again.'
  debugDetails.appendChild(macroVoiceHint)

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
        applyVoiceMacrosToVoices(asteroidMusicDebug)
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
        applyVoiceMacrosToVoices(asteroidMusicDebug)
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
        applyVoiceMacrosToVoices(asteroidMusicDebug)
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
        applyVoiceMacrosToVoices(asteroidMusicDebug)
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
        applyVoiceMacrosToVoices(asteroidMusicDebug)
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
        applyVoiceMacrosToVoices(asteroidMusicDebug)
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
        applyVoiceMacrosToVoices(asteroidMusicDebug)
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
        applyVoiceMacrosToVoices(asteroidMusicDebug)
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
        applyVoiceMacrosToVoices(asteroidMusicDebug)
      },
    },
  ]
  for (const spec of macroMusicSpecs) {
    appendMusicSliderRow(debugDetails, spec)
  }
  appendVoiceLogHzSliderRow(
    debugDetails,
    'Macro — amp LFO speed (Hz, log slider)',
    'settings-music-macro-lfo-hz',
    AMP_LFO_HZ_LO,
    AMP_LFO_HZ_HI,
    () => vm().ampLfoHz,
    (hz) => {
      vm().ampLfoHz = hz
      applyVoiceMacrosToVoices(asteroidMusicDebug)
    },
  )
  appendVoiceLogHzSliderRow(
    debugDetails,
    'Macro — amp LFO 2 speed (Hz, log slider)',
    'settings-music-macro-lfo2-hz',
    AMP_LFO_HZ_LO,
    AMP_LFO_HZ_HI,
    () => vm().ampLfo2Hz,
    (hz) => {
      vm().ampLfo2Hz = hz
      applyVoiceMacrosToVoices(asteroidMusicDebug)
    },
  )
  appendVoiceLogHzSliderRow(
    debugDetails,
    'Macro — pan LFO speed (Hz, log slider)',
    'settings-music-macro-pan-lfo-hz',
    PAN_LFO_HZ_LO,
    PAN_LFO_HZ_HI,
    () => vm().panLfoHz,
    (hz) => {
      vm().panLfoHz = hz
      applyVoiceMacrosToVoices(asteroidMusicDebug)
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
        label: `V${vi + 1} — note (semitones, then major-scale snap)`,
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
  debugDetails.appendChild(perVoiceOuter)

  function appendMusicBusSubheading(text: string): void {
    const h = document.createElement('h4')
    h.className = 'settings-debug-subheading'
    h.style.marginTop = '14px'
    h.textContent = text
    debugDetails.appendChild(h)
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
      id: 'settings-music-reverb-decay',
      label: 'Bus — reverb decay (s, regenerates IR)',
      min: 0.15,
      max: 10,
      step: 0.05,
      decimals: 2,
      read: () => asteroidMusicDebug.reverbDecaySec,
      write: (n) => {
        asteroidMusicDebug.reverbDecaySec = n
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
    appendMusicSliderRow(debugDetails, spec)
  }
  appendMusicBusSubheading('Music bus — pre-filter drive')
  for (const spec of musicBusPreSpecs) {
    appendMusicSliderRow(debugDetails, spec)
  }
  appendMusicBusSubheading('Music bus — filter')
  const musicBusFilterHint = document.createElement('p')
  musicBusFilterHint.className = 'settings-debug-hint'
  musicBusFilterHint.textContent =
    'Pure sine voices only change when cutoff is near or below the note; raise pre-filter drive to add harmonics, then sweep Hz. The Hz slider is logarithmic so most of its range maps to lower cutoffs.'
  debugDetails.appendChild(musicBusFilterHint)
  appendBusLowpassHzLogSliderRow(debugDetails)
  for (const spec of musicBusFilterSpecs) {
    appendMusicSliderRow(debugDetails, spec)
  }
  appendMusicBusSubheading('Music bus — reverb')
  for (const spec of musicBusReverbSpecs) {
    appendMusicSliderRow(debugDetails, spec)
  }
  appendMusicBusSubheading('Music bus — wet saturation')
  for (const spec of musicBusWetSatSpecs) {
    appendMusicSliderRow(debugDetails, spec)
  }

  debugDetails.appendChild(resetBalanceBtn)

  panel.append(
    heading,
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
