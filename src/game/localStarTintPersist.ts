import type { LocalStarTintDebug } from './localStarTintDebug'

export const LOCAL_STAR_TINT_DEBUG_STORAGE_KEY = 'roid:localStarTintDebug'

const DEBOUNCE_MS = 400

let persistTimer: ReturnType<typeof setTimeout> | null = null

const NUM_KEYS: (keyof LocalStarTintDebug)[] = [
  'excludedHueBandCenter',
  'excludedHueBandWidth',
  'starTintSaturationMin',
  'starTintSaturationMax',
]

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

export function loadPersistedLocalStarTintDebug(): Partial<LocalStarTintDebug> {
  try {
    const raw = localStorage.getItem(LOCAL_STAR_TINT_DEBUG_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed === null || typeof parsed !== 'object') return {}
    const o = parsed as Record<string, unknown>
    const out: Partial<LocalStarTintDebug> = {}
    for (const key of NUM_KEYS) {
      const v = o[key]
      if (isFiniteNumber(v)) {
        Object.assign(out, { [key]: v } as Partial<LocalStarTintDebug>)
      }
    }
    return out
  } catch {
    return {}
  }
}

export function schedulePersistLocalStarTintDebug(debug: LocalStarTintDebug): void {
  if (persistTimer !== null) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      localStorage.setItem(LOCAL_STAR_TINT_DEBUG_STORAGE_KEY, JSON.stringify(debug))
    } catch {
      /* ignore */
    }
  }, DEBOUNCE_MS)
}

export function mergeLocalStarTintDebugFromUnknown(p: unknown): Partial<LocalStarTintDebug> {
  if (p === null || typeof p !== 'object' || Array.isArray(p)) return {}
  const o = p as Record<string, unknown>
  const out: Partial<LocalStarTintDebug> = {}
  for (const key of NUM_KEYS) {
    const v = o[key]
    if (isFiniteNumber(v)) {
      ;(out as Record<string, number>)[key] = v
    }
  }
  return out
}
