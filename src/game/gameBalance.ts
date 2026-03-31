import { getDebugProjectAutosave, setDebugProjectAutosave } from './debugProjectAutosave'

export interface GameBalance {
  durabilityMult: number
  replicatorFeedSpeedMult: number
  /** Seconds from payment until a mature replicator becomes the chosen structure/computronium. */
  replicatorTransformDurationSec: number
  toolCostMult: number
  reactorOutputMult: number
  energyBaseCapMult: number
  batteryStorageMult: number
  passiveIncomeMult: number
  /** Multiplier on mining laser energy per voxel converted. */
  orbitalLaserEnergyMult: number
  /** Multiplier on excavating laser energy per damage tick. */
  excavatingLaserEnergyMult: number
  /** Multiplier on scanner satellite energy per neighborhood scan. */
  scannerEnergyMult: number
  /**
   * Half-extent in grid steps from the hit voxel (inclusive). 0 = single voxel, 1 = 3×3×3, 2 = 5×5×5, …
   * Energy cost scales with neighborhood volume vs the default 3³.
   */
  scannerScanRadius: number
  /**
   * Half-extent in grid steps for explosive charge blasts (inclusive cube). Same semantics as scanner neighborhood.
   */
  explosiveChargeBlastRadius: number
  /** Energy spent when arming one explosive charge (after computronium tier-1 unlock). */
  explosiveChargeEnergyPerArm: number
  /**
   * Multiplier on procedural impact-crater bowl radius after per-crater size is sampled (generation only).
   * 0 = no craters; 1 = default. Applies on Regenerate / load.
   */
  impactCraterRangeMult: number
  /**
   * Bounds (voxel units) for each crater’s bowl radius: sampled uniformly per crater (deterministic from seed).
   * Then multiplied by `impactCraterRangeMult`.
   */
  impactCraterRadiusMinVoxels: number
  impactCraterRadiusMaxVoxels: number
  /** Inclusive min number of procedural impact craters (generation); clamped vs max. */
  impactCraterCountMin: number
  /** Inclusive max number of procedural impact craters (generation); 0 = none. */
  impactCraterCountMax: number
  /** Multiplier on hub pull throughput from the local network. */
  hubPullMult: number
  /**
   * Multiplier on max hub energy draw per second, scaled by **active** hub count.
   */
  hubMaxEnergySpendMult: number
  /** Multiplier on refinery processing throughput (global root tallies → children). */
  refineryProcessMult: number
  /**
   * Multiplier on max refinery energy draw per second for tally processing, scaled by **active** refinery count.
   */
  refineryMaxProcessEnergySpendMult: number
  /**
   * Softlock guard: max additional `surfaceIces` units a single active refinery may generate per second
   * when processing any root (independent of the main recipe yields).
   */
  refineryIceBackfillPerSecPerRefinery: number
  /**
   * Global hard cap on extra `surfaceIces` units generated per second from refinery backfill across all refineries.
   */
  refineryIceBackfillMaxPerSecGlobal: number
  /** Mining laser zap loudness (master gain). */
  laserZapVolumeMult: number
  /** Tremolo / amplitude-LFO rate. */
  laserZapLfoHzMult: number
  /** Tremolo depth (how much the LFO modulates level). */
  laserZapLfoDepthMult: number
  /** Pitch sweep start frequency (× ~523 Hz / C5). */
  laserZapPitchStartFreqMult: number
  /** Pitch sweep depth: octave span (× 3 octaves, C5→C2 baseline). */
  laserZapPitchDepthMult: number
  /** Pitch envelope length in seconds (× 1 s baseline). */
  laserZapPitchDurMult: number

  /** Dig laser sustain: looped noise buffer length (seconds). */
  digLaserNoiseBufferSec: number
  /** Bandpass center frequency (Hz). */
  digLaserBandpassHz: number
  /** Bandpass Q (resonance). */
  digLaserBandpassQ: number
  /** Sustain output peak gain (linear, ~0–0.45). */
  digLaserSustainPeak: number
  /** Gain attack time when beam starts (seconds). */
  digLaserSustainAttackSec: number
  /** Gain release when mouse released (seconds). */
  digLaserSustainReleaseSec: number
  /** Multiplier on dig laser sustain peak gain (audio). */
  digLaserVolumeMult: number
  /** Dig laser sustain tremolo / amplitude-LFO rate (× baseline Hz, same family as zap). */
  digLaserLfoHzMult: number
  /** Dig laser sustain tremolo depth (× baseline modulation amount). */
  digLaserLfoDepthMult: number

