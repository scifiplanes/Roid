import { Vector3, type PerspectiveCamera } from 'three'
import { getAudioContext } from './audioContext'
import { getSfxBusInput } from './sfxReverbBus'
import { gameBalance } from './gameBalance'
import { getAudioMasterDebugSnapshot } from './masterOutputChain'
import { pickThudDebug } from './pickThudDebug'
import type { VoxelKind } from './voxelKinds'

const shakeOffset = new Vector3()
let shakeEnergy = 0
let shakeAppliedThisFrame = false

/** Impulse for camera jitter (world units, scaled inside apply). */
export function triggerMineShake(popped: boolean): void {
  const impulse = popped ? 0.088 : 0.054
  shakeEnergy = Math.max(shakeEnergy, impulse)
}

/**
 * Call after OrbitControls `update()`. Adds a small decaying offset to `camera.position`.
 */
export function applyFrameShake(camera: PerspectiveCamera): void {
  shakeAppliedThisFrame = false
  if (shakeEnergy < 1e-6) return

  const t = performance.now() * 0.001
  const a = shakeEnergy
  shakeOffset.set(
    Math.sin(t * 47.3) * a * 0.55,
    Math.cos(t * 41.7) * a * 0.55,
    Math.sin(t * 43.1 + 0.7) * a * 0.4,
  )
  camera.position.add(shakeOffset)
  shakeEnergy *= 0.82
  shakeAppliedThisFrame = true
}

/** Call after `renderer.render` to restore orbit camera position. */
export function undoFrameShake(camera: PerspectiveCamera): void {
  if (shakeAppliedThisFrame) {
    camera.position.sub(shakeOffset)
  }
}

function envelopeGain(
  g: GainNode,
  t0: number,
  peak: number,
  tailSec: number,
  attackSec = 0.002,
): void {
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + attackSec)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + tailSec)
}

/** Short triangle tick through highpass — subtle mechanical click. */
function scheduleReplicatorClick(
  c: AudioContext,
  t0: number,
  peak: number,
  freqHz: number,
  tailSec: number,
  attackSec: number,
): void {
  const osc = c.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freqHz, t0)
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 720
  const g = c.createGain()
  envelopeGain(g, t0, peak, tailSec, attackSec)
  osc.connect(hp).connect(g).connect(getSfxBusInput(c))
  osc.start(t0)
  osc.stop(t0 + tailSec + 0.02)
}

export function playReplicatorPlaceClick(): void {
  try {
    const c = getAudioContext()
    if (!c || c.state !== 'running') return
    scheduleReplicatorClick(c, c.currentTime, 0.048, 1760, 0.016, 0.009)
  } catch {
    /* ignore blocked / unsupported audio */
  }
}

export function playReplicatorTapClick(): void {
  try {
    const c = getAudioContext()
    if (!c || c.state !== 'running') return
    scheduleReplicatorClick(c, c.currentTime, 0.032, 1320, 0.024, 0.01)
  } catch {
    /* ignore blocked / unsupported audio */
  }
}

/** Brighter “magnetic” tick — distinct from mining thuds and replicator UI clicks. */
export function playDebrisCollectSound(): void {
  try {
    const c = getAudioContext()
    if (!c || c.state !== 'running') return
    scheduleReplicatorClick(c, c.currentTime, 0.038, 2480, 0.022, 0.006)
  } catch {
    /* ignore blocked / unsupported audio */
  }
}

const LASER_PITCH_BASE_START_HZ = 523.25
/** C5 → C2 is three octaves; scaled by `laserZapPitchDepthMult`. */
const LASER_PITCH_BASE_OCTAVES_DOWN = 3

