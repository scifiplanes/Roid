/** Persisted debug multiplier for simulation delta time (`simDtMs = dtMs * mult`). */
export const GAME_SPEED_MULT_STORAGE_KEY = 'roid:gameSpeedMult'

const MIN = 0.05
const MAX = 8

export function clampGameSpeedMult(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.min(MAX, Math.max(MIN, n))
}

export function loadGameSpeedMult(): number {
  try {
    const s = localStorage.getItem(GAME_SPEED_MULT_STORAGE_KEY)
    if (s === null) return 1
    return clampGameSpeedMult(Number(s))
  } catch {
    return 1
  }
}

export function saveGameSpeedMult(mult: number): void {
  try {
    localStorage.setItem(GAME_SPEED_MULT_STORAGE_KEY, String(clampGameSpeedMult(mult)))
  } catch {
    /* ignore */
  }
}