  /** Replicator eating ticks: max simultaneous click voices per frame (reduces mud when many HP drop). */
  replicatorFeedAudioMaxVoices: number
  /** Spacing between voices on the timeline (s). */
  replicatorFeedAudioStepSec: number
  /** Gain multiplier on the computed per-tick peak. */
  replicatorFeedAudioVolumeMult: number
  /** Carrier frequency base (Hz); per-voice jitter adds up to `replicatorFeedAudioPitchSpread`. */
  replicatorFeedAudioBaseHz: number
  /** Random pitch spread per tick (Hz); 0 = fixed base frequency. */
  replicatorFeedAudioPitchSpread: number
  /** Envelope decay tail (s). */
  replicatorFeedAudioTailSec: number
  /** Envelope attack time (s). */
  replicatorFeedAudioAttackSec: number

  /** Global tool SFX reverb: gain into convolver (parallel dry stays unity). */
  sfxReverbWetSend: number
  /** Gain after convolver (wet path). */
  sfxReverbWetOut: number
  /** Convolver impulse length (s); rebuilds IR when changed. */
  sfxReverbDurationSec: number
  /** Exponential decay rate for IR noise (higher = shorter tail). */
  sfxReverbDecayPerSec: number

  /** Base rate (per second, before distance falloff) for depth-scan voxel reveal. */
  depthRevealRate: number
  /** Manhattan distance scale `d0` in the falloff `1 / (1 + (d/d0)^p)`. */
  depthRevealDistanceScale: number
  /** Power `p` for distance falloff. */
  depthRevealPower: number
  /**
   * Minimum multiplier on reveal rate when composite depth-scan susceptibility is 0
   * (linear blend: `floor + (1 - floor) * S`).
   */
  depthRevealSusceptibilityFloor: number
  /** Opacity of rock instanced meshes while the depth overlay is active (0–1). */
  depthOverlayRockOpacity: number
  /** Opacity toward fully revealed tint along reveal progress (instance color path). */
  depthOverlayScannedVoxelOpacity: number
  /** How much `maxDurability` scales simulated per-voxel opacity in the depth overlay. */
  depthOverlayDurabilityOpacityMix: number
  /**
   * How strongly low depth-scan susceptibility lerps instance color toward opaque (0 = off).
   * `effectiveOpacity' = lerp(effectiveOpacity, 1, (1 - S) * k)`.
   */
  depthOverlaySusceptibilityOpacityBoost: number
  /** Extra saturation multiplier on depth-overlay refined RGB (after surface-scan boost). */
  depthOverlayScanSaturationMul: number
  /** Lightness multiplier on depth-overlay refined RGB (heatmap punch). */
  depthOverlayScanLightnessMul: number
  /** Reveal progress at or above which depth overlay voxels are forced fully opaque. */
  depthOverlaySolidRevealProgress: number
  /**
   * Minimum `rareLodeStrength01` for rare-lode treatment: depth overlay forces full instance opacity;
   * surface scan heatmap / lerp ramp uses the same floor.
   */
  depthOverlayLodeOpaqueStrengthFloor: number
  /**
   * Max extra blend toward full surface-scan tint when `rareLodeStrength01` is high.
   * Ramp starts at `depthOverlayLodeOpaqueStrengthFloor` (same “meaningful lode” threshold as depth).
   */
  surfaceScanRareLodeLerpBoostMax: number
  /**
   * Surface scan: blend toward blue→red heatmap from graded `rareLodeStrength01` (after composition tint).
   * Weight scales with the same smoothstep ramp as `surfaceScanRareLodeLerpBoostMax`.
   */
  surfaceScanLodeHeatmapBlend: number
  /** Upper cap on convex mix toward spectral rare-lode template (procgen). */
  rareLodeMixMax: number
  /** Smoothstep low edge for rare-lode noise field (0–1). */
  rareLodeNoiseSmoothLow: number
  /** Smoothstep high edge for rare-lode noise field (0–1). */
  rareLodeNoiseSmoothHigh: number
  /**
   * Depth overlay: blend weight toward classic blue→red heatmap from graded lode density
   * (`rareLodeStrength01 × revealProgress`). 0 = composition tint only; 1 = full heatmap at high density.
   */
  depthOverlayHeatmapBlend: number
  /** HSL saturation for depth heatmap (classic jet-like cool→warm). */
  depthOverlayHeatmapSaturationMul: number
  /**
   * Depth overlay: graded density `min(1, rareLodeStrength01 × revealProgress)` must be ≥ this for
   * full material opacity (warm heatmap band); below reads with normal rock transparency (cool/green band).
   */
  depthOverlayLodeFullOpacityMinDensity: number

