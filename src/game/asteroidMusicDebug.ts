import {
  type ScaleClampMode,
  type ScaleCycleDirection,
  defaultSemitonesFromRootForVoice,
  parseScaleClampMode,
  scaleStepsForMode,
  snapMidiToScale,
} from './asteroidMusicScale'

export const ASTEROID_MUSIC_VOICE_COUNT = 12

/** Bounds for `voicePitchSpread` (global multiplier on static spread + note jitter depth). */
export const VOICE_PITCH_SPREAD_MIN = 0
export const VOICE_PITCH_SPREAD_MAX = 3

/** Absolute bounds for macro `noteJitterHz` (Settings log slider + persist). */
export const NOTE_JITTER_HZ_MIN = 0.0005
export const NOTE_JITTER_HZ_MAX = 4

/** Bounds for `noteJitterRateJitterHz` (slow wobble of note jitter rate; same as LFO `rateJitterHz`). */
export const NOTE_JITTER_RATE_JITTER_HZ_MIN = 0.0005
export const NOTE_JITTER_RATE_JITTER_HZ_MAX = 0.35

/** Macro music phrase spikes (occasional jitter depth / rate boost). */
/** Log-slider / active clamp floor for phrase starts/sec (above 0). */
export const PHRASE_RATE_HZ_MIN = 1e-5
export const PHRASE_RATE_HZ_MAX = 0.5
export const PHRASE_AVG_LENGTH_MIN = 0.05
export const PHRASE_AVG_LENGTH_MAX = 60
export const PHRASE_DEPTH_MAX = 4
const PHRASE_LENGTH_MIN = PHRASE_AVG_LENGTH_MIN
const PHRASE_LENGTH_MAX = PHRASE_AVG_LENGTH_MAX
/** Multiplier on `phraseDepth` when boosting effective note jitter Hz during a phrase. */
const PHRASE_K_RUN = 1

/** How macro note/rate jitter evolves over `voiceMacroJitterTimeSec`. */
export type MacroJitterMode = 'sine' | 'step'

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
  /** Semitones added to the default triad/octave layout before scale snap. */
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
  /** Extra semitone wobble over time; 0 = static spread only. */
  noteJitterDepthSemitones: number
  /** Modulation rate for note jitter (Hz); used with Debug log slider range. */
  noteJitterHz: number
  noteJitterMode: MacroJitterMode
  /** Multiplicative wobble on `noteJitterHz` (0–0.5); 0 = static note jitter rate. */
  noteJitterRateJitterDepth: number
  /** Rate (Hz) of the slow wobble applied to note jitter frequency. */
  noteJitterRateJitterHz: number
  noteJitterRateJitterMode: MacroJitterMode
  /** Multiplier on rate LFO wobble (0–0.5); 0 = no time variation on rates. */
  rateJitterDepth: number
  rateJitterHz: number
  rateJitterMode: MacroJitterMode
  /** Expected phrase starts per second; 0 = no phrase spikes. */
  phraseRateHz: number
  /** Multiplicative wobble on phrase rate (0–0.5); 0 = static phrase rate. */
  phraseRateJitterDepth: number
  /** Rate (Hz) of the slow wobble applied to phrase start rate. */
  phraseRateJitterHz: number
  phraseRateJitterMode: MacroJitterMode
  /** Mean phrase length (actual length hashed per slot). */
  phraseAvgLengthSec: number
  /** Spike strength (boosts effective jitter depth and Hz). */
  phraseDepth: number
}