/** C5 → C2 (~1 s baseline); sine carrier with LFO amplitude modulation. */
export function playOrbitalLaserZap(): void {
  try {
    const c = getAudioContext()
    if (!c || c.state !== 'running') return
    const t0 = c.currentTime

    const dur = Math.min(5, Math.max(0.06, 1 * gameBalance.laserZapPitchDurMult))
    const attackSec = Math.min(0.14, Math.max(0.006, dur * 0.028))

    const startHz = Math.min(
      8000,
      Math.max(32, LASER_PITCH_BASE_START_HZ * gameBalance.laserZapPitchStartFreqMult),
    )
    const octavesDown = Math.min(
      9,
      Math.max(0.12, LASER_PITCH_BASE_OCTAVES_DOWN * gameBalance.laserZapPitchDepthMult),
    )
    const endHzRaw = startHz / 2 ** octavesDown
    const endHz = Math.max(12, Math.min(startHz * 0.995, endHzRaw))

    const vol = gameBalance.laserZapVolumeMult
    const lfoHz = Math.min(28, Math.max(0.4, 7.2 * gameBalance.laserZapLfoHzMult))
    const lfoDepthAmt = Math.min(0.45, Math.max(0.02, 0.22 * gameBalance.laserZapLfoDepthMult))
    const peak = Math.min(0.95, Math.max(0.0001, 0.42 * vol))

    const carrier = c.createOscillator()
    carrier.type = 'sine'
    carrier.frequency.setValueAtTime(startHz, t0)
    carrier.frequency.exponentialRampToValueAtTime(Math.max(endHz, 0.01), t0 + dur)

    const vca = c.createGain()
    vca.gain.value = 0.48

    const lfo = c.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = lfoHz
    const lfoDepth = c.createGain()
    lfoDepth.gain.value = lfoDepthAmt
    lfo.connect(lfoDepth)
    lfoDepth.connect(vca.gain)

    const master = c.createGain()
    master.gain.setValueAtTime(0.0001, t0)
    master.gain.exponentialRampToValueAtTime(peak, t0 + attackSec)
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

    carrier.connect(vca)
    vca.connect(master)
    master.connect(getSfxBusInput(c))

    const tail = Math.min(0.2, dur * 0.12 + 0.04)
    carrier.start(t0)
    lfo.start(t0)
    carrier.stop(t0 + dur + tail)
    lfo.stop(t0 + dur + tail)
  } catch {
    /* ignore blocked / unsupported audio */
  }
}

type OrbitalLaserSustainNodes = {
  ctx: AudioContext
  master: GainNode
  carrier: OscillatorNode
  lfo: OscillatorNode
  vca: GainNode
}

let orbitalLaserSustainRef: OrbitalLaserSustainNodes | null = null

export function stopOrbitalLaserSustain(): void {
  const ref = orbitalLaserSustainRef
  if (!ref) return
  orbitalLaserSustainRef = null
  const { ctx, master, carrier, lfo } = ref
  const t0 = ctx.currentTime
  const rel = 0.09
  try {
    master.gain.cancelScheduledValues(t0)
    const gv = Math.max(0.0002, master.gain.value)
    master.gain.setValueAtTime(gv, t0)
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + rel)
    carrier.stop(t0 + rel + 0.025)
    lfo.stop(t0 + rel + 0.025)
  } catch {
    /* ignore */
  }
}

/** Held mining laser: sine + tremolo until `stopOrbitalLaserSustain`. */
export function startOrbitalLaserSustain(): void {
  try {
    stopOrbitalLaserSustain()
    const c = getAudioContext()
    if (!c || c.state !== 'running') return
    const t0 = c.currentTime

    const vol = gameBalance.laserZapVolumeMult
    const startHz = Math.min(
      8000,
      Math.max(32, LASER_PITCH_BASE_START_HZ * gameBalance.laserZapPitchStartFreqMult),
    )
    const octavesDown = Math.min(
      9,
      Math.max(0.12, LASER_PITCH_BASE_OCTAVES_DOWN * gameBalance.laserZapPitchDepthMult),
    )
    const endHz = Math.max(12, Math.min(startHz * 0.995, startHz / 2 ** octavesDown))
    const sustainHz = Math.max(32, Math.sqrt(startHz * endHz))

    const peak = Math.min(0.82, Math.max(0.0001, 0.3 * vol))
    const lfoHz = Math.min(28, Math.max(0.4, 7.2 * gameBalance.laserZapLfoHzMult))
    const lfoDepthAmt = Math.min(0.45, Math.max(0.02, 0.22 * gameBalance.laserZapLfoDepthMult))

    const carrier = c.createOscillator()
    carrier.type = 'sine'
    carrier.frequency.value = sustainHz

    const vca = c.createGain()
    vca.gain.value = 0.48

    const lfo = c.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = lfoHz
    const lfoDepth = c.createGain()
    lfoDepth.gain.value = lfoDepthAmt
    lfo.connect(lfoDepth)
    lfoDepth.connect(vca.gain)

    const master = c.createGain()
    const atk = 0.045
    master.gain.setValueAtTime(0.0001, t0)
    master.gain.exponentialRampToValueAtTime(peak, t0 + atk)

    carrier.connect(vca)
    vca.connect(master)
    master.connect(getSfxBusInput(c))

    carrier.start(t0)
    lfo.start(t0)

    orbitalLaserSustainRef = { ctx: c, master, carrier, lfo, vca }
  } catch {
    orbitalLaserSustainRef = null
  }
}

