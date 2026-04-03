import { wireMusicPostAnalyserAfterGain } from './audioMeters'
import { getAudioContext } from './audioContext'
import { getGlobalMasterInput } from './globalMasterBus'
import {
  createDefaultAudioMasterDebug,
  type AudioMasterDebug,
} from './audioMasterDebug'

const MASTER_EQ_MID_HZ = 1000
const MASTER_EQ_MID_Q = 1

const EQ_LOW_SHELF_HZ_MIN = 40
const EQ_LOW_SHELF_HZ_MAX = 2000
const EQ_HIGH_SHELF_HZ_MIN = 1000
const EQ_HIGH_SHELF_HZ_MAX = 12000

let ctxRef: AudioContext | null = null
let masterIn: GainNode | null = null
let lowShelf: BiquadFilterNode | null = null
let midPeak: BiquadFilterNode | null = null
let highShelf: BiquadFilterNode | null = null
let highpass: BiquadFilterNode | null = null
/** After EQ/HPF, before global bus; gain from `musicPostOutGainDb`. */
let musicPostOutGain: GainNode | null = null

const _fallbackDebug = createDefaultAudioMasterDebug()
let getAudioMasterDebug: () => AudioMasterDebug = () => _fallbackDebug

export function setAudioMasterDebugGetter(get: () => AudioMasterDebug): void {
  getAudioMasterDebug = get
}

/** Current `AudioMasterDebug` snapshot (music post EQ + hoover lowpass LFO). */
export function getAudioMasterDebugSnapshot(): AudioMasterDebug {
  return getAudioMasterDebug()
}

function clampHz(hz: number): number {
  return Math.min(200, Math.max(20, hz))
}

function nyquistCapHz(c: AudioContext): number {
  return c.sampleRate * 0.45
}

function clampEqLowShelfHz(hz: number, c: AudioContext): number {
  const cap = Math.min(EQ_LOW_SHELF_HZ_MAX, nyquistCapHz(c))
  const lo = Math.min(EQ_LOW_SHELF_HZ_MIN, cap)
  if (!Number.isFinite(hz)) return lo
  return Math.min(cap, Math.max(lo, hz))
}

function clampEqHighShelfHz(hz: number, c: AudioContext): number {
  const cap = Math.min(EQ_HIGH_SHELF_HZ_MAX, nyquistCapHz(c))
  const lo = Math.min(EQ_HIGH_SHELF_HZ_MIN, cap)
  if (!Number.isFinite(hz)) return lo
  return Math.min(cap, Math.max(lo, hz))
}

/** Ensures low shelf corner stays below high shelf corner after clamping. */
function resolveShelfCornerHz(lowHz: number, highHz: number, c: AudioContext): { low: number; high: number } {
  const ny = nyquistCapHz(c)
  let low = clampEqLowShelfHz(lowHz, c)
  let high = clampEqHighShelfHz(highHz, c)
  if (low >= high) {
    high = Math.min(ny, low * 1.5 + 50)
    if (low >= high) {
      low = Math.max(EQ_LOW_SHELF_HZ_MIN, Math.min(low, high * 0.85))
      if (low >= high) high = Math.min(ny, low + 100)
    }
  }
  return { low, high }
}

function clampEqDb(db: number): number {
  return Math.min(12, Math.max(-12, db))
}

function clampMusicPostOutGainDb(db: number): number {
  return Math.min(36, Math.max(-24, db))
}

function dbToLinearGain(db: number): number {
  return 10 ** (clampMusicPostOutGainDb(db) / 20)
}

/**
 * Unity-gain input at the end of the **asteroid music** graph only (dry + wet buses).
 * Chain: lowshelf → peaking → highshelf → highpass → output gain → [`global master bus`](globalMasterBus.ts).
 */
export function getMusicPostChainInput(c: AudioContext): GainNode {
  if (masterIn && ctxRef === c) return masterIn

  const inGain = c.createGain()
  inGain.gain.value = 1

  const dbg = getAudioMasterDebug()
  const shelf = resolveShelfCornerHz(dbg.eqLowShelfHz, dbg.eqHighShelfHz, c)

  const ls = c.createBiquadFilter()
  ls.type = 'lowshelf'
  ls.frequency.value = shelf.low
  ls.gain.value = 0

  const pk = c.createBiquadFilter()
  pk.type = 'peaking'
  pk.frequency.value = MASTER_EQ_MID_HZ
  pk.Q.value = MASTER_EQ_MID_Q
  pk.gain.value = 0

  const hs = c.createBiquadFilter()
  hs.type = 'highshelf'
  hs.frequency.value = shelf.high
  hs.gain.value = 0

  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 40
  hp.Q.value = 0.707

  inGain.connect(ls)
  ls.connect(pk)
  pk.connect(hs)
  hs.connect(hp)

  const outGain = c.createGain()
  outGain.gain.value = 1
  hp.connect(outGain)
  const globalIn = getGlobalMasterInput(c)
  wireMusicPostAnalyserAfterGain(c, outGain, globalIn)

  ctxRef = c
  masterIn = inGain
  lowShelf = ls
  midPeak = pk
  highShelf = hs
  highpass = hp
  musicPostOutGain = outGain

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
  lowShelf.frequency.cancelScheduledValues(t)
  highShelf.frequency.cancelScheduledValues(t)
  lowShelf.gain.cancelScheduledValues(t)
  midPeak.gain.cancelScheduledValues(t)
  highShelf.gain.cancelScheduledValues(t)
  musicPostOutGain?.gain.cancelScheduledValues(t)

  const shelfHz = resolveShelfCornerHz(debug.eqLowShelfHz, debug.eqHighShelfHz, c)
  highpass.frequency.setValueAtTime(clampHz(debug.masterHighPassHz), t)
  lowShelf.frequency.setValueAtTime(shelfHz.low, t)
  highShelf.frequency.setValueAtTime(shelfHz.high, t)
  lowShelf.gain.setValueAtTime(clampEqDb(debug.eqLowDb), t)
  midPeak.gain.setValueAtTime(clampEqDb(debug.eqMidDb), t)
  highShelf.gain.setValueAtTime(clampEqDb(debug.eqHighDb), t)
  musicPostOutGain?.gain.setValueAtTime(dbToLinearGain(debug.musicPostOutGainDb), t)
}
