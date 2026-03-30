import type { AudioMasterDebug } from './audioMasterDebug'

export const AUDIO_MASTER_DEBUG_STORAGE_KEY = 'roid:audioMasterDebug'

const DEBOUNCE_MS = 400

let persistTimer: ReturnType<typeof setTimeout> | null = null

const NUM_KEYS: (keyof AudioMasterDebug)[] = [
  'masterHighPassHz',
  'eqLowDb',
  'eqMidDb',
  'eqHighDb',
]

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/** Safe subset from localStorage to merge into defaults. */
export function loadPersistedAudioMasterDebug(): Partial<AudioMasterDebug> {
  try {
    const raw = localStorage.getItem(AUDIO_MASTER_DEBUG_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed === null || typeof parsed !== 'object') return {}
    const o = parsed as Record<string, unknown>
    const out: Partial<AudioMasterDebug> = {}
    for (const key of NUM_KEYS) {
      const v = o[key]
      if (isFiniteNumber(v)) {
        Object.assign(out, { [key]: v } as Partial<AudioMasterDebug>)
      }
    }
    return out
  } catch {
    return {}
  }
}

export function schedulePersistAudioMasterDebug(debug: AudioMasterDebug): void {
  if (persistTimer !== null) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      localStorage.setItem(AUDIO_MASTER_DEBUG_STORAGE_KEY, JSON.stringify(debug))
    } catch {
      /* ignore */
    }
  }, DEBOUNCE_MS)
}