export interface AsteroidMusicDebug {
  voices: AsteroidMusicVoiceDebug[]
  /** Shared centers for all 12 voices; use `applyVoiceMacrosToVoices` after edits. */
  voiceMacros: AsteroidMusicVoiceMacroDebug
  /** Monotonic seconds driving `noteJitter` / `rateJitter`; advanced in music `tick`. */
  voiceMacroJitterTimeSec: number
  /** Exponential smoothing rate (1/s); higher = faster tracking of target voice count. */
  influenceRate: number
  /** Multiplier on weighted activity before rounding to a voice target. */
  activityScale: number
  minVoices: number
  maxVoices: number
  /**
   * Mean lifetime (s) of an active voice slot when stochastic churn is on.
   * `0` = off (always the first N voices by index).
   */
  averageVoiceLifetimeSec: number
  /**
   * Multiplicative spread (0…1) around `averageVoiceLifetimeSec` for per-slot death rate only;
   * `0` = every slot uses the mean; `1` = per-slot τ ∈ [0, 2× mean] (deterministic from seed).
   */
  voiceLifetimeJitter: number
  voxelWeight: number
  satelliteWeight: number
  /** Global: seconds for each voice to fade from silence to full level when it becomes active. */
  voiceFadeInSec: number
  /** Global: seconds for each voice to fade to silence when it turns off. */
  voiceFadeOutSec: number
  /** Base time constant (s) for carrier pitch glide toward snapped note; 0 with `notePitchSlideJitterSec` 0 = instant. */
  notePitchSlideBaseSec: number
  /** Extra 0…jitter (s) per voice (deterministic hash) added to base glide time. */
  notePitchSlideJitterSec: number
  /**
   * Multiplier on deterministic inter-voice semitone spread and macro note-jitter depth (not `noteOffset`).
   * `1` = default; `0` = no spread/jitter movement.
   */
  voicePitchSpread: number

  /** Per-voice bandpass before VCA; center tracks smoothed carrier pitch. */
  voicePitchBandpassEnabled: boolean
  /** Semitones added to carrier Hz for bandpass center (−36…+36 in persist/UI). */
  voicePitchBandpassCenterSemitones: number
  /** Bandpass resonance (Q); one macro shared by all voices. */
  voicePitchBandpassQ: number

  /** Which pitch-class set (relative to procedural root) note snapping uses. */
  scaleClampMode: ScaleClampMode

  /** When true, tonic pitch class advances along the circle of fifths/fourths on a timer. */
  scaleCycleEnabled: boolean
  /** Seconds between advances (before jitter). */
  scaleCycleIntervalSec: number
  /** Randomized ± spread on each interval (deterministic from seed). */
  scaleCycleJitterSec: number
  /** +7 semitones per step (fifths) or +5 (fourths). */
  scaleCycleDirection: ScaleCycleDirection

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

  /** Pre-reverb stereo delay (wet path): delay time both channels (ms); engine max 16000. */
  preReverbStereoDelayTimeMs: number
  /** Feedback in each delay loop (0–1). */
  preReverbStereoDelayFeedback: number
  /** Highpass in feedback loop (Hz). */
  preReverbStereoDelayHighpassHz: number
  /** Lowpass in feedback loop (Hz); darkens repeats. */
  preReverbStereoDelayLowpassHz: number
  /** Delay send level vs direct wet (0 = delay off; direct stays full). */
  preReverbStereoDelayVolume: number
  /** Second parallel tap: delay time (ms); same max as tap 1 in engine. */
  preReverbStereoDelay2TimeMs: number
  /** Second tap send (0 = tap off). */
  preReverbStereoDelay2Volume: number
  /** Peak delay-time wobble (ms); both taps; engine max 8000 (8s). */
  preReverbStereoDelayRateJitterDepthMs: number
  /** Main wander rate (Hz); very slow (engine min ~1e-8). */
  preReverbStereoDelayRateJitterSpeedHz: number
  /** 0–1: LFO-on-LFO depth — how much the wander rate itself drifts (per tap, unsynced inner LFOs). */
  preReverbStereoDelayRateJitterRandomness: number

