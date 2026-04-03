import type { WebGLRenderer } from 'three'

import { formatAudioMeterLines } from './audioMeters'

const STORAGE_KEY = 'roid-perf-debug-overlay-visible'

export function getPerfDebugOverlayStored(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setPerfDebugOverlayStored(on: boolean): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function sumMeasureDurations(name: string): number {
  const entries = performance.getEntriesByName(name, 'measure')
  let s = 0
  for (const e of entries) {
    s += e.duration
  }
  return s
}

const MEASURE_NAMES = [
  'roid-set-resource-hud',
  'roid-sim',
  'roid-replicator-transform',
  'roid-replicator-feed',
  'roid-replace-mesh',
  'roid-scourge-step',
  'roid-locust-step',
  'roid-mining-drones-step',
  'roid-debris-brackets',
  'roid-computronium',
  'roid-cargo-drones',
  'roid-refinery',
  'roid-depth-reveal',
  'roid-dross-particles',
  'roid-step-hubs',
  'roid-music',
  'roid-depth-overlay',
  'roid-render',
] as const

export interface PerfDebugOverlayHandle {
  setVisible: (on: boolean) => void
  getVisible: () => boolean
  /** Call at end of each frame after all `perfMeasure` calls; then `clearMeasures`. */
  onFrameEnd: (args: {
    frameStartMs: number
    renderer: WebGLRenderer
    voxels: number
    debrisShards: number
    drossClusters: number
  }) => void
}

/** Wider rolling average than a single frame; reduces fps / avg jitter. */
const AVG_RING = 120

/** EMA alpha for displayed "frame" line (smooths 60 Hz noise). */
const EMA_FRAME_ALPHA = 0.12

/** EMA alpha for spike readout (avoids jumps when old samples leave the window). */
const EMA_SPIKE_ALPHA = 0.08

/** Max label width for aligned measure rows (pad/truncate). */
const MEASURE_LABEL_W = 30

function padMeasureLabel(name: string): string {
  return name.length > MEASURE_LABEL_W ? `${name.slice(0, MEASURE_LABEL_W - 1)}…` : name.padEnd(MEASURE_LABEL_W)
}

function formatMsCell(ms: number, threshold = 0.01): string {
  if (ms < threshold) return '    —   '
  return ms.toFixed(2).padStart(8)
}

export function createPerfDebugOverlay(container: HTMLElement): PerfDebugOverlayHandle {
  const el = document.createElement('div')
  el.className = 'perf-debug-overlay'
  el.setAttribute('aria-hidden', 'true')
  el.hidden = true
  container.appendChild(el)

  let visible = getPerfDebugOverlayStored()
  el.hidden = !visible

  const frameMsRing: number[] = []
  const spikeWindowMs = 1000
  const spikeSamples: { t: number; ms: number }[] = []

  let emaFrameMs: number | null = null
  let emaSpikeMs: number | null = null

  function pushSpike(ms: number, now: number): void {
    spikeSamples.push({ t: now, ms })
    const cutoff = now - spikeWindowMs
    while (spikeSamples.length > 0 && spikeSamples[0]!.t < cutoff) {
      spikeSamples.shift()
    }
  }

  return {
    setVisible(on: boolean) {
      visible = on
      el.hidden = !on
      setPerfDebugOverlayStored(on)
      if (on) {
        emaFrameMs = null
        emaSpikeMs = null
        frameMsRing.length = 0
        spikeSamples.length = 0
      }
    },
    getVisible() {
      return visible
    },
    onFrameEnd({ frameStartMs, renderer, voxels, debrisShards, drossClusters }) {
      if (!visible) return

      const now = performance.now()
      const frameMs = now - frameStartMs
      frameMsRing.push(frameMs)
      if (frameMsRing.length > AVG_RING) frameMsRing.shift()
      pushSpike(frameMs, now)

      const avgMs =
        frameMsRing.length > 0 ? frameMsRing.reduce((a, b) => a + b, 0) / frameMsRing.length : frameMs
      const fps = avgMs > 1e-6 ? 1000 / avgMs : 0
      const rawSpikeMax =
        spikeSamples.length > 0 ? Math.max(...spikeSamples.map((s) => s.ms)) : frameMs

      emaFrameMs =
        emaFrameMs === null ? frameMs : emaFrameMs + EMA_FRAME_ALPHA * (frameMs - emaFrameMs)
      emaSpikeMs =
        emaSpikeMs === null
          ? rawSpikeMax
          : emaSpikeMs + EMA_SPIKE_ALPHA * (rawSpikeMax - emaSpikeMs)

      const lines: string[] = []
      lines.push(`frame ${emaFrameMs.toFixed(1)} ms  avg ${avgMs.toFixed(1)} ms  ~${fps.toFixed(0)} fps`)
      lines.push(`spike ~${emaSpikeMs.toFixed(1)} ms  (${spikeWindowMs} ms window, smoothed)`)

      const ri = renderer.info.render
      const mem = renderer.info.memory
      lines.push(`draw ${String(ri.calls).padStart(5)} calls   ${String(ri.triangles).padStart(8)} tris`)
      lines.push(`mem ${String(mem.geometries).padStart(5)} geo   ${String(mem.textures).padStart(5)} tex`)
      lines.push(
        `cells ${String(voxels).padStart(6)}   debris ${String(debrisShards).padStart(5)}   dross ${String(drossClusters).padStart(4)}`,
      )

      const heap = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory
      lines.push(
        heap?.usedJSHeapSize !== undefined
          ? `JS heap ${(heap.usedJSHeapSize / (1024 * 1024)).toFixed(2).padStart(7)} MB`
          : 'JS heap       n/a',
      )

      lines.push(...formatAudioMeterLines())
      lines.push('— ms (fixed rows; — = <0.01) —')
      for (const name of MEASURE_NAMES) {
        const ms = sumMeasureDurations(name)
        lines.push(`${padMeasureLabel(name)} ${formatMsCell(ms)}`)
      }

      el.textContent = lines.join('\n')
    },
  }
}
