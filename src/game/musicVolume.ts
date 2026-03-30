export const MUSIC_VOLUME_STORAGE_KEY = 'roid:musicVolume'

const DEFAULT_LINEAR = 0.42

export function loadMusicVolumeLinear(): number {
  try {
    const raw = localStorage.getItem(MUSIC_VOLUME_STORAGE_KEY)
    if (raw === null) return DEFAULT_LINEAR
    const n = Number(raw)
    if (!Number.isFinite(n)) return DEFAULT_LINEAR
    return Math.min(1, Math.max(0, n))
  } catch {
    return DEFAULT_LINEAR
  }
}

export function saveMusicVolumeLinear(linear: number): void {
  try {
    const v = Math.min(1, Math.max(0, linear))
    localStorage.setItem(MUSIC_VOLUME_STORAGE_KEY, String(v))
  } catch {
    /* ignore */
  }
}