  /** Energy drained per second per **active** computronium voxel (not disabled). */
  computroniumEnergyDrainPerSecPerCell: number
  /**
   * Unlock points gained per second per active computronium cell, scaled by how fully
   * the tick’s energy drain was satisfied (no progress when energy is empty).
   */
  computroniumUnlockPointsPerSecPerCell: number
  /** Cumulative unlock points needed for each laser stage (mining → dig → scanner). */
  computroniumPointsPerStage: number

  /** Voxel-equivalent dross mass spawned per removed voxel (before `drossMassMult`). */
  drossMassPerRemoval: number
  /** Multiplier on dross spawn mass (Debug / balance). */
  drossMassMult: number
  /** Base collection rate in voxel-equivalents per second per deployed dross collector satellite. */
  drossCollectionRatePerSatellitePerSec: number
  /** Multiplier on dross collection rate. */
  drossCollectionMult: number
  /**
   * Manual Hoover tool: voxel-space radius around the hit voxel (Euclidean on `VoxelPos`)
   * for dross drain while held.
   */
  drossHooverRadiusVox: number
  /**
   * Manual Hoover tool: equivalent dross-collector satellite count while held, before
   * `drossCollectionMult` is applied (QoL baseline, no unlock gate).
   */
  drossHooverSatelliteEquiv: number
  /** Per HP tick while a replicator eats rock: probability [0,1] of spawning one scrap blob (independent roll). */
  drossReplicatorSpawnChance: number
  /** Voxel-equivalent dross mass when a replicator scrap roll succeeds (before `drossMassMult`). */
  drossMassPerReplicatorHp: number
  /**
   * `FogExp2` density multiplier: `density = min(drossFogDensityMax, totalDrossMass × this)`.
   * 0 = no dross fog.
   */
  drossFogDensityPerMass: number
  /**
   * Debug multiplier on dross fog density; scales `drossFogDensityPerMass` without changing
   * the baseline balance JSON. 1 = default density.
   */
  drossFogDensityMult: number
  /** Cap on `FogExp2` density (Three.js uses factor ≈ 1 − exp(−density² × depth²)). 0 = no fog. */
  drossFogDensityMax: number
  /** Dross fog tint, sRGB 0–1 each. Light values read as bright haze (mix toward fog color, like lighten-style dust). */
  drossFogColorR: number
  drossFogColorG: number
  drossFogColorB: number
  /**
   * Blend between debug base dross fog color and composition-driven dross tint.
   * 0 = base color only; 1 = fully composition-informed.
   */
  drossFogTintLerp01: number

  /**
   * Legacy persisted field; discovery offers no longer use a second probability roll (site density only).
   * Kept so older `gameBalance` JSON still merges; unused in gameplay.
   */
  discoveryChanceOnRockDepthScanner: number
  /** Fraction [0,1] of voxels that are discovery sites (scan highlight + claim eligibility). */
  discoverySiteDensity: number
  /** Relative weights for discovery archetypes (windfall / drain / lore / research bypass). */
  discoveryWeightWindfall: number
  discoveryWeightDrain: number
  discoveryWeightLore: number
  discoveryWeightResearchBypass: number
}

