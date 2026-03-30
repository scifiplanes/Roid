import { getAudioContext } from './audioContext'
import {
  createDefaultAudioMasterDebug,
  type AudioMasterDebug,
} from './audioMasterDebug'

/** Fixed band edges (only gains are exposed in debug). */
const MASTER_EQ_LOW_SHELF_HZ = 200
const MASTER_EQ_MID_HZ = 1000
const MASTER_EQ_MID_Q = 1
const MASTER_EQ_HIGH_SHELF_HZ = 4000

let ctxRef: AudioContext | null = null
let masterIn: GainNode | null = null
let lowShelf: BiquadFilterNode | null = null
let midPeak: BiquadFilterNode | null = null
let highShelf: BiquadFilterNode | null = null
let highpass: BiquadFilterNode | null = null

const _fallbackDebug = createDefaultAudioMasterDebug()
let getAudioMasterDebug: () => AudioMasterDebug = () => _fallbackDebug

export function setAudioMasterDebugGetter(get: () => AudioMasterDebug): void {
  getAudioMasterDebug = get
}

function clampHz(hz: number): number {
  return Math.min(200, Math.max(20, hz))
}

function clampEqDb(db: number): number {
  return Math.min(12, Math.max(-12, db))
}

/**
 * Unity-gain input at the end of the **asteroid music** graph only (dry + wet buses).
 * Chain: lowshelf → peaking → highshelf → highpass → `destination`.
 */
export function getMusicPostChainInput(c: AudioContext): GainNode {
  if (masterIn && ctxRef === c) return masterIn

  const inGain = c.createGain()
  inGain.gain.value = 1

  const ls = c.createBiquadFilter()
  ls.type = 'lowshelf'
  ls.frequency.value = MASTER_EQ_LOW_SHELF_HZ
  ls.gain.value = 0

  const pk = c.createBiquadFilter()
  pk.type = 'peaking'
  pk.frequency.value = MASTER_EQ_MID_HZ
  pk.Q.value = MASTER_EQ_MID_Q
  pk.gain.value = 0

  const hs = c.createBiquadFilter()
  hs.type = 'highshelf'
  hs.frequency.value = MASTER_EQ_HIGH_SHELF_HZ
  hs.gain.value = 0

  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 40
  hp.Q.value = 0.707

  inGain.connect(ls)
  ls.connect(pk)
  pk.connect(hs)
  hs.connect(hp)
  hp.connect(c.destination)

  ctxRef = c
  masterIn = inGain
  lowShelf = ls
  midPeak = pk
  highShelf = hs
  highpass = hp

  applyAudioMasterDebug(getAudioMasterDebug())
  return inGain
}

export function applyAudioMasterDebug(debug: AudioMasterDebug): void {
  const c = getAudioContext()
  if (!c) return
  if (!masterIn || ctxRef !== c) {
    getMusicPostChainInput(c)
  }
  if (!highpass || !lowShelf || !midPeak || !highShelf) return
  const t = c.currentTime

  highpass.frequency.cancelScheduledValues(t)
  lowShelf.gain.cancelScheduledValues(t)
  midPeak.gain.cancelScheduledValues(t)
  highShelf.gain.cancelScheduledValues(t)

  highpass.frequency.setValueAtTime(clampHz(debug.masterHighPassHz), t)
  lowShelf.gain.setValueAtTime(clampEqDb(debug.eqLowDb), t)
  midPeak.gain.setValueAtTime(clampEqDb(debug.eqMidDb), t)
  highShelf.gain.setValueAtTime(clampEqDb(debug.eqHighDb), t)
}
