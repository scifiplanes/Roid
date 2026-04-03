/**
 * Peak/RMS metering taps (AnalyserNode fan-out) for music post-chain and global master
 * pre/post limiter. Does not affect the audible graph beyond analyser CPU cost.
 */

const FFT_SIZE = 2048
const SMOOTHING = 0.65
/** Display floor for dBFS when linear level is tiny. */
const DBFS_FLOOR = -96

export type MeterBand = {
  peakLin: number
  rmsLin: number
  peakDbfs: number
  rmsDbfs: number
}

export type AudioMetersSnapshot = {
  musicPost: MeterBand | null
  masterPre: MeterBand | null
  masterPost: MeterBand | null
}

let musicAnalyser: AnalyserNode | null = null
let masterPreAnalyser: AnalyserNode | null = null
let masterPostAnalyser: AnalyserNode | null = null

let bufMusic: Float32Array | null = null
let bufPre: Float32Array | null = null
let bufPost: Float32Array | null = null

let lastSnapshot: AudioMetersSnapshot = {
  musicPost: null,
  masterPre: null,
  masterPost: null,
}

function createAnalyser(c: BaseAudioContext): AnalyserNode {
  const a = c.createAnalyser()
  a.fftSize = FFT_SIZE
  a.smoothingTimeConstant = SMOOTHING
  return a
}

function peakRms(data: ArrayLike<number>): { peak: number; rms: number } {
  let peak = 0
  let sumSq = 0
  const n = data.length
  for (let i = 0; i < n; i++) {
    const x = data[i] as number
    const ax = Math.abs(x)
    if (ax > peak) peak = ax
    sumSq += x * x
  }
  const rms = n > 0 ? Math.sqrt(sumSq / n) : 0
  return { peak, rms }
}

function linToDbfs(lin: number): number {
  if (lin <= 1e-8) return DBFS_FLOOR
  return 20 * Math.log10(lin)
}

function bandFromAnalyser(a: AnalyserNode | null, buf: Float32Array | null): MeterBand | null {
  if (!a || !buf) return null
  a.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>)
  const { peak, rms } = peakRms(buf)
  return {
    peakLin: peak,
    rmsLin: rms,
    peakDbfs: linToDbfs(peak),
    rmsDbfs: linToDbfs(rms),
  }
}

/**
 * Music level meter: **after** post output gain, in series with the path to the global bus
 * (`postGain → analyser → globalMasterInput`) so peak/RMS match the gained signal.
 */
export function wireMusicPostAnalyserAfterGain(
  c: AudioContext,
  postGain: GainNode,
  globalMasterInput: AudioNode,
): void {
  if (musicAnalyser && musicAnalyser.context === c) return
  musicAnalyser = createAnalyser(c)
  bufMusic = new Float32Array(musicAnalyser.fftSize)
  postGain.connect(musicAnalyser)
  musicAnalyser.connect(globalMasterInput)
}

/** Fan-out from global bus input (music + SFX sum) and compressor output (post-limiter). */
export function attachGlobalMasterAnalysers(
  c: AudioContext,
  inGain: GainNode,
  comp: DynamicsCompressorNode,
): void {
  if (masterPreAnalyser && masterPreAnalyser.context === c) return
  masterPreAnalyser = createAnalyser(c)
  bufPre = new Float32Array(masterPreAnalyser.fftSize)
  inGain.connect(masterPreAnalyser)

  masterPostAnalyser = createAnalyser(c)
  bufPost = new Float32Array(masterPostAnalyser.fftSize)
  comp.connect(masterPostAnalyser)
}

/** Read current levels; cheap to call once per frame. */
export function sampleAudioMeters(): AudioMetersSnapshot {
  lastSnapshot = {
    musicPost: bandFromAnalyser(musicAnalyser, bufMusic),
    masterPre: bandFromAnalyser(masterPreAnalyser, bufPre),
    masterPost: bandFromAnalyser(masterPostAnalyser, bufPost),
  }
  return lastSnapshot
}

export function getLastAudioMetersSnapshot(): AudioMetersSnapshot {
  return lastSnapshot
}

function fmtBand(label: string, b: MeterBand | null): string {
  if (!b) return `${label}  n/a`
  return `${label}  pk ${b.peakDbfs.toFixed(1)} dBFS  rms ${b.rmsDbfs.toFixed(1)} dBFS`
}

/** Lines for perf overlay (DEV). */
export function formatAudioMeterLines(): string[] {
  const s = lastSnapshot
  return [
    fmtBand('audio music (post gain)', s.musicPost),
    fmtBand('audio master pre-lim', s.masterPre),
    fmtBand('audio master post-lim', s.masterPost),
  ]
}

const SETTINGS_METER_ID = 'roid-settings-audio-meters'

/** Single-line readout for Settings → music master (updated from main tick when present). */
export function updateSettingsAudioMeterElement(): void {
  const el = document.getElementById(SETTINGS_METER_ID)
  if (!el) return
  const s = lastSnapshot
  const parts: string[] = []
  if (s.musicPost) {
    parts.push(`music pk ${s.musicPost.peakDbfs.toFixed(0)} / rms ${s.musicPost.rmsDbfs.toFixed(0)} dBFS`)
  } else {
    parts.push('music n/a')
  }
  if (s.masterPre) {
    parts.push(`master pre ${s.masterPre.peakDbfs.toFixed(0)} dBFS`)
  }
  el.textContent = parts.join('  ·  ')
}
