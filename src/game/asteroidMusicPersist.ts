import {
  type AsteroidMusicDebug,
  type AsteroidMusicVoiceDebug,
  type AsteroidMusicVoiceMacroDebug,
  ASTEROID_MUSIC_VOICE_COUNT,
  createDefaultAsteroidMusicDebug,
  voiceMacrosFromVoice,
} from './asteroidMusicDebug'

export const ASTEROID_MUSIC_LOCAL_STORAGE_KEY = 'roid:asteroidMusicDebug'
export const MUSIC_AUTO_SAVE_FILE_KEY = 'roid:musicAutoSaveToFile'

const PERSIST_PATH = '/api/persist-asteroid-music'
const DEBOUNCE_MS = 450

let persistTimer: ReturnType<typeof setTimeout> | null = null

export function getMusicAutoSaveToFile(): boolean {
  try {
    const v = localStorage.getItem(MUSIC_AUTO_SAVE_FILE_KEY)
    if (v === null) return true
    return v === '1' || v === 'true'
  } catch {
    return true
  }
}

export function setMusicAutoSaveToFile(on: boolean): void {
  try {
    localStorage.setItem(MUSIC_AUTO_SAVE_FILE_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
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
  num('voxelWeight', 0, 3)
  num('satelliteWeight', 0, 3)
  num('voiceFadeInSec', 0.05, 45)
  num('voiceFadeOutSec', 0.05, 45)
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
  num('reverbMix', 0, 1)
  num('reverbWetTrim', 0, 1)
  num('reverbDecaySec', 0.15, 10)
  num('busWetSaturatorAmount', 0, 1)
  const vm = (o as { voiceMacros?: unknown }).voiceMacros
  if (vm !== null && typeof vm === 'object') {
    const base = createDefaultAsteroidMusicDebug().voiceMacros
    out.voiceMacros = mergeVoiceMacros(base, vm)
  }
  return out
}

/** Deep-assign merged state into `target` (mutate). */
export function initAsteroidMusicDebugFromPersisted(
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
  if (!getMusicAutoSaveToFile()) return
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
