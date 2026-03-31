import { getAudioContext, resumeAudioContext, isAudioContextReady } from './audioContext'
import { getMusicPostChainInput } from './masterOutputChain'
import {
  type AsteroidMusicDebug,
  ASTEROID_MUSIC_VOICE_COUNT,
  applyVoiceMacrosToVoices,
} from './asteroidMusicDebug'
import { createReverbImpulseBuffer, type ReverbImpulseOptions } from './reverbImpulse'
import {
  defaultSemitonesFromRootForVoice,
  effectiveRootMidiAfterCycleSteps,
  parseScaleCycleDirection,
  rootMidiFromSeed,
  scaleStepsForMode,
  snapMidiToScale,
} from './asteroidMusicScale'

const STRUCTURE_KINDS = new Set<string>([
  'replicator',
  'reactor',
  'battery',
  'hub',
  'refinery',
  'depthScanner',
  'computronium',
  'processedMatter',
])

/** Must exceed base delay + peak modulation. */
const CHORUS_MAX_DELAY_SEC = 0.06

/** Pre-delay into convolver (music wet path). */
const REVERB_MAX_PRE_DELAY_SEC = 0.15
/** Wet feedback loop delay (after convolver). */
const REVERB_MAX_WET_FB_DELAY_SEC = 0.13
/** Pre-reverb stereo delay (tap 1 L/R); max delay 16s + up to 8s peak time-jitter + margin. */
const PRE_REVERB_STEREO_DELAY_MAX_SEC = 24.35
/** Tap 2 L/R; same as tap 1. */
const PRE_REVERB_STEREO_DELAY2_MAX_SEC = 24.35
/** Min center rate for pre-reverb delay-time wander (Hz); ~3.2 yr period at floor. */
const PRE_DELAY_JIT_SPEED_HZ_MIN = 1e-8
/** Below min wander rate so `maxDep` / randomness headroom stays valid. */
const PRE_DELAY_JIT_MAIN_HEADROOM_HZ = 1e-10

const PRE_SHAPER_CURVE = makePreShaperCurve()

export function countStructureVoxelsForMusic(cells: readonly { kind: string }[]): number {
  let n = 0
  for (const c of cells) {
    if (STRUCTURE_KINDS.has(c.kind)) n++
  }
  return n
}

function midiToHz(m: number): number {
  if (!Number.isFinite(m)) return 440
  return 440 * 2 ** ((m - 69) / 12)
}

/** Avoids Web Audio `setValueAtTime(NaN)` which throws. */
function audioFinite(n: number, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}

/** Deterministic [0, 1) — same style as `u01` in asteroidMusicDebug; varies by seed + salt. */
function phase01(seed: number, salt: number): number {
  let x = Math.imul((seed >>> 0) + 1, 0x9e3779b1) ^ salt
  x ^= x >>> 16
  x = Math.imul(x, 0x85ebca6b)
  x ^= x >>> 13
  return (x >>> 0) / 0xffffffff
}

/**
 * Start sine so phase at `tRef` is approximately `phase01` cycles.
 * `when = tRef - p/f` must be >= 0; for very low f, `p/f` can exceed `tRef` (LFOs), so clamp —
 * unclamped negative times throw InvalidStateError and abort the whole graph build.
 */
function startOscillatorAtPhase(osc: OscillatorNode, ctx: BaseAudioContext, phase01: number): void {
  const f = Math.max(1e-6, osc.frequency.value)
  const p = phase01 - Math.floor(phase01)
  const tRef = ctx.currentTime
  const when = Math.max(0, tRef - p / f)
  osc.start(when)
}

const PHASE_SALT_CHORUS = 0xa11f0
const PHASE_SALT_CARRIER = 0xca01e
const PHASE_SALT_AMP_LFO = 0x4a01e
const PHASE_SALT_SPEED_LFO = 0x51d40
const PHASE_SALT_AMP_LFO2 = 0x5b02f
const PHASE_SALT_SPEED_LFO2 = 0x62e41
const PHASE_SALT_PAN_LFO = 0x6d053
const PHASE_SALT_FAST_AMP_LFO = 0x7a164
const PHASE_SALT_FAST_SPEED_LFO = 0x8b275
/** Per-voice spread for pitch glide time constant (with `notePitchSlideJitterSec`). */
const PHASE_SALT_PITCH_SLIDE = 0x91d00
/** Bus lowpass LFO + speed LFO — not shared with per-voice tremolo salts. */
const PHASE_SALT_BUS_FILTER_LFO = 0x7e164
const PHASE_SALT_BUS_FILTER_SPEED_LFO = 0x8f275
const PHASE_SALT_PRE_DLY_JIT1_LFO = 0x9a386
const PHASE_SALT_PRE_DLY_JIT1_SPEED = 0xa0497
const PHASE_SALT_PRE_DLY_JIT2_LFO = 0xb15a8
const PHASE_SALT_PRE_DLY_JIT2_SPEED = 0xc26b9
const PHASE_SALT_PRE_DLY_JIT2_RATE_MUL = 0xd37ca
/** Macro jitter on pre-reverb stereo delay feedback amount. */
const PHASE_SALT_PRE_FB_JIT = 0xe48ad
/** Rate wobble for pre-reverb stereo delay feedback jitter. */
const PHASE_SALT_PRE_FB_JIT_RATE = 0xf59be
const PHASE_SALT_SCALE_CYCLE = 0xe48ec
const PHASE_SALT_VOICE_LIFETIME = 0xf1a7d

function makePreShaperCurve(): Float32Array<ArrayBuffer> {
  const n = 65536
  const c = new Float32Array(n) as Float32Array<ArrayBuffer>
  const k = 2.4
  const inv = 1 / Math.tanh(k)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    c[i] = Math.tanh(k * x) * inv
  }
  return c
}

function makeWetSatCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 65536
  const c = new Float32Array(n) as Float32Array<ArrayBuffer>
  const k = 2 + amount * 7
  const inv = 1 / Math.tanh(k)
  const a = Math.min(1, Math.max(0, amount))
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    const sat = Math.tanh(k * x) * inv
    c[i] = (1 - a) * x + a * sat
  }
  return c
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function busNum(d: AsteroidMusicDebug, key: keyof AsteroidMusicDebug, fallback: number): number {
  const v = d[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

type VoiceNodes = {
  carrier: OscillatorNode
  carrierDetuned: OscillatorNode
  pitchBandpass: BiquadFilterNode
  bpDryGain: GainNode
  bpWetGain: GainNode
  toneLowpass: BiquadFilterNode
  reeseDriveGain: GainNode
  reeseShaper: WaveShaperNode
  vca: GainNode
  ampLfo: OscillatorNode
  speedLfo: OscillatorNode
  speedDepth: GainNode
  lfoDepth: GainNode
  ampLfo2: OscillatorNode
  speedLfo2: OscillatorNode
  speedDepth2: GainNode
  lfoDepth2: GainNode
  fastAmpLfo: OscillatorNode
  fastAmpSpeedLfo: OscillatorNode
  fastAmpSpeedDepth: GainNode
  fastAmpDepth: GainNode
  stereoPanner: StereoPannerNode
  panLfo: OscillatorNode
  panLfoDepth: GainNode
  levelGain: GainNode
}

type BusFxNodes = {
  chorusDry: GainNode
  chorusDelay: DelayNode
  chorusWet: GainNode
  chorusMerge: GainNode
  chorusLfo: OscillatorNode
  chorusModDepth: GainNode
  preDriveGain: GainNode
  preShaper: WaveShaperNode
  lpFreqBase: ConstantSourceNode
  filterLfo: OscillatorNode
  filterModDepth: GainNode
  filterSpeedLfo: OscillatorNode
  filterSpeedDepth: GainNode
  lowpass: BiquadFilterNode
  dryBus: GainNode
  preReverbSplit: ChannelSplitterNode
  preReverbMerge: ChannelMergerNode
  preReverbSumL: GainNode
  preReverbSumR: GainNode
  preReverbDelayL: DelayNode
  preReverbDelayR: DelayNode
  preReverbFbHpfL: BiquadFilterNode
  preReverbFbHpfR: BiquadFilterNode
  preReverbFbLpfL: BiquadFilterNode
  preReverbFbLpfR: BiquadFilterNode
  preReverbFbGainL: GainNode
  preReverbFbGainR: GainNode
  preReverbDirectL: GainNode
  preReverbDirectR: GainNode
  preReverbDelayVolL: GainNode
  preReverbDelayVolR: GainNode
  preReverbSumL2: GainNode
  preReverbSumR2: GainNode
  preReverbDelayL2: DelayNode
  preReverbDelayR2: DelayNode
  preReverbFbHpfL2: BiquadFilterNode
  preReverbFbHpfR2: BiquadFilterNode
  preReverbFbLpfL2: BiquadFilterNode
  preReverbFbLpfR2: BiquadFilterNode
  preReverbFbGainL2: GainNode
  preReverbFbGainR2: GainNode
  preReverbDelay2VolL: GainNode
  preReverbDelay2VolR: GainNode
  preDlyJit1Lfo: OscillatorNode
  preDlyJit1Depth: GainNode
  preDlyJit1SpeedLfo: OscillatorNode
  preDlyJit1SpeedDepth: GainNode
  preDlyJit2Lfo: OscillatorNode
  preDlyJit2Depth: GainNode
  preDlyJit2SpeedLfo: OscillatorNode
  preDlyJit2SpeedDepth: GainNode
  reverbPreDelay: DelayNode
  convolver: ConvolverNode
  reverbWetSum: GainNode
  reverbFbDelay: DelayNode
  reverbFbFeedback: GainNode
  postShaper: WaveShaperNode
  wetBus: GainNode
}

export function createAsteroidAmbientMusic(options: {
  getDebug: () => AsteroidMusicDebug
  getMusicVolume: () => number
}): {
  tryEnsureGraph: () => void
  /** Apply music debug + bus FX immediately (e.g. slider input); resumes audio context. */
  applyDebugNow: () => void
  /** Procedural root plus circle-of-fifths/fourths step (matches carrier snapping). */
  getEffectiveRootMidi: () => number
  setSeed: (seed: number) => void
  resetVoiceSmoothing: () => void
  tick: (
    dtSec: number,
    structureVoxelCount: number,
    orbitalSats: number,
    excavatingSats: number,
    scannerSats: number,
    drossCollectorSats: number,
  ) => void
  dispose: () => void
} {
  const { getDebug, getMusicVolume } = options
  let seed = 42
  /** Position on the circle of fifths/fourths (0…11). */
  let scaleCycleStep = 0
  /** Countdown (s) until the next step; only decrements while `scaleCycleEnabled`. */
  let scaleCycleTimeToNextSec = 180
  let displayedVoices = 0
  const smoothedVoiceGain: number[] = Array.from(
    { length: ASTEROID_MUSIC_VOICE_COUNT },
    () => 0,
  )
  const voiceWasActive: boolean[] = Array.from(
    { length: ASTEROID_MUSIC_VOICE_COUNT },
    () => false,
  )
  const fadeInStartMs: (number | null)[] = Array.from(
    { length: ASTEROID_MUSIC_VOICE_COUNT },
    () => null,
  )
  const fadeOutStartMs: (number | null)[] = Array.from(
    { length: ASTEROID_MUSIC_VOICE_COUNT },
    () => null,
  )
  const gainAtFadeOutStart: number[] = Array.from(
    { length: ASTEROID_MUSIC_VOICE_COUNT },
    () => 0,
  )
  const smoothedCarrierHz: number[] = Array.from(
    { length: ASTEROID_MUSIC_VOICE_COUNT },
    () => 440,
  )
  /** Skip redundant `setValueAtTime` when values are unchanged (reduces main-thread churn). */
  const lastSentAtVoice = {
    carrierHz: new Float32Array(ASTEROID_MUSIC_VOICE_COUNT),
    pitchBpHz: new Float32Array(ASTEROID_MUSIC_VOICE_COUNT),
    pitchBpQ: new Float32Array(ASTEROID_MUSIC_VOICE_COUNT),
    ampLfoHz: new Float32Array(ASTEROID_MUSIC_VOICE_COUNT),
    ampLfo2Hz: new Float32Array(ASTEROID_MUSIC_VOICE_COUNT),
    fastAmpLfoHz: new Float32Array(ASTEROID_MUSIC_VOICE_COUNT),
    fastAmpSpeedLfoHz: new Float32Array(ASTEROID_MUSIC_VOICE_COUNT),
    panLfoHz: new Float32Array(ASTEROID_MUSIC_VOICE_COUNT),
    speedLfoHz: new Float32Array(ASTEROID_MUSIC_VOICE_COUNT),
    speedLfo2Hz: new Float32Array(ASTEROID_MUSIC_VOICE_COUNT),
  }
  function clearLastSentVoiceAudioParams(): void {
    lastSentAtVoice.carrierHz.fill(Number.NaN)
    lastSentAtVoice.pitchBpHz.fill(Number.NaN)
    lastSentAtVoice.pitchBpQ.fill(Number.NaN)
    lastSentAtVoice.ampLfoHz.fill(Number.NaN)
    lastSentAtVoice.ampLfo2Hz.fill(Number.NaN)
    lastSentAtVoice.fastAmpLfoHz.fill(Number.NaN)
    lastSentAtVoice.fastAmpSpeedLfoHz.fill(Number.NaN)
    lastSentAtVoice.panLfoHz.fill(Number.NaN)
    lastSentAtVoice.speedLfoHz.fill(Number.NaN)
    lastSentAtVoice.speedLfo2Hz.fill(Number.NaN)
  }
  function setVoiceParamIfChanged(
    buf: Float32Array,
    i: number,
    next: number,
    param: AudioParam,
    t: number,
    eps: number,
  ): void {
    const v = audioFinite(next, next)
    const prev = buf[i]!
    if (Number.isFinite(prev) && Math.abs(prev - v) <= eps) return
    buf[i] = v
    param.setValueAtTime(v, t)
  }
  let carrierPitchSmoothPrimed = true
  let lastPitchSyncPerfMs: number | null = null
  let masterGain: GainNode | null = null
  let busFx: BusFxNodes | null = null
  let ctxRef: AudioContext | null = null
  let lastReverbIrKey = ''
  let lastWetSatAmount = -1
  let lastChorusBaseMs = Number.NaN
  const voices: VoiceNodes[] = []
  const voiceSlotActive: boolean[] = Array.from(
    { length: ASTEROID_MUSIC_VOICE_COUNT },
    () => false,
  )

  function syncVoiceSlotMaskFromDisplayed(): void {
    const n = Math.min(
      ASTEROID_MUSIC_VOICE_COUNT,
      Math.max(0, Math.round(displayedVoices)),
    )
    for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
      voiceSlotActive[i] = i < n
    }
  }

  /** Birth/death on slots so count and identity fluctuate around smoothed `displayedVoices`. */
  function stepVoiceSlotChurn(dtSec: number, d: AsteroidMusicDebug): void {
    const tau = d.averageVoiceLifetimeSec
    if (!Number.isFinite(tau) || tau <= 0) {
      syncVoiceSlotMaskFromDisplayed()
      return
    }
    const dt = Math.max(0, dtSec)
    if (dt <= 0) return
    const jRaw =
      typeof d.voiceLifetimeJitter === 'number' && Number.isFinite(d.voiceLifetimeJitter)
        ? d.voiceLifetimeJitter
        : 0
    const jitter = Math.min(1, Math.max(0, jRaw))
    const k = Math.min(ASTEROID_MUSIC_VOICE_COUNT, Math.max(0, displayedVoices))
    const eps = 1e-6
    const denom = Math.max(eps, ASTEROID_MUSIC_VOICE_COUNT - k)
    const lambdaPerInactive = k / (denom * tau)
    const reeseEnabled = d.reeseEnabled === true
    const reeseIndex = reeseEnabled
      ? Math.min(
          ASTEROID_MUSIC_VOICE_COUNT - 1,
          Math.max(0, Math.round(typeof d.reeseVoiceIndex === 'number' ? d.reeseVoiceIndex : 0)),
        )
      : -1
    const reeseGate =
      reeseEnabled && Number.isFinite(d.reeseOrderAfterVoice)
        ? Math.max(0, Math.round(d.reeseOrderAfterVoice))
        : null

    for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
      if (voiceSlotActive[i]) {
        const u = phase01(seed, PHASE_SALT_VOICE_LIFETIME ^ (i * 0x10001))
        const tauI =
          jitter <= 0
            ? tau
            : Math.max(0.05, tau * (1 + (2 * u - 1) * jitter))
        const pDie = 1 - Math.exp(-dt / tauI)
        if (Math.random() < pDie) voiceSlotActive[i] = false
      } else {
        // Gate reese voice so it only becomes eligible after the configured order threshold,
        // unless solo mode is on (solo ignores order).
        if (
          reeseGate !== null &&
          reeseIndex === i &&
          d.reeseSolo !== true &&
          displayedVoices <= reeseGate + 0.5
        ) {
          voiceSlotActive[i] = false
          continue
        }
        const pBirth = 1 - Math.exp(-dt * lambdaPerInactive)
        if (Math.random() < pBirth) voiceSlotActive[i] = true
      }
    }
  }

  function stopVoices(): void {
    for (const v of voices) {
      try {
        v.carrier.stop()
        v.carrierDetuned.stop()
        v.ampLfo.stop()
        v.speedLfo.stop()
        v.ampLfo2.stop()
        v.speedLfo2.stop()
        v.panLfo.stop()
      } catch {
        /* ignore */
      }
    }
    voices.length = 0
  }

  function disposeBus(): void {
    if (busFx) {
      try {
        busFx.chorusLfo.stop()
        busFx.lpFreqBase.stop()
        busFx.filterLfo.stop()
        busFx.filterSpeedLfo.stop()
        busFx.preDlyJit1Lfo.stop()
        busFx.preDlyJit1SpeedLfo.stop()
        busFx.preDlyJit2Lfo.stop()
        busFx.preDlyJit2SpeedLfo.stop()
      } catch {
        /* ignore */
      }
      for (const k of Object.keys(busFx) as (keyof BusFxNodes)[]) {
        try {
          busFx[k].disconnect()
        } catch {
          /* ignore */
        }
      }
      busFx = null
    }
    lastReverbIrKey = ''
    lastWetSatAmount = -1
    lastChorusBaseMs = Number.NaN
  }

  function dispose(): void {
    stopVoices()
    disposeBus()
    try {
      masterGain?.disconnect()
    } catch {
      /* ignore */
    }
    masterGain = null
    ctxRef = null
    clearLastSentVoiceAudioParams()
  }

  function cancelBusParamAutomation(t: number): void {
    if (!busFx) return
    const params: AudioParam[] = [
      busFx.chorusDry.gain,
      busFx.chorusWet.gain,
      busFx.chorusLfo.frequency,
      busFx.chorusModDepth.gain,
      busFx.preDriveGain.gain,
      busFx.lpFreqBase.offset,
      busFx.filterLfo.frequency,
      busFx.filterModDepth.gain,
      busFx.filterSpeedLfo.frequency,
      busFx.filterSpeedDepth.gain,
      busFx.lowpass.Q,
      busFx.dryBus.gain,
      busFx.wetBus.gain,
      busFx.reverbPreDelay.delayTime,
      busFx.reverbFbDelay.delayTime,
      busFx.reverbFbFeedback.gain,
      busFx.preReverbDelayL.delayTime,
      busFx.preReverbDelayR.delayTime,
      busFx.preReverbFbGainL.gain,
      busFx.preReverbFbGainR.gain,
      busFx.preReverbFbHpfL.frequency,
      busFx.preReverbFbHpfR.frequency,
      busFx.preReverbFbLpfL.frequency,
      busFx.preReverbFbLpfR.frequency,
      busFx.preReverbDelayVolL.gain,
      busFx.preReverbDelayVolR.gain,
      busFx.preReverbDirectL.gain,
      busFx.preReverbDirectR.gain,
      busFx.preReverbDelayL2.delayTime,
      busFx.preReverbDelayR2.delayTime,
      busFx.preReverbFbGainL2.gain,
      busFx.preReverbFbGainR2.gain,
      busFx.preReverbFbHpfL2.frequency,
      busFx.preReverbFbHpfR2.frequency,
      busFx.preReverbFbLpfL2.frequency,
      busFx.preReverbFbLpfR2.frequency,
      busFx.preReverbDelay2VolL.gain,
      busFx.preReverbDelay2VolR.gain,
      busFx.preDlyJit1Lfo.frequency,
      busFx.preDlyJit1Depth.gain,
      busFx.preDlyJit1SpeedLfo.frequency,
      busFx.preDlyJit1SpeedDepth.gain,
      busFx.preDlyJit2Lfo.frequency,
      busFx.preDlyJit2Depth.gain,
      busFx.preDlyJit2SpeedLfo.frequency,
      busFx.preDlyJit2SpeedDepth.gain,
    ]
    for (const p of params) {
      try {
        p.cancelScheduledValues(t)
      } catch {
        /* ignore */
      }
    }
  }

  function syncBusFx(): void {
    const c = ctxRef
    if (!c || !busFx || !masterGain) return
    const t = c.currentTime
    cancelBusParamAutomation(t)
    const d = getDebug()
    const nyquist = c.sampleRate * 0.48

    const mix = clamp01(busNum(d, 'chorusMix', 0))
    const dryC = Math.cos((mix * Math.PI) / 2)
    const wetC = Math.sin((mix * Math.PI) / 2)
    busFx.chorusDry.gain.setValueAtTime(dryC, t)
    busFx.chorusWet.gain.setValueAtTime(wetC, t)

    busFx.chorusLfo.frequency.setValueAtTime(
      Math.min(6, Math.max(0.05, busNum(d, 'chorusRateHz', 0.45))),
      t,
    )
    const depthMs = Math.max(0, busNum(d, 'chorusDepthMs', 2.5))
    const peakModSec = Math.min(CHORUS_MAX_DELAY_SEC * 0.45, depthMs / 2000)
    busFx.chorusModDepth.gain.setValueAtTime(peakModSec, t)
    const baseMs = busNum(d, 'chorusDelayBaseMs', 18)
    if (!Number.isFinite(lastChorusBaseMs) || Math.abs(baseMs - lastChorusBaseMs) > 1e-3) {
      lastChorusBaseMs = baseMs
      const baseSec = Math.min(
        CHORUS_MAX_DELAY_SEC * 0.55,
        Math.max(0.001, baseMs) / 1000,
      )
      busFx.chorusDelay.delayTime.setValueAtTime(baseSec, t)
    }

    busFx.preDriveGain.gain.setValueAtTime(Math.min(6, Math.max(0.2, busNum(d, 'busPreDrive', 1))), t)

    let hz = Math.min(nyquist, Math.max(40, busNum(d, 'busLowPassHz', 20000)))
    if (d.reeseSolo === true) {
      hz = Math.max(hz, 3000)
    }
    busFx.lpFreqBase.offset.setValueAtTime(hz, t)

    const minBusLpLfoHz = 0.0001
    const maxBusLpLfoHz = 4
    let flHz = Math.min(
      maxBusLpLfoHz,
      Math.max(minBusLpLfoHz, busNum(d, 'busLowPassLfoHz', 0.006)),
    )
    const maxDepSp = Math.min(flHz - minBusLpLfoHz, maxBusLpLfoHz - flHz)
    const depSp = Math.min(
      Math.max(0, maxDepSp),
      Math.max(0, busNum(d, 'busLowPassLfoSpeedModDepthHz', 0.012)),
    )
    busFx.filterLfo.frequency.setValueAtTime(flHz, t)
    busFx.filterSpeedDepth.gain.setValueAtTime(depSp, t)
    busFx.filterSpeedLfo.frequency.setValueAtTime(
      Math.min(0.35, Math.max(0.02, busNum(d, 'busLowPassLfoSpeedModHz', 0.025))),
      t,
    )
    let depthHz = Math.max(0, busNum(d, 'busLowPassLfoDepthHz', 0))
    const depthCap = Math.min(Math.max(0, hz - 40), Math.max(0, nyquist - hz))
    depthHz = Math.min(depthHz, depthCap)
    busFx.filterModDepth.gain.setValueAtTime(depthHz, t)

    busFx.lowpass.Q.setValueAtTime(Math.min(18, Math.max(0.1, busNum(d, 'busLowPassQ', 0.7))), t)

    const jitDepthMs = Math.max(0, busNum(d, 'preReverbStereoDelayRateJitterDepthMs', 0))
    const jitSpeedHz = Math.min(
      0.28,
      Math.max(PRE_DELAY_JIT_SPEED_HZ_MIN, busNum(d, 'preReverbStereoDelayRateJitterSpeedHz', 0.016)),
    )
    const jitRand = clamp01(busNum(d, 'preReverbStereoDelayRateJitterRandomness', 0))
    const minJitMainHz = PRE_DELAY_JIT_MAIN_HEADROOM_HZ
    const maxJitMainHz = 0.32
    const inner1Hz = Math.min(0.11, Math.max(0.0035, 0.019 * (0.65 + phase01(seed, PHASE_SALT_PRE_DLY_JIT1_SPEED))))
    const inner2Hz = Math.min(0.11, Math.max(0.0035, 0.024 * (0.65 + phase01(seed, PHASE_SALT_PRE_DLY_JIT2_SPEED))))
    busFx.preDlyJit1SpeedLfo.frequency.setValueAtTime(inner1Hz, t)
    busFx.preDlyJit2SpeedLfo.frequency.setValueAtTime(inner2Hz, t)
    busFx.preDlyJit1Lfo.frequency.setValueAtTime(jitSpeedHz, t)
    const rateMul2 = 0.58 + 0.84 * phase01(seed, PHASE_SALT_PRE_DLY_JIT2_RATE_MUL)
    const jitSpeed2Hz = Math.min(maxJitMainHz, Math.max(minJitMainHz, jitSpeedHz * rateMul2))
    busFx.preDlyJit2Lfo.frequency.setValueAtTime(jitSpeed2Hz, t)
    const maxDep1 = Math.min(jitSpeedHz - minJitMainHz, maxJitMainHz - jitSpeedHz)
    const maxDep2 = Math.min(jitSpeed2Hz - minJitMainHz, maxJitMainHz - jitSpeed2Hz)
    busFx.preDlyJit1SpeedDepth.gain.setValueAtTime(jitRand * Math.max(0, maxDep1), t)
    busFx.preDlyJit2SpeedDepth.gain.setValueAtTime(jitRand * Math.max(0, maxDep2), t)

    const preStereoMs = Math.min(16000, Math.max(1, busNum(d, 'preReverbStereoDelayTimeMs', 520)))
    const preStereoSec = Math.min(PRE_REVERB_STEREO_DELAY_MAX_SEC, preStereoMs / 1000)
    const peakJit1Sec = Math.min(
      jitDepthMs / 1000,
      Math.max(0, preStereoSec - 0.0005),
      Math.max(0, PRE_REVERB_STEREO_DELAY_MAX_SEC - preStereoSec - 0.0005),
    )
    busFx.preDlyJit1Depth.gain.setValueAtTime(peakJit1Sec, t)
    busFx.preReverbDelayL.delayTime.setValueAtTime(preStereoSec, t)
    busFx.preReverbDelayR.delayTime.setValueAtTime(preStereoSec, t)
    const basePreStereoFb = Math.min(0.92, Math.max(0, busNum(d, 'preReverbStereoDelayFeedback', 0.25)))
    let preStereoFbEff = basePreStereoFb
    const fbJitDepthRaw = busNum(d, 'preReverbStereoDelayFeedbackJitterDepth', 0)
    const fbJitRateRaw = busNum(d, 'preReverbStereoDelayFeedbackJitterHz', 0)
    const fbJitRand = clamp01(busNum(d, 'preReverbStereoDelayFeedbackJitterRandomness', 0))
    const fbTime = Number.isFinite(d.voiceMacroJitterTimeSec) ? d.voiceMacroJitterTimeSec : 0
    const minFbJitHz = 1e-5
    const maxFbJitHz = 0.1
    if (basePreStereoFb > 0 && fbJitDepthRaw > 0 && fbJitRateRaw > 0 && fbTime > 0) {
      const depth = clamp01(fbJitDepthRaw)
      let fEff = Math.min(maxFbJitHz, Math.max(minFbJitHz, fbJitRateRaw))
      if (fbJitRand > 0) {
        const fMod = 0.25 * fEff
        const phaseMod =
          2 * Math.PI * fMod * fbTime +
          2 * Math.PI * phase01(seed, PHASE_SALT_PRE_FB_JIT_RATE)
        const wRate = Math.sin(phaseMod)
        fEff = Math.min(
          maxFbJitHz,
          Math.max(minFbJitHz, fEff * (1 + fbJitRand * wRate)),
        )
      }
      const phase0 =
        2 * Math.PI * phase01(seed, PHASE_SALT_PRE_FB_JIT)
      const w = Math.sin(2 * Math.PI * fEff * fbTime + phase0)
      const mul = 1 + depth * w
      preStereoFbEff = Math.min(0.92, Math.max(0, basePreStereoFb * mul))
    }
    busFx.preReverbFbGainL.gain.setValueAtTime(preStereoFbEff, t)
    busFx.preReverbFbGainR.gain.setValueAtTime(preStereoFbEff, t)
    let preStereoHpf = Math.min(8000, Math.max(20, busNum(d, 'preReverbStereoDelayHighpassHz', 220)))
    preStereoHpf = Math.min(preStereoHpf, nyquist * 0.45)
    busFx.preReverbFbHpfL.frequency.setValueAtTime(preStereoHpf, t)
    busFx.preReverbFbHpfR.frequency.setValueAtTime(preStereoHpf, t)
    let preStereoLpf = Math.min(20000, Math.max(200, busNum(d, 'preReverbStereoDelayLowpassHz', 10000)))
    preStereoLpf = Math.max(preStereoLpf, preStereoHpf * 1.02)
    preStereoLpf = Math.min(preStereoLpf, nyquist * 0.45)
    busFx.preReverbFbLpfL.frequency.setValueAtTime(preStereoLpf, t)
    busFx.preReverbFbLpfR.frequency.setValueAtTime(preStereoLpf, t)
    const preStereoVol = clamp01(busNum(d, 'preReverbStereoDelayVolume', 0.3))
    busFx.preReverbDelayVolL.gain.setValueAtTime(preStereoVol, t)
    busFx.preReverbDelayVolR.gain.setValueAtTime(preStereoVol, t)

    const preStereo2Ms = Math.min(16000, Math.max(1, busNum(d, 'preReverbStereoDelay2TimeMs', 3000)))
    const preStereo2Sec = Math.min(PRE_REVERB_STEREO_DELAY2_MAX_SEC, preStereo2Ms / 1000)
    const peakJit2Sec = Math.min(
      jitDepthMs / 1000,
      Math.max(0, preStereo2Sec - 0.0005),
      Math.max(0, PRE_REVERB_STEREO_DELAY2_MAX_SEC - preStereo2Sec - 0.0005),
    )
    busFx.preDlyJit2Depth.gain.setValueAtTime(peakJit2Sec, t)
    busFx.preReverbDelayL2.delayTime.setValueAtTime(preStereo2Sec, t)
    busFx.preReverbDelayR2.delayTime.setValueAtTime(preStereo2Sec, t)
    busFx.preReverbFbGainL2.gain.setValueAtTime(preStereoFbEff, t)
    busFx.preReverbFbGainR2.gain.setValueAtTime(preStereoFbEff, t)
    busFx.preReverbFbHpfL2.frequency.setValueAtTime(preStereoHpf, t)
    busFx.preReverbFbHpfR2.frequency.setValueAtTime(preStereoHpf, t)
    busFx.preReverbFbLpfL2.frequency.setValueAtTime(preStereoLpf, t)
    busFx.preReverbFbLpfR2.frequency.setValueAtTime(preStereoLpf, t)
    const preStereo2Vol = clamp01(busNum(d, 'preReverbStereoDelay2Volume', 0))
    busFx.preReverbDelay2VolL.gain.setValueAtTime(preStereo2Vol, t)
    busFx.preReverbDelay2VolR.gain.setValueAtTime(preStereo2Vol, t)

    busFx.preReverbDirectL.gain.setValueAtTime(1, t)
    busFx.preReverbDirectR.gain.setValueAtTime(1, t)

    let rm = clamp01(busNum(d, 'reverbMix', 0))
    const mixLfoDepth = clamp01(busNum(d as unknown as AsteroidMusicDebug, 'reverbMixLfoDepth', 0))
    const mixLfoHz = Math.max(
      0,
      busNum(d as unknown as AsteroidMusicDebug, 'reverbMixLfoHz', 0.001),
    )
    const macroT =
      typeof (d as AsteroidMusicDebug).voiceMacroJitterTimeSec === 'number' &&
      Number.isFinite((d as AsteroidMusicDebug).voiceMacroJitterTimeSec)
        ? (d as AsteroidMusicDebug).voiceMacroJitterTimeSec
        : 0
    if (mixLfoDepth > 0 && mixLfoHz > 0 && Number.isFinite(macroT)) {
      const phase =
        2 * Math.PI * mixLfoHz * macroT +
        2 * Math.PI * phase01(seed, PHASE_SALT_PRE_FB_JIT_RATE)
      const w = Math.sin(phase)
      const k = 0.5 * mixLfoDepth
      const mul = 1 + k * w
      rm = clamp01(rm * mul)
    }
    const wetTrim = clamp01(busNum(d, 'reverbWetTrim', 0.55))
    /** Linear wet/dry: dry `1 − reverbMix`, wet `reverbMix` × `reverbWetTrim` (full wet = no dry). */
    busFx.dryBus.gain.setValueAtTime(clamp01(1 - rm), t)
    busFx.wetBus.gain.setValueAtTime(rm * wetTrim, t)

    const wetAmt = clamp01(busNum(d, 'busWetSaturatorAmount', 0))
    if (Math.abs(wetAmt - lastWetSatAmount) > 1e-6) {
      lastWetSatAmount = wetAmt
      busFx.postShaper.curve = makeWetSatCurve(wetAmt)
    }

    const irDur = Math.min(6, Math.max(0.35, busNum(d, 'reverbIrDurationSec', 3.96)))
    const irDecay = Math.max(0.4, busNum(d, 'reverbIrDecayPerSec', 1.45))
    const preMs = Math.min(150, Math.max(0, busNum(d, 'reverbPreDelayMs', 0)))
    busFx.reverbPreDelay.delayTime.setValueAtTime(preMs / 1000, t)

    const fbMs = Math.min(120, Math.max(4, busNum(d, 'reverbWetFeedbackMs', 32)))
    busFx.reverbFbDelay.delayTime.setValueAtTime(fbMs / 1000, t)
    const fbAmt = Math.min(0.92, Math.max(0, busNum(d, 'reverbWetFeedback', 0)))
    busFx.reverbFbFeedback.gain.setValueAtTime(fbAmt, t)

    const norm = d.reverbConvolverNormalize !== false
    if (busFx.convolver.normalize !== norm) {
      busFx.convolver.normalize = norm
    }

    const dec = clamp01(busNum(d, 'reverbIrDecorrelate', 0.4))
    const damp = clamp01(busNum(d, 'reverbIrDamping', 0.3))
    const early = clamp01(busNum(d, 'reverbIrEarlyDensity', 0.45))
    const irOpts: ReverbImpulseOptions = {
      decorrelate: dec,
      damping: damp,
      earlyDensity: early,
    }
    const irKey = JSON.stringify([irDur, irDecay, dec, damp, early])
    if (irKey !== lastReverbIrKey) {
      lastReverbIrKey = irKey
      busFx.convolver.buffer = createReverbImpulseBuffer(c, irDur, irDecay, irOpts)
    }
  }

  function resetCarrierPitchSmoothState(): void {
    carrierPitchSmoothPrimed = true
    lastPitchSyncPerfMs = null
    clearLastSentVoiceAudioParams()
  }

  function rollScaleCycleDelay(): void {
    const d = getDebug()
    const interval = Math.min(3600, Math.max(30, busNum(d, 'scaleCycleIntervalSec', 180)))
    const jit = Math.min(120, Math.max(0, busNum(d, 'scaleCycleJitterSec', 0)))
    const u = phase01(seed, PHASE_SALT_SCALE_CYCLE ^ (scaleCycleStep * 0x10001))
    scaleCycleTimeToNextSec = Math.max(1, interval + (2 * u - 1) * jit)
  }

  function resetScaleCycleState(): void {
    scaleCycleStep = 0
    rollScaleCycleDelay()
  }

  function syncAllParams(): void {
    const c = ctxRef
    if (!c || !masterGain || voices.length === 0) return
    const d = getDebug()
    const baseRoot = rootMidiFromSeed(seed)
    const dir = parseScaleCycleDirection(d.scaleCycleDirection, 'fifths')
    const root = effectiveRootMidiAfterCycleSteps(baseRoot, scaleCycleStep, dir)
    applyVoiceMacrosToVoices(d, root)
    const scaleSteps = scaleStepsForMode(d.scaleClampMode)
    const t = c.currentTime
    const nyquist = c.sampleRate * 0.48
    const vol = getMusicVolume()
    masterGain.gain.setValueAtTime(vol, t)

    const nowPerf = performance.now()
    let dtSec = 1 / 60
    if (lastPitchSyncPerfMs !== null) {
      dtSec = Math.min(0.1, Math.max(1e-4, (nowPerf - lastPitchSyncPerfMs) / 1000))
    }
    lastPitchSyncPerfMs = nowPerf

    const slideBase = busNum(d, 'notePitchSlideBaseSec', 3)
    const slideJit = busNum(d, 'notePitchSlideJitterSec', 2)

    const minAmpLfoHz = 0.002
    const maxAmpLfoHz = 0.28
    const minPanHz = 0.0008
    const maxPanHz = 0.03

    const reeseEnabled = d.reeseEnabled === true
    const reeseIndex = reeseEnabled
      ? Math.min(
          ASTEROID_MUSIC_VOICE_COUNT - 1,
          Math.max(0, Math.round(typeof d.reeseVoiceIndex === 'number' ? d.reeseVoiceIndex : 0)),
        )
      : -1
    for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
      const v = voices[i]
      const vd = d.voices[i]
      const isReese = reeseEnabled && i === reeseIndex
      const roughMidi = root + defaultSemitonesFromRootForVoice(i) + audioFinite(vd.note, 0)
      const midi = snapMidiToScale(roughMidi, root, scaleSteps)
      const targetHz = midiToHz(midi)
      let hzOut = targetHz
      if (carrierPitchSmoothPrimed) {
        hzOut = targetHz
        smoothedCarrierHz[i] = targetHz
      } else {
        if (isReese) {
          const reeseSlide = busNum(d as unknown as AsteroidMusicDebug, 'reesePitchSlideSec', 3)
          if (reeseSlide <= 0) {
            hzOut = targetHz
            smoothedCarrierHz[i] = targetHz
          } else {
            const tauSec = Math.max(1e-6, reeseSlide)
            const prev = smoothedCarrierHz[i]
            hzOut = prev + (targetHz - prev) * (1 - Math.exp(-dtSec / tauSec))
            smoothedCarrierHz[i] = hzOut
          }
        } else {
          const instantPitch = slideBase <= 0 && slideJit <= 0
          if (instantPitch) {
            hzOut = targetHz
            smoothedCarrierHz[i] = targetHz
          } else {
            const u = phase01(seed, PHASE_SALT_PITCH_SLIDE ^ (i * 0x10001))
            const tauSec = Math.max(1e-6, slideBase + u * slideJit)
            const prev = smoothedCarrierHz[i]
            hzOut = prev + (targetHz - prev) * (1 - Math.exp(-dtSec / tauSec))
            smoothedCarrierHz[i] = hzOut
          }
        }
      }
      const baseHz = audioFinite(hzOut, targetHz)
      if (isReese) {
        const detSemi = Math.max(
          0,
          busNum(d as unknown as AsteroidMusicDebug, 'reeseDetuneSemitones', 0),
        )
        if (detSemi > 0) {
          const up = 2 ** (detSemi / 24)
          const dn = 1 / up
          setVoiceParamIfChanged(
            lastSentAtVoice.carrierHz,
            i,
            baseHz * up,
            v.carrier.frequency,
            t,
            1e-3,
          )
          v.carrierDetuned.frequency.setValueAtTime(baseHz * dn, t)
        } else {
          setVoiceParamIfChanged(lastSentAtVoice.carrierHz, i, baseHz, v.carrier.frequency, t, 1e-3)
          v.carrierDetuned.frequency.setValueAtTime(baseHz, t)
        }
      } else {
        setVoiceParamIfChanged(lastSentAtVoice.carrierHz, i, baseHz, v.carrier.frequency, t, 1e-3)
      }

      if (isReese) {
        // Reese voice: use pitchBandpass as a fixed highpass and drive cutoff from reeseHighpassHz.
        if (v.pitchBandpass.type !== 'highpass') {
          v.pitchBandpass.type = 'highpass'
        }
        const hpHz = Math.min(
          nyquist,
          Math.max(20, busNum(d as unknown as AsteroidMusicDebug, 'reeseHighpassHz', 200)),
        )
        setVoiceParamIfChanged(lastSentAtVoice.pitchBpHz, i, hpHz, v.pitchBandpass.frequency, t, 1e-3)
        const bpQ = 0.707
        setVoiceParamIfChanged(lastSentAtVoice.pitchBpQ, i, bpQ, v.pitchBandpass.Q, t, 1e-5)
        v.bpDryGain.gain.setValueAtTime(0, t)
        v.bpWetGain.gain.setValueAtTime(1, t)

        // Reese lowpass: base cutoff plus simple attack/decay envelope depth.
        const baseLp = Math.min(
          nyquist,
          Math.max(
            0,
            busNum(d as unknown as AsteroidMusicDebug, 'reeseLowpassBaseHz', 2500),
          ),
        )
        const depthHz = Math.max(
          0,
          busNum(d as unknown as AsteroidMusicDebug, 'reeseLowpassEnvDepthHz', 3500),
        )
        let env01 = 0
        const attack = Math.max(
          0.01,
          busNum(d as unknown as AsteroidMusicDebug, 'reeseLowpassEnvAttackSec', 0.12),
        )
        const decay = Math.max(
          0.05,
          busNum(d as unknown as AsteroidMusicDebug, 'reeseLowpassEnvDecaySec', 1.6),
        )
        const envSpan = attack + decay
        const macroT =
          typeof (d as AsteroidMusicDebug).voiceMacroJitterTimeSec === 'number' &&
          Number.isFinite((d as AsteroidMusicDebug).voiceMacroJitterTimeSec)
            ? (d as AsteroidMusicDebug).voiceMacroJitterTimeSec
            : 0
        const rateHz = Math.max(
          0.0001,
          busNum(d as unknown as AsteroidMusicDebug, 'reeseSwellsRateHz', 0.003),
        )
        if (envSpan > 0 && rateHz > 0 && Number.isFinite(macroT)) {
          const cyc = macroT * rateHz
          const u = cyc - Math.floor(cyc)
          const aFrac = attack / envSpan
          if (u <= aFrac && aFrac > 1e-6) {
            env01 = u / aFrac
          } else if (u > aFrac && envSpan > attack && 1 - aFrac > 1e-6) {
            const dFrac = (u - aFrac) / (1 - aFrac)
            env01 = 1 - dFrac
          } else {
            env01 = 0
          }
        }
        const depthMul = clamp01(
          busNum(d as unknown as AsteroidMusicDebug, 'reeseSwellsDepth', 1),
        )
        let lpHz = baseLp + env01 * depthHz * depthMul
        lpHz = Math.min(nyquist, Math.max(0, lpHz))
        v.toneLowpass.frequency.setValueAtTime(lpHz, t)
        // Reese overdrive: extra pre-filter gain into a dedicated waveshaper.
        const drive = Math.max(
          0,
          busNum(d as unknown as AsteroidMusicDebug, 'reeseDrive', 0),
        )
        const driveGain = 1 + drive * 4
        v.reeseDriveGain.gain.setValueAtTime(driveGain, t)
      } else {
        const bpOn = d.voicePitchBandpassEnabled === true
        if (v.pitchBandpass.type !== 'bandpass') {
          v.pitchBandpass.type = 'bandpass'
        }
        const semi = Math.min(
          36,
          Math.max(-36, busNum(d as AsteroidMusicDebug, 'voicePitchBandpassCenterSemitones', 0)),
        )
        const centerHz = audioFinite(hzOut * 2 ** (semi / 12), hzOut)
        setVoiceParamIfChanged(lastSentAtVoice.pitchBpHz, i, centerHz, v.pitchBandpass.frequency, t, 1e-3)
        const bpQ = Math.min(30, Math.max(0.25, busNum(d as AsteroidMusicDebug, 'voicePitchBandpassQ', 5)))
        setVoiceParamIfChanged(lastSentAtVoice.pitchBpQ, i, bpQ, v.pitchBandpass.Q, t, 1e-5)
        v.bpDryGain.gain.setValueAtTime(bpOn ? 0 : 1, t)
        v.bpWetGain.gain.setValueAtTime(bpOn ? 1 : 0, t)

        // Non-reese voices: keep tone lowpass effectively open.
        v.toneLowpass.frequency.setValueAtTime(nyquist, t)
      }

      let ampHz = Math.min(
        maxAmpLfoHz,
        Math.max(minAmpLfoHz, audioFinite(vd.ampLfoHz, minAmpLfoHz)),
      )
      const maxDep = Math.min(ampHz - minAmpLfoHz, maxAmpLfoHz - ampHz)
      const dep = Math.min(
        Math.max(0, maxDep),
        Math.max(0, audioFinite(vd.ampLfoSpeedModDepthHz, 0)),
      )
      setVoiceParamIfChanged(lastSentAtVoice.ampLfoHz, i, ampHz, v.ampLfo.frequency, t, 1e-5)
      v.speedDepth.gain.setValueAtTime(dep, t)
      setVoiceParamIfChanged(
        lastSentAtVoice.speedLfoHz,
        i,
        Math.min(0.35, Math.max(0.02, audioFinite(vd.ampLfoSpeedModHz, 0.02))),
        v.speedLfo.frequency,
        t,
        1e-5,
      )
      const tremoloAmount = Math.min(1, Math.max(0, audioFinite(vd.ampLfoDepth, 0)) / 1.6)
      v.lfoDepth.gain.setValueAtTime(0.5 * tremoloAmount, t)

      const ampHz2 = Math.min(
        maxAmpLfoHz,
        Math.max(minAmpLfoHz, audioFinite(vd.ampLfo2Hz, minAmpLfoHz)),
      )
      const maxDep2 = Math.min(ampHz2 - minAmpLfoHz, maxAmpLfoHz - ampHz2)
      const dep2 = Math.min(
        Math.max(0, maxDep2),
        Math.max(0, audioFinite(vd.ampLfo2SpeedModDepthHz, 0)),
      )
      setVoiceParamIfChanged(lastSentAtVoice.ampLfo2Hz, i, ampHz2, v.ampLfo2.frequency, t, 1e-5)
      v.speedDepth2.gain.setValueAtTime(dep2, t)
      setVoiceParamIfChanged(
        lastSentAtVoice.speedLfo2Hz,
        i,
        Math.min(0.35, Math.max(0.02, audioFinite(vd.ampLfo2SpeedModHz, 0.02))),
        v.speedLfo2.frequency,
        t,
        1e-5,
      )
      const tremoloAmount2 = Math.min(1, Math.max(0, audioFinite(vd.ampLfo2Depth, 0)) / 1.6)
      // Inverted vs layer 1: subtractive tremolo at vca.gain (additive slow + subtractive fast).
      v.lfoDepth2.gain.setValueAtTime(-0.5 * tremoloAmount2, t)

      // Fast tremolo: higher-rate layer with macro-driven depth swells and desynchronised rate.
      const fastHz = Math.min(
        12,
        Math.max(0.8, audioFinite(vd.fastAmpLfoHz, 3)),
      )
      setVoiceParamIfChanged(
        lastSentAtVoice.fastAmpLfoHz,
        i,
        fastHz,
        v.fastAmpLfo.frequency,
        t,
        1e-4,
      )
      const fastSpeedHz = Math.min(
        0.5,
        Math.max(0.0005, audioFinite(vd.fastAmpLfoSpeedModHz, 0.02)),
      )
      setVoiceParamIfChanged(
        lastSentAtVoice.fastAmpSpeedLfoHz,
        i,
        fastSpeedHz,
        v.fastAmpSpeedLfo.frequency,
        t,
        1e-5,
      )
      v.fastAmpSpeedDepth.gain.setValueAtTime(
        Math.max(0, audioFinite(vd.fastAmpLfoSpeedModDepthHz, 0)),
        t,
      )
      const fastDepth = Math.min(1.6, Math.max(0, audioFinite(vd.fastAmpLfoDepth, 0)))
      // Map depth to a 0…~0.6 amplitude swing around current level.
      v.fastAmpDepth.gain.setValueAtTime(0.4 * (fastDepth / 1.6), t)

      const panHz = Math.min(
        maxPanHz,
        Math.max(minPanHz, audioFinite(vd.panLfoHz, minPanHz)),
      )
      setVoiceParamIfChanged(lastSentAtVoice.panLfoHz, i, panHz, v.panLfo.frequency, t, 1e-6)
      v.panLfoDepth.gain.setValueAtTime(
        Math.min(0.95, Math.max(0, audioFinite(vd.panLfoDepth, 0))),
        t,
      )
    }

    carrierPitchSmoothPrimed = false
    syncBusFx()
  }

  function resetVoiceFadeState(): void {
    for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
      smoothedVoiceGain[i] = 0
      voiceWasActive[i] = false
      fadeInStartMs[i] = null
      fadeOutStartMs[i] = null
      gainAtFadeOutStart[i] = 0
    }
  }

  /** Per-voice linear fade; global `voiceFadeInSec` / `voiceFadeOutSec` set ramp length. */
  function applyVoiceLevels(): void {
    const c = ctxRef
    if (!c || voices.length === 0 || !masterGain) return
    const t = c.currentTime
    const d = getDebug()
    const vol = getMusicVolume()
    masterGain.gain.setValueAtTime(vol, t)
    const gainScale = 0.065
    const now = performance.now()
    const fadeInMs = Math.max(0.05, d.voiceFadeInSec) * 1000
    const fadeOutMs = Math.max(0.05, d.voiceFadeOutSec) * 1000

    const reeseEnabled = d.reeseEnabled === true
    const reeseIndex = reeseEnabled
      ? Math.min(
          ASTEROID_MUSIC_VOICE_COUNT - 1,
          Math.max(0, Math.round(typeof d.reeseVoiceIndex === 'number' ? d.reeseVoiceIndex : 0)),
        )
      : -1

    for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
      const v = voices[i]
      const vd = d.voices[i]
      const activeRaw = voiceSlotActive[i]
      const active =
        d.reeseSolo === true
          ? reeseEnabled && i === reeseIndex
          : activeRaw
      const targetPeak = active
        ? Math.min(0.95, Math.max(0, audioFinite(vd.amp, 0))) * vol * gainScale
        : 0

      if (active && !voiceWasActive[i]) {
        voiceWasActive[i] = true
        fadeInStartMs[i] = now
        fadeOutStartMs[i] = null
      }
      if (!active && voiceWasActive[i]) {
        voiceWasActive[i] = false
        fadeOutStartMs[i] = now
        gainAtFadeOutStart[i] = smoothedVoiceGain[i]
        fadeInStartMs[i] = null
      }

      if (active) {
        if (fadeInStartMs[i] === null) {
          fadeInStartMs[i] = now
        }
        const t0 = fadeInStartMs[i]!
        const u = Math.min(1, (now - t0) / fadeInMs)
        smoothedVoiceGain[i] = u >= 1 ? targetPeak : targetPeak * u
      } else {
        const t1 = fadeOutStartMs[i]
        if (t1 !== null) {
          const u = Math.min(1, (now - t1) / fadeOutMs)
          smoothedVoiceGain[i] = gainAtFadeOutStart[i] * (1 - u)
          if (u >= 1 - 1e-9) {
            fadeOutStartMs[i] = null
            smoothedVoiceGain[i] = 0
          }
        } else {
          smoothedVoiceGain[i] = 0
        }
      }

      v.levelGain.gain.setValueAtTime(audioFinite(smoothedVoiceGain[i], 0), t)
    }
  }

  function buildGraph(): void {
    dispose()
    const c = getAudioContext()
    if (!c) return
    ctxRef = c
    masterGain = c.createGain()
    masterGain.gain.value = getMusicVolume()

    const chorusDry = c.createGain()
    const chorusDelay = c.createDelay(CHORUS_MAX_DELAY_SEC)
    const chorusWet = c.createGain()
    const chorusMerge = c.createGain()
    chorusMerge.gain.value = 1

    const chorusLfo = c.createOscillator()
    chorusLfo.type = 'sine'
    const chorusModDepth = c.createGain()
    chorusLfo.connect(chorusModDepth)
    chorusModDepth.connect(chorusDelay.delayTime)

    const preDriveGain = c.createGain()
    const preShaper = c.createWaveShaper()
    preShaper.curve = PRE_SHAPER_CURVE
    preShaper.oversample = '2x'

    const lowpass = c.createBiquadFilter()
    lowpass.type = 'lowpass'

    const lpFreqBase = c.createConstantSource()
    const filterLfo = c.createOscillator()
    filterLfo.type = 'sine'
    const filterModDepth = c.createGain()
    const filterSpeedLfo = c.createOscillator()
    filterSpeedLfo.type = 'sine'
    const filterSpeedDepth = c.createGain()
    lpFreqBase.connect(lowpass.frequency)
    filterLfo.connect(filterModDepth)
    filterModDepth.connect(lowpass.frequency)
    filterSpeedLfo.connect(filterSpeedDepth)
    filterSpeedDepth.connect(filterLfo.frequency)

    const dryBus = c.createGain()

    const preReverbSplit = c.createChannelSplitter(2)
    const preReverbMerge = c.createChannelMerger(2)
    const preReverbSumL = c.createGain()
    const preReverbSumR = c.createGain()
    preReverbSumL.gain.value = 1
    preReverbSumR.gain.value = 1
    const preReverbDelayL = c.createDelay(PRE_REVERB_STEREO_DELAY_MAX_SEC)
    const preReverbDelayR = c.createDelay(PRE_REVERB_STEREO_DELAY_MAX_SEC)
    const preReverbFbHpfL = c.createBiquadFilter()
    preReverbFbHpfL.type = 'highpass'
    preReverbFbHpfL.frequency.value = 220
    preReverbFbHpfL.Q.value = 0.707
    const preReverbFbHpfR = c.createBiquadFilter()
    preReverbFbHpfR.type = 'highpass'
    preReverbFbHpfR.frequency.value = 220
    preReverbFbHpfR.Q.value = 0.707
    const preReverbFbLpfL = c.createBiquadFilter()
    preReverbFbLpfL.type = 'lowpass'
    preReverbFbLpfL.frequency.value = 10000
    preReverbFbLpfL.Q.value = 0.707
    const preReverbFbLpfR = c.createBiquadFilter()
    preReverbFbLpfR.type = 'lowpass'
    preReverbFbLpfR.frequency.value = 10000
    preReverbFbLpfR.Q.value = 0.707
    const preReverbFbGainL = c.createGain()
    const preReverbFbGainR = c.createGain()
    const preReverbDirectL = c.createGain()
    const preReverbDirectR = c.createGain()
    preReverbDirectL.gain.value = 1
    preReverbDirectR.gain.value = 1
    const preReverbDelayVolL = c.createGain()
    const preReverbDelayVolR = c.createGain()

    const preReverbSumL2 = c.createGain()
    const preReverbSumR2 = c.createGain()
    preReverbSumL2.gain.value = 1
    preReverbSumR2.gain.value = 1
    const preReverbDelayL2 = c.createDelay(PRE_REVERB_STEREO_DELAY2_MAX_SEC)
    const preReverbDelayR2 = c.createDelay(PRE_REVERB_STEREO_DELAY2_MAX_SEC)
    const preReverbFbHpfL2 = c.createBiquadFilter()
    preReverbFbHpfL2.type = 'highpass'
    preReverbFbHpfL2.frequency.value = 220
    preReverbFbHpfL2.Q.value = 0.707
    const preReverbFbHpfR2 = c.createBiquadFilter()
    preReverbFbHpfR2.type = 'highpass'
    preReverbFbHpfR2.frequency.value = 220
    preReverbFbHpfR2.Q.value = 0.707
    const preReverbFbLpfL2 = c.createBiquadFilter()
    preReverbFbLpfL2.type = 'lowpass'
    preReverbFbLpfL2.frequency.value = 10000
    preReverbFbLpfL2.Q.value = 0.707
    const preReverbFbLpfR2 = c.createBiquadFilter()
    preReverbFbLpfR2.type = 'lowpass'
    preReverbFbLpfR2.frequency.value = 10000
    preReverbFbLpfR2.Q.value = 0.707
    const preReverbFbGainL2 = c.createGain()
    const preReverbFbGainR2 = c.createGain()
    const preReverbDelay2VolL = c.createGain()
    const preReverbDelay2VolR = c.createGain()

    const preDlyJit1Lfo = c.createOscillator()
    preDlyJit1Lfo.type = 'sine'
    const preDlyJit1Depth = c.createGain()
    const preDlyJit1SpeedLfo = c.createOscillator()
    preDlyJit1SpeedLfo.type = 'sine'
    const preDlyJit1SpeedDepth = c.createGain()
    preDlyJit1Lfo.connect(preDlyJit1Depth)
    preDlyJit1Depth.connect(preReverbDelayL.delayTime)
    preDlyJit1Depth.connect(preReverbDelayR.delayTime)
    preDlyJit1SpeedLfo.connect(preDlyJit1SpeedDepth)
    preDlyJit1SpeedDepth.connect(preDlyJit1Lfo.frequency)

    const preDlyJit2Lfo = c.createOscillator()
    preDlyJit2Lfo.type = 'sine'
    const preDlyJit2Depth = c.createGain()
    const preDlyJit2SpeedLfo = c.createOscillator()
    preDlyJit2SpeedLfo.type = 'sine'
    const preDlyJit2SpeedDepth = c.createGain()
    preDlyJit2Lfo.connect(preDlyJit2Depth)
    preDlyJit2Depth.connect(preReverbDelayL2.delayTime)
    preDlyJit2Depth.connect(preReverbDelayR2.delayTime)
    preDlyJit2SpeedLfo.connect(preDlyJit2SpeedDepth)
    preDlyJit2SpeedDepth.connect(preDlyJit2Lfo.frequency)

    const reverbPreDelay = c.createDelay(REVERB_MAX_PRE_DELAY_SEC)
    const convolver = c.createConvolver()
    convolver.normalize = true
    const reverbWetSum = c.createGain()
    reverbWetSum.gain.value = 1
    const reverbFbDelay = c.createDelay(REVERB_MAX_WET_FB_DELAY_SEC)
    const reverbFbFeedback = c.createGain()
    reverbFbFeedback.gain.value = 0
    const postShaper = c.createWaveShaper()
    postShaper.oversample = '2x'
    const wetBus = c.createGain()

    masterGain.connect(chorusDry)
    masterGain.connect(chorusDelay)
    chorusDry.connect(chorusMerge)
    chorusDelay.connect(chorusWet)
    chorusWet.connect(chorusMerge)
    chorusMerge.connect(preDriveGain)
    preDriveGain.connect(preShaper)
    preShaper.connect(lowpass)
    lowpass.connect(dryBus)
    lowpass.connect(preReverbSplit)

    preReverbSplit.connect(preReverbSumL, 0)
    preReverbSplit.connect(preReverbDirectL, 0)
    preReverbSumL.connect(preReverbDelayL)
    preReverbDelayL.connect(preReverbFbHpfL)
    preReverbFbHpfL.connect(preReverbFbLpfL)
    preReverbFbLpfL.connect(preReverbFbGainL)
    preReverbFbGainL.connect(preReverbSumL)
    preReverbDelayL.connect(preReverbDelayVolL)
    preReverbDelayVolL.connect(preReverbMerge, 0, 0)
    preReverbDirectL.connect(preReverbMerge, 0, 0)

    preReverbSplit.connect(preReverbSumR, 1)
    preReverbSplit.connect(preReverbDirectR, 1)
    preReverbSumR.connect(preReverbDelayR)
    preReverbDelayR.connect(preReverbFbHpfR)
    preReverbFbHpfR.connect(preReverbFbLpfR)
    preReverbFbLpfR.connect(preReverbFbGainR)
    preReverbFbGainR.connect(preReverbSumR)
    preReverbDelayR.connect(preReverbDelayVolR)
    preReverbDelayVolR.connect(preReverbMerge, 0, 1)
    preReverbDirectR.connect(preReverbMerge, 0, 1)

    preReverbSplit.connect(preReverbSumL2, 0)
    preReverbSumL2.connect(preReverbDelayL2)
    preReverbDelayL2.connect(preReverbFbHpfL2)
    preReverbFbHpfL2.connect(preReverbFbLpfL2)
    preReverbFbLpfL2.connect(preReverbFbGainL2)
    preReverbFbGainL2.connect(preReverbSumL2)
    preReverbDelayL2.connect(preReverbDelay2VolL)
    preReverbDelay2VolL.connect(preReverbMerge, 0, 0)

    preReverbSplit.connect(preReverbSumR2, 1)
    preReverbSumR2.connect(preReverbDelayR2)
    preReverbDelayR2.connect(preReverbFbHpfR2)
    preReverbFbHpfR2.connect(preReverbFbLpfR2)
    preReverbFbLpfR2.connect(preReverbFbGainR2)
    preReverbFbGainR2.connect(preReverbSumR2)
    preReverbDelayR2.connect(preReverbDelay2VolR)
    preReverbDelay2VolR.connect(preReverbMerge, 0, 1)

    preReverbMerge.connect(reverbPreDelay)
    reverbPreDelay.connect(convolver)
    convolver.connect(reverbWetSum)
    reverbWetSum.connect(postShaper)
    reverbWetSum.connect(reverbFbDelay)
    reverbFbDelay.connect(reverbFbFeedback)
    reverbFbFeedback.connect(reverbWetSum)
    postShaper.connect(wetBus)
    const masterIn = getMusicPostChainInput(c)
    dryBus.connect(masterIn)
    wetBus.connect(masterIn)

    busFx = {
      chorusDry,
      chorusDelay,
      chorusWet,
      chorusMerge,
      chorusLfo,
      chorusModDepth,
      preDriveGain,
      preShaper,
      lpFreqBase,
      filterLfo,
      filterModDepth,
      filterSpeedLfo,
      filterSpeedDepth,
      lowpass,
      dryBus,
      preReverbSplit,
      preReverbMerge,
      preReverbSumL,
      preReverbSumR,
      preReverbDelayL,
      preReverbDelayR,
      preReverbFbHpfL,
      preReverbFbHpfR,
      preReverbFbLpfL,
      preReverbFbLpfR,
      preReverbFbGainL,
      preReverbFbGainR,
      preReverbDirectL,
      preReverbDirectR,
      preReverbDelayVolL,
      preReverbDelayVolR,
      preReverbSumL2,
      preReverbSumR2,
      preReverbDelayL2,
      preReverbDelayR2,
      preReverbFbHpfL2,
      preReverbFbHpfR2,
      preReverbFbLpfL2,
      preReverbFbLpfR2,
      preReverbFbGainL2,
      preReverbFbGainR2,
      preReverbDelay2VolL,
      preReverbDelay2VolR,
      preDlyJit1Lfo,
      preDlyJit1Depth,
      preDlyJit1SpeedLfo,
      preDlyJit1SpeedDepth,
      preDlyJit2Lfo,
      preDlyJit2Depth,
      preDlyJit2SpeedLfo,
      preDlyJit2SpeedDepth,
      reverbPreDelay,
      convolver,
      reverbWetSum,
      reverbFbDelay,
      reverbFbFeedback,
      postShaper,
      wetBus,
    }
    lastReverbIrKey = ''
    lastWetSatAmount = -1
    lastChorusBaseMs = Number.NaN

    const debugNow = getDebug()
    const reeseEnabledAtBuild = debugNow.reeseEnabled === true
    const reeseIndexAtBuild = reeseEnabledAtBuild
      ? Math.min(
          ASTEROID_MUSIC_VOICE_COUNT - 1,
          Math.max(
            0,
            Math.round(
              typeof debugNow.reeseVoiceIndex === 'number' ? debugNow.reeseVoiceIndex : 0,
            ),
          ),
        )
      : -1

    for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
      const isReeseAtBuild = i === reeseIndexAtBuild
      const carrier = c.createOscillator()
      carrier.type = isReeseAtBuild ? 'sawtooth' : 'sine'
      const carrierDetuned = c.createOscillator()
      carrierDetuned.type = isReeseAtBuild ? 'sawtooth' : 'sine'

      const vca = c.createGain()
      vca.gain.value = 0.5

      const ampLfo = c.createOscillator()
      ampLfo.type = 'sine'

      const speedLfo = c.createOscillator()
      speedLfo.type = 'sine'

      const speedDepth = c.createGain()
      const lfoDepth = c.createGain()
      const ampLfo2 = c.createOscillator()
      ampLfo2.type = 'sine'
      const speedLfo2 = c.createOscillator()
      speedLfo2.type = 'sine'
      const speedDepth2 = c.createGain()
      const lfoDepth2 = c.createGain()
      const fastAmpLfo = c.createOscillator()
      fastAmpLfo.type = 'sine'
      const fastAmpSpeedLfo = c.createOscillator()
      fastAmpSpeedLfo.type = 'sine'
      const fastAmpSpeedDepth = c.createGain()
      const fastAmpDepth = c.createGain()
      const stereoPanner = c.createStereoPanner()
      stereoPanner.pan.value = 0
      const panLfo = c.createOscillator()
      panLfo.type = 'sine'
      const panLfoDepth = c.createGain()
      const levelGain = c.createGain()
      levelGain.gain.value = 0

      const pitchBandpass = c.createBiquadFilter()
      pitchBandpass.type = 'bandpass'
      pitchBandpass.Q.value = Math.min(
        30,
        Math.max(0.25, busNum(getDebug(), 'voicePitchBandpassQ', 5)),
      )
      const toneLowpass = c.createBiquadFilter()
      toneLowpass.type = 'lowpass'
      toneLowpass.frequency.value = c.sampleRate * 0.48
      const reeseDriveGain = c.createGain()
      reeseDriveGain.gain.value = 1
      const reeseShaper = c.createWaveShaper()
      reeseShaper.curve = PRE_SHAPER_CURVE
      reeseShaper.oversample = '2x'
      const bpDryGain = c.createGain()
      const bpWetGain = c.createGain()
      bpDryGain.gain.value = 1
      bpWetGain.gain.value = 0

      carrier.connect(bpDryGain)
      if (i === reeseIndexAtBuild) {
        carrierDetuned.connect(bpDryGain)
      }
      bpDryGain.connect(vca)
      carrier.connect(pitchBandpass)
      if (i === reeseIndexAtBuild) {
        carrierDetuned.connect(pitchBandpass)
      }
      pitchBandpass.connect(toneLowpass)
      toneLowpass.connect(bpWetGain)
      if (isReeseAtBuild) {
        bpWetGain.connect(reeseDriveGain)
        reeseDriveGain.connect(reeseShaper)
        reeseShaper.connect(vca)
      } else {
        bpWetGain.connect(vca)
      }
      vca.connect(levelGain)
      levelGain.connect(stereoPanner)
      stereoPanner.connect(masterGain)

      ampLfo.connect(lfoDepth)
      lfoDepth.connect(vca.gain)

      speedLfo.connect(speedDepth)
      speedDepth.connect(ampLfo.frequency)

      ampLfo2.connect(lfoDepth2)
      lfoDepth2.connect(vca.gain)

      speedLfo2.connect(speedDepth2)
      speedDepth2.connect(ampLfo2.frequency)

      fastAmpLfo.connect(fastAmpDepth)
      fastAmpDepth.connect(vca.gain)
      fastAmpSpeedLfo.connect(fastAmpSpeedDepth)
      fastAmpSpeedDepth.connect(fastAmpLfo.frequency)

      panLfo.connect(panLfoDepth)
      panLfoDepth.connect(stereoPanner.pan)

      voices.push({
        carrier,
        carrierDetuned,
        pitchBandpass,
        bpDryGain,
        bpWetGain,
        toneLowpass,
        reeseDriveGain,
        reeseShaper,
        vca,
        ampLfo,
        speedLfo,
        speedDepth,
        lfoDepth,
        ampLfo2,
        speedLfo2,
        speedDepth2,
        lfoDepth2,
        fastAmpLfo,
        fastAmpSpeedLfo,
        fastAmpSpeedDepth,
        fastAmpDepth,
        stereoPanner,
        panLfo,
        panLfoDepth,
        levelGain,
      })
    }

    startOscillatorAtPhase(chorusLfo, c, phase01(seed, PHASE_SALT_CHORUS))
    lpFreqBase.start()
    startOscillatorAtPhase(filterLfo, c, phase01(seed, PHASE_SALT_BUS_FILTER_LFO))
    startOscillatorAtPhase(filterSpeedLfo, c, phase01(seed, PHASE_SALT_BUS_FILTER_SPEED_LFO))
    startOscillatorAtPhase(preDlyJit1Lfo, c, phase01(seed, PHASE_SALT_PRE_DLY_JIT1_LFO))
    startOscillatorAtPhase(preDlyJit1SpeedLfo, c, phase01(seed, PHASE_SALT_PRE_DLY_JIT1_SPEED))
    startOscillatorAtPhase(preDlyJit2Lfo, c, phase01(seed, PHASE_SALT_PRE_DLY_JIT2_LFO))
    startOscillatorAtPhase(preDlyJit2SpeedLfo, c, phase01(seed, PHASE_SALT_PRE_DLY_JIT2_SPEED))
    for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
      const v = voices[i]
      const vi = (i + 1) << 16
      startOscillatorAtPhase(v.ampLfo, c, phase01(seed, vi ^ PHASE_SALT_AMP_LFO))
      startOscillatorAtPhase(v.speedLfo, c, phase01(seed, vi ^ PHASE_SALT_SPEED_LFO))
      startOscillatorAtPhase(v.ampLfo2, c, phase01(seed, vi ^ PHASE_SALT_AMP_LFO2))
      startOscillatorAtPhase(v.speedLfo2, c, phase01(seed, vi ^ PHASE_SALT_SPEED_LFO2))
      startOscillatorAtPhase(v.panLfo, c, phase01(seed, vi ^ PHASE_SALT_PAN_LFO))
      startOscillatorAtPhase(v.fastAmpLfo, c, phase01(seed, vi ^ PHASE_SALT_FAST_AMP_LFO))
      startOscillatorAtPhase(
        v.fastAmpSpeedLfo,
        c,
        phase01(seed, vi ^ PHASE_SALT_FAST_SPEED_LFO),
      )
      const carrierPhase = phase01(seed, vi ^ PHASE_SALT_CARRIER)
      startOscillatorAtPhase(v.carrier, c, carrierPhase)
      if (i === reeseIndexAtBuild) {
        startOscillatorAtPhase(v.carrierDetuned, c, carrierPhase + 0.25)
      }
    }

    resetCarrierPitchSmoothState()
    resetScaleCycleState()
    syncAllParams()

    resetVoiceFadeState()
    for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) voiceSlotActive[i] = false
    applyVoiceLevels()
  }

  return {
    tryEnsureGraph(): void {
      void resumeAudioContext().then(() => {
        const c = getAudioContext()
        if (!c) return
        if (voices.length > 0 && ctxRef === c) return
        buildGraph()
      })
    },

    applyDebugNow(): void {
      void resumeAudioContext().then(() => {
        if (!isAudioContextReady()) return
        if (voices.length > 0 && ctxRef) {
          syncAllParams()
        } else {
          buildGraph()
        }
      })
    },

    getEffectiveRootMidi(): number {
      const d = getDebug()
      const baseRoot = rootMidiFromSeed(seed)
      const dir = parseScaleCycleDirection(d.scaleCycleDirection, 'fifths')
      return effectiveRootMidiAfterCycleSteps(baseRoot, scaleCycleStep, dir)
    },

    setSeed(s: number): void {
      seed = s >>> 0
      getDebug().voiceMacroJitterTimeSec = 0
      resetCarrierPitchSmoothState()
      resetScaleCycleState()
      const d = getDebug()
      if (Number.isFinite(d.averageVoiceLifetimeSec) && d.averageVoiceLifetimeSec > 0) {
        syncVoiceSlotMaskFromDisplayed()
      }
      if (voices.length > 0) syncAllParams()
    },

    resetVoiceSmoothing(): void {
      displayedVoices = 0
      resetCarrierPitchSmoothState()
      resetVoiceFadeState()
      syncVoiceSlotMaskFromDisplayed()
    },

    tick(dtSec, structureVoxelCount, orbitalSats, excavatingSats, scannerSats, drossCollectorSats): void {
      if (voices.length === 0) return
      const d = getDebug()
      const dt = Math.max(0, dtSec)
      if (Number.isFinite(dt)) {
        const prev = Number.isFinite(d.voiceMacroJitterTimeSec) ? d.voiceMacroJitterTimeSec : 0
        d.voiceMacroJitterTimeSec = prev + dt
      }
      if (d.scaleCycleEnabled !== false && Number.isFinite(dt) && dt > 0) {
        scaleCycleTimeToNextSec -= dt
        while (scaleCycleTimeToNextSec <= 0) {
          scaleCycleStep = (scaleCycleStep + 1) % 12
          rollScaleCycleDelay()
        }
      }
      const satSum = orbitalSats + excavatingSats + scannerSats + drossCollectorSats
      const w = structureVoxelCount * d.voxelWeight + satSum * d.satelliteWeight
      let target = Math.round(w * d.activityScale)
      target = Math.min(d.maxVoices, Math.max(d.minVoices, target))
      target = Math.min(ASTEROID_MUSIC_VOICE_COUNT, Math.max(0, target))

      const rate = Math.max(0.001, d.influenceRate)
      const alpha = 1 - Math.exp(-rate * Math.max(0, dtSec))
      displayedVoices += (target - displayedVoices) * alpha
      stepVoiceSlotChurn(dt, d)

      syncAllParams()
      applyVoiceLevels()
    },

    dispose,
  }
}
