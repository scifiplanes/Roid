/** Single shared Web Audio context for SFX and ambient music. */

let audioCtx: AudioContext | null = null
let audioInitialized = false
let audioInitPromise: Promise<void> | null = null

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
  if (audioInitPromise) return audioInitPromise

  const c = getAudioContext()
  if (!c) {
    audioInitPromise = Promise.resolve()
    return audioInitPromise
  }

  audioInitPromise = (async () => {
    try {
      if (c.state === 'suspended') {
        await c.resume()
      }
      audioInitialized = true
    } catch {
      audioInitialized = false
    }
  })()

  return audioInitPromise
}

export function isAudioInitialized(): boolean {
  return audioInitialized
}

export function isAudioContextReady(): boolean {
  const c = getAudioContext()
  return !!c && (c.state === 'running' || c.state === 'closed')
}

export function ensureAudioContextInitialized(): Promise<void> {
  return resumeAudioContext()
}