  /** Wet/dry mix toward convolver (0 = all dry, 1 = wet only, no dry). */
  reverbMix: number
  /** Scales wet path gain when mix > 0 (tames loud IR). */
  reverbWetTrim: number
  /**
   * Legacy single knob; migrated to `reverbIrDurationSec` / `reverbIrDecayPerSec` when those are absent from save.
   * IR generation uses the IR fields, not this value, when present.
   */
  reverbDecaySec: number
  /** Convolver impulse buffer length (s); regenerates IR. */
  reverbIrDurationSec: number
  /** Exponential decay constant k in IR `exp(-k·t)` (higher = shorter tail); regenerates IR. */
  reverbIrDecayPerSec: number
  /** Delay before convolver on wet path only (ms). */
  reverbPreDelayMs: number
  /** 0–1: independent L/R noise in IR (density / width). */
  reverbIrDecorrelate: number
  /** 0–1: one-pole HF damping on IR noise (darker tail). */
  reverbIrDamping: number
  /** 0–1: sparse early taps in first ~80 ms (reflection density). */
  reverbIrEarlyDensity: number
  /** Wet-only feedback delay time (ms); loop after convolver. */
  reverbWetFeedbackMs: number
  /** 0–1: feedback amount around wet delay (smear / regeneration). */
  reverbWetFeedback: number
  /** When true, `ConvolverNode.normalize` is on (balances IR energy). */
  reverbConvolverNormalize: boolean

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

const SALT_NOTE_STEP = 0xe2fa1
const SALT_NOTE_SINE_PH = 0xd1e90
const SALT_RATE_AMP = 0x111a1
const SALT_RATE_SPD1 = 0x222b2
const SALT_RATE_AMP2 = 0x333c3
const SALT_RATE_SPD2 = 0x444d4
const SALT_RATE_PAN = 0x555e5
const SALT_NOTE_RJ_STEP = 0x666f6
const SALT_NOTE_RJ_SINE = 0x77707
const SALT_PHRASE_START = 0x88818
const SALT_PHRASE_LEN = 0x99929
const SALT_PHRASE_RJ_STEP = 0xaa04b
const SALT_PHRASE_RJ_SINE = 0xbb05c

/**
 * Deterministic [0, 1] envelope: occasional boosted note-jitter “phrases” shared by all voices.
 * Uses bounded slot scan backward from `timeSec` (no unbounded history walk).
 */
function phraseEnvelope01(timeSec: number, m: AsteroidMusicVoiceMacroDebug): number {
  if (m.phraseDepth <= 0 || m.phraseRateHz <= 0 || !Number.isFinite(timeSec)) return 0
  let rate = clamp(m.phraseRateHz, PHRASE_RATE_HZ_MIN, PHRASE_RATE_HZ_MAX)
  if (m.phraseRateJitterDepth > 0) {
    const w = macroJitterWobble(
      m.phraseRateJitterMode,
      0,
      timeSec,
      m.phraseRateJitterHz,
      SALT_PHRASE_RJ_STEP,
      SALT_PHRASE_RJ_SINE,
    )
    rate = clamp(rate * (1 + m.phraseRateJitterDepth * w), PHRASE_RATE_HZ_MIN, PHRASE_RATE_HZ_MAX)
  }
  const avgLen = clamp(m.phraseAvgLengthSec, PHRASE_LENGTH_MIN, PHRASE_LENGTH_MAX)
  const slotSec = clamp(1 / (4 * rate), 0.25, 12)
  const p = Math.min(1, rate * slotSec)
  const t = Math.max(0, timeSec)
  const kMax = Math.floor(t / slotSec)
  const kMin = Math.max(0, Math.floor((t - PHRASE_LENGTH_MAX) / slotSec) - 1)
  for (let k = kMax; k >= kMin; k--) {
    const start = k * slotSec
    if (u01(0, k ^ SALT_PHRASE_START) >= p) continue
    const lenRaw = avgLen * (0.5 + 0.5 * u01(0, k ^ SALT_PHRASE_LEN))
    const len = clamp(lenRaw, PHRASE_LENGTH_MIN, PHRASE_LENGTH_MAX)
    if (t < start || t >= start + len) continue
    const edge = Math.min(0.08, len * 0.2)
    const u = t - start
    if (edge > 1e-6 && u < edge) {
      return 0.5 - 0.5 * Math.cos((Math.PI / edge) * u)
    }
    if (edge > 1e-6 && u > len - edge) {
      return 0.5 - 0.5 * Math.cos((Math.PI / edge) * (len - u))
    }
    return 1
  }
  return 0
}

function macroJitterWobble(
  mode: MacroJitterMode,
  i: number,
  timeSec: number,
  hz: number,
  stepSalt: number,
  sinePhaseSalt: number,
): number {
  const f = Math.max(1e-9, hz)
  if (mode === 'step') {
    const bucket = Math.floor(timeSec * f)
    return 2 * u01(i, bucket ^ stepSalt) - 1
  }
  return Math.sin(2 * Math.PI * f * timeSec + 2 * Math.PI * u01(i, sinePhaseSalt))
}

/**
 * Final semitone offset for a voice: macro center + static spread + optional time jitter,
 * folded to a scale-snapped delta vs the voice’s triad layout for `rootMidi`.
 */
export function computeVoiceNoteSemitones(
  m: AsteroidMusicVoiceMacroDebug,
  i: number,
  timeSec: number,
  rootMidi: number,
  scaleSteps: readonly number[],
  pitchSpreadMul: number,
): number {
  const mul = clamp(
    typeof pitchSpreadMul === 'number' && Number.isFinite(pitchSpreadMul) ? pitchSpreadMul : 1,
    VOICE_PITCH_SPREAD_MIN,
    VOICE_PITCH_SPREAD_MAX,
  )
  const uStatic = 2 * (2 * u01(i, 0xc0c8f) - 1)
  const noteJ = Math.round(mul * uStatic)
  let extra = 0
  if (m.noteJitterDepthSemitones > 0 && Number.isFinite(timeSec)) {
    let hz = clamp(m.noteJitterHz, NOTE_JITTER_HZ_MIN, NOTE_JITTER_HZ_MAX)
    if (m.noteJitterRateJitterDepth > 0) {
      const w = macroJitterWobble(
        m.noteJitterRateJitterMode,
        i,
        timeSec,
        m.noteJitterRateJitterHz,
        SALT_NOTE_RJ_STEP,
        SALT_NOTE_RJ_SINE,
      )
      hz = clamp(hz * (1 + m.noteJitterRateJitterDepth * w), NOTE_JITTER_HZ_MIN, NOTE_JITTER_HZ_MAX)
    }
    const env = phraseEnvelope01(timeSec, m)
    const depthEff = clamp(m.noteJitterDepthSemitones * mul * (1 + m.phraseDepth * env), 0, 6 * mul)
    hz = clamp(hz * (1 + PHRASE_K_RUN * m.phraseDepth * env), NOTE_JITTER_HZ_MIN, NOTE_JITTER_HZ_MAX)
    hz = Math.max(1e-9, hz)
    if (m.noteJitterMode === 'step') {
      const bucket = Math.floor(timeSec * hz)
      extra = Math.round((2 * u01(i, bucket ^ SALT_NOTE_STEP) - 1) * depthEff)
    } else {
      extra = Math.round(
        depthEff * Math.sin(2 * Math.PI * hz * timeSec + 2 * Math.PI * u01(i, SALT_NOTE_SINE_PH)),
      )
    }
  }
  const raw = Math.round(m.noteOffset) + noteJ + extra
  const base = rootMidi + defaultSemitonesFromRootForVoice(i)
  let rough = base + raw
  if (!Number.isFinite(rough)) {
    rough = base + Math.round(m.noteOffset) + noteJ
  }
  if (!Number.isFinite(rough)) {
    return 0
  }
  const snapped = snapMidiToScale(rough, rootMidi, scaleSteps)
  const out = snapped - base
  return Number.isFinite(out) ? out : 0
}

function applyRateJitter(
  v0: number,
  i: number,
  timeSec: number,
  m: AsteroidMusicVoiceMacroDebug,
  lo: number,
  hi: number,
  stepSalt: number,
  sineSalt: number,
): number {
  if (m.rateJitterDepth <= 0 || !Number.isFinite(timeSec)) return v0
  const w = macroJitterWobble(m.rateJitterMode, i, timeSec, m.rateJitterHz, stepSalt, sineSalt)
  const r = clamp(v0 * (1 + m.rateJitterDepth * w), lo, hi)
  return Number.isFinite(r) ? r : v0
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

const DEFAULT_JITTER_MACROS: Pick<
  AsteroidMusicVoiceMacroDebug,
  | 'noteJitterDepthSemitones'
  | 'noteJitterHz'
  | 'noteJitterMode'
  | 'noteJitterRateJitterDepth'
  | 'noteJitterRateJitterHz'
  | 'noteJitterRateJitterMode'
  | 'rateJitterDepth'
  | 'rateJitterHz'
  | 'rateJitterMode'
  | 'phraseRateHz'
  | 'phraseRateJitterDepth'
  | 'phraseRateJitterHz'
  | 'phraseRateJitterMode'
  | 'phraseAvgLengthSec'
  | 'phraseDepth'
> = {
  noteJitterDepthSemitones: 0,
  noteJitterHz: 0.02,
  noteJitterMode: 'sine',
  noteJitterRateJitterDepth: 0,
  noteJitterRateJitterHz: 0.02,
  noteJitterRateJitterMode: 'sine',
  rateJitterDepth: 0,
  rateJitterHz: 0.02,
  rateJitterMode: 'sine',
  phraseRateHz: 0,
  phraseRateJitterDepth: 0,
  phraseRateJitterHz: 0.02,
  phraseRateJitterMode: 'sine',
  phraseAvgLengthSec: 2,
  phraseDepth: 0,
}

/** Shared template — `applyVoiceMacrosToVoices` runs every animation frame; never allocate a full default graph per call. */
let defaultAsteroidMusicDebugSingleton: AsteroidMusicDebug | null = null

function getDefaultAsteroidMusicDebugSingleton(): AsteroidMusicDebug {
  if (!defaultAsteroidMusicDebugSingleton) {
    defaultAsteroidMusicDebugSingleton = createDefaultAsteroidMusicDebug()
  }
  return defaultAsteroidMusicDebugSingleton
}

/** Ensures `voices` has 12 entries (fixes sparse/short arrays from bad JSON). */
export function ensureAsteroidMusicVoicesArray(debug: AsteroidMusicDebug): void {
  if (Array.isArray(debug.voices) && debug.voices.length === ASTEROID_MUSIC_VOICE_COUNT) {
    let ok = true
    for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
      const vi = debug.voices[i]
      if (!vi || typeof vi !== 'object') {
        ok = false
        break
      }
    }
    if (ok) return
  }
  const def = getDefaultAsteroidMusicDebugSingleton()
  if (!Array.isArray(debug.voices)) {
    debug.voices = def.voices.map((x) => ({ ...x }))
    return
  }
  while (debug.voices.length < ASTEROID_MUSIC_VOICE_COUNT) {
    const i = debug.voices.length
    debug.voices.push({ ...def.voices[i] })
  }
  if (debug.voices.length > ASTEROID_MUSIC_VOICE_COUNT) {
    debug.voices.length = ASTEROID_MUSIC_VOICE_COUNT
  }
  for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
    if (!debug.voices[i] || typeof debug.voices[i] !== 'object') {
      debug.voices[i] = { ...def.voices[i] }
    }
  }
}

