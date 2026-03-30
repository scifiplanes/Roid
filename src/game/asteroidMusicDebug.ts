export const ASTEROID_MUSIC_VOICE_COUNT = 12

export interface AsteroidMusicVoiceDebug {
  amp: number
  ampLfoDepth: number
  ampLfoHz: number
  ampLfoSpeedModDepthHz: number
  ampLfoSpeedModHz: number
  /** Mid-rate second tremolo layer (Hz); engine clamps like primary amp LFO. */
  ampLfo2Hz: number
  ampLfo2Depth: number
  ampLfo2SpeedModDepthHz: number
  ampLfo2SpeedModHz: number
  /** Very slow pan sweep (Hz); multi-minute periods typical. */
  panLfoHz: number
  /** Max stereo pan excursion (0 = center, ~1 = full L/R from sine). */
  panLfoDepth: number
  /** Semitones added to the default triad/octave layout before major-scale snap. */
  note: number
}

/** Centers for all voices; `applyVoiceMacrosToVoices` adds deterministic per-voice micro-jitter. */
export interface AsteroidMusicVoiceMacroDebug {
  amp: number
  ampLfoDepth: number
  ampLfoHz: number
  ampLfoSpeedModDepthHz: number
  ampLfoSpeedModHz: number
  ampLfo2Hz: number
  ampLfo2Depth: number
  ampLfo2SpeedModDepthHz: number
  ampLfo2SpeedModHz: number
  panLfoHz: number
  panLfoDepth: number
  /** Added to each voice’s note (with small per-voice jitter) after spread. */
  noteOffset: number
}

export interface AsteroidMusicDebug {
  voices: AsteroidMusicVoiceDebug[]
  /** Shared centers for all 12 voices; use `applyVoiceMacrosToVoices` after edits. */
  voiceMacros: AsteroidMusicVoiceMacroDebug
  /** Exponential smoothing rate (1/s); higher = faster tracking of target voice count. */
  influenceRate: number
  /** Multiplier on weighted activity before rounding to a voice target. */
  activityScale: number
  minVoices: number
  maxVoices: number
  voxelWeight: number
  satelliteWeight: number
  /** Global: seconds for each voice to fade from silence to full level when it becomes active. */
  voiceFadeInSec: number
  /** Global: seconds for each voice to fade to silence when it turns off. */
  voiceFadeOutSec: number

  /** Music bus — chorus dry/wet (0 = bypass). */
  chorusMix: number
  /** LFO rate modulating delay time (Hz). */
  chorusRateHz: number
  /** Peak delay modulation in ms (each side ~ half). */
  chorusDepthMs: number
  /** Mean delay offset for chorus (ms). */
  chorusDelayBaseMs: number

  /** Input gain into pre-filter waveshaper (overdrive). */
  busPreDrive: number

  /** Lowpass before reverb split (Hz); high values ≈ open. */
  busLowPassHz: number
  busLowPassQ: number
  /** Bus lowpass cutoff LFO base rate (Hz); separate from per-voice tremolo. */
  busLowPassLfoHz: number
  /** Peak ±Hz modulation of cutoff; 0 = LFO off. */
  busLowPassLfoDepthHz: number
  /** LFO-on-LFO: rate (Hz) that drifts `busLowPassLfoHz`. */
  busLowPassLfoSpeedModHz: number
  /** Max Hz the speed LFO can push the filter LFO rate (headroom-capped in engine). */
  busLowPassLfoSpeedModDepthHz: number

  /** Wet/dry mix toward convolver (0 = all dry, 1 = wet only, no dry). */
  reverbMix: number
  /** Scales wet path gain when mix > 0 (tames loud IR). */
  reverbWetTrim: number
  /** Impulse decay time / tail length (regenerates convolver buffer). */
  reverbDecaySec: number

  /** Wet-only post-reverb saturation: 0 = linear, 1 = strong clip. */
  busWetSaturatorAmount: number
}

