import type { ResourceId, RootResourceId } from './resources'
import { ROOT_RESOURCE_IDS, addResourceYields } from './resources'
import type { AsteroidRegime } from './asteroidGenProfile'
import type { VoxelCell } from './voxelState'
import { getResourceColor } from './resourceColors'

export interface DebrisShard {
  id: number
  /** World-space center position (same frame as asteroid mesh). */
  pos: { x: number; y: number; z: number }
  /** World-space velocity per millisecond. */
  vel: { x: number; y: number; z: number }
  /** Wall-clock spawn time in ms. */
  spawnTimeMs: number
  /** Lifetime in ms before auto-despawn. */
  maxLifetimeMs: number
  /** Normalized root composition snapshot driving rewards. */
  bulk: Record<RootResourceId, number>
  /** Contextual reward granted on click or expiry. */
  reward: Partial<Record<ResourceId, number>>
  /** Local-axis instance scale (hit radius uses max × base pick radius). */
  scaleX: number
  scaleY: number
  scaleZ: number
  /** Unit quaternion for shard orientation (world, asteroid-local). */
  quat: { x: number; y: number; z: number; w: number }
  /** Tint derived from dominant bulk root (instance color). */
  tintRgb: { r: number; g: number; b: number }
}

export interface DebrisState {
  shards: DebrisShard[]
  nextId: number
}

export interface DebrisSpawnParams {
  /**
   * Base spawn probability in [0, 1] for this event type. Actual probability
   * may be further modulated by rock kind or other heuristics.
   */
  spawnChance: number
  /** Lifetime range (ms) for newly spawned debris. */
  lifetimeMs: { min: number; max: number }
  /** Base speed range (world units per second). */
  speedPerSec: { min: number; max: number }
  /**
   * Multiplier applied to nominal 1-unit reward derived from bulk composition,
   * e.g. 0.25 credits roughly a quarter of a voxel-equivalent yield.
   */
  rewardBaseUnits: number
  /**
   * Extra bonus units on top of the base, applied with small probability to
   * satisfy the \"with a little extra\" design intent.
   */
  bonusUnits: number
  bonusChance: number
  /** When set, biases shard visual archetype (chip / splinter / chunk). */
  asteroidRegime?: AsteroidRegime
}

export interface DebrisRay {
  origin: { x: number; y: number; z: number }
  dir: { x: number; y: number; z: number }
  /**
   * Maximum distance along the ray (in world units) to consider for hits.
   * Caller is expected to choose this consistent with asteroid pick distances.
   */
  maxDist: number
}

export interface DebrisHit {
  shard: DebrisShard
  distance: number
}

export function createDebrisState(): DebrisState {
  return { shards: [], nextId: 1 }
}

export function resetDebrisState(state: DebrisState): void {
  state.shards.length = 0
  state.nextId = 1
}

function clamp01(x: number): number {
  return x <= 0 ? 0 : x >= 1 ? 1 : x
}

function normalizeBulkFromCell(cell: VoxelCell): Record<RootResourceId, number> {
  const comp = cell.bulkComposition
  if (!comp) {
    const out = {} as Record<RootResourceId, number>
    const w = 1 / ROOT_RESOURCE_IDS.length
    for (const r of ROOT_RESOURCE_IDS) out[r] = w
    return out
  }
  let sum = 0
  for (const r of ROOT_RESOURCE_IDS) sum += comp[r] ?? 0
  if (!Number.isFinite(sum) || sum <= 0) {
    const out = {} as Record<RootResourceId, number>
    const w = 1 / ROOT_RESOURCE_IDS.length
    for (const r of ROOT_RESOURCE_IDS) out[r] = w
    return out
  }
  const out = {} as Record<RootResourceId, number>
  for (const r of ROOT_RESOURCE_IDS) {
    const v = comp[r] ?? 0
    out[r] = v > 0 ? v / sum : 0
  }
  return out
}

function randomInRange(min: number, max: number): number {
  if (max <= min) return min
  return min + Math.random() * (max - min)
}

function float01FromShardKey(key: number, salt: number): number {
  let n = key * 2246822519 + salt * 3266489917 + 668265263
  n ^= n >>> 13
  n = Math.imul(n, 1274126177)
  n ^= n >>> 16
  return (n >>> 0) / 4294967296
}

