import type { WebGLRenderer } from 'three'

export const MAX_PIXEL_RATIO_STORAGE_KEY = 'roid:maxPixelRatio'

export type MaxPixelRatioCap = 1 | 1.5 | 2

export function loadMaxPixelRatioCap(): MaxPixelRatioCap {
  try {
    const s = localStorage.getItem(MAX_PIXEL_RATIO_STORAGE_KEY)
    if (s === '1') return 1
    if (s === '1.5') return 1.5
  } catch {
    /* ignore */
  }
  return 2
}

export function saveMaxPixelRatioCap(cap: MaxPixelRatioCap): void {
  try {
    localStorage.setItem(MAX_PIXEL_RATIO_STORAGE_KEY, String(cap))
  } catch {
    /* ignore */
  }
}

/** Apply capped device pixel ratio (Settings → max canvas pixel ratio). */
export function applyRendererPixelRatio(renderer: WebGLRenderer): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, loadMaxPixelRatioCap()))
}