/** Deterministic [0, 1) — varies per voice index for subtle randomisation. */
function u01(i: number, salt: number): number {
  let x = Math.imul(i + 1, 0x9e3779b1) ^ salt
  x ^= x >>> 16
  x = Math.imul(x, 0x85ebca6b)
  x ^= x >>> 13
  return (x >>> 0) / 0xffffffff
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** Multiplicative jitter around `center` for voice `i`. */
function spreadMul(center: number, i: number, salt: number, k: number): number {
  return center * (1 + k * (2 * u01(i, salt) - 1))
}

function defaultVoice(i: number): AsteroidMusicVoiceDebug {
  return {
    amp: 0.22 + u01(i, 0x51d4) * 0.16,
    /** High depth → tremolo reaches silence at trough (see engine: ×0.5 with 1.6 = full). */
    ampLfoDepth: 1.38 + u01(i, 0x62e5) * 0.22,
    /** Very slow main tremolo (Hz); engine caps so it never runs “fast”. */
    ampLfoHz: 0.006 + u01(i, 0x73f6) * 0.052,
    /** Noticeable wobble of tremolo rate (Hz); paired with low base speed. */
    ampLfoSpeedModDepthHz: 0.02 + u01(i, 0x8407) * 0.055,
    /** Slow LFO that modulates tremolo speed. */
    ampLfoSpeedModHz: 0.016 + u01(i, 0x9518) * 0.095,
    ampLfo2Depth: 0.38 + u01(i, 0xa629) * 0.18,
    ampLfo2Hz: 0.048 + u01(i, 0xb73a) * 0.11,
    ampLfo2SpeedModDepthHz: 0.018 + u01(i, 0xc84b) * 0.045,
    ampLfo2SpeedModHz: 0.022 + u01(i, 0xd95c) * 0.088,
    panLfoHz: 0.0015 + u01(i, 0xea6d) * 0.0185,
    panLfoDepth: 0.15 + u01(i, 0xfb7e) * 0.3,
    note: 0,
  }
}

export function voiceMacrosFromVoice(v: AsteroidMusicVoiceDebug): AsteroidMusicVoiceMacroDebug {
  return {
    amp: v.amp,
    ampLfoDepth: v.ampLfoDepth,
    ampLfoHz: v.ampLfoHz,
    ampLfoSpeedModDepthHz: v.ampLfoSpeedModDepthHz,
    ampLfoSpeedModHz: v.ampLfoSpeedModHz,
    ampLfo2Hz: v.ampLfo2Hz,
    ampLfo2Depth: v.ampLfo2Depth,
    ampLfo2SpeedModDepthHz: v.ampLfo2SpeedModDepthHz,
    ampLfo2SpeedModHz: v.ampLfo2SpeedModHz,
    panLfoHz: v.panLfoHz,
    panLfoDepth: v.panLfoDepth,
    noteOffset: v.note,
  }
}

/**
 * Writes every `voices[i]` from `debug.voiceMacros` with small deterministic per-voice variation.
 * Moving any macro control should call this, then persist / `applyDebugNow`.
 */
export function applyVoiceMacrosToVoices(debug: AsteroidMusicDebug): void {
  const m = debug.voiceMacros
  for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
    const v = debug.voices[i]
    v.amp = clamp(spreadMul(m.amp, i, 0x101d4, 0.055), 0, 0.95)
    v.ampLfoDepth = clamp(spreadMul(m.ampLfoDepth, i, 0x202e5, 0.045), 0, 1.6)
    v.ampLfoHz = clamp(spreadMul(m.ampLfoHz, i, 0x303f6, 0.038), 0.002, 24)
    v.ampLfoSpeedModDepthHz = clamp(spreadMul(m.ampLfoSpeedModDepthHz, i, 0x40407, 0.06), 0, 5)
    v.ampLfoSpeedModHz = clamp(spreadMul(m.ampLfoSpeedModHz, i, 0x50518, 0.065), 0.02, 0.35)
    v.ampLfo2Depth = clamp(spreadMul(m.ampLfo2Depth, i, 0x60629, 0.045), 0, 1.6)
    v.ampLfo2Hz = clamp(spreadMul(m.ampLfo2Hz, i, 0x7073a, 0.038), 0.002, 24)
    v.ampLfo2SpeedModDepthHz = clamp(spreadMul(m.ampLfo2SpeedModDepthHz, i, 0x8084b, 0.06), 0, 5)
    v.ampLfo2SpeedModHz = clamp(spreadMul(m.ampLfo2SpeedModHz, i, 0x9095c, 0.065), 0.02, 0.35)
    v.panLfoHz = clamp(spreadMul(m.panLfoHz, i, 0xa0a6d, 0.045), 0.0005, 0.05)
    v.panLfoDepth = clamp(spreadMul(m.panLfoDepth, i, 0xb0b7e, 0.05), 0, 0.95)
    const noteJ = Math.round(2 * (2 * u01(i, 0xc0c8f) - 1))
    v.note = clamp(Math.round(m.noteOffset) + noteJ, -12, 24)
  }
}

export function createDefaultAsteroidMusicDebug(): AsteroidMusicDebug {
  const voices: AsteroidMusicVoiceDebug[] = []
  for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
    voices.push(defaultVoice(i))
  }
  const voiceMacros = voiceMacrosFromVoice(voices[0])
  return {
    voices,
    voiceMacros,
    influenceRate: 2.8,
    activityScale: 0.9,
    minVoices: 0,
    maxVoices: 12,
    voxelWeight: 1,
    satelliteWeight: 1,
    voiceFadeInSec: 1.85,
    voiceFadeOutSec: 1.25,

    chorusMix: 0,
    chorusRateHz: 0.45,
    chorusDepthMs: 2.5,
    chorusDelayBaseMs: 18,
    busPreDrive: 1,
    busLowPassHz: 20000,
    busLowPassQ: 0.7,
    busLowPassLfoHz: 0.006,
    busLowPassLfoDepthHz: 0,
    busLowPassLfoSpeedModHz: 0.025,
    busLowPassLfoSpeedModDepthHz: 0.012,
    reverbMix: 0,
    reverbWetTrim: 0.55,
    reverbDecaySec: 2.2,
    busWetSaturatorAmount: 0,
  }
}
