export type FontId = 'disketMono' | 'perfectDosVga'

export interface FontOption {
  id: FontId
  label: string
}

export const FONT_OPTIONS: readonly FontOption[] = [
  { id: 'disketMono', label: 'Disket Mono' },
  { id: 'perfectDosVga', label: 'Perfect DOS VGA' },
] as const

export const DEFAULT_FONT_ID: FontId = 'disketMono'

export function getFontClass(id: FontId): string {
  switch (id) {
    case 'perfectDosVga':
      return 'font-perfect-dos-vga'
    case 'disketMono':
    default:
      return 'font-disket-mono'
  }
}

