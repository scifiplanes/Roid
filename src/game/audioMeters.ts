/**
 * Peak/RMS metering taps (AnalyserNode fan-out) for music post-chain and global master
 * pre/post limiter. Does not affect the audible graph beyond analyser CPU cost.
 *
 * DEV: optional per-voice taps before/after ambient music `voiceCeiling` (see
 * `wireAmbientVoiceCeilingMeters`); sampled in `sampleAudioMeters` for perf overlay lines.
 */

const FFT_SIZE = 2048
/** Smaller FFT for 12×2 ambient voice taps (lighter than main meters). */
const VOICE_CEILING_FFT_SIZE = 512
const SMOOTHING = 0.65
/** Display floor for dBFS when linear level is tiny. */
const DBFS_FLOOR = -96
/** Per-voice `i:pk` tokens per overlay row (~420px panel, `white-space: pre`). */
const VOICE_CEILING_PEAKS_PER_LINE = 4
/** EMA toward measured dBFS; lower = calmer overlay (less digit flicker). */
const VOICE_CEILING_DISPLAY_EMA = 0.1
/** Quantize displayed dB to this step after smoothing (e.g. 0.5 ⇒ only .0 / .5). */
const VOICE_CEILING_DISPLAY_DB_STEP = 0.5
/** Perf overlay: dBFS in [-3, 0) → yellow; ≥ 0 → red. */
const METER_LEVEL_WARN_DBFS = -3
const METER_LEVEL_CLIP_DBFS = 0

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Wrap padded plain dB text for perf overlay (`inner` is escaped here). */
function wrapLevelDbFs(db: number, formattedNumberPlain: string): string {
  const inner = escapeHtmlText(formattedNumberPlain)
  if (db >= METER_LEVEL_CLIP_DBFS) {
    return `<span class="perf-meter-clip">${inner}</span>`
  }
  if (db >= METER_LEVEL_WARN_DBFS) {
    return `<span class="perf-meter-warn">${inner}</span>`
  }
  return inner
}

/** Fixed-width dB column for monospace voice rows (plain text; pass into `wrapLevelDbFs`). */
function padVcDbPlain(q: string): string {
  const w = 7
  return q.length >= w ? q : q.padStart(w, ' ')
}

function wrapVcLine(innerHtml: string): string {
  return `<span class="perf-vc-line">${innerHtml}</span>`
}

export type MeterBand = {
  peakLin: number
  rmsLin: number
  peakDbfs: number
  rmsDbfs: number
}

export type VoiceCeilingMeterSnapshot = {
  /**
   * When produced from `sampleAudioMeters`, voice-ceiling fields are **display-smoothed** (EMA +
   * 0.5 dB quantization in overlay strings); not raw analyser peaks.
   */
  maxPreDbfs: number
  maxPostDbfs: number
  /** Max over voices of (pre peak dBFS − post peak dBFS); positive ⇒ shaper reduced peak. */
  maxReductionDb: number
  /** Index of max **smoothed** pre peak (stable vs raw frame-to-frame). */
  hottestPreIndex: number
  /** Peak dBFS before `voiceCeiling`, one entry per voice index (same order as wiring). */
  prePeakDbfsPerVoice: number[]
  /** Peak dBFS after `voiceCeiling`. */
  postPeakDbfsPerVoice: number[]
}

export type AudioMetersSnapshot = {
  musicPost: MeterBand | null
  masterPre: MeterBand | null
  masterPost: MeterBand | null
  /** Present when ambient voice ceiling taps are wired (DEV). */
  voiceCeiling: VoiceCeilingMeterSnapshot | null
}

let musicAnalyser: AnalyserNode | null = null
let masterPreAnalyser: AnalyserNode | null = null
let masterPostAnalyser: AnalyserNode | null = null

let bufMusic: Float32Array | null = null
let bufPre: Float32Array | null = null
let bufPost: Float32Array | null = null

const voicePreAnalysers: AnalyserNode[] = []
const voicePostAnalysers: AnalyserNode[] = []
let bufVoiceTap: Float32Array | null = null

let lastVoiceCeilingSnapshot: VoiceCeilingMeterSnapshot | null = null

/** Smoothed buffers for overlay only (reset when voice tap count changes or cleared). */
const vcDisplayPre: number[] = []
const vcDisplayPost: number[] = []
let vcDisplayVoiceCount = -1
let vcDisplayMaxPre = DBFS_FLOOR
let vcDisplayMaxPost = DBFS_FLOOR
let vcDisplayMaxRed = 0

