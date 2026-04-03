import {
  type AsteroidMusicDebug,
  type AsteroidMusicVoiceDebug,
  type AsteroidMusicVoiceMacroDebug,
  type MacroJitterMode,
  ASTEROID_MUSIC_VOICE_COUNT,
  createDefaultAsteroidMusicDebug,
  ensureAsteroidMusicVoicesArray,
  NOTE_JITTER_HZ_MAX,
  NOTE_JITTER_HZ_MIN,
  NOTE_JITTER_RATE_JITTER_HZ_MAX,
  NOTE_JITTER_RATE_JITTER_HZ_MIN,
  PHRASE_AVG_LENGTH_MAX,
  PHRASE_AVG_LENGTH_MIN,
  PHRASE_DEPTH_MAX,
  PHRASE_RATE_HZ_MAX,
  PHRASE_RATE_HZ_MIN,
  sanitizeVoiceMacrosForApply,
  voiceMacrosFromVoice,
} from './asteroidMusicDebug'
import { parseScaleClampMode, parseScaleCycleDirection } from './asteroidMusicScale'
import { getDebugProjectAutosave, setDebugProjectAutosave } from './debugProjectAutosave'

export const ASTEROID_MUSIC_LOCAL_STORAGE_KEY = 'roid:asteroidMusicDebug'
export const MUSIC_AUTO_SAVE_FILE_KEY = 'roid:musicAutoSaveToFile'

const PERSIST_PATH = '/api/persist-asteroid-music'
const DEBOUNCE_MS = 450

let persistTimer: ReturnType<typeof setTimeout> | null = null

export function getMusicAutoSaveToFile(): boolean {
  return getDebugProjectAutosave()
}

export function setMusicAutoSaveToFile(on: boolean): void {
  setDebugProjectAutosave(on)
  if (!on) cancelScheduledMusicPersist()
}

export function cancelScheduledMusicPersist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function mergeVoice(base: AsteroidMusicVoiceDebug, p: unknown): AsteroidMusicVoiceDebug {
  if (p === null || typeof p !== 'object') return base
  const o = p as Record<string, unknown>
  return {
    amp: typeof o.amp === 'number' && Number.isFinite(o.amp) ? clamp(o.amp, 0, 0.95) : base.amp,
    ampLfoDepth:
      typeof o.ampLfoDepth === 'number' && Number.isFinite(o.ampLfoDepth)
        ? clamp(o.ampLfoDepth, 0, 1.6)
        : base.ampLfoDepth,
    ampLfoHz:
      typeof o.ampLfoHz === 'number' && Number.isFinite(o.ampLfoHz)
        ? clamp(o.ampLfoHz, 0.002, 24)
        : base.ampLfoHz,
    ampLfoSpeedModDepthHz:
      typeof o.ampLfoSpeedModDepthHz === 'number' && Number.isFinite(o.ampLfoSpeedModDepthHz)
        ? clamp(o.ampLfoSpeedModDepthHz, 0, 5)
        : base.ampLfoSpeedModDepthHz,
    ampLfoSpeedModHz:
      typeof o.ampLfoSpeedModHz === 'number' && Number.isFinite(o.ampLfoSpeedModHz)
        ? clamp(o.ampLfoSpeedModHz, 0.02, 0.35)
        : base.ampLfoSpeedModHz,
    ampLfo2Hz:
      typeof o.ampLfo2Hz === 'number' && Number.isFinite(o.ampLfo2Hz)
        ? clamp(o.ampLfo2Hz, 0.002, 24)
        : base.ampLfo2Hz,
    ampLfo2Depth:
      typeof o.ampLfo2Depth === 'number' && Number.isFinite(o.ampLfo2Depth)
        ? clamp(o.ampLfo2Depth, 0, 1.6)
        : base.ampLfo2Depth,
    ampLfo2SpeedModDepthHz:
      typeof o.ampLfo2SpeedModDepthHz === 'number' && Number.isFinite(o.ampLfo2SpeedModDepthHz)
        ? clamp(o.ampLfo2SpeedModDepthHz, 0, 5)
        : base.ampLfo2SpeedModDepthHz,
    ampLfo2SpeedModHz:
      typeof o.ampLfo2SpeedModHz === 'number' && Number.isFinite(o.ampLfo2SpeedModHz)
        ? clamp(o.ampLfo2SpeedModHz, 0.02, 0.35)
        : base.ampLfo2SpeedModHz,
    fastAmpLfoHz:
      typeof o.fastAmpLfoHz === 'number' && Number.isFinite(o.fastAmpLfoHz)
        ? clamp(o.fastAmpLfoHz, 0.8, 12)
        : base.fastAmpLfoHz,
    fastAmpLfoDepth:
      typeof o.fastAmpLfoDepth === 'number' && Number.isFinite(o.fastAmpLfoDepth)
        ? clamp(o.fastAmpLfoDepth, 0, 1.6)
        : base.fastAmpLfoDepth,
    fastAmpLfoSpeedModDepthHz:
      typeof o.fastAmpLfoSpeedModDepthHz === 'number' && Number.isFinite(o.fastAmpLfoSpeedModDepthHz)
        ? clamp(o.fastAmpLfoSpeedModDepthHz, 0, 5)
        : base.fastAmpLfoSpeedModDepthHz,
    fastAmpLfoSpeedModHz:
      typeof o.fastAmpLfoSpeedModHz === 'number' && Number.isFinite(o.fastAmpLfoSpeedModHz)
        ? clamp(o.fastAmpLfoSpeedModHz, 0.0005, 0.5)
        : base.fastAmpLfoSpeedModHz,
    panLfoHz:
      typeof o.panLfoHz === 'number' && Number.isFinite(o.panLfoHz)
        ? clamp(o.panLfoHz, 0.0005, 0.05)
        : base.panLfoHz,
    panLfoDepth:
      typeof o.panLfoDepth === 'number' && Number.isFinite(o.panLfoDepth)
        ? clamp(o.panLfoDepth, 0, 0.95)
        : base.panLfoDepth,
    note:
      typeof o.note === 'number' && Number.isFinite(o.note) ? Math.round(o.note) : base.note,
  }
}

