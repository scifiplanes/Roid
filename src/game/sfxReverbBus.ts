import { gameBalance } from './gameBalance'
import { getGlobalMasterInput } from './globalMasterBus'
import { createReverbImpulseBuffer } from './reverbImpulse'

let ctxRef: AudioContext | null = null
let busInput: GainNode | null = null
let wetSendGain: GainNode | null = null
let wetOutGain: GainNode | null = null
let convolverNode: ConvolverNode | null = null
let lastIrDur = -1
let lastIrDecay = -1
/** User SFX level (0–1); applied to the bus input before dry/wet split. */
let lastSfxVolumeLinear = 1

/**
 * Sets gameplay SFX loudness (lasers, taps, hoover, etc.). Safe before the bus exists.
 */
export function applySfxVolumeLinear(linear: number): void {
  const v = Math.min(1, Math.max(0, linear))
  lastSfxVolumeLinear = v
  const c = ctxRef
  if (!c || !busInput) return
  const t = c.currentTime
  busInput.gain.cancelScheduledValues(t)
  busInput.gain.setValueAtTime(v, t)
}

/**
 * Apply `gameBalance` wet levels and rebuild convolver IR when duration/decay change.
 * Safe before the bus exists (no-op). Resumes audio context for immediate slider feedback.
 */
export function applySfxReverbFromBalance(): void {
  const c = ctxRef
  if (!c || !wetSendGain || !wetOutGain || !convolverNode) return
  const t = c.currentTime
  const b = gameBalance
  wetSendGain.gain.cancelScheduledValues(t)
  wetOutGain.gain.cancelScheduledValues(t)
  wetSendGain.gain.setValueAtTime(b.sfxReverbWetSend, t)
  wetOutGain.gain.setValueAtTime(b.sfxReverbWetOut, t)

  const dur = b.sfxReverbDurationSec
  const decay = b.sfxReverbDecayPerSec
  if (Math.abs(dur - lastIrDur) > 1e-4 || Math.abs(decay - lastIrDecay) > 1e-4) {
    lastIrDur = dur
    lastIrDecay = decay
    convolverNode.buffer = createReverbImpulseBuffer(c, dur, decay)
  }
}

/**
 * Final node for all gameplay SFX chains: parallel dry (unity) + convolver wet into
 * [`global master bus`](globalMasterBus.ts) (summed with music → compressor → `destination`).
 */
export function getSfxBusInput(c: AudioContext): GainNode {
  if (busInput && ctxRef === c) return busInput

  const dry = c.createGain()
  dry.gain.value = 1

  const wetSend = c.createGain()
  const convolver = c.createConvolver()
  convolver.normalize = true

  const wetOut = c.createGain()

  const input = c.createGain()
  input.gain.value = lastSfxVolumeLinear
  input.connect(dry)
  input.connect(wetSend)
  wetSend.connect(convolver)
  convolver.connect(wetOut)
  const masterIn = getGlobalMasterInput(c)
  dry.connect(masterIn)
  wetOut.connect(masterIn)

  ctxRef = c
  busInput = input
  wetSendGain = wetSend
  wetOutGain = wetOut
  convolverNode = convolver

  lastIrDur = -1
  lastIrDecay = -1
  applySfxReverbFromBalance()

  return input
}
