/**
 * Debug tunables for audio output chains:
 * - Music post chain EQ + high-pass (music-only, after asteroid music bus, before global master limiter).
 * - Hoover tool lowpass LFO on the shared SFX bus.
 */
export interface AudioMasterDebug {
  /** High-pass cutoff (Hz); default rolls off sub-bass. */
  masterHighPassHz: number
  /** Low shelf gain (dB) at ~200 Hz. */
  eqLowDb: number
  /** Peaking gain (dB) at ~1 kHz. */
  eqMidDb: number
  /** High shelf gain (dB) at ~4 kHz. */
  eqHighDb: number
  /**
   * Hoover tool sustain: base lowpass cutoff (Hz) on the SFX path.
   * 0 or less falls back to a conservative default.
   */
  hooverLowpassBaseHz: number
  /**
   * Hoover tool sustain: peak ±Hz modulation of the lowpass cutoff.
   * 0 disables the LFO and keeps a fixed cutoff.
   */
  hooverLowpassLfoDepthHz: number
  /**
   * Hoover tool sustain: sine LFO rate (Hz) modulating the lowpass cutoff.
   * 0 disables the LFO.
   */
  hooverLowpassLfoRateHz: number
}

export function createDefaultAudioMasterDebug(): AudioMasterDebug {
  return {
    masterHighPassHz: 40,
    eqLowDb: 0,
    eqMidDb: 0,
    eqHighDb: 0,
    hooverLowpassBaseHz: 120,
    hooverLowpassLfoDepthHz: 140,
    hooverLowpassLfoRateHz: 1.6,
  }
}