export const defaultGameBalance: GameBalance = {
  durabilityMult: 1,
  replicatorFeedSpeedMult: 1,
  replicatorTransformDurationSec: 3,
  toolCostMult: 1,
  reactorOutputMult: 1,
  energyBaseCapMult: 1,
  batteryStorageMult: 1,
  /** Mature replicator passive trickle; slight bump to offset replicator placement cost. */
  passiveIncomeMult: 1.05,
  orbitalLaserEnergyMult: 1,
  excavatingLaserEnergyMult: 1,
  scannerEnergyMult: 1,
  scannerScanRadius: 1,
  explosiveChargeBlastRadius: 1,
  explosiveChargeEnergyPerArm: 3.2,
  impactCraterRangeMult: 1,
  impactCraterRadiusMinVoxels: 2,
  impactCraterRadiusMaxVoxels: 9,
  impactCraterCountMin: 2,
  impactCraterCountMax: 10,
  hubPullMult: 1,
  hubMaxEnergySpendMult: 1,
  refineryProcessMult: 1,
  refineryMaxProcessEnergySpendMult: 1,
  refineryIceBackfillPerSecPerRefinery: 0.015,
  refineryIceBackfillMaxPerSecGlobal: 0.06,
  laserZapVolumeMult: 1,
  laserZapLfoHzMult: 1,
  laserZapLfoDepthMult: 1,
  laserZapPitchStartFreqMult: 1,
  laserZapPitchDepthMult: 1,
  laserZapPitchDurMult: 1,
  digLaserNoiseBufferSec: 0.22,
  digLaserBandpassHz: 1280,
  digLaserBandpassQ: 0.62,
  digLaserSustainPeak: 0.13,
  digLaserSustainAttackSec: 0.05,
  digLaserSustainReleaseSec: 0.1,
  digLaserVolumeMult: 1,
  digLaserLfoHzMult: 1,
  digLaserLfoDepthMult: 1,
  replicatorFeedAudioMaxVoices: 3,
  replicatorFeedAudioStepSec: 0.036,
  replicatorFeedAudioVolumeMult: 1,
  replicatorFeedAudioBaseHz: 1980,
  replicatorFeedAudioPitchSpread: 220,
  replicatorFeedAudioTailSec: 0.012,
  replicatorFeedAudioAttackSec: 0.007,
  sfxReverbWetSend: 0.34,
  sfxReverbWetOut: 0.26,
  sfxReverbDurationSec: 1.05,
  sfxReverbDecayPerSec: 4.4,
  depthRevealRate: 0.012,
  depthRevealDistanceScale: 4,
  depthRevealPower: 2,
  depthRevealSusceptibilityFloor: 0.12,
  depthOverlayRockOpacity: 0.5,
  depthOverlayScannedVoxelOpacity: 0.72,
  depthOverlayDurabilityOpacityMix: 0.5,
  depthOverlaySusceptibilityOpacityBoost: 0.55,
  depthOverlayScanSaturationMul: 1.22,
  depthOverlayScanLightnessMul: 1.06,
  depthOverlaySolidRevealProgress: 0.86,
  depthOverlayLodeOpaqueStrengthFloor: 0.22,
  surfaceScanRareLodeLerpBoostMax: 0.36,
  surfaceScanLodeHeatmapBlend: 0.9,
  rareLodeMixMax: 0.72,
  /** Wider band so merged morphology still yields graded `rareLodeStrength01` (narrow bands made most voxels read as zero). */
  rareLodeNoiseSmoothLow: 0.06,
  rareLodeNoiseSmoothHigh: 0.82,
  depthOverlayHeatmapBlend: 0.9,
  depthOverlayHeatmapSaturationMul: 0.94,
  depthOverlayLodeFullOpacityMinDensity: 0.42,
  computroniumEnergyDrainPerSecPerCell: 0.42,
  computroniumUnlockPointsPerSecPerCell: 0.16,
  computroniumPointsPerStage: 48,
  drossMassPerRemoval: 0.3,
  drossMassMult: 1,
  drossCollectionRatePerSatellitePerSec: 0.085,
  drossCollectionMult: 1,
  drossHooverRadiusVox: 3,
  drossHooverSatelliteEquiv: 10,
  drossReplicatorSpawnChance: 0.1,
  drossMassPerReplicatorHp: 0.04,
  drossFogDensityPerMass: 0.0004,
  drossFogDensityMult: 1,
  drossFogDensityMax: 0.05,
  drossFogColorR: 0.78,
  drossFogColorG: 0.82,
  drossFogColorB: 0.9,
  drossFogTintLerp01: 1,
  discoveryChanceOnRockDepthScanner: 0.03,
  discoverySiteDensity: 0.02,
  discoveryWeightWindfall: 1,
  discoveryWeightDrain: 0.45,
  discoveryWeightLore: 0.65,
  discoveryWeightResearchBypass: 0.28,
}

