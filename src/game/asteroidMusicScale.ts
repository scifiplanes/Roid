export const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11] as const

/** Natural minor (Aeolian). */
const MINOR_SCALE_STEPS = [0, 2, 3, 5, 7, 8, 10] as const
const IWATO_STEPS = [0, 1, 5, 7, 10] as const
const HIRAJOSHI_STEPS = [0, 2, 3, 7, 8] as const
const MAJOR_PENTATONIC_STEPS = [0, 2, 4, 7, 9] as const
/** Locrian. */
const LOCRIAN_STEPS = [0, 1, 3, 5, 6, 8, 10] as const

export type ScaleClampMode =
  | 'major'
  | 'minor'
  | 'iwato'
  | 'hirajoshi'
  | 'majorPentatonic'
  | 'locrian'

const SCALE_STEPS_BY_MODE: Record<ScaleClampMode, readonly number[]> = {
  major: MAJOR_SCALE_STEPS,
  minor: MINOR_SCALE_STEPS,
  iwato: IWATO_STEPS,
  hirajoshi: HIRAJOSHI_STEPS,
  majorPentatonic: MAJOR_PENTATONIC_STEPS,
  locrian: LOCRIAN_STEPS,
}

export function scaleStepsForMode(mode: ScaleClampMode): readonly number[] {
  return SCALE_STEPS_BY_MODE[mode]
}

export function parseScaleClampMode(s: unknown, fallback: ScaleClampMode): ScaleClampMode {
  if (typeof s !== 'string') return fallback
  return s in SCALE_STEPS_BY_MODE ? (s as ScaleClampMode) : fallback
}

export function rootMidiFromSeed(seed: number): number {
  return 36 + (seed >>> 0) % 12
}

export function defaultSemitonesFromRootForVoice(i: number): number {
  return Math.floor(i / 3) * 12 + [0, 4, 7][i % 3]
}

/**
 * Snap `roughMidi` to the nearest MIDI note whose pitch class is in `steps` (semitones from root, mod 12).
 */
export function snapMidiToScale(
  roughMidi: number,
  rootMidi: number,
  steps: readonly number[],
): number {
  if (!Number.isFinite(roughMidi) || !Number.isFinite(rootMidi)) {
    const r0 = Number.isFinite(rootMidi) ? rootMidi : 36
    return Math.round(r0)
  }
  const r = ((rootMidi % 12) + 12) % 12
  let best = Math.round(roughMidi)
  let bestErr = Infinity
  for (let delta = -48; delta <= 48; delta++) {
    const m = Math.round(roughMidi) + delta
    const mpc = ((m % 12) + 12) % 12
    let ok = false
    for (const s of steps) {
      if (mpc === ((r + s) % 12 + 12) % 12) {
        ok = true
        break
      }
    }
    if (!ok) continue
    const err = Math.abs(m - roughMidi)
    if (err < bestErr) {
      bestErr = err
      best = m
    }
  }
  return best
}

export function snapMidiToMajorScale(roughMidi: number, rootMidi: number): number {
  return snapMidiToScale(roughMidi, rootMidi, MAJOR_SCALE_STEPS)
}

/** Circle-of-fifths (+7 PC/step) vs circle-of-fourths (+5 PC/step). */
export type ScaleCycleDirection = 'fifths' | 'fourths'

const SCALE_CYCLE_DIRECTIONS: Record<ScaleCycleDirection, true> = {
  fifths: true,
  fourths: true,
}

export function parseScaleCycleDirection(s: unknown, fallback: ScaleCycleDirection): ScaleCycleDirection {
  if (typeof s !== 'string') return fallback
  return s in SCALE_CYCLE_DIRECTIONS ? (s as ScaleCycleDirection) : fallback
}

/**
 * Tonic pitch class after `steps` moves around the circle (mod 12 positions).
 * `steps` is wrapped to 0…11.
 */
export function tonicPitchClassAfterCycleSteps(
  basePitchClass: number,
  steps: number,
  direction: ScaleCycleDirection,
): number {
  const stepSemis = direction === 'fifths' ? 7 : 5
  const s = ((steps % 12) + 12) % 12
  const pc = ((basePitchClass % 12) + 12) % 12
  return (pc + stepSemis * s) % 12
}

/**
 * Move the MIDI tonic by pitch-class motion only (keeps the same octave band as `baseRootMidi`).
 */
export function effectiveRootMidiAfterCycleSteps(
  baseRootMidi: number,
  cycleSteps: number,
  direction: ScaleCycleDirection,
): number {
  if (!Number.isFinite(baseRootMidi)) return 36
  const basePc = ((baseRootMidi % 12) + 12) % 12
  const newPc = tonicPitchClassAfterCycleSteps(basePc, cycleSteps, direction)
  return baseRootMidi - basePc + newPc
}
