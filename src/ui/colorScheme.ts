export type ColorSchemeId = 'blue' | 'gray' | 'orange'

export interface ColorSchemeOption {
  id: ColorSchemeId
  label: string
}

export const COLOR_SCHEME_OPTIONS: readonly ColorSchemeOption[] = [
  { id: 'blue', label: 'Blue (default)' },
  { id: 'gray', label: 'Gray' },
  { id: 'orange', label: 'Orange' },
] as const

export const DEFAULT_COLOR_SCHEME: ColorSchemeId = 'blue'

export function getColorSchemeClass(id: ColorSchemeId): string {
  switch (id) {
    case 'gray':
      return 'theme-gray'
    case 'orange':
      return 'theme-orange'
    case 'blue':
    default:
      return 'theme-blue'
  }
}