type ExcavatingLaserSustainNodes = {
  ctx: AudioContext
  master: GainNode
  src: AudioBufferSourceNode
  lfo: OscillatorNode
  vca: GainNode
}

let excavatingLaserSustainRef: ExcavatingLaserSustainNodes | null = null

export function stopExcavatingLaserSustain(): void {
  const ref = excavatingLaserSustainRef
  if (!ref) return
  excavatingLaserSustainRef = null
  const { ctx, master, src, lfo } = ref
  const t0 = ctx.currentTime
  const rel = Math.max(0.02, gameBalance.digLaserSustainReleaseSec)
  try {
    master.gain.cancelScheduledValues(t0)
    const gv = Math.max(0.0002, master.gain.value)
    master.gain.setValueAtTime(gv, t0)
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + rel)
    const tStop = t0 + rel + 0.03
    src.stop(tStop)
    lfo.stop(tStop)
  } catch {
    /* ignore */
  }
}

/** Held dig laser: looped band-limited noise + tremolo until `stopExcavatingLaserSustain`. */
export function startExcavatingLaserSustain(): void {
  try {
    stopExcavatingLaserSustain()
    const c = getAudioContext()
    if (!c || c.state !== 'running') return
    const t0 = c.currentTime
    const b = gameBalance

    const bufSec = Math.min(0.65, Math.max(0.04, b.digLaserNoiseBufferSec))
    const n = Math.min(120000, Math.floor(c.sampleRate * bufSec))
    const buf = c.createBuffer(1, n, c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < n; i++) {
      data[i] = Math.random() * 2 - 1
    }

    const src = c.createBufferSource()
    src.buffer = buf
    src.loop = true

    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = b.digLaserBandpassHz
    bp.Q.value = b.digLaserBandpassQ

    const vca = c.createGain()
    vca.gain.value = 0.48

    const lfoHz = Math.min(28, Math.max(0.4, 7.2 * b.digLaserLfoHzMult))
    const lfoDepthAmt = Math.min(0.45, Math.max(0.02, 0.22 * b.digLaserLfoDepthMult))
    const lfo = c.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = lfoHz
    const lfoDepth = c.createGain()
    lfoDepth.gain.value = lfoDepthAmt
    lfo.connect(lfoDepth)
    lfoDepth.connect(vca.gain)

    const master = c.createGain()
    const peak = Math.min(
      0.6,
      Math.max(0.0002, b.digLaserSustainPeak * Math.max(0.1, b.digLaserVolumeMult)),
    )
    const atk = Math.max(0.002, b.digLaserSustainAttackSec)
    master.gain.setValueAtTime(0.0001, t0)
    master.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + atk)

    src.connect(bp).connect(vca).connect(master).connect(getSfxBusInput(c))
    src.start(t0)
    lfo.start(t0)

    excavatingLaserSustainRef = { ctx: c, master, src, lfo, vca }
  } catch {
    excavatingLaserSustainRef = null
  }
}

type HooverSustainNodes = {
  ctx: AudioContext
  master: GainNode
  src: AudioBufferSourceNode
  bp: BiquadFilterNode
  startTime: number
}

let hooverSustainRef: HooverSustainNodes | null = null

