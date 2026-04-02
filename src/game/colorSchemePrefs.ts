import { DEFAULT_COLOR_SCHEME, type ColorSchemeId } from '../ui/colorScheme'

export const COLOR_SCHEME_STORAGE_KEY = 'roid:colorScheme'

function isColorSchemeId(value: unknown): value is ColorSchemeId {
  return value === 'blue' || value === 'gray' || value === 'orange'
}

export function loadColorSchemeId(defaultId: ColorSchemeId = DEFAULT_COLOR_SCHEME): ColorSchemeId {
  try {
    const raw = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)
    if (!raw) return defaultId
    if (isColorSchemeId(raw)) return raw
    return defaultId
  } catch {
    return defaultId
  }
}

export function saveColorSchemeId(id: ColorSchemeId): void {
  try {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, id)
  } catch {
    /* ignore quota / private mode */
  }
}

export { isColorSchemeId }