/** Live tuning values; init via `initGameBalanceFromPersisted` before gameplay. */
export const gameBalance: GameBalance = { ...defaultGameBalance }

export const LOCAL_STORAGE_KEY = 'roid:gameBalance'

/** When true (default), balance changes trigger debounced writes to `gameBalance.persisted.json` in dev. */
export const BALANCE_AUTO_SAVE_FILE_KEY = 'roid:balanceAutoSaveToFile'

const PERSIST_PATH = '/api/persist-game-balance'
const DEBOUNCE_MS = 400

const MULT_MIN = 0.1
const MULT_MAX = 4

/** Inclusive Chebyshev cube half-extent; max 4 → 9³ neighborhood on the 33³ grid. */
const SCANNER_SCAN_RADIUS_MIN = 0
const SCANNER_SCAN_RADIUS_MAX = 4

const IMPACT_CRATER_COUNT_ABS_MIN = 0
const IMPACT_CRATER_COUNT_ABS_MAX = 64

const IMPACT_CRATER_RADIUS_VOXELS_CLAMP = { min: 0.5, max: 24 }

let persistTimer: ReturnType<typeof setTimeout> | null = null

export function getBalanceAutoSaveToFile(): boolean {
  return getDebugProjectAutosave()
}

export function setBalanceAutoSaveToFile(on: boolean): void {
  setDebugProjectAutosave(on)
  if (!on) cancelScheduledPersist()
}

export function cancelScheduledPersist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
}

/** Writes current balance to the repo JSON via dev server (no debounce). */
export async function persistGameBalanceToProjectNow(): Promise<boolean> {
  if (!import.meta.env.DEV) return false
  try {
    const res = await fetch(PERSIST_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gameBalance),
    })
    return res.ok
  } catch {
    return false
  }
}

export const GAME_BALANCE_KEYS: readonly (keyof GameBalance)[] = [
  'durabilityMult',
  'replicatorFeedSpeedMult',
  'replicatorTransformDurationSec',
  'toolCostMult',
  'reactorOutputMult',
  'energyBaseCapMult',
  'batteryStorageMult',
  'passiveIncomeMult',
  'orbitalLaserEnergyMult',
  'excavatingLaserEnergyMult',
  'scannerEnergyMult',
  'scannerScanRadius',
  'explosiveChargeBlastRadius',
  'explosiveChargeEnergyPerArm',
  'impactCraterRangeMult',
  'impactCraterRadiusMinVoxels',
  'impactCraterRadiusMaxVoxels',
  'impactCraterCountMin',
  'impactCraterCountMax',
  'hubPullMult',
  'hubMaxEnergySpendMult',
  'refineryProcessMult',
  'refineryMaxProcessEnergySpendMult',
  'refineryIceBackfillPerSecPerRefinery',
  'refineryIceBackfillMaxPerSecGlobal',
  'laserZapVolumeMult',
  'laserZapLfoHzMult',
  'laserZapLfoDepthMult',
  'laserZapPitchStartFreqMult',
  'laserZapPitchDepthMult',
  'laserZapPitchDurMult',
  'digLaserNoiseBufferSec',
  'digLaserBandpassHz',
  'digLaserBandpassQ',
  'digLaserSustainPeak',
  'digLaserSustainAttackSec',
  'digLaserSustainReleaseSec',
  'digLaserVolumeMult',
  'digLaserLfoHzMult',
  'digLaserLfoDepthMult',
  'replicatorFeedAudioMaxVoices',
  'replicatorFeedAudioStepSec',
  'replicatorFeedAudioVolumeMult',
  'replicatorFeedAudioBaseHz',
  'replicatorFeedAudioPitchSpread',
  'replicatorFeedAudioTailSec',
  'replicatorFeedAudioAttackSec',
  'sfxReverbWetSend',
  'sfxReverbWetOut',
  'sfxReverbDurationSec',
  'sfxReverbDecayPerSec',
  'depthRevealRate',
  'depthRevealDistanceScale',
  'depthRevealPower',
  'depthRevealSusceptibilityFloor',
  'depthOverlayRockOpacity',
  'depthOverlayScannedVoxelOpacity',
  'depthOverlayDurabilityOpacityMix',
  'depthOverlaySusceptibilityOpacityBoost',
  'depthOverlayScanSaturationMul',
  'depthOverlayScanLightnessMul',
  'depthOverlaySolidRevealProgress',
  'depthOverlayLodeOpaqueStrengthFloor',
  'surfaceScanRareLodeLerpBoostMax',
  'surfaceScanLodeHeatmapBlend',
  'rareLodeMixMax',
  'rareLodeNoiseSmoothLow',
  'rareLodeNoiseSmoothHigh',
  'depthOverlayHeatmapBlend',
  'depthOverlayHeatmapSaturationMul',
  'depthOverlayLodeFullOpacityMinDensity',
  'computroniumEnergyDrainPerSecPerCell',
  'computroniumUnlockPointsPerSecPerCell',
  'computroniumPointsPerStage',
  'drossMassPerRemoval',
  'drossMassMult',
  'drossCollectionRatePerSatellitePerSec',
  'drossCollectionMult',
  'drossHooverRadiusVox',
  'drossHooverSatelliteEquiv',
  'drossReplicatorSpawnChance',
  'drossMassPerReplicatorHp',
  'drossFogDensityPerMass',
  'drossFogDensityMult',
  'drossFogDensityMax',
  'drossFogColorR',
  'drossFogColorG',
  'drossFogColorB',
  'drossFogTintLerp01',
  'discoveryChanceOnRockDepthScanner',
  'discoverySiteDensity',
  'discoveryWeightWindfall',
  'discoveryWeightDrain',
  'discoveryWeightLore',
  'discoveryWeightResearchBypass',
] as const