function dominantRootFromBulk(bulk: Record<RootResourceId, number>): RootResourceId {
  let best: RootResourceId = ROOT_RESOURCE_IDS[0]!
  let bestW = -1
  for (const r of ROOT_RESOURCE_IDS) {
    const w = clamp01(bulk[r] ?? 0)
    if (w > bestW) {
      bestW = w
      best = r
    }
  }
  return best
}

function regimeStyleSalt(reg: AsteroidRegime | undefined): number {
  if (!reg) return 0
  let h = 0
  for (let i = 0; i < reg.length; i++) h = Math.imul(h, 31) + reg.charCodeAt(i)!
  return h & 0xffff
}

function splinterBiasForRegime(reg: AsteroidRegime | undefined): number {
  if (!reg) return 0.34
  switch (reg) {
    case 'impactShattered':
    case 'collisionalFamilyDebris':
      return 0.56
    case 'competentMonolith':
      return 0.14
    case 'contactBinaryRubble':
      return 0.4
    default:
      return 0.34
  }
}

/** Deterministic orientation + non-uniform scale from shard id, cell, and asteroid regime. */
function computeShardVisualMorph(
  id: number,
  pos: { x: number; y: number; z: number },
  bulk: Record<RootResourceId, number>,
  regime: AsteroidRegime | undefined,
): {
  scaleX: number
  scaleY: number
  scaleZ: number
  quat: DebrisShard['quat']
  tintRgb: { r: number; g: number; b: number }
} {
  const { x: cx, y: cy, z: cz } = pos
  const key = id * 1315423911 + cx * 7919 + cy * 7937 + cz * 7949

  const u0 = float01FromShardKey(key, 1)
  const u1 = float01FromShardKey(key, 2)
  const u2 = float01FromShardKey(key, 3)
  const u3 = float01FromShardKey(key, 4)
  const uStyle = float01FromShardKey(key, 5 + regimeStyleSalt(regime))

  const base = 0.62 + u0 * 0.76
  const t0 = splinterBiasForRegime(regime)
  const t1 = t0 + 0.22
  let scaleX = base
  let scaleY = base
  let scaleZ = base
  if (uStyle < t0) {
    scaleX = base * 0.42
    scaleY = base * 1.02
    scaleZ = base * 1.4
  } else if (uStyle < t1) {
    const c = base * 1.16
    scaleX = c
    scaleY = c
    scaleZ = c
  } else {
    const c = base * 0.9
    scaleX = c
    scaleY = c
    scaleZ = c
  }

  const theta = 2 * Math.PI * u1
  const z = 2 * u2 - 1
  const r = Math.sqrt(Math.max(0, 1 - z * z))
  const ax = r * Math.cos(theta)
  const ay = r * Math.sin(theta)
  const ang = 2 * Math.PI * u3
  const half = ang * 0.5
  const s = Math.sin(half)
  const c = Math.cos(half)
  const len = Math.hypot(ax, ay, z) || 1
  const quat: DebrisShard['quat'] = {
    x: (ax / len) * s,
    y: (ay / len) * s,
    z: (z / len) * s,
    w: c,
  }

  const tintRgb = getResourceColor(dominantRootFromBulk(bulk))
  return { scaleX, scaleY, scaleZ, quat, tintRgb }
}

function randomUnitVectorHemisphere(): { x: number; y: number; z: number } {
  // Cosine-weighted hemisphere in +Z for a gentle upward drift; caller can
  // rotate via asteroid transform if needed.
  const u = Math.random()
  const v = Math.random()
  const az = 2 * Math.PI * u
  const z = clamp01(v)
  const r = Math.sqrt(Math.max(0, 1 - z * z))
  const x = r * Math.cos(az)
  const y = r * Math.sin(az)
  return { x, y, z }
}

