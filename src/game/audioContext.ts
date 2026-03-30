/** Single shared Web Audio context for SFX and ambient music. */

let audioCtx: AudioContext | null = null
let audioInitialized = false

function getAudioContextConstructor(): (typeof AudioContext) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export function getAudioContext(): AudioContext | null {
  const Ctor = getAudioContextConstructor()
  if (!Ctor) return null
  try {
    if (!audioCtx) audioCtx = new Ctor()
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