const DIG_LASER_AUDIO_CLAMP: Partial<Record<keyof GameBalance, { min: number; max: number }>> = {
  digLaserNoiseBufferSec: { min: 0.04, max: 0.65 },
  digLaserBandpassHz: { min: 80, max: 2600 },
  digLaserBandpassQ: { min: 0.08, max: 12 },
  digLaserVolumeMult: { min: 0.1, max: 20 },
  digLaserSustainPeak: { min: 0.02, max: 0.48 },
  digLaserSustainAttackSec: { min: 0.002, max: 0.35 },
  digLaserSustainReleaseSec: { min: 0.02, max: 0.55 },
}

const REPLICATOR_FEED_AUDIO_CLAMP: Partial<Record<keyof GameBalance, { min: number; max: number }>> = {
  replicatorFeedAudioMaxVoices: { min: 1, max: 8 },
  replicatorFeedAudioStepSec: { min: 0.012, max: 0.12 },
  replicatorFeedAudioBaseHz: { min: 400, max: 8000 },
  replicatorFeedAudioPitchSpread: { min: 0, max: 800 },
  replicatorFeedAudioTailSec: { min: 0.004, max: 0.055 },
  replicatorFeedAudioAttackSec: { min: 0.001, max: 0.035 },
}

const SFX_REVERB_CLAMP: Partial<Record<keyof GameBalance, { min: number; max: number }>> = {
  sfxReverbWetSend: { min: 0, max: 0.95 },
  sfxReverbWetOut: { min: 0, max: 0.95 },
  sfxReverbDurationSec: { min: 0.35, max: 2.5 },
  sfxReverbDecayPerSec: { min: 1.5, max: 12 },
}

const DEPTH_BALANCE_CLAMP: Partial<Record<keyof GameBalance, { min: number; max: number }>> = {
  depthRevealRate: { min: 0.0005, max: 0.8 },
  depthRevealDistanceScale: { min: 0.5, max: 32 },
  depthRevealPower: { min: 0.5, max: 8 },
  depthRevealSusceptibilityFloor: { min: 0.02, max: 1 },
  depthOverlayRockOpacity: { min: 0.08, max: 0.92 },
  depthOverlayScannedVoxelOpacity: { min: 0.08, max: 1 },
  depthOverlayDurabilityOpacityMix: { min: 0, max: 1 },
  depthOverlaySusceptibilityOpacityBoost: { min: 0, max: 1 },
  depthOverlayScanSaturationMul: { min: 0.6, max: 2.2 },
  depthOverlayScanLightnessMul: { min: 0.65, max: 1.35 },
  depthOverlaySolidRevealProgress: { min: 0.5, max: 1 },
  depthOverlayLodeOpaqueStrengthFloor: { min: 0, max: 1 },
  surfaceScanRareLodeLerpBoostMax: { min: 0, max: 1 },
  surfaceScanLodeHeatmapBlend: { min: 0, max: 1 },
  rareLodeMixMax: { min: 0.15, max: 1 },
  rareLodeNoiseSmoothLow: { min: 0.05, max: 0.85 },
  rareLodeNoiseSmoothHigh: { min: 0.15, max: 0.99 },
  depthOverlayHeatmapBlend: { min: 0, max: 1 },
  depthOverlayHeatmapSaturationMul: { min: 0.35, max: 1 },
  depthOverlayLodeFullOpacityMinDensity: { min: 0, max: 1 },
}

