export interface PickThudVoiceParams {
  /** Envelope decay tail (seconds). */
  tailSecBase: number
  tailSecPopped: number
  /** Peak gain (linear, into SFX bus). */
  peakBase: number
  peakPopped: number
}

export interface PickThudRegolithParams extends PickThudVoiceParams {
  /** Bandpass center frequency (Hz). */
  bandpassHzBase: number
  bandpassHzPopped: number
  /** Bandpass resonance (Q). */
  bandpassQ: number
  /**
   * Exponential noise decay shaping constant; higher = faster decay.
   * Used in exp(-i / (n * shape)).
   */
  decayShapeBase: number
  decayShapePopped: number
}

export interface PickThudSilicateParams extends PickThudVoiceParams {
  /** Saw oscillator fundamental (Hz). */
  oscHzBase: number
  oscHzPopped: number
  /** Lowpass cutoff (Hz). */
  lowpassHzBase: number
  lowpassHzPopped: number
  /** Lowpass Q. */
  lowpassQ: number
}

export interface PickThudMetalParams extends PickThudVoiceParams {
  /** Fundamental frequency (Hz) for square carrier. */
  f0Base: number
  f0Popped: number
  /** Lowpass cutoff (Hz). */
  lowpassHzBase: number
  lowpassHzPopped: number
  /** Lowpass Q. */
  lowpassQ: number
  /** Relative gain for harmonic sine layer. */
  harmonicGainBase: number
  harmonicGainPopped: number
}

export interface PickThudDebug {
  regolith: PickThudRegolithParams
  silicate: PickThudSilicateParams
  metal: PickThudMetalParams
}

export const pickThudDebug: PickThudDebug = {
  regolith: {
    tailSecBase: 0.042,
    tailSecPopped: 0.07,
    peakBase: 0.12,
    peakPopped: 0.2,
    bandpassHzBase: 2200,
    bandpassHzPopped: 1650,
    bandpassQ: 0.65,
    decayShapeBase: 0.09,
    decayShapePopped: 0.14,
  },
  silicate: {
    tailSecBase: 0.075,
    tailSecPopped: 0.13,
    peakBase: 0.14,
    peakPopped: 0.22,
    oscHzBase: 142,
    oscHzPopped: 98,
    lowpassHzBase: 780,
    lowpassHzPopped: 520,
    lowpassQ: 0.7,
  },
  metal: {
    tailSecBase: 0.11,
    tailSecPopped: 0.22,
    peakBase: 0.16,
    peakPopped: 0.26,
    f0Base: 88,
    f0Popped: 62,
    lowpassHzBase: 620,
    lowpassHzPopped: 420,
    lowpassQ: 1.1,
    harmonicGainBase: 0.22,
    harmonicGainPopped: 0.38,
  },
}