export function stopHooverSustain(): void {
  const ref = hooverSustainRef
  if (!ref) return
  hooverSustainRef = null
  const { ctx, master, src } = ref
  const t0 = ctx.currentTime
  const rel = 0.08
  try {
    master.gain.cancelScheduledValues(t0)
    const gv = Math.max(0.0002, master.gain.value)
    master.gain.setValueAtTime(gv, t0)
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + rel)
    src.stop(t0 + rel + 0.03)
  } catch {
    /* ignore */
  }
}

/**
 * Hoover tool sustain: soft band-limited noise while active. Tuned quieter than dig laser.
 */
export function startHooverSustain(): void {
  try {
    stopHooverSustain()
    const c = getAudioContext()
    if (!c || c.state !== 'running') return
    const t0 = c.currentTime

    const bufSec = 0.25
    const n = Math.min(60000, Math.floor(c.sampleRate * bufSec))
    const buf = c.createBuffer(1, n, c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < n; i++) {
      data[i] = Math.random() * 2 - 1
    }

    const src = c.createBufferSource()
    src.buffer = buf
    src.loop = true

    const bp = c.createBiquadFilter()
    bp.type = 'lowpass'
    bp.frequency.value = 120
    bp.Q.value = 0.8

    const master = c.createGain()
    const peak = 0.15
    const atk = 0.045
    master.gain.setValueAtTime(0.0001, t0)
    master.gain.exponentialRampToValueAtTime(peak, t0 + atk)

    src.connect(bp).connect(master).connect(getSfxBusInput(c))
    src.start(t0)

    hooverSustainRef = { ctx: c, master, src, bp, startTime: t0 }

    const updateCutoff = () => {
      const ref = hooverSustainRef
      if (!ref || ref.ctx !== c || ref.bp !== bp) return
      const now = c.currentTime
      const dt = now - ref.startTime
      const nyquist = c.sampleRate * 0.5
      const debug = getAudioMasterDebugSnapshot()
      const base = Number.isFinite(debug.hooverLowpassBaseHz)
        ? debug.hooverLowpassBaseHz
        : 120
      const depth = Math.max(0, debug.hooverLowpassLfoDepthHz)
      const rate = Math.max(0, debug.hooverLowpassLfoRateHz)
      const clampedBase = Math.min(nyquist, Math.max(20, base))
      let cutoff = clampedBase
      if (depth > 0 && rate > 0) {
        const span = Math.min(nyquist - 20, Math.max(0, depth))
        const wobble = Math.sin(dt * rate * 2 * Math.PI)
        cutoff = clampedBase + span * wobble
        cutoff = Math.min(nyquist, Math.max(20, cutoff))
      }
      ref.bp.frequency.setValueAtTime(cutoff, now)
      // Keep updating while hoover sustain is active.
      requestAnimationFrame(updateCutoff)
    }
    // Start LFO loop on next frame so we do not block the current call stack.
    requestAnimationFrame(updateCutoff)
  } catch {
    hooverSustainRef = null
  }
}

/** Discovery site claimed but no offer (e.g. all archetype weights zero). Short down-chirp pair. */
export function playDiscoveryFalseSignal(): void {
  try {
    const c = getAudioContext()
    if (!c || c.state !== 'running') return
    const t0 = c.currentTime
    scheduleReplicatorClick(c, t0, 0.042, 880, 0.055, 0.008)
    scheduleReplicatorClick(c, t0 + 0.07, 0.036, 520, 0.07, 0.01)
  } catch {
    /* ignore */
  }
}

/** Scanner satellite completed a neighborhood readout. */
export function playScanPing(): void {
  try {
    const c = getAudioContext()
    if (!c || c.state !== 'running') return
    const t0 = c.currentTime
    scheduleReplicatorClick(c, t0, 0.048, 1420, 0.045, 0.006)
  } catch {
    /* ignore */
  }
}

/** Explosive charge detonated (processed-matter blast). */
export function playExplosiveChargeDetonation(): void {
  try {
    triggerMineShake(true)
    const c = getAudioContext()
    if (!c || c.state !== 'running') return
    const t0 = c.currentTime
    scheduleReplicatorClick(c, t0, 0.11, 220, 0.14, 0.004)
    scheduleReplicatorClick(c, t0 + 0.012, 0.052, 95, 0.18, 0.006)
  } catch {
    /* ignore */
  }
}