const COMPUTRONIUM_BALANCE_CLAMP: Partial<Record<keyof GameBalance, { min: number; max: number }>> = {
  computroniumEnergyDrainPerSecPerCell: { min: 0.02, max: 6 },
  computroniumUnlockPointsPerSecPerCell: { min: 0.02, max: 3 },
  computroniumPointsPerStage: { min: 8, max: 400 },
}

const IMPACT_CRATER_RANGE_MULT_CLAMP = { min: 0, max: 3 }

export function clampBalanceField(key: keyof GameBalance, v: number): number {
  const d = defaultGameBalance[key]
  const fallback = typeof d === 'number' && Number.isFinite(d) ? d : 1
  if (!Number.isFinite(v)) return fallback
  const dig = DIG_LASER_AUDIO_CLAMP[key]
  if (dig) return Math.min(dig.max, Math.max(dig.min, v))
  const rep = REPLICATOR_FEED_AUDIO_CLAMP[key]
  if (rep) {
    const clamped = Math.min(rep.max, Math.max(rep.min, v))
    if (key === 'replicatorFeedAudioMaxVoices') return Math.round(clamped)
    return clamped
  }
  const sfx = SFX_REVERB_CLAMP[key]
  if (sfx) return Math.min(sfx.max, Math.max(sfx.min, v))
  const depth = DEPTH_BALANCE_CLAMP[key]
  if (depth) return Math.min(depth.max, Math.max(depth.min, v))
  const comp = COMPUTRONIUM_BALANCE_CLAMP[key]
  if (comp) return Math.min(comp.max, Math.max(comp.min, v))
  if (key === 'impactCraterRangeMult') {
    return Math.min(
      IMPACT_CRATER_RANGE_MULT_CLAMP.max,
      Math.max(IMPACT_CRATER_RANGE_MULT_CLAMP.min, v),
    )
  }
  if (key === 'impactCraterRadiusMinVoxels' || key === 'impactCraterRadiusMaxVoxels') {
    return Math.min(
      IMPACT_CRATER_RADIUS_VOXELS_CLAMP.max,
      Math.max(IMPACT_CRATER_RADIUS_VOXELS_CLAMP.min, v),
    )
  }
  if (key === 'impactCraterCountMin' || key === 'impactCraterCountMax') {
    const ri = Math.round(v)
    return Math.min(
      IMPACT_CRATER_COUNT_ABS_MAX,
      Math.max(IMPACT_CRATER_COUNT_ABS_MIN, ri),
    )
  }
  if (key === 'scannerScanRadius' || key === 'explosiveChargeBlastRadius') {
    const ri = Math.round(v)
    return Math.min(SCANNER_SCAN_RADIUS_MAX, Math.max(SCANNER_SCAN_RADIUS_MIN, ri))
  }
  if (key === 'explosiveChargeEnergyPerArm') {
    return Math.min(48, Math.max(0.2, v))
  }
  if (key === 'drossMassPerRemoval') {
    return Math.min(2, Math.max(0.02, v))
  }
  if (key === 'drossCollectionRatePerSatellitePerSec') {
    return Math.min(2, Math.max(0.001, v))
  }
  if (key === 'drossMassMult' || key === 'drossCollectionMult') {
    return Math.min(MULT_MAX, Math.max(MULT_MIN, v))
  }
  if (key === 'drossHooverRadiusVox') {
    const ri = Math.round(v)
    return Math.min(8, Math.max(0, ri))
  }
  if (key === 'drossHooverSatelliteEquiv') {
    const ri = Math.round(v)
    return Math.min(24, Math.max(1, ri))
  }
  if (key === 'drossReplicatorSpawnChance') {
    return Math.min(1, Math.max(0, v))
  }
  if (key === 'drossMassPerReplicatorHp') {
    return Math.min(2, Math.max(0.001, v))
  }
  if (key === 'drossFogDensityPerMass') {
    return Math.min(0.002, Math.max(0, v))
  }
  if (key === 'drossFogDensityMult') {
    return Math.min(MULT_MAX, Math.max(MULT_MIN, v))
  }
  if (key === 'drossFogDensityMax') {
    return Math.min(0.12, Math.max(0, v))
  }
  if (key === 'drossFogColorR' || key === 'drossFogColorG' || key === 'drossFogColorB') {
    return Math.min(1, Math.max(0, v))
  }
  if (key === 'drossFogTintLerp01') {
    return Math.min(1, Math.max(0, v))
  }
  if (key === 'replicatorTransformDurationSec') {
    return Math.min(120, Math.max(0, v))
  }
  if (key === 'discoveryChanceOnRockDepthScanner' || key === 'discoverySiteDensity') {
    return Math.min(1, Math.max(0, v))
  }
  if (
    key === 'discoveryWeightWindfall' ||
    key === 'discoveryWeightDrain' ||
    key === 'discoveryWeightLore' ||
    key === 'discoveryWeightResearchBypass'
  ) {
    return Math.min(8, Math.max(0, v))
  }
  return Math.min(MULT_MAX, Math.max(MULT_MIN, v))
}

