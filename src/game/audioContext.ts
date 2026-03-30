/** Single shared Web Audio context for SFX and ambient music. */

let audioCtx: AudioContext | null = null
let audioInitialized = false

export function getAudioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    return audioCtx
  } catch {
    return null
  }
}

export function resumeAudioContext(): Promise<void> {
  const c = getAudioContext()
  if (!c) return Promise.resolve()
  audioInitialized = true
  if (c.state === 'suspended') return c.resume().catch(() => undefined)
  return Promise.resolve()
}

export function isAudioInitialized(): boolean {
  return audioInitialized
}

export function ensureAudioContextInitialized(): void {
  void resumeAudioContext()
}
