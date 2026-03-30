/** Single shared Web Audio context for SFX and ambient music. */

let audioCtx: AudioContext | null = null
let audioInitialized = false
let audioInitPromise: Promise<void> | null = null

type AudioContextStateChangeCallback = () => void
const stateChangeCallbacks: AudioContextStateChangeCallback[] = []

function getAudioContextConstructor(): (typeof AudioContext) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

function attachStateListener(c: AudioContext): void {
  c.addEventListener('statechange', () => {
    if (c.state === 'running') {
      audioInitialized = true
    } else if (c.state === 'suspended' || c.state === 'interrupted') {
      audioInitialized = false
    }
    for (const cb of stateChangeCallbacks) cb()
  })
}

export function onAudioContextStateChange(cb: AudioContextStateChangeCallback): void {
  stateChangeCallbacks.push(cb)
}

/**
 * Creates the AudioContext synchronously. Must be called within a user gesture
 * handler's synchronous callstack for iOS/Android browser policy compliance.
 */
export function createAudioContextNow(): AudioContext | null {
  const Ctor = getAudioContextConstructor()
  if (!Ctor) return null
  try {
    if (!audioCtx) {
      audioCtx = new Ctor()
      attachStateListener(audioCtx)
    }
    return audioCtx
  } catch {
    return null
  }
}

export function getAudioContext(): AudioContext | null {
  return audioCtx
}

export function resumeAudioContext(): Promise<void> {
  if (audioInitPromise) return audioInitPromise

  const c = audioCtx
  if (!c) {
    return Promise.resolve()
  }

  audioInitPromise = (async () => {
    try {
      if (c.state === 'suspended') {
        await c.resume()
      }
      audioInitialized = c.state === 'running'
    } catch {
      audioInitialized = false
    } finally {
      audioInitPromise = null
    }
  })()

  return audioInitPromise
}

export function isAudioInitialized(): boolean {
  return audioInitialized
}

export function isAudioContextReady(): boolean {
  const c = audioCtx
  return !!c && (c.state === 'running' || c.state === 'closed')
}

export function ensureAudioContextInitialized(): Promise<void> {
  return resumeAudioContext()
}
