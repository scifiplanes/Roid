import { getAudioContext, resumeAudioContext, isAudioContextReady } from './audioContext'
import { getMusicPostChainInput } from './masterOutputChain'
import {
  type AsteroidMusicDebug,
  ASTEROID_MUSIC_VOICE_COUNT,
} from './asteroidMusicDebug'
import { createReverbImpulseBuffer } from './reverbImpulse'

const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11] as const

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

const PRE_SHAPER_CURVE = makePreShaperCurve()

export function countStructureVoxelsForMusic(cells: readonly { kind: string }[]): number {
  let n = 0
  for (const c of cells) {
    if (STRUCTURE_KINDS.has(c.kind)) n++
  }
  return n
}

function rootMidiFromSeed(seed: number): number {
  return 36 + (seed >>> 0) % 12
}

function defaultSemitonesFromRootForVoice(i: number): number {
  return Math.floor(i / 3) * 12 + [0, 4, 7][i % 3]
}

function snapMidiToMajorScale(roughMidi: number, rootMidi: number): number {
  const r = ((rootMidi % 12) + 12) % 12
  let best = Math.round(roughMidi)
  let bestErr = Infinity
  for (let delta = -48; delta <= 48; delta++) {
    const m = Math.round(roughMidi) + delta
    const mpc = ((m % 12) + 12) % 12
    let ok = false
    for (const s of MAJOR_SCALE_STEPS) {
      if (mpc === ((r + s) % 12 + 12) % 12) {
        ok = true
        break
      }
    }
    if (!ok) continue
    const err = Math.abs(m - roughMidi)
    if (err < bestErr) {
      bestErr = err
      best = m
    }
  }
  return best
}

