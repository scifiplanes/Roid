/**
 * Debug tunables for the asteroid music post chain (Settings → Debug → Music output).
 * EQ + high-pass only on the music dry/wet buses, before `AudioContext.destination`.
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
}

export function createDefaultAudioMasterDebug(): AudioMasterDebug {
  return {
    masterHighPassHz: 40,
    eqLowDb: 0,
    eqMidDb: 0,
    eqHighDb: 0,
  }
}