/**
 * Fills non-finite macro numbers from defaults (not only jitter — `spreadMul` needs every center).
 * Call before `applyVoiceMacrosToVoices`.
 */
export function sanitizeVoiceMacrosForApply(debug: AsteroidMusicDebug): void {
  const ref = getDefaultAsteroidMusicDebugSingleton().voiceMacros
  if (!debug.voiceMacros || typeof debug.voiceMacros !== 'object') {
    debug.voiceMacros = { ...ref }
    ensureVoiceMacroJitterFields(debug)
    return
  }
  const m = debug.voiceMacros
  for (const key of Object.keys(ref) as (keyof AsteroidMusicVoiceMacroDebug)[]) {
    if (
      key === 'noteJitterMode' ||
      key === 'noteJitterRateJitterMode' ||
      key === 'rateJitterMode' ||
      key === 'phraseRateJitterMode'
    )
      continue
    const cur = m[key]
    if (typeof cur !== 'number' || !Number.isFinite(cur)) {
      ;(m as unknown as Record<string, number>)[key] = ref[key] as number
    }
  }
  ensureVoiceMacroJitterFields(debug)
}

export function ensureVoiceMacroJitterFields(debug: AsteroidMusicDebug): void {
  if (!debug.voiceMacros || typeof debug.voiceMacros !== 'object') {
    debug.voiceMacros = { ...getDefaultAsteroidMusicDebugSingleton().voiceMacros }
  }
  const m = debug.voiceMacros
  if (typeof m.noteOffset !== 'number' || !Number.isFinite(m.noteOffset)) {
    m.noteOffset = 0
  } else {
    m.noteOffset = clamp(Math.round(m.noteOffset), -12, 24)
  }
  if (typeof m.noteJitterDepthSemitones !== 'number' || !Number.isFinite(m.noteJitterDepthSemitones)) {
    m.noteJitterDepthSemitones = DEFAULT_JITTER_MACROS.noteJitterDepthSemitones
  } else {
    m.noteJitterDepthSemitones = clamp(m.noteJitterDepthSemitones, 0, 6)
  }
  if (typeof m.noteJitterHz !== 'number' || !Number.isFinite(m.noteJitterHz) || m.noteJitterHz <= 0) {
    m.noteJitterHz = DEFAULT_JITTER_MACROS.noteJitterHz
  } else {
    m.noteJitterHz = clamp(m.noteJitterHz, NOTE_JITTER_HZ_MIN, NOTE_JITTER_HZ_MAX)
  }
  m.noteJitterMode = m.noteJitterMode === 'step' ? 'step' : 'sine'
  if (typeof m.noteJitterRateJitterDepth !== 'number' || !Number.isFinite(m.noteJitterRateJitterDepth)) {
    m.noteJitterRateJitterDepth = DEFAULT_JITTER_MACROS.noteJitterRateJitterDepth
  } else {
    m.noteJitterRateJitterDepth = clamp(m.noteJitterRateJitterDepth, 0, 0.5)
  }
  if (
    typeof m.noteJitterRateJitterHz !== 'number' ||
    !Number.isFinite(m.noteJitterRateJitterHz) ||
    m.noteJitterRateJitterHz <= 0
  ) {
    m.noteJitterRateJitterHz = DEFAULT_JITTER_MACROS.noteJitterRateJitterHz
  } else {
    m.noteJitterRateJitterHz = clamp(
      m.noteJitterRateJitterHz,
      NOTE_JITTER_RATE_JITTER_HZ_MIN,
      NOTE_JITTER_RATE_JITTER_HZ_MAX,
    )
  }
  m.noteJitterRateJitterMode = m.noteJitterRateJitterMode === 'step' ? 'step' : 'sine'
  if (typeof m.rateJitterDepth !== 'number' || !Number.isFinite(m.rateJitterDepth)) {
    m.rateJitterDepth = DEFAULT_JITTER_MACROS.rateJitterDepth
  } else {
    m.rateJitterDepth = clamp(m.rateJitterDepth, 0, 0.5)
  }
  if (typeof m.rateJitterHz !== 'number' || !Number.isFinite(m.rateJitterHz) || m.rateJitterHz <= 0) {
    m.rateJitterHz = DEFAULT_JITTER_MACROS.rateJitterHz
  }
  m.rateJitterMode = m.rateJitterMode === 'step' ? 'step' : 'sine'
  if (typeof m.phraseRateHz !== 'number' || !Number.isFinite(m.phraseRateHz)) {
    m.phraseRateHz = DEFAULT_JITTER_MACROS.phraseRateHz
  } else if (m.phraseRateHz <= 0) {
    m.phraseRateHz = 0
  } else {
    m.phraseRateHz = clamp(m.phraseRateHz, PHRASE_RATE_HZ_MIN, PHRASE_RATE_HZ_MAX)
  }
  if (typeof m.phraseRateJitterDepth !== 'number' || !Number.isFinite(m.phraseRateJitterDepth)) {
    m.phraseRateJitterDepth = DEFAULT_JITTER_MACROS.phraseRateJitterDepth
  } else {
    m.phraseRateJitterDepth = clamp(m.phraseRateJitterDepth, 0, 0.5)
  }
  if (
    typeof m.phraseRateJitterHz !== 'number' ||
    !Number.isFinite(m.phraseRateJitterHz) ||
    m.phraseRateJitterHz <= 0
  ) {
    m.phraseRateJitterHz = DEFAULT_JITTER_MACROS.phraseRateJitterHz
  } else {
    m.phraseRateJitterHz = clamp(
      m.phraseRateJitterHz,
      NOTE_JITTER_RATE_JITTER_HZ_MIN,
      NOTE_JITTER_RATE_JITTER_HZ_MAX,
    )
  }
  m.phraseRateJitterMode = m.phraseRateJitterMode === 'step' ? 'step' : 'sine'
  if (typeof m.phraseAvgLengthSec !== 'number' || !Number.isFinite(m.phraseAvgLengthSec)) {
    m.phraseAvgLengthSec = DEFAULT_JITTER_MACROS.phraseAvgLengthSec
  } else {
    m.phraseAvgLengthSec = clamp(m.phraseAvgLengthSec, PHRASE_LENGTH_MIN, PHRASE_LENGTH_MAX)
  }
  if (typeof m.phraseDepth !== 'number' || !Number.isFinite(m.phraseDepth)) {
    m.phraseDepth = DEFAULT_JITTER_MACROS.phraseDepth
  } else {
    m.phraseDepth = clamp(m.phraseDepth, 0, PHRASE_DEPTH_MAX)
  }
  if (typeof debug.voiceMacroJitterTimeSec !== 'number' || !Number.isFinite(debug.voiceMacroJitterTimeSec)) {
    debug.voiceMacroJitterTimeSec = 0
  } else {
    debug.voiceMacroJitterTimeSec = Math.max(0, debug.voiceMacroJitterTimeSec)
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
    ...DEFAULT_JITTER_MACROS,
  }
}