function midiToHz(m: number): number {
  return 440 * 2 ** ((m - 69) / 12)
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
/** Bus lowpass LFO + speed LFO — not shared with per-voice tremolo salts. */
const PHASE_SALT_BUS_FILTER_LFO = 0x7e164
const PHASE_SALT_BUS_FILTER_SPEED_LFO = 0x8f275

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
  vca: GainNode
  ampLfo: OscillatorNode
  speedLfo: OscillatorNode
  speedDepth: GainNode
  lfoDepth: GainNode
  ampLfo2: OscillatorNode
  speedLfo2: OscillatorNode
  speedDepth2: GainNode
  lfoDepth2: GainNode
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
  convolver: ConvolverNode
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
  let masterGain: GainNode | null = null
  let busFx: BusFxNodes | null = null
  let ctxRef: AudioContext | null = null
  let lastReverbDecayApplied = -1
  let lastWetSatAmount = -1
  let lastChorusBaseMs = Number.NaN
  const voices: VoiceNodes[] = []

  function stopVoices(): void {
    for (const v of voices) {
      try {
        v.carrier.stop()
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
    lastReverbDecayApplied = -1
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

    const hz = Math.min(nyquist, Math.max(40, busNum(d, 'busLowPassHz', 20000)))
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

    const rm = clamp01(busNum(d, 'reverbMix', 0))
    const wetTrim = clamp01(busNum(d, 'reverbWetTrim', 0.55))
    /** Linear wet/dry: dry `1 − reverbMix`, wet `reverbMix` × `reverbWetTrim` (full wet = no dry). */
    busFx.dryBus.gain.setValueAtTime(clamp01(1 - rm), t)
    busFx.wetBus.gain.setValueAtTime(rm * wetTrim, t)

    const wetAmt = clamp01(busNum(d, 'busWetSaturatorAmount', 0))
    if (Math.abs(wetAmt - lastWetSatAmount) > 1e-6) {
      lastWetSatAmount = wetAmt
      busFx.postShaper.curve = makeWetSatCurve(wetAmt)
    }

    const decaySec = Math.min(10, Math.max(0.15, busNum(d, 'reverbDecaySec', 2.2)))
    if (Math.abs(decaySec - lastReverbDecayApplied) > 1e-4) {
      lastReverbDecayApplied = decaySec
      const dur = Math.min(6, Math.max(0.4, decaySec * 1.8))
      const decayPerSec = 3.2 / Math.max(0.2, decaySec)
      busFx.convolver.buffer = createReverbImpulseBuffer(c, dur, decayPerSec)
    }
  }

  function syncAllParams(): void {
    const c = ctxRef
    if (!c || !masterGain || voices.length === 0) return
    const t = c.currentTime
    const d = getDebug()
    const vol = getMusicVolume()
    masterGain.gain.setValueAtTime(vol, t)
    const root = rootMidiFromSeed(seed)

    for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
      const v = voices[i]
      const vd = d.voices[i]
      const roughMidi = root + defaultSemitonesFromRootForVoice(i) + vd.note
      const midi = snapMidiToMajorScale(roughMidi, root)
      v.carrier.frequency.setValueAtTime(midiToHz(midi), t)

      const minAmpLfoHz = 0.002
      const maxAmpLfoHz = 0.28
      let ampHz = Math.min(maxAmpLfoHz, Math.max(minAmpLfoHz, vd.ampLfoHz))
      const maxDep = Math.min(ampHz - minAmpLfoHz, maxAmpLfoHz - ampHz)
      const dep = Math.min(Math.max(0, maxDep), Math.max(0, vd.ampLfoSpeedModDepthHz))
      v.ampLfo.frequency.setValueAtTime(ampHz, t)
      v.speedDepth.gain.setValueAtTime(dep, t)
      v.speedLfo.frequency.setValueAtTime(
        Math.min(0.35, Math.max(0.02, vd.ampLfoSpeedModHz)),
        t,
      )
      const tremoloAmount = Math.min(1, Math.max(0, vd.ampLfoDepth) / 1.6)
      v.lfoDepth.gain.setValueAtTime(0.5 * tremoloAmount, t)

      const ampHz2 = Math.min(maxAmpLfoHz, Math.max(minAmpLfoHz, vd.ampLfo2Hz))
      const maxDep2 = Math.min(ampHz2 - minAmpLfoHz, maxAmpLfoHz - ampHz2)
      const dep2 = Math.min(Math.max(0, maxDep2), Math.max(0, vd.ampLfo2SpeedModDepthHz))
      v.ampLfo2.frequency.setValueAtTime(ampHz2, t)
      v.speedDepth2.gain.setValueAtTime(dep2, t)
      v.speedLfo2.frequency.setValueAtTime(
        Math.min(0.35, Math.max(0.02, vd.ampLfo2SpeedModHz)),
        t,
      )
      const tremoloAmount2 = Math.min(1, Math.max(0, vd.ampLfo2Depth) / 1.6)
      v.lfoDepth2.gain.setValueAtTime(0.5 * tremoloAmount2, t)

      const minPanHz = 0.0008
      const maxPanHz = 0.03
      const panHz = Math.min(maxPanHz, Math.max(minPanHz, vd.panLfoHz))
      v.panLfo.frequency.setValueAtTime(panHz, t)
      v.panLfoDepth.gain.setValueAtTime(Math.min(0.95, Math.max(0, vd.panLfoDepth)), t)
    }

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
  function applyVoiceLevels(activeCount: number): void {
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

    for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
      const v = voices[i]
      const vd = d.voices[i]
      const active = i < activeCount
      const targetPeak = active
        ? Math.min(0.95, Math.max(0, vd.amp)) * vol * gainScale
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

      v.levelGain.gain.setValueAtTime(smoothedVoiceGain[i], t)
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
    const convolver = c.createConvolver()
    convolver.normalize = true
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
    lowpass.connect(convolver)
    convolver.connect(postShaper)
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
      convolver,
      postShaper,
      wetBus,
    }
    lastReverbDecayApplied = -1
    lastWetSatAmount = -1
    lastChorusBaseMs = Number.NaN

    for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
      const carrier = c.createOscillator()
      carrier.type = 'sine'

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
      const stereoPanner = c.createStereoPanner()
      stereoPanner.pan.value = 0
      const panLfo = c.createOscillator()
      panLfo.type = 'sine'
      const panLfoDepth = c.createGain()
      const levelGain = c.createGain()
      levelGain.gain.value = 0

      carrier.connect(vca)
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

      panLfo.connect(panLfoDepth)
      panLfoDepth.connect(stereoPanner.pan)

      voices.push({
        carrier,
        vca,
        ampLfo,
        speedLfo,
        speedDepth,
        lfoDepth,
        ampLfo2,
        speedLfo2,
        speedDepth2,
        lfoDepth2,
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
    for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
      const v = voices[i]
      const vi = (i + 1) << 16
      startOscillatorAtPhase(v.ampLfo, c, phase01(seed, vi ^ PHASE_SALT_AMP_LFO))
      startOscillatorAtPhase(v.speedLfo, c, phase01(seed, vi ^ PHASE_SALT_SPEED_LFO))
      startOscillatorAtPhase(v.ampLfo2, c, phase01(seed, vi ^ PHASE_SALT_AMP_LFO2))
      startOscillatorAtPhase(v.speedLfo2, c, phase01(seed, vi ^ PHASE_SALT_SPEED_LFO2))
      startOscillatorAtPhase(v.panLfo, c, phase01(seed, vi ^ PHASE_SALT_PAN_LFO))
      startOscillatorAtPhase(v.carrier, c, phase01(seed, vi ^ PHASE_SALT_CARRIER))
    }

    syncAllParams()

    resetVoiceFadeState()
    applyVoiceLevels(0)
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

    setSeed(s: number): void {
      seed = s >>> 0
      if (voices.length > 0) syncAllParams()
    },

    resetVoiceSmoothing(): void {
      displayedVoices = 0
      resetVoiceFadeState()
    },

    tick(dtSec, structureVoxelCount, orbitalSats, excavatingSats, scannerSats, drossCollectorSats): void {
      if (voices.length === 0) return
      const d = getDebug()
      const satSum = orbitalSats + excavatingSats + scannerSats + drossCollectorSats
      const w = structureVoxelCount * d.voxelWeight + satSum * d.satelliteWeight
      let target = Math.round(w * d.activityScale)
      target = Math.min(d.maxVoices, Math.max(d.minVoices, target))
      target = Math.min(ASTEROID_MUSIC_VOICE_COUNT, Math.max(0, target))

      const rate = Math.max(0.001, d.influenceRate)
      const alpha = 1 - Math.exp(-rate * Math.max(0, dtSec))
      displayedVoices += (target - displayedVoices) * alpha
      let active = Math.round(displayedVoices)
      active = Math.min(ASTEROID_MUSIC_VOICE_COUNT, Math.max(0, active))

      syncAllParams()
      applyVoiceLevels(active)
    },

    dispose,
  }
}