function computeDebrisRewardFromBulk(
  bulk: Record<RootResourceId, number>,
  baseUnits: number,
  bonusUnits: number,
  bonusChance: number,
): Partial<Record<ResourceId, number>> {
  const units = baseUnits + (Math.random() < bonusChance ? bonusUnits : 0)
  if (units <= 0) return {}
  const out: Partial<Record<ResourceId, number>> = {}
  let acc = 0
  for (const r of ROOT_RESOURCE_IDS) {
    const w = clamp01(bulk[r] ?? 0)
    if (w <= 0) continue
    const exact = units * w
    const n = Math.max(0, Math.round(exact))
    if (n > 0) {
      out[r] = (out[r] ?? 0) + n
      acc += n
    }
  }
  if (acc <= 0 && units > 0) {
    // Ensure at least one unit goes somewhere so a successful debris roll
    // always produces a visible shard. Pick the dominant root in `bulk`.
    let best: RootResourceId | null = null
    let bestW = 0
    for (const r of ROOT_RESOURCE_IDS) {
      const w = clamp01(bulk[r] ?? 0)
      if (w > bestW) {
        bestW = w
        best = r
      }
    }
    if (best) {
      out[best] = 1
    }
  }
  return out
}

export function spawnDebrisFromRemovedCell(
  state: DebrisState,
  cell: VoxelCell,
  localPos: { x: number; y: number; z: number },
  nowMs: number,
  params: DebrisSpawnParams,
): void {
  if (params.spawnChance <= 0) return
  if (Math.random() >= params.spawnChance) return

  const bulk = normalizeBulkFromCell(cell)
  const baseUnits = Math.max(0, params.rewardBaseUnits)
  const bonusUnits = Math.max(0, params.bonusUnits)
  const reward = computeDebrisRewardFromBulk(bulk, baseUnits, bonusUnits, clamp01(params.bonusChance))
  if (!reward || Object.keys(reward).length === 0) return

  const speedPerSec = randomInRange(params.speedPerSec.min, params.speedPerSec.max)
  const speedPerMs = speedPerSec / 1000
  const dir = randomUnitVectorHemisphere()
  const lifetimeMs = randomInRange(params.lifetimeMs.min, params.lifetimeMs.max)

  const id = state.nextId++
  const morph = computeShardVisualMorph(id, cell.pos, bulk, params.asteroidRegime)
  state.shards.push({
    id,
    pos: { x: localPos.x, y: localPos.y, z: localPos.z },
    vel: { x: dir.x * speedPerMs, y: dir.y * speedPerMs, z: dir.z * speedPerMs },
    spawnTimeMs: nowMs,
    maxLifetimeMs: lifetimeMs,
    bulk,
    reward,
    scaleX: morph.scaleX,
    scaleY: morph.scaleY,
    scaleZ: morph.scaleZ,
    quat: morph.quat,
    tintRgb: morph.tintRgb,
  })
}

export function stepDebris(state: DebrisState, nowMs: number, dtMs: number): void {
  if (dtMs <= 0 || state.shards.length === 0) return
  const shards = state.shards
  for (let i = 0; i < shards.length; i++) {
    const s = shards[i]!
    s.pos.x += s.vel.x * dtMs
    s.pos.y += s.vel.y * dtMs
    s.pos.z += s.vel.z * dtMs
  }
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i]!
    if (nowMs - s.spawnTimeMs >= s.maxLifetimeMs) {
      shards.splice(i, 1)
    }
  }
}

export function raycastDebris(
  state: DebrisState,
  ray: DebrisRay,
  baseRadius: number,
): DebrisHit | null {
  const shards = state.shards
  if (shards.length === 0 || baseRadius <= 0) return null
  const { origin, dir, maxDist } = ray
  let best: DebrisHit | null = null
  for (const s of shards) {
    const effR = baseRadius * Math.max(s.scaleX, s.scaleY, s.scaleZ)
    const r2 = effR * effR
    const px = s.pos.x - origin.x
    const py = s.pos.y - origin.y
    const pz = s.pos.z - origin.z
    const proj = px * dir.x + py * dir.y + pz * dir.z
    if (proj < 0 || proj > maxDist) continue
    const cx = px - proj * dir.x
    const cy = py - proj * dir.y
    const cz = pz - proj * dir.z
    const d2 = cx * cx + cy * cy + cz * cz
    if (d2 > r2) continue
    if (!best || proj < best.distance) {
      best = { shard: s, distance: proj }
    }
  }
  return best
}

export function collectDebris(
  state: DebrisState,
  shardId: number,
  tallies: Record<ResourceId, number>,
): boolean {
  const shards = state.shards
  for (let i = 0; i < shards.length; i++) {
    const s = shards[i]!
    if (s.id === shardId) {
      if (s.reward) {
        addResourceYields(tallies, s.reward)
      }
      shards.splice(i, 1)
      return true
    }
  }
  return false
}