/**
 * Writes every `voices[i]` from `debug.voiceMacros` with small deterministic per-voice variation.
 * Uses `debug.voiceMacroJitterTimeSec` for note and rate time jitter.
 * Moving any macro control should call this, then persist / `applyDebugNow`.
 */
export function applyVoiceMacrosToVoices(debug: AsteroidMusicDebug, rootMidi: number): void {
  ensureAsteroidMusicVoicesArray(debug)
  sanitizeVoiceMacrosForApply(debug)
  debug.scaleClampMode = parseScaleClampMode(debug.scaleClampMode, 'major')
  const scaleSteps = scaleStepsForMode(debug.scaleClampMode)
  const m = debug.voiceMacros
  const t = Number.isFinite(debug.voiceMacroJitterTimeSec) ? debug.voiceMacroJitterTimeSec : 0
  const pitchSpreadMul = clamp(
    typeof debug.voicePitchSpread === 'number' && Number.isFinite(debug.voicePitchSpread)
      ? debug.voicePitchSpread
      : 1,
    VOICE_PITCH_SPREAD_MIN,
    VOICE_PITCH_SPREAD_MAX,
  )
  for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
    const v = debug.voices[i]
    v.amp = clamp(spreadMul(m.amp, i, 0x101d4, 0.055), 0, 0.95)
    v.ampLfoDepth = clamp(spreadMul(m.ampLfoDepth, i, 0x202e5, 0.045), 0, 1.6)
    let ampLfoHz = clamp(spreadMul(m.ampLfoHz, i, 0x303f6, 0.038), 0.002, 24)
    ampLfoHz = applyRateJitter(ampLfoHz, i, t, m, 0.002, 24, SALT_RATE_AMP ^ 0x10000, SALT_RATE_AMP)
    v.ampLfoHz = ampLfoHz
    v.ampLfoSpeedModDepthHz = clamp(spreadMul(m.ampLfoSpeedModDepthHz, i, 0x40407, 0.06), 0, 5)
    let ampLfoSpeedModHz = clamp(spreadMul(m.ampLfoSpeedModHz, i, 0x50518, 0.065), 0.02, 0.35)
    ampLfoSpeedModHz = applyRateJitter(
      ampLfoSpeedModHz,
      i,
      t,
      m,
      0.02,
      0.35,
      SALT_RATE_SPD1 ^ 0x10000,
      SALT_RATE_SPD1,
    )
    v.ampLfoSpeedModHz = ampLfoSpeedModHz
    v.ampLfo2Depth = clamp(spreadMul(m.ampLfo2Depth, i, 0x60629, 0.045), 0, 1.6)
    let ampLfo2Hz = clamp(spreadMul(m.ampLfo2Hz, i, 0x7073a, 0.038), 0.002, 24)
    ampLfo2Hz = applyRateJitter(ampLfo2Hz, i, t, m, 0.002, 24, SALT_RATE_AMP2 ^ 0x10000, SALT_RATE_AMP2)
    v.ampLfo2Hz = ampLfo2Hz
    v.ampLfo2SpeedModDepthHz = clamp(spreadMul(m.ampLfo2SpeedModDepthHz, i, 0x8084b, 0.06), 0, 5)
    let ampLfo2SpeedModHz = clamp(spreadMul(m.ampLfo2SpeedModHz, i, 0x9095c, 0.065), 0.02, 0.35)
    ampLfo2SpeedModHz = applyRateJitter(
      ampLfo2SpeedModHz,
      i,
      t,
      m,
      0.02,
      0.35,
      SALT_RATE_SPD2 ^ 0x10000,
      SALT_RATE_SPD2,
    )
    v.ampLfo2SpeedModHz = ampLfo2SpeedModHz
    let panLfoHz = clamp(spreadMul(m.panLfoHz, i, 0xa0a6d, 0.045), 0.0005, 0.05)
    panLfoHz = applyRateJitter(panLfoHz, i, t, m, 0.0005, 0.05, SALT_RATE_PAN ^ 0x10000, SALT_RATE_PAN)
    v.panLfoHz = panLfoHz
    v.panLfoDepth = clamp(spreadMul(m.panLfoDepth, i, 0xb0b7e, 0.05), 0, 0.95)
    v.note = computeVoiceNoteSemitones(m, i, t, rootMidi, scaleSteps, pitchSpreadMul)
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
    voiceMacroJitterTimeSec: 0,
    influenceRate: 2.8,
    activityScale: 0.9,
    minVoices: 0,
    maxVoices: 12,
    averageVoiceLifetimeSec: 0,
    voiceLifetimeJitter: 0,
    voxelWeight: 1,
    satelliteWeight: 1,
    voiceFadeInSec: 1.85,
    voiceFadeOutSec: 1.25,
    notePitchSlideBaseSec: 3,
    notePitchSlideJitterSec: 2,
    voicePitchSpread: 1,
    voicePitchBandpassEnabled: false,
    voicePitchBandpassCenterSemitones: 0,
    voicePitchBandpassQ: 5,
    scaleClampMode: 'major',
    scaleCycleEnabled: true,
    scaleCycleIntervalSec: 180,
    scaleCycleJitterSec: 0,
    scaleCycleDirection: 'fifths',

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
    preReverbStereoDelayTimeMs: 520,
    preReverbStereoDelayFeedback: 0.25,
    preReverbStereoDelayHighpassHz: 220,
    preReverbStereoDelayLowpassHz: 10000,
    preReverbStereoDelayVolume: 0.3,
    preReverbStereoDelay2TimeMs: 3000,
    preReverbStereoDelay2Volume: 0,
    preReverbStereoDelayRateJitterDepthMs: 0,
    preReverbStereoDelayRateJitterSpeedHz: 0.016,
    preReverbStereoDelayRateJitterRandomness: 0,
    reverbMix: 0,
    reverbWetTrim: 0.55,
    reverbDecaySec: 2.2,
    reverbIrDurationSec: 3.96,
    reverbIrDecayPerSec: 1.45,
    reverbPreDelayMs: 0,
    reverbIrDecorrelate: 0.4,
    reverbIrDamping: 0.3,
    reverbIrEarlyDensity: 0.45,
    reverbWetFeedbackMs: 32,
    reverbWetFeedback: 0.18,
    reverbConvolverNormalize: true,
    busWetSaturatorAmount: 0,
  }
}
