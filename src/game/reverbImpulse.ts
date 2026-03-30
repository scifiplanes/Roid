/** Stereo noise-decay impulse for `ConvolverNode` (shared by music + SFX buses). */

export type ReverbImpulseOptions = {
  /**
   * 0 = identical L/R noise; 1 = independent noise per channel (wider, less mono smear).
   * Music bus only; SFX omits this (defaults to 0).
   */
  decorrelate?: number
  /**
   * 0 = none; 1 = strong one-pole lowpass on noise before the exponential envelope (darker tail).
   */
  damping?: number
  /**
   * 0 = smooth noise tail only; 1 = stronger sparse early taps in the first ~80 ms (reflection density).
   */
  earlyDensity?: number
}

/** Deterministic [0, 1) for early taps (index + salt). */
function u01Tap(i: number, salt: number): number {
  let x = Math.imul(i + 1, 0x9e3779b1) ^ salt
  x ^= x >>> 16
  x = Math.imul(x, 0x85ebca6b)
  x ^= x >>> 13
  return (x >>> 0) / 0xffffffff
}

/**
 * @param durationSec Buffer length / IR window (capped internally).
 * @param decayPerSec Exponential decay constant k in `exp(-k * t)` (higher = shorter tail).
 */
export function createReverbImpulseBuffer(
  ctx: AudioContext,
  durationSec: number,
  decayPerSec: number,
  options?: ReverbImpulseOptions,
): AudioBuffer {
  const rate = ctx.sampleRate
  const dur = Math.min(6, Math.max(0.35, durationSec))
  const len = Math.floor(dur * rate)
  const buf = ctx.createBuffer(2, len, rate)

  const dec = Math.max(0, Math.min(1, options?.decorrelate ?? 0))
  const damp = Math.max(0, Math.min(1, options?.damping ?? 0))
  const early = Math.max(0, Math.min(1, options?.earlyDensity ?? 0))
  /** One-pole smoothing: higher damping → more HF loss. */
  const lpCoef = 0.12 + damp * 0.83

  const earlyEnd = Math.min(len - 1, Math.floor(0.08 * rate))
  const numTaps = Math.max(0, Math.floor(early * 14))
  const tapSalt = 0x7e5b00

  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const t = i / rate
      const wShared = Math.random() * 2 - 1
      const wIndep = Math.random() * 2 - 1
      const w = (1 - dec) * wShared + dec * wIndep
      lp = lpCoef * lp + (1 - lpCoef) * w
      const env = Math.exp(-decayPerSec * t)
      d[i] = lp * env
    }

    if (numTaps > 0 && earlyEnd > 2) {
      for (let j = 0; j < numTaps; j++) {
        const u = u01Tap(j * 17 + ch * 31, tapSalt)
        const idx = Math.min(earlyEnd - 1, Math.floor(u * earlyEnd))
        const fall = Math.exp(-j * 0.35)
        const amp = (Math.random() * 2 - 1) * 0.22 * early * fall
        d[idx] += amp
      }
    }
  }

  return buf
}
