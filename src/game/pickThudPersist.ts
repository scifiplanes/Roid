import type { PickThudDebug } from './pickThudDebug'

export const PICK_THUD_DEBUG_STORAGE_KEY = 'roid:pickThudDebug'

const DEBOUNCE_MS = 400

let persistTimer: ReturnType<typeof setTimeout> | null = null

export function loadPersistedPickThudDebug(): Partial<PickThudDebug> {
  try {
    const raw = localStorage.getItem(PICK_THUD_DEBUG_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed === null || typeof parsed !== 'object') return {}
    const o = parsed as Record<string, unknown>
    const out: Partial<PickThudDebug> = {}
    const reg = o.regolith
    const sil = o.silicate
    const met = o.metal
    if (reg && typeof reg === 'object') {
      out.regolith = { ...(reg as object) } as PickThudDebug['regolith']
    }
    if (sil && typeof sil === 'object') {
      out.silicate = { ...(sil as object) } as PickThudDebug['silicate']
    }
    if (met && typeof met === 'object') {
      out.metal = { ...(met as object) } as PickThudDebug['metal']
    }
    return out
  } catch {
    return {}
  }
}

export function schedulePersistPickThudDebug(debug: PickThudDebug): void {
  if (persistTimer !== null) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      localStorage.setItem(PICK_THUD_DEBUG_STORAGE_KEY, JSON.stringify(debug))
    } catch {
      /* ignore */
    }
  }, DEBOUNCE_MS)
}