function parseMacroJitterMode(v: unknown, fallback: MacroJitterMode): MacroJitterMode {
  return v === 'step' ? 'step' : v === 'sine' ? 'sine' : fallback
}

function mergeVoiceMacros(
  base: AsteroidMusicVoiceMacroDebug,
  p: unknown,
): AsteroidMusicVoiceMacroDebug {
  if (p === null || typeof p !== 'object') return base
  const o = p as Record<string, unknown>
  return {
    amp: typeof o.amp === 'number' && Number.isFinite(o.amp) ? clamp(o.amp, 0, 0.95) : base.amp,
    ampLfoDepth:
      typeof o.ampLfoDepth === 'number' && Number.isFinite(o.ampLfoDepth)
        ? clamp(o.ampLfoDepth, 0, 1.6)
        : base.ampLfoDepth,
    ampLfoHz:
      typeof o.ampLfoHz === 'number' && Number.isFinite(o.ampLfoHz)
        ? clamp(o.ampLfoHz, 0.002, 24)
        : base.ampLfoHz,
    ampLfoSpeedModDepthHz:
      typeof o.ampLfoSpeedModDepthHz === 'number' && Number.isFinite(o.ampLfoSpeedModDepthHz)
        ? clamp(o.ampLfoSpeedModDepthHz, 0, 5)
        : base.ampLfoSpeedModDepthHz,
    ampLfoSpeedModHz:
      typeof o.ampLfoSpeedModHz === 'number' && Number.isFinite(o.ampLfoSpeedModHz)
        ? clamp(o.ampLfoSpeedModHz, 0.02, 0.35)
        : base.ampLfoSpeedModHz,
    ampLfo2Hz:
      typeof o.ampLfo2Hz === 'number' && Number.isFinite(o.ampLfo2Hz)
        ? clamp(o.ampLfo2Hz, 0.002, 24)
        : base.ampLfo2Hz,
    ampLfo2Depth:
      typeof o.ampLfo2Depth === 'number' && Number.isFinite(o.ampLfo2Depth)
        ? clamp(o.ampLfo2Depth, 0, 1.6)
        : base.ampLfo2Depth,
    ampLfo2SpeedModDepthHz:
      typeof o.ampLfo2SpeedModDepthHz === 'number' && Number.isFinite(o.ampLfo2SpeedModDepthHz)
        ? clamp(o.ampLfo2SpeedModDepthHz, 0, 5)
        : base.ampLfo2SpeedModDepthHz,
    ampLfo2SpeedModHz:
      typeof o.ampLfo2SpeedModHz === 'number' && Number.isFinite(o.ampLfo2SpeedModHz)
        ? clamp(o.ampLfo2SpeedModHz, 0.02, 0.35)
        : base.ampLfo2SpeedModHz,
    tremoloDepth:
      typeof o.tremoloDepth === 'number' && Number.isFinite(o.tremoloDepth)
        ? clamp(o.tremoloDepth, 0, 1.6)
        : base.tremoloDepth,
    tremoloBaseHz:
      typeof o.tremoloBaseHz === 'number' && Number.isFinite(o.tremoloBaseHz)
        ? clamp(o.tremoloBaseHz, 0.8, 12)
        : base.tremoloBaseHz,
    tremoloDesyncWidth:
      typeof o.tremoloDesyncWidth === 'number' && Number.isFinite(o.tremoloDesyncWidth)
        ? clamp(o.tremoloDesyncWidth, 0, 1)
        : base.tremoloDesyncWidth,
    tremoloDepthJitterHz:
      typeof o.tremoloDepthJitterHz === 'number' && Number.isFinite(o.tremoloDepthJitterHz)
        ? clamp(o.tremoloDepthJitterHz, 0.0001, 0.1)
        : base.tremoloDepthJitterHz,
    tremoloDepthJitterRateJitterDepth:
      typeof o.tremoloDepthJitterRateJitterDepth === 'number' &&
      Number.isFinite(o.tremoloDepthJitterRateJitterDepth)
        ? clamp(o.tremoloDepthJitterRateJitterDepth, 0, 0.5)
        : base.tremoloDepthJitterRateJitterDepth,
    tremoloDepthJitterRateJitterHz:
      typeof o.tremoloDepthJitterRateJitterHz === 'number' &&
      Number.isFinite(o.tremoloDepthJitterRateJitterHz)
        ? clamp(o.tremoloDepthJitterRateJitterHz, 0.0001, 0.5)
        : base.tremoloDepthJitterRateJitterHz,
    tremoloRateJitterDepth:
      typeof o.tremoloRateJitterDepth === 'number' && Number.isFinite(o.tremoloRateJitterDepth)
        ? clamp(o.tremoloRateJitterDepth, 0, 0.5)
        : base.tremoloRateJitterDepth,
    tremoloRateJitterHz:
      typeof o.tremoloRateJitterHz === 'number' && Number.isFinite(o.tremoloRateJitterHz)
        ? clamp(o.tremoloRateJitterHz, 0.0005, 0.35)
        : base.tremoloRateJitterHz,
    tremoloRateJitterMorphDepth:
      typeof o.tremoloRateJitterMorphDepth === 'number' &&
      Number.isFinite(o.tremoloRateJitterMorphDepth)
        ? clamp(o.tremoloRateJitterMorphDepth, 0, 0.5)
        : base.tremoloRateJitterMorphDepth,
    tremoloRateJitterMorphHz:
      typeof o.tremoloRateJitterMorphHz === 'number' &&
      Number.isFinite(o.tremoloRateJitterMorphHz)
        ? clamp(o.tremoloRateJitterMorphHz, 0.0001, 0.5)
        : base.tremoloRateJitterMorphHz,
    panLfoHz:
      typeof o.panLfoHz === 'number' && Number.isFinite(o.panLfoHz)
        ? clamp(o.panLfoHz, 0.0005, 0.05)
        : base.panLfoHz,
    panLfoDepth:
      typeof o.panLfoDepth === 'number' && Number.isFinite(o.panLfoDepth)
        ? clamp(o.panLfoDepth, 0, 0.95)
        : base.panLfoDepth,
    noteOffset:
      typeof o.noteOffset === 'number' && Number.isFinite(o.noteOffset)
        ? clamp(Math.round(o.noteOffset), -12, 24)
        : base.noteOffset,
    noteJitterDepthSemitones:
      typeof o.noteJitterDepthSemitones === 'number' && Number.isFinite(o.noteJitterDepthSemitones)
        ? clamp(o.noteJitterDepthSemitones, 0, 6)
        : base.noteJitterDepthSemitones,
    noteJitterHz:
      typeof o.noteJitterHz === 'number' && Number.isFinite(o.noteJitterHz)
        ? clamp(o.noteJitterHz, NOTE_JITTER_HZ_MIN, NOTE_JITTER_HZ_MAX)
        : base.noteJitterHz,
    noteJitterMode: parseMacroJitterMode(o.noteJitterMode, base.noteJitterMode),
    noteJitterRateJitterDepth:
      typeof o.noteJitterRateJitterDepth === 'number' && Number.isFinite(o.noteJitterRateJitterDepth)
        ? clamp(o.noteJitterRateJitterDepth, 0, 0.5)
        : base.noteJitterRateJitterDepth,
    noteJitterRateJitterHz:
      typeof o.noteJitterRateJitterHz === 'number' && Number.isFinite(o.noteJitterRateJitterHz)
        ? clamp(o.noteJitterRateJitterHz, NOTE_JITTER_RATE_JITTER_HZ_MIN, NOTE_JITTER_RATE_JITTER_HZ_MAX)
        : base.noteJitterRateJitterHz,
    noteJitterRateJitterMode: parseMacroJitterMode(
      o.noteJitterRateJitterMode,
      base.noteJitterRateJitterMode,
    ),
    rateJitterDepth:
      typeof o.rateJitterDepth === 'number' && Number.isFinite(o.rateJitterDepth)
        ? clamp(o.rateJitterDepth, 0, 0.5)
        : base.rateJitterDepth,
    rateJitterHz:
      typeof o.rateJitterHz === 'number' && Number.isFinite(o.rateJitterHz)
        ? clamp(o.rateJitterHz, 0.0005, 0.35)
        : base.rateJitterHz,
    rateJitterMode: parseMacroJitterMode(o.rateJitterMode, base.rateJitterMode),
    phraseRateHz:
      typeof o.phraseRateHz === 'number' && Number.isFinite(o.phraseRateHz)
        ? o.phraseRateHz <= 0
          ? 0
          : clamp(o.phraseRateHz, PHRASE_RATE_HZ_MIN, PHRASE_RATE_HZ_MAX)
        : base.phraseRateHz,
    phraseRateJitterDepth:
      typeof o.phraseRateJitterDepth === 'number' && Number.isFinite(o.phraseRateJitterDepth)
        ? clamp(o.phraseRateJitterDepth, 0, 0.5)
        : base.phraseRateJitterDepth,
    phraseRateJitterHz:
      typeof o.phraseRateJitterHz === 'number' && Number.isFinite(o.phraseRateJitterHz)
        ? clamp(o.phraseRateJitterHz, NOTE_JITTER_RATE_JITTER_HZ_MIN, NOTE_JITTER_RATE_JITTER_HZ_MAX)
        : base.phraseRateJitterHz,
    phraseRateJitterMode: parseMacroJitterMode(o.phraseRateJitterMode, base.phraseRateJitterMode),
    phraseAvgLengthSec:
      typeof o.phraseAvgLengthSec === 'number' && Number.isFinite(o.phraseAvgLengthSec)
        ? clamp(o.phraseAvgLengthSec, PHRASE_AVG_LENGTH_MIN, PHRASE_AVG_LENGTH_MAX)
        : base.phraseAvgLengthSec,
    phraseDepth:
      typeof o.phraseDepth === 'number' && Number.isFinite(o.phraseDepth)
        ? clamp(o.phraseDepth, 0, PHRASE_DEPTH_MAX)
        : base.phraseDepth,
  }
}