/** Hub toggled on (processing) vs off (standby). */
export function playHubToggle(isNowActive: boolean): void {
  try {
    const c = getAudioContext()
    if (!c || c.state !== 'running') return
    const t0 = c.currentTime
    if (isNowActive) {
      scheduleReplicatorClick(c, t0, 0.055, 1980, 0.02, 0.008)
    } else {
      scheduleReplicatorClick(c, t0, 0.04, 620, 0.055, 0.012)
    }
  } catch {
    /* ignore blocked / unsupported audio */
  }
}

/** Refinery toggled on (processing) vs off (standby). */
export function playRefineryToggle(isNowActive: boolean): void {
  try {
    const c = getAudioContext()
    if (!c || c.state !== 'running') return
    const t0 = c.currentTime
    if (isNowActive) {
      scheduleReplicatorClick(c, t0, 0.052, 1650, 0.022, 0.008)
    } else {
      scheduleReplicatorClick(c, t0, 0.038, 540, 0.058, 0.012)
    }
  } catch {
    /* ignore blocked / unsupported audio */
  }
}

export function playReplicatorConsumeClicks(tickCount: number): void {
  if (tickCount <= 0) return
  try {
    const c = getAudioContext()
    if (!c || c.state !== 'running') return
    const b = gameBalance
    const maxVoices = Math.max(1, Math.round(b.replicatorFeedAudioMaxVoices))
    const now = c.currentTime
    const voices = Math.min(tickCount, maxVoices)
    const activity = Math.min(1.35, 0.82 + 0.1 * Math.sqrt(tickCount))
    const peakEach =
      ((0.028 * activity) / Math.sqrt(voices)) * Math.max(0.1, b.replicatorFeedAudioVolumeMult)
    const stepSec = b.replicatorFeedAudioStepSec
    const baseHz = b.replicatorFeedAudioBaseHz
    const spread = b.replicatorFeedAudioPitchSpread
    const tailSec = b.replicatorFeedAudioTailSec
    const attackSec = b.replicatorFeedAudioAttackSec
    const spreadN = spread <= 0 ? 1 : Math.max(1, Math.round(spread))
    for (let i = 0; i < voices; i++) {
      const jitterMs = ((i * 17 + tickCount * 23) % 14) / 1000
      const t0 = now + i * stepSec + jitterMs
      const h =
        spread <= 0 ? 0 : (i * 97 + tickCount * 31 + 13) % spreadN
      scheduleReplicatorClick(c, t0, peakEach, baseHz + h, tailSec, attackSec)
    }
  } catch {
    /* ignore blocked / unsupported audio */
  }
}

/** Loose fines: band-limited noise “crunch” (reads clearly on small speakers). */
function playRegolithThud(c: AudioContext, now: number, popped: boolean): void {
  const cfg = pickThudDebug.regolith
  const tailSec = popped ? cfg.tailSecPopped : cfg.tailSecBase
  const peak = popped ? cfg.peakPopped : cfg.peakBase
  const n = Math.ceil(c.sampleRate * tailSec)
  const buffer = c.createBuffer(1, n, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < n; i++) {
    const shape = popped ? cfg.decayShapePopped : cfg.decayShapeBase
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * shape))
  }
  const src = c.createBufferSource()
  src.buffer = buffer
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = popped ? cfg.bandpassHzPopped : cfg.bandpassHzBase
  bp.Q.value = cfg.bandpassQ
  const g = c.createGain()
  envelopeGain(g, now, peak, tailSec, 0.001)
  src.connect(bp).connect(g).connect(getSfxBusInput(c))
  src.start(now)
  src.stop(now + tailSec + 0.03)
}

