export const GAME_START_TIPS_DISMISSED_STORAGE_KEY = 'roid:gameStartTipsDismissed'

const DEFAULT_DISMISSED = false

export function loadGameStartTipsDismissed(): boolean {
  try {
    const raw = localStorage.getItem(GAME_START_TIPS_DISMISSED_STORAGE_KEY)
    if (raw === null) return DEFAULT_DISMISSED
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
    const parsed = JSON.parse(raw) as unknown
    if (parsed === true) return true
    if (parsed === false) return false
  } catch {
    /* ignore */
  }
  return DEFAULT_DISMISSED
}

export function saveGameStartTipsDismissed(value: boolean): void {
  try {
    localStorage.setItem(GAME_START_TIPS_DISMISSED_STORAGE_KEY, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}
