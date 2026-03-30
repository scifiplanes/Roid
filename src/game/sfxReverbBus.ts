import { resumeAudioContext } from './audioContext'
import { gameBalance } from './gameBalance'
import { createReverbImpulseBuffer } from './reverbImpulse'

let ctxRef: AudioContext | null = null
let busInput: GainNode | null = null
let wetSendGain: GainNode | null = null
let wetOutGain: GainNode | null = null
let convolverNode: ConvolverNode | null = null
let lastIrDur = -1
let lastIrDecay = -1

/**
 * Apply `gameBalance` wet levels and rebuild convolver IR when duration/decay change.
 * Safe before the bus exists (no-op). Resumes audio context for immediate slider feedback.
 */
export function applySfxReverbFromBalance(): void {
  void resumeAudioContext()
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
 * Final node for all gameplay SFX chains: parallel dry (unity) + convolver wet into `destination`.
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
  input.gain.value = 1
  input.connect(dry)
  input.connect(wetSend)
  wetSend.connect(convolver)
  convolver.connect(wetOut)
  dry.connect(c.destination)
  wetOut.connect(c.destination)

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