function mergeBalance(
  base: GameBalance,
  partial: Partial<Record<string, unknown>>,
): GameBalance {
  const out: GameBalance = { ...base }
  for (const key of GAME_BALANCE_KEYS) {
    const v = partial[key as string]
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = clampBalanceField(key, v)
    }
  }
  const legacyPull = partial['refineryPullMult']
  if (
    typeof legacyPull === 'number' &&
    Number.isFinite(legacyPull) &&
    partial['hubPullMult'] === undefined
  ) {
    out.hubPullMult = clampBalanceField('hubPullMult', legacyPull)
  }
  const legacyMax = partial['refineryMaxEnergySpendMult']
  if (
    typeof legacyMax === 'number' &&
    Number.isFinite(legacyMax) &&
    partial['hubMaxEnergySpendMult'] === undefined
  ) {
    out.hubMaxEnergySpendMult = clampBalanceField('hubMaxEnergySpendMult', legacyMax)
  }
  return out
}

/** Merge defaults ← bundled JSON ← localStorage (if present). */
export function initGameBalanceFromPersisted(importedFile: unknown): void {
  let next: GameBalance = { ...defaultGameBalance }
  if (importedFile !== null && typeof importedFile === 'object') {
    next = mergeBalance(next, importedFile as Record<string, unknown>)
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (parsed !== null && typeof parsed === 'object') {
        next = mergeBalance(next, parsed as Record<string, unknown>)
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  Object.assign(gameBalance, next)
  normalizeImpactCraterPairs(gameBalance)
}

/** Keep min ≤ max for impact crater count and radius sliders. */
function normalizeImpactCraterPairs(b: GameBalance): void {
  const clo = b.impactCraterCountMin
  const chi = b.impactCraterCountMax
  b.impactCraterCountMin = Math.min(clo, chi)
  b.impactCraterCountMax = Math.max(clo, chi)

  const rlo = b.impactCraterRadiusMinVoxels
  const rhi = b.impactCraterRadiusMaxVoxels
  b.impactCraterRadiusMinVoxels = Math.min(rlo, rhi)
  b.impactCraterRadiusMaxVoxels = Math.max(rlo, rhi)
}

export function patchGameBalance(partial: Partial<GameBalance>): void {
  for (const key of GAME_BALANCE_KEYS) {
    const v = partial[key]
    if (v !== undefined) {
      gameBalance[key] = clampBalanceField(key, v)
    }
  }
  normalizeImpactCraterPairs(gameBalance)
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(gameBalance))
  } catch {
    /* quota / private mode */
  }
  schedulePersistGameBalance()
}

export function resetGameBalance(): void {
  Object.assign(gameBalance, defaultGameBalance)
  normalizeImpactCraterPairs(gameBalance)
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  schedulePersistGameBalance()
}

export function schedulePersistGameBalance(): void {
  cancelScheduledPersist()
  if (!getDebugProjectAutosave()) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    if (!import.meta.env.DEV) return
    void fetch(PERSIST_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gameBalance),
    }).catch(() => {})
  }, DEBOUNCE_MS)
}