function resetVoiceCeilingDisplaySmoothing(): void {
  vcDisplayVoiceCount = -1
  vcDisplayPre.length = 0
  vcDisplayPost.length = 0
}

function quantizeDisplayDb(db: number): number {
  if (!Number.isFinite(db)) return DBFS_FLOOR
  const inv = 1 / VOICE_CEILING_DISPLAY_DB_STEP
  return Math.round(db * inv) / inv
}

/**
 * EMA + stable hottest index from smoothed pre peaks; reduces perf-overlay jitter.
 */
function applyVoiceCeilingDisplaySmoothing(raw: VoiceCeilingMeterSnapshot): VoiceCeilingMeterSnapshot {
  const n = raw.prePeakDbfsPerVoice.length
  const a = VOICE_CEILING_DISPLAY_EMA

  if (n !== vcDisplayVoiceCount || vcDisplayPre.length !== n) {
    vcDisplayVoiceCount = n
    vcDisplayPre.length = n
    vcDisplayPost.length = n
    for (let i = 0; i < n; i++) {
      vcDisplayPre[i] = raw.prePeakDbfsPerVoice[i]!
      vcDisplayPost[i] = raw.postPeakDbfsPerVoice[i]!
    }
    vcDisplayMaxPre = raw.maxPreDbfs
    vcDisplayMaxPost = raw.maxPostDbfs
    vcDisplayMaxRed = raw.maxReductionDb
  } else {
    for (let i = 0; i < n; i++) {
      vcDisplayPre[i]! += a * (raw.prePeakDbfsPerVoice[i]! - vcDisplayPre[i]!)
      vcDisplayPost[i]! += a * (raw.postPeakDbfsPerVoice[i]! - vcDisplayPost[i]!)
    }
    vcDisplayMaxPre += a * (raw.maxPreDbfs - vcDisplayMaxPre)
    vcDisplayMaxPost += a * (raw.maxPostDbfs - vcDisplayMaxPost)
    vcDisplayMaxRed += a * (raw.maxReductionDb - vcDisplayMaxRed)
  }

  let hottestPreIndex = 0
  let hp = vcDisplayPre[0]!
  for (let i = 1; i < n; i++) {
    if (vcDisplayPre[i]! > hp) {
      hp = vcDisplayPre[i]!
      hottestPreIndex = i
    }
  }

  return {
    maxPreDbfs: vcDisplayMaxPre,
    maxPostDbfs: vcDisplayMaxPost,
    maxReductionDb: vcDisplayMaxRed,
    hottestPreIndex,
    prePeakDbfsPerVoice: vcDisplayPre,
    postPeakDbfsPerVoice: vcDisplayPost,
  }
}

let lastSnapshot: AudioMetersSnapshot = {
  musicPost: null,
  masterPre: null,
  masterPost: null,
  voiceCeiling: null,
}

function createAnalyser(c: BaseAudioContext): AnalyserNode {
  const a = c.createAnalyser()
  a.fftSize = FFT_SIZE
  a.smoothingTimeConstant = SMOOTHING
  return a
}