function mergeTop(p: unknown): Partial<AsteroidMusicDebug> {
  if (p === null || typeof p !== 'object') return {}
  const o = p as Record<string, unknown>
  const out: Partial<AsteroidMusicDebug> = {}
  const num = (k: keyof AsteroidMusicDebug, lo: number, hi: number) => {
    const v = o[k as string]
    if (typeof v === 'number' && Number.isFinite(v)) {
      ;(out as Record<string, number>)[k as string] = clamp(v, lo, hi)
    }
  }
  if (typeof o.voiceFadeInSec !== 'number' && typeof o.voiceFadeInRate === 'number') {
    out.voiceFadeInSec = clamp(1 / Math.max(0.08, o.voiceFadeInRate as number), 0.05, 45)
  }
  if (typeof o.voiceFadeOutSec !== 'number' && typeof o.voiceFadeOutRate === 'number') {
    out.voiceFadeOutSec = clamp(1 / Math.max(0.08, o.voiceFadeOutRate as number), 0.05, 45)
  }
  num('influenceRate', 0.05, 20)
  num('activityScale', 0.05, 3)
  num('minVoices', 0, 12)
  num('maxVoices', 0, 12)
  num('averageVoiceLifetimeSec', 0, 300)
  num('voiceLifetimeJitter', 0, 1)
  num('voxelWeight', 0, 3)
  num('satelliteWeight', 0, 3)
  num('interactionPokeSatelliteEquiv', 0, 30)
  num('interactionPokeDurationSec', 0, 10)
  num('interactionOrbitalLaserHoldSatelliteEquiv', 0, 30)
  num('interactionExcavatingLaserHoldSatelliteEquiv', 0, 30)
  num('interactionToolTapSatelliteEquiv', 0, 30)
  num('interactionToolTapDurationSec', 0, 10)
  num('voiceFadeInSec', 0.05, 45)
  num('voiceFadeOutSec', 0.05, 45)
  num('notePitchSlideBaseSec', 0, 60)
  num('notePitchSlideJitterSec', 0, 30)
  num('voicePitchSpread', 0, 3)
  num('voicePitchBandpassCenterSemitones', -36, 36)
  num('voicePitchBandpassQ', 0.25, 30)
  num('chorusMix', 0, 1)
  num('chorusRateHz', 0.05, 6)
  num('chorusDepthMs', 0, 20)
  num('chorusDelayBaseMs', 4, 45)
  num('busPreDrive', 0.2, 6)
  num('busLowPassHz', 80, 20000)
  num('busLowPassQ', 0.1, 18)
  num('busLowPassLfoHz', 0.0001, 4)
  num('busLowPassLfoDepthHz', 0, 12000)
  num('busLowPassLfoSpeedModHz', 0.005, 0.35)
  num('busLowPassLfoSpeedModDepthHz', 0, 0.15)
  num('preReverbStereoDelayTimeMs', 1, 16000)
  num('preReverbStereoDelayFeedback', 0, 0.92)
  num('preReverbStereoDelayFeedbackJitterDepth', 0, 1)
  num('preReverbStereoDelayFeedbackJitterHz', 1e-8, 0.28)
  num('preReverbStereoDelayFeedbackJitterRandomness', 0, 1)
  num('preReverbStereoDelayHighpassHz', 20, 8000)
  num('preReverbStereoDelayLowpassHz', 200, 20000)
  num('preReverbStereoDelayVolume', 0, 1)
  num('preReverbStereoDelay2TimeMs', 1, 16000)
  num('preReverbStereoDelay2Feedback', 0, 0.92)
  num('preReverbStereoDelay2Volume', 0, 1)
  if (
    !('preReverbStereoDelay2Feedback' in out) &&
    typeof o.preReverbStereoDelayFeedback === 'number' &&
    Number.isFinite(o.preReverbStereoDelayFeedback)
  ) {
    out.preReverbStereoDelay2Feedback = clamp(o.preReverbStereoDelayFeedback, 0, 0.92)
  }
  num('preReverbStereoDelayRateJitterDepthMs', 0, 8000)
  num('preReverbStereoDelayRateJitterSpeedHz', 1e-8, 0.28)
  num('preReverbStereoDelayRateJitterRandomness', 0, 1)
  num('reverbMix', 0, 1)
  num('reverbWetTrim', 0, 1)
  num('reverbDecaySec', 0.15, 10)
  num('reverbIrDurationSec', 0.35, 6)
  num('reverbIrDecayPerSec', 0.4, 24)
  num('reverbPreDelayMs', 0, 150)
  num('reverbIrDecorrelate', 0, 1)
  num('reverbIrDamping', 0, 1)
  num('reverbIrEarlyDensity', 0, 1)
  num('reverbWetFeedbackMs', 4, 120)
  num('reverbWetFeedback', 0, 0.92)
  num('busWetSaturatorAmount', 0, 1)
  num('reverbMixLfoDepth', 0, 1)
  num('reverbMixLfoHz', 1e-5, 0.05)
  {
    const v = o.reverbConvolverNormalize
    if (typeof v === 'boolean') {
      out.reverbConvolverNormalize = v
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out.reverbConvolverNormalize = v !== 0
    }
  }
  {
    const v = o.voicePitchBandpassEnabled
    if (typeof v === 'boolean') {
      out.voicePitchBandpassEnabled = v
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out.voicePitchBandpassEnabled = v !== 0
    }
  }
  {
    const v = o.reeseEnabled
    if (typeof v === 'boolean') {
      out.reeseEnabled = v
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out.reeseEnabled = v !== 0
    }
  }
  {
    const v = o.reeseSolo
    if (typeof v === 'boolean') {
      out.reeseSolo = v
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out.reeseSolo = v !== 0
    }
  }
  num('reeseVoiceIndex', 0, ASTEROID_MUSIC_VOICE_COUNT - 1)
  num('reeseOrderAfterVoice', 0, ASTEROID_MUSIC_VOICE_COUNT - 1)
  num('reesePitchSemitones', -36, 24)
  num('reesePitchVariationSemitones', 0, 24)
  num('reesePitchJitterHz', NOTE_JITTER_HZ_MIN, NOTE_JITTER_HZ_MAX)
  num('reesePitchJitterRandomness', 0, 1)
  num('reeseSwellsRateHz', 0.0001, 2)
  num('reeseSwellsRandomness', 0, 1)
  num('reeseVolume', 0, 1.5)
  num('reeseWidth', 0, 0.95)
  num('reeseDetuneSemitones', 0, 4)
  num('reeseHighpassHz', 60, 2000)
  num('reeseLowpassBaseHz', 400, 20000)
  num('reeseLowpassEnvAttackSec', 0.01, 4)
  num('reeseLowpassEnvDecaySec', 0.05, 12)
  num('reeseLowpassEnvDepthHz', 0, 20000)
  num('reesePitchSlideSec', 0, 30)
  num('reeseSwellsDepth', 0, 1)
  num('reeseDrive', 0, 3)
  num('reeseLargeSwellRateHz', 0, 0.05)
  if (
    (typeof o.reverbIrDurationSec !== 'number' || typeof o.reverbIrDecayPerSec !== 'number') &&
    typeof o.reverbDecaySec === 'number' &&
    Number.isFinite(o.reverbDecaySec)
  ) {
    const rd = clamp(o.reverbDecaySec, 0.15, 10)
    if (typeof o.reverbIrDurationSec !== 'number') {
      out.reverbIrDurationSec = Math.min(6, Math.max(0.35, rd * 1.8))
    }
    if (typeof o.reverbIrDecayPerSec !== 'number') {
      out.reverbIrDecayPerSec = 3.2 / Math.max(0.2, rd)
    }
  }
  num('voiceMacroJitterTimeSec', 0, 86400 * 365)
  if ('scaleClampMode' in o) {
    out.scaleClampMode = parseScaleClampMode(o.scaleClampMode, 'major')
  }
  {
    const v = o.scaleCycleEnabled
    if (typeof v === 'boolean') {
      out.scaleCycleEnabled = v
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out.scaleCycleEnabled = v !== 0
    }
  }
  num('scaleCycleIntervalSec', 30, 3600)
  num('scaleCycleJitterSec', 0, 120)
  if ('scaleCycleDirection' in o) {
    out.scaleCycleDirection = parseScaleCycleDirection(o.scaleCycleDirection, 'fifths')
  }
  const vm = (o as { voiceMacros?: unknown }).voiceMacros
  if (vm !== null && typeof vm === 'object') {
    const base = createDefaultAsteroidMusicDebug().voiceMacros
    out.voiceMacros = mergeVoiceMacros(base, vm)
  }
  return out
}

