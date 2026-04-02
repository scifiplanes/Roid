import type { FontId } from '../ui/fontTheme'
import { DEFAULT_FONT_ID } from '../ui/fontTheme'

export const FONT_STORAGE_KEY = 'roid:font'

export function isFontId(value: unknown): value is FontId {
  return value === 'disketMono' || value === 'perfectDosVga'
}

export function loadFontId(defaultId: FontId = DEFAULT_FONT_ID): FontId {
  try {
    const raw = localStorage.getItem(FONT_STORAGE_KEY)
    if (!raw) return defaultId
    if (isFontId(raw)) return raw
    return defaultId
  } catch {
    return defaultId
  }
}

export function saveFontId(id: FontId): void {
  try {
    localStorage.setItem(FONT_STORAGE_KEY, id)
  } catch {
    /* ignore quota / private mode */
  }
}

