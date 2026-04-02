import type { ResourceId, RootResourceId } from './resources'
import { ROOT_RESOURCE_IDS, addResourceYields } from './resources'
import type { VoxelCell } from './voxelState'

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
  state.shards.push({
    id,
    pos: { x: localPos.x, y: localPos.y, z: localPos.z },
    vel: { x: dir.x * speedPerMs, y: dir.y * speedPerMs, z: dir.z * speedPerMs },
    spawnTimeMs: nowMs,
    maxLifetimeMs: lifetimeMs,
    bulk,
    reward,
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
  radius: number,
): DebrisHit | null {
  const shards = state.shards
  if (shards.length === 0 || radius <= 0) return null
  const { origin, dir, maxDist } = ray
  const r2 = radius * radius
  let best: DebrisHit | null = null
  for (const s of shards) {
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

