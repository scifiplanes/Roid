/** Stereo noise-decay impulse for `ConvolverNode` (shared by music + SFX buses). */

export function createReverbImpulseBuffer(
  ctx: AudioContext,
  durationSec: number,
  decayPerSec: number,
): AudioBuffer {
  const rate = ctx.sampleRate
  const dur = Math.min(6, Math.max(0.35, durationSec))
  const len = Math.floor(dur * rate)
  const buf = ctx.createBuffer(2, len, rate)
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      const t = i / rate
      d[i] = (Math.random() * 2 - 1) * Math.exp(-decayPerSec * t)
    }
  }
  return buf
}