/** Crystalline fracture: saw through lowpass (bright body, duller than regolith noise). */
function playSilicateThud(c: AudioContext, now: number, popped: boolean): void {
  const cfg = pickThudDebug.silicate
  const tailSec = popped ? cfg.tailSecPopped : cfg.tailSecBase
  const peak = popped ? cfg.peakPopped : cfg.peakBase
  const osc = c.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.value = popped ? cfg.oscHzPopped : cfg.oscHzBase
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = popped ? cfg.lowpassHzPopped : cfg.lowpassHzBase
  lp.Q.value = cfg.lowpassQ
  const g = c.createGain()
  envelopeGain(g, now, peak, tailSec, 0.003)
  osc.connect(lp).connect(g).connect(getSfxBusInput(c))
  osc.start(now)
  osc.stop(now + tailSec + 0.03)
}

/** Metal “clang”: low fundamentals + harmonic (survives bad bass roll-off better than a lone sine). */
function playMetalThud(c: AudioContext, now: number, popped: boolean): void {
  const cfg = pickThudDebug.metal
  const tailSec = popped ? cfg.tailSecPopped : cfg.tailSecBase
  const peak = popped ? cfg.peakPopped : cfg.peakBase
  const f0 = popped ? cfg.f0Popped : cfg.f0Base

  const osc0 = c.createOscillator()
  const osc1 = c.createOscillator()
  osc0.type = 'square'
  osc1.type = 'sine'
  osc0.frequency.value = f0
  osc1.frequency.value = f0 * 2.01

  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = popped ? cfg.lowpassHzPopped : cfg.lowpassHzBase
  lp.Q.value = cfg.lowpassQ

  const gHarm = c.createGain()
  gHarm.gain.value = popped ? cfg.harmonicGainPopped : cfg.harmonicGainBase
  const g = c.createGain()
  envelopeGain(g, now, peak, tailSec, 0.004)

  osc0.connect(lp)
  osc1.connect(gHarm).connect(lp)
  lp.connect(g).connect(getSfxBusInput(c))
  osc0.start(now)
  osc1.start(now)
  osc0.stop(now + tailSec + 0.04)
  osc1.stop(now + tailSec + 0.04)
}

/**
 * Distinct timbres per lithology so laptop speakers don’t collapse everything to one click.
 * Regolith = filtered noise, silicate = saw+lowpass, metal = square+f harmonic + lowpass.
 */
export function playMineThud(popped: boolean, kind: VoxelKind): void {
  try {
    const c = getAudioContext()
    if (!c || c.state !== 'running') return

    const now = c.currentTime
    switch (kind) {
      case 'regolith':
        playRegolithThud(c, now, popped)
        break
      case 'silicateRock':
        playSilicateThud(c, now, popped)
        break
      case 'metalRich':
        playMetalThud(c, now, popped)
        break
      case 'replicator':
      case 'reactor':
      case 'battery':
        break
    }
  } catch {
    /* ignore blocked / unsupported audio */
  }
}

export function createMineRippleElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.id = 'mine-ripple'
  el.setAttribute('aria-hidden', 'true')
  return el
}

export function triggerMineRipple(
  el: HTMLDivElement,
  clientX: number,
  clientY: number,
  viewport: HTMLElement,
): void {
  const r = viewport.getBoundingClientRect()
  el.style.left = `${clientX - r.left}px`
  el.style.top = `${clientY - r.top}px`
  el.classList.remove('mine-ripple-active')
  void el.offsetWidth
  el.classList.add('mine-ripple-active')
}

export function onMiningHitFeedback(
  clientX: number,
  clientY: number,
  viewport: HTMLElement,
  rippleEl: HTMLDivElement,
  kind: VoxelKind,
  popped: boolean,
): void {
  triggerMineShake(popped)
  playMineThud(popped, kind)
  triggerMineRipple(rippleEl, clientX, clientY, viewport)
}

/** Shake + ripple only (no thud) — used for dig-laser ticks after the first sound in a press. */
export function onMiningHitFeedbackVisualOnly(
  clientX: number,
  clientY: number,
  viewport: HTMLElement,
  rippleEl: HTMLDivElement,
  popped: boolean,
): void {
  triggerMineShake(popped)
  triggerMineRipple(rippleEl, clientX, clientY, viewport)
}

export function onDebrisCollectFeedback(
  clientX: number,
  clientY: number,
  viewport: HTMLElement,
  rippleEl: HTMLDivElement,
): void {
  playDebrisCollectSound()
  triggerMineRipple(rippleEl, clientX, clientY, viewport)
}
