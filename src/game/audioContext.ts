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

/**
 * Fires `c.resume()` and returns the promise. Safe to call from within a
 * synchronous user-gesture handler — the returned promise must NOT be awaited
 * in the gesture callstack, just fire-and-forget or chain with `.then()`.
 * iOS requires the `.resume()` call itself to be initiated synchronously
 * inside the gesture; the resolution can be async.
 */
export function resumeAudioContextSync(): Promise<void> {
  const c = audioCtx
  if (!c) return Promise.resolve()
  const state = c.state as string
  if (state === 'suspended' || state === 'interrupted') {
    try {
      return c.resume().then(
        () => { audioInitialized = c.state === 'running' },
        () => { audioInitialized = false },
      )
    } catch {
      return Promise.resolve()
    }
  }
  return Promise.resolve()
}

export function resumeAudioContext(): Promise<void> {
  if (audioInitPromise) return audioInitPromise

  const c = audioCtx
  if (!c) {
    return Promise.resolve()
  }

  audioInitPromise = (async () => {
    try {
      const state = c.state as string
      if (state === 'suspended' || state === 'interrupted') {
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

/**
 * Sets the iOS audio session type to 'playback' so that the silent/ringer
 * switch does not mute Web Audio. Must be called inside a user gesture.
 * No-op on platforms that don't support navigator.audioSession.
 */
export function setAudioSessionPlayback(): void {
  try {
    const nav = navigator as unknown as { audioSession?: { type: string } }
    if (nav.audioSession) {
      nav.audioSession.type = 'playback'
    }
  } catch {
    /* ignore */
  }
}

/** After tab switch / screen lock iOS may suspend the context; clear so the next gesture re-runs unlock. */
export function resetAudioInitializedAfterBackgrounding(): void {
  audioInitialized = false
}

export function markAudioContextResumeComplete(): void {
  audioInitialized = true
}
