/**
 * Single entry to `AudioContext.destination` for music + SFX: unity input →
 * dynamics compressor (peak control) → destination.
 */

/** dB; pull down hot material before it clips at the output. */
const GLOBAL_MASTER_THRESHOLD_DB = -6
/** Hard knee reads more like a limiter than smooth glue compression. */
const GLOBAL_MASTER_KNEE_DB = 0
/** High ratio for strong peak reduction (Web Audio caps at 20). */
const GLOBAL_MASTER_RATIO = 20
/** Seconds; fast attack catches transients. */
const GLOBAL_MASTER_ATTACK_SEC = 0.003
/** Seconds; release avoids obvious pumping on sustained material. */
const GLOBAL_MASTER_RELEASE_SEC = 0.12

let ctxRef: AudioContext | null = null
let busIn: GainNode | null = null

/**
 * Unity-gain input: connect music post chain and SFX bus here; audio is summed,
 * then limited-ish via compressor before `destination`.
 */
export function getGlobalMasterInput(c: AudioContext): GainNode {
  if (busIn && ctxRef === c) return busIn

  const inGain = c.createGain()
  inGain.gain.value = 1

  const comp = c.createDynamicsCompressor()
  comp.threshold.value = GLOBAL_MASTER_THRESHOLD_DB
  comp.knee.value = GLOBAL_MASTER_KNEE_DB
  comp.ratio.value = GLOBAL_MASTER_RATIO
  comp.attack.value = GLOBAL_MASTER_ATTACK_SEC
  comp.release.value = GLOBAL_MASTER_RELEASE_SEC

  inGain.connect(comp)
  comp.connect(c.destination)

  ctxRef = c
  busIn = inGain
  return busIn
}
