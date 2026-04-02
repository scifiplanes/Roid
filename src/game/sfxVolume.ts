export const SFX_VOLUME_STORAGE_KEY = 'roid:sfxVolume'

const DEFAULT_LINEAR = 1

export function loadSfxVolumeLinear(): number {
  try {
    const raw = localStorage.getItem(SFX_VOLUME_STORAGE_KEY)
    if (raw === null) return DEFAULT_LINEAR
    const n = Number(raw)
    if (!Number.isFinite(n)) return DEFAULT_LINEAR
    return Math.min(1, Math.max(0, n))
  } catch {
    return DEFAULT_LINEAR
  }
}

export function saveSfxVolumeLinear(linear: number): void {
  try {
    const v = Math.min(1, Math.max(0, linear))
    localStorage.setItem(SFX_VOLUME_STORAGE_KEY, String(v))
  } catch {
    /* ignore */
  }
}