/** Merge defaults ← bundled JSON only into `target` (no `localStorage`). */
export function applyAsteroidMusicImportedFileToTarget(
  importedFile: unknown,
  target: AsteroidMusicDebug,
): void {
  const base = createDefaultAsteroidMusicDebug()
  let voices: AsteroidMusicVoiceDebug[] = base.voices.map((v) => ({ ...v }))
  let voiceMacros: AsteroidMusicVoiceMacroDebug = { ...base.voiceMacros }
  if (importedFile !== null && typeof importedFile === 'object') {
    const fileVoices = (importedFile as { voices?: unknown }).voices
    if (Array.isArray(fileVoices)) {
      for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
        voices[i] = mergeVoice(voices[i], fileVoices[i])
      }
    }
    const fileVm = (importedFile as { voiceMacros?: unknown }).voiceMacros
    if (fileVm !== null && typeof fileVm === 'object') {
      voiceMacros = mergeVoiceMacros(voiceMacros, fileVm)
    }
    Object.assign(target, base, mergeTop(importedFile), { voices, voiceMacros })
  } else {
    Object.assign(target, base, { voices, voiceMacros })
  }
  if (target.voiceMacros === undefined || target.voiceMacros === null) {
    target.voiceMacros = voiceMacrosFromVoice(target.voices[0])
  }
  ensureAsteroidMusicVoicesArray(target)
  sanitizeVoiceMacrosForApply(target)
  target.scaleClampMode = parseScaleClampMode(target.scaleClampMode, 'major')
  target.scaleCycleDirection = parseScaleCycleDirection(target.scaleCycleDirection, 'fifths')
}

