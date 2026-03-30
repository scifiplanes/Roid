/**
 * Dev-only User Timing marks for profiling hot paths (Chrome Performance → Timings).
 * No-op in production builds.
 */
export const PERF_MARKS_ENABLED = import.meta.env.DEV

export function perfMark(name: string): void {
  if (PERF_MARKS_ENABLED) performance.mark(name)
}

export function perfMeasure(name: string, startMark: string, endMark: string): void {
  if (!PERF_MARKS_ENABLED) return
  try {
    performance.measure(name, startMark, endMark)
  } catch {
    /* duplicate measure name in same frame */
  }
}
