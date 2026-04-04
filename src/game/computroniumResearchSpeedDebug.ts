/** Persisted debug multiplier for computronium unlock-point accrual only (energy drain unchanged). */
export const COMPUTRONIUM_RESEARCH_SPEED_MULT_STORAGE_KEY = 'roid:computroniumResearchSpeedMult'

const MIN = 0.05
const MAX = 100

export function clampComputroniumResearchSpeedMult(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.min(MAX, Math.max(MIN, n))
}

export function loadComputroniumResearchSpeedMult(): number {
  try {
    const s = localStorage.getItem(COMPUTRONIUM_RESEARCH_SPEED_MULT_STORAGE_KEY)
    if (s === null) return 1
    return clampComputroniumResearchSpeedMult(Number(s))
  } catch {
    return 1
  }
}

export function saveComputroniumResearchSpeedMult(mult: number): void {
  try {
    localStorage.setItem(
      COMPUTRONIUM_RESEARCH_SPEED_MULT_STORAGE_KEY,
      String(clampComputroniumResearchSpeedMult(mult)),
    )
  } catch {
    /* ignore */
  }
}