/** Deep-assign merged state into `target` (mutate). */
export function initAsteroidMusicDebugFromPersisted(
  importedFile: unknown,
  target: AsteroidMusicDebug,
): void {
  applyAsteroidMusicImportedFileToTarget(importedFile, target)
  try {
    const raw = localStorage.getItem(ASTEROID_MUSIC_LOCAL_STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (parsed !== null && typeof parsed === 'object') {
        const o = parsed as { voices?: unknown }
        if (Array.isArray(o.voices)) {
          for (let i = 0; i < ASTEROID_MUSIC_VOICE_COUNT; i++) {
            target.voices[i] = mergeVoice(target.voices[i], o.voices[i])
          }
        }
        Object.assign(target, mergeTop(parsed))
        const pVm = (parsed as { voiceMacros?: unknown }).voiceMacros
        if (pVm === undefined || pVm === null || typeof pVm !== 'object') {
          target.voiceMacros = voiceMacrosFromVoice(target.voices[0])
        }
      }
    }
  } catch {
    /* ignore */
  }
  if (target.voiceMacros === undefined || target.voiceMacros === null) {
    target.voiceMacros = voiceMacrosFromVoice(target.voices[0])
  }
  ensureAsteroidMusicVoicesArray(target)
  sanitizeVoiceMacrosForApply(target)
  target.scaleClampMode = parseScaleClampMode(target.scaleClampMode, 'major')
  target.scaleCycleDirection = parseScaleCycleDirection(target.scaleCycleDirection, 'fifths')
}

export function buildAsteroidMusicDebugFromBundledSnapshot(importedFile: unknown): AsteroidMusicDebug {
  const target = createDefaultAsteroidMusicDebug()
  applyAsteroidMusicImportedFileToTarget(importedFile, target)
  return target
}

export function writeAsteroidMusicDebugToLocalStorage(debug: AsteroidMusicDebug): void {
  try {
    localStorage.setItem(ASTEROID_MUSIC_LOCAL_STORAGE_KEY, JSON.stringify(debug))
  } catch {
    /* ignore */
  }
}

export function schedulePersistAsteroidMusicDebug(debug: AsteroidMusicDebug): void {
  writeAsteroidMusicDebugToLocalStorage(debug)
  cancelScheduledMusicPersist()
  if (!getDebugProjectAutosave()) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    if (!import.meta.env.DEV) return
    void fetch(PERSIST_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(debug),
    }).catch(() => {})
  }, DEBOUNCE_MS)
}

export async function persistAsteroidMusicDebugToProjectNow(
  debug: AsteroidMusicDebug,
): Promise<boolean> {
  if (!import.meta.env.DEV) return false
  try {
    const res = await fetch(PERSIST_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(debug),
    })
    return res.ok
  } catch {
    return false
  }
}