function createVoiceCeilingTapAnalyser(c: BaseAudioContext): AnalyserNode {
  const a = c.createAnalyser()
  a.fftSize = VOICE_CEILING_FFT_SIZE
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

/** Remove ambient voice ceiling taps (call on graph dispose / before rewiring). */
export function clearAmbientVoiceCeilingMeters(): void {
  for (const a of voicePreAnalysers) {
    try {
      a.disconnect()
    } catch {
      /* ignore */
    }
  }
  for (const a of voicePostAnalysers) {
    try {
      a.disconnect()
    } catch {
      /* ignore */
    }
  }
  voicePreAnalysers.length = 0
  voicePostAnalysers.length = 0
  bufVoiceTap = null
  lastVoiceCeilingSnapshot = null
  resetVoiceCeilingDisplaySmoothing()
}

export type AmbientVoiceCeilingTap = {
  levelGain: GainNode
  voiceCeiling: WaveShaperNode
}

/**
 * DEV: fan-out analysers from each voice’s `levelGain` (pre) and `voiceCeiling` (post).
 * Clears any previous taps first.
 */
export function wireAmbientVoiceCeilingMeters(
  c: AudioContext,
  voices: readonly AmbientVoiceCeilingTap[],
): void {
  clearAmbientVoiceCeilingMeters()
  if (voices.length === 0) return

  bufVoiceTap = new Float32Array(VOICE_CEILING_FFT_SIZE)

  for (const v of voices) {
    const pre = createVoiceCeilingTapAnalyser(c)
    const post = createVoiceCeilingTapAnalyser(c)
    v.levelGain.connect(pre)
    v.voiceCeiling.connect(post)
    voicePreAnalysers.push(pre)
    voicePostAnalysers.push(post)
  }
}

function sampleVoiceCeilingMeters(): VoiceCeilingMeterSnapshot | null {
  const n = voicePreAnalysers.length
  if (n === 0 || !bufVoiceTap) return null

  let maxPreDbfs = DBFS_FLOOR
  let maxPostDbfs = DBFS_FLOOR
  let maxReductionDb = 0
  let hottestPreIndex = 0
  let hottestPreLin = 0
  const prePeakDbfsPerVoice: number[] = new Array(n)
  const postPeakDbfsPerVoice: number[] = new Array(n)

  for (let i = 0; i < n; i++) {
    const preA = voicePreAnalysers[i]!
    const postA = voicePostAnalysers[i]!
    const preB = bandFromAnalyser(preA, bufVoiceTap)
    const postB = bandFromAnalyser(postA, bufVoiceTap)
    const preDb = preB?.peakDbfs ?? DBFS_FLOOR
    const postDb = postB?.peakDbfs ?? DBFS_FLOOR
    prePeakDbfsPerVoice[i] = preDb
    postPeakDbfsPerVoice[i] = postDb

    if (preDb > maxPreDbfs) maxPreDbfs = preDb
    if (postDb > maxPostDbfs) maxPostDbfs = postDb

    const red = preDb - postDb
    if (red > maxReductionDb) maxReductionDb = red

    const preLin = preB?.peakLin ?? 0
    if (preLin > hottestPreLin) {
      hottestPreLin = preLin
      hottestPreIndex = i
    }
  }

  return {
    maxPreDbfs,
    maxPostDbfs,
    maxReductionDb,
    hottestPreIndex,
    prePeakDbfsPerVoice,
    postPeakDbfsPerVoice,
  }
}

/** Read current levels; cheap to call once per frame. */
export function sampleAudioMeters(): AudioMetersSnapshot {
  const rawVc = sampleVoiceCeilingMeters()
  lastVoiceCeilingSnapshot = rawVc ? applyVoiceCeilingDisplaySmoothing(rawVc) : null
  lastSnapshot = {
    musicPost: bandFromAnalyser(musicAnalyser, bufMusic),
    masterPre: bandFromAnalyser(masterPreAnalyser, bufPre),
    masterPost: bandFromAnalyser(masterPostAnalyser, bufPost),
    voiceCeiling: lastVoiceCeilingSnapshot,
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

function fmtVoiceCeilingLines(v: VoiceCeilingMeterSnapshot | null): string[] {
  const P = 'audio vc'
  if (!v) {
    return [`${P}  n/a`]
  }
  const hotPre = v.prePeakDbfsPerVoice[v.hottestPreIndex]
  const hotPreStr =
    typeof hotPre === 'number' && Number.isFinite(hotPre)
      ? `${quantizeDisplayDb(hotPre).toFixed(1)} dBFS`
      : 'n/a'
  const lines: string[] = [
    `${P}  pre max ${quantizeDisplayDb(v.maxPreDbfs).toFixed(1)} dBFS  post max ${quantizeDisplayDb(v.maxPostDbfs).toFixed(1)} dBFS`,
    `${P}  peakΔ ${quantizeDisplayDb(v.maxReductionDb).toFixed(1)} dB  hottest v${v.hottestPreIndex}  ${hotPreStr}`,
  ]

  function pushPeakRows(label: string, cont: string, arr: readonly number[]): void {
    const tokens = arr.map((db, vi) => `${vi}:${quantizeDisplayDb(db).toFixed(1)}`)
    for (let row = 0; row < tokens.length; row += VOICE_CEILING_PEAKS_PER_LINE) {
      const chunk = tokens.slice(row, row + VOICE_CEILING_PEAKS_PER_LINE).join('  ')
      lines.push(`${row === 0 ? label : cont}  ${chunk}`)
    }
  }

  pushPeakRows(`${P} pre pk dBFS`, `${P} pre ···`, v.prePeakDbfsPerVoice)
  pushPeakRows(`${P} post pk dBFS`, `${P} post ···`, v.postPeakDbfsPerVoice)
  return lines
}

function fmtBandHtml(label: string, b: MeterBand | null): string {
  const L = escapeHtmlText(label)
  if (!b) {
    return `${L}  n/a`
  }
  return `${L}  pk ${wrapLevelDbFs(b.peakDbfs, b.peakDbfs.toFixed(1))} dBFS  rms ${wrapLevelDbFs(
    b.rmsDbfs,
    b.rmsDbfs.toFixed(1),
  )} dBFS`
}

function fmtVoiceCeilingLinesHtml(v: VoiceCeilingMeterSnapshot | null): string[] {
  const P = 'audio vc'
  if (!v) {
    return [wrapVcLine(`${escapeHtmlText(P)}  n/a`)]
  }
  const hotPre = v.prePeakDbfsPerVoice[v.hottestPreIndex]
  const hotPreQ = typeof hotPre === 'number' && Number.isFinite(hotPre) ? quantizeDisplayDb(hotPre).toFixed(1) : null
  const hotPreHtml =
    hotPreQ !== null && typeof hotPre === 'number' && Number.isFinite(hotPre)
      ? `${wrapLevelDbFs(hotPre, padVcDbPlain(hotPreQ))} dBFS`
      : escapeHtmlText('n/a     ')

  const qPreMax = quantizeDisplayDb(v.maxPreDbfs).toFixed(1)
  const qPostMax = quantizeDisplayDb(v.maxPostDbfs).toFixed(1)
  const hotIdx = String(v.hottestPreIndex).padStart(2, ' ')
  const lines: string[] = [
    wrapVcLine(
      `${escapeHtmlText(P)}  pre max ${wrapLevelDbFs(v.maxPreDbfs, padVcDbPlain(qPreMax))} dBFS  post max ${wrapLevelDbFs(
        v.maxPostDbfs,
        padVcDbPlain(qPostMax),
      )} dBFS`,
    ),
    wrapVcLine(
      `${escapeHtmlText(P)}  peakΔ ${escapeHtmlText(
        quantizeDisplayDb(v.maxReductionDb).toFixed(1).padStart(4, ' '),
      )} dB  hottest v${escapeHtmlText(hotIdx)}  ${hotPreHtml}`,
    ),
  ]

  function pushPeakRowsHtml(label: string, cont: string, arr: readonly number[]): void {
    const tokens = arr.map((db, vi) => {
      const q = quantizeDisplayDb(db).toFixed(1)
      const idx = String(vi).padStart(2, ' ')
      return `${escapeHtmlText(idx)}:${wrapLevelDbFs(db, padVcDbPlain(q))}`
    })
    for (let row = 0; row < tokens.length; row += VOICE_CEILING_PEAKS_PER_LINE) {
      const chunk = tokens.slice(row, row + VOICE_CEILING_PEAKS_PER_LINE).join('  ')
      lines.push(wrapVcLine(`${escapeHtmlText(row === 0 ? label : cont)}  ${chunk}`))
    }
  }

  pushPeakRowsHtml(`${P} pre pk dBFS`, `${P} pre ···`, v.prePeakDbfsPerVoice)
  pushPeakRowsHtml(`${P} post pk dBFS`, `${P} post ···`, v.postPeakDbfsPerVoice)
  return lines
}

/** Lines for perf overlay (DEV). */
export function formatAudioMeterLines(): string[] {
  const s = lastSnapshot
  return [
    fmtBand('audio music (post gain)', s.musicPost),
    fmtBand('audio master pre-lim', s.masterPre),
    fmtBand('audio master post-lim', s.masterPost),
    ...fmtVoiceCeilingLines(s.voiceCeiling),
  ]
}

/** HTML lines for perf overlay (dBFS thresholds: ≥−3 yellow, ≥0 red). */
export function formatAudioMeterLinesHtml(): string[] {
  const s = lastSnapshot
  return [
    fmtBandHtml('audio music (post gain)', s.musicPost),
    fmtBandHtml('audio master pre-lim', s.masterPre),
    fmtBandHtml('audio master post-lim', s.masterPost),
    ...fmtVoiceCeilingLinesHtml(s.voiceCeiling),
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
