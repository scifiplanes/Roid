import type { GameBalance } from './gameBalance'
import type { LaserUnlockApply } from './computroniumSim'
import { applyResearchTierGrant } from './computroniumSim'
import { RESOURCE_DEFS, RESOURCE_IDS_ORDERED, ROOT_RESOURCE_IDS, type ResourceId } from './resources'
import type { VoxelKind } from './voxelKinds'
import type { VoxelPos } from '../scene/asteroid/generateAsteroidVoxels'

/** Lithology voxels that can proc discoveries (not processed matter). */
export const DISCOVERY_LITHOLOGY_KINDS: ReadonlySet<VoxelKind> = new Set([
  'regolith',
  'silicateRock',
  'metalRich',
])

export type DiscoveryArchetype = 'windfall' | 'drain' | 'lore' | 'researchBypass'

export interface DiscoveryOffer {
  /** Stable id for logging */
  id: string
  /** Grid cell where this discovery was claimed (for anchored UI). */
  foundAt: VoxelPos
  titleLine: string
  /** Small ASCII illustration (modal only; not stored in lore log). */
  asciiArtLines: string[]
  bodyLines: string[]
  /** Optional explicit resource delta summary (e.g. "+3 Reg, -1 Fe"). */
  resourceSummaryLine: string | null
  archetype: DiscoveryArchetype
  resourceDelta: Partial<Record<ResourceId, number>>
  researchTierGrant: 1 | 2 | 3 | 4 | null
  loreLogLine: string | null
}

/** Result of attempting to claim a discovery at a voxel (e.g. after mining). */
export type DiscoveryClaimResult =
  | { kind: 'none' }
  | { kind: 'falseSignal' }
  | { kind: 'offer'; offer: DiscoveryOffer }

function mixU32(a: number, b: number, c: number, d: number): number {
  let x = (Math.imul(a ^ b, 0x9e3779b1) ^ c ^ d) >>> 0
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  x = (x + Math.imul(c, 0x85ebca6b)) >>> 0
  x ^= x << 13
  x ^= x >>> 17
  return x >>> 0
}

function u32ToUnit(h: number): number {
  return (h >>> 0) / 0x1_0000_0000
}

/**
 * Deterministic: fraction of voxels that are discovery sites (scan hint + claim eligibility).
 * `densityScale` (default 1) comes from `discoveryDensityScale(profile)` — spectral/regime prior on top of balance.
 */
export function isDiscoverySite(
  asteroidSeed: number,
  pos: { x: number; y: number; z: number },
  balance: GameBalance,
  densityScale = 1,
): boolean {
  const d = Math.min(1, Math.max(0, balance.discoverySiteDensity * densityScale))
  if (d <= 0) return false
  let h = mixU32(asteroidSeed, pos.x, pos.y, pos.z)
  h = mixU32(h, 0x53495445, 0x44495343, 0x544553)
  return u32ToUnit(h) <= d
}

export function discoveryPosKey(pos: { x: number; y: number; z: number }): string {
  return `${pos.x},${pos.y},${pos.z}`
}

/**
 * One-shot claim at `pos`: must be a discovery site and not already consumed.
 * Marks consumed and increments counter, then rolls an offer. Rarity is from site density only;
 * `falseSignal` means the site was spent but no offer was built (e.g. all archetype weights zero).
 */
export function tryDiscoveryClaim(
  asteroidSeed: number,
  pos: { x: number; y: number; z: number },
  balance: GameBalance,
  consumed: Set<string>,
  discoveryCounter: { current: number },
  densityScale = 1,
): DiscoveryClaimResult {
  const key = discoveryPosKey(pos)
  if (consumed.has(key)) return { kind: 'none' }
  if (!isDiscoverySite(asteroidSeed, pos, balance, densityScale)) return { kind: 'none' }
  consumed.add(key)
  discoveryCounter.current += 1
  const offer = rollDiscoveryOffer(asteroidSeed, pos, discoveryCounter.current, balance)
  if (!offer) return { kind: 'falseSignal' }
  return { kind: 'offer', offer }
}

const PREFIXES = [
  'Stray',
  'Cached',
  'Anomalous',
  'Pre-impact',
  'Folded',
  'Drifting',
  'Quantum-locked',
  'Spectral',
]
const SUBJECTS = [
  'echo',
  'fragment',
  'cache',
  'signal',
  'lattice',
  'void',
  'shard',
  'trace',
]
const SUFFIXES = [
  'in the regolith seam',
  'near the crust boundary',
  'from a forgotten survey',
  'in phase with the scan',
  'below noise floor',
  'aligned with the belt',
  'outside the catalog',
  'in the shadow cone',
]

const RESEARCH_FLAVOR = [
  'A dormant uplink aligns with your grid — routing unlocks.',
  'Residual ephemeris resolves; orbital tools answer.',
  'Buried calibration unlocks a deeper beam path.',
  'A cached almanac completes the scanner chain.',
  'Strange harmonics finish what computronium started.',
]

const WINDFALL_LINES = [
  'Loose material clings to the cavity walls.',
  'Crystals flicker as vacuum redeposits fines.',
  'A pocket opens; mass tumbles inward.',
]

const DRAIN_LINES = [
  'The cavity equalizes — some stores vent to space.',
  'A feedback pulse scatters cached volatiles.',
  'Thermal shock cracks a storage blister.',
]

const LORE_ONLY = [
  'You file a label that fits nowhere in the taxonomy.',
  'The signature will bother you for weeks.',
  'No spectrum matches; you keep the trace anyway.',
]

/** Plain ASCII; each variant same line count for stable layout. */
const DISCOVERY_ASCII_WINDFALL: readonly (readonly string[])[] = [
  ['  .---.  ', ' /     \\', '|  * *  |', ' \\_____/ '],
  ['    *    ', '   ***   ', '  * * *  ', '   ***   '],
  ['   /\\   ', '  /  \\  ', '  \\  /  ', '   \\/   '],
  ['   ___   ', '  /   \\  ', ' |_____| ', '  \\ | /  '],
]

const DISCOVERY_ASCII_DRAIN: readonly (readonly string[])[] = [
  ['   | |   ', '   | |   ', '  \\   /  ', '   \\ /   '],
  [' ~ ~ ~ ~ ', '~       ~', ' ~ ~ ~ ~ ', '         '],
  ['  \\   /  ', '   \\ /   ', '    V    ', '         '],
  ['  /   \\  ', ' |     | ', '  \\   /  ', '         '],
]

const DISCOVERY_ASCII_LORE: readonly (readonly string[])[] = [
  ['  .---.  ', '  | ? |  ', "  '---'  ", '         '],
  ['    ?    ', '   /|\\   ', '    |    ', '         '],
  ['  .---.  ', '  |~~~|  ', "  '---'  ", '         '],
  ['   ___   ', '  ( o )  ', '   ---   ', '         '],
]

const DISCOVERY_ASCII_RESEARCH: readonly (readonly string[])[] = [
  ['    |    ', '   -+-   ', '    |    ', '         '],
  ['   ___   ', '  /   \\  ', '  \\___/  ', '         '],
  ['    |    ', '    |    ', '   / \\   ', '         '],
  ['    ^    ', '    |    ', '    |    ', '         '],
]

const ARCHETYPE_ASCII_TAG: Record<DiscoveryArchetype, number> = {
  windfall: 1,
  drain: 2,
  lore: 3,
  researchBypass: 4,
}

function pickDiscoveryAsciiLines(
  archetype: DiscoveryArchetype,
  h: number,
  band: number,
): string[] {
  const pool =
    archetype === 'windfall'
      ? DISCOVERY_ASCII_WINDFALL
      : archetype === 'drain'
        ? DISCOVERY_ASCII_DRAIN
        : archetype === 'lore'
          ? DISCOVERY_ASCII_LORE
          : DISCOVERY_ASCII_RESEARCH
  const idx = mixU32(h, band, ARCHETYPE_ASCII_TAG[archetype], 0x415343) % pool.length
  return [...pool[idx]!]
}

function pickStr(arr: readonly string[], h: number): { s: string; next: number } {
  const i = h % arr.length
  const next = Math.imul(h, 0x7feb352d) ^ (h >>> 3)
  return { s: arr[i]!, next: next >>> 0 }
}

function tierFromHash(h: number): 1 | 2 | 3 | 4 {
  const w1 = 8
  const w2 = 4
  const w3 = 2
  const w4 = 1
  const t = h % (w1 + w2 + w3 + w4)
  if (t < w1) return 1
  if (t < w1 + w2) return 2
  if (t < w1 + w2 + w3) return 3
  return 4
}

function pickRootResource(h: number): { id: ResourceId; next: number } {
  const idx = h % ROOT_RESOURCE_IDS.length
  const next = (Math.imul(h, 0xac4c1b5a) ^ 0xdeadbeef) >>> 0
  return { id: ROOT_RESOURCE_IDS[idx]!, next }
}

function formatResourceDeltaSummary(delta: Partial<Record<ResourceId, number>>): string | null {
  const parts: string[] = []
  for (const id of RESOURCE_IDS_ORDERED) {
    const n = delta[id]
    if (n === undefined || n === 0) continue
    const sign = n > 0 ? '+' : ''
    parts.push(`${sign}${n} ${RESOURCE_DEFS[id].hudAbbrev}`)
  }
  if (parts.length === 0) return null
  return parts.join(', ')
}

/**
 * Deterministic discovery from asteroid seed, voxel position, and per-run counter.
 * Returns null only if all archetype weights are zero (cannot pick an archetype).
 */
export function rollDiscoveryOffer(
  asteroidSeed: number,
  voxelPos: { x: number; y: number; z: number },
  discoveryCounter: number,
  balance: GameBalance,
): DiscoveryOffer | null {
  let h = mixU32(asteroidSeed, voxelPos.x, voxelPos.y, voxelPos.z)
  h = mixU32(h, discoveryCounter, 0x4f6e6f6e, 0x44697363)

  const ww = balance.discoveryWeightWindfall
  const wd = balance.discoveryWeightDrain
  const wl = balance.discoveryWeightLore
  const wr = balance.discoveryWeightResearchBypass
  const sum = ww + wd + wl + wr
  if (sum <= 0) return null

  h = mixU32(h, ww, wd, wl)
  const pick = u32ToUnit(h) * sum
  let archetype: DiscoveryArchetype
  let acc = ww
  if (pick < acc) archetype = 'windfall'
  else {
    acc += wd
    if (pick < acc) archetype = 'drain'
    else {
      acc += wl
      if (pick < acc) archetype = 'lore'
      else archetype = 'researchBypass'
    }
  }

  h = mixU32(h, archetype.length, discoveryCounter, voxelPos.z)
  const band = 1 + (h % 4)
  h = h >>> 1

  const id = `dsc-${(mixU32(asteroidSeed, voxelPos.x, voxelPos.y, voxelPos.z) ^ discoveryCounter).toString(16)}`

  let titleLine = 'Discovery'
  const bodyLines: string[] = []
  const resourceDelta: Partial<Record<ResourceId, number>> = {}
  let researchTierGrant: 1 | 2 | 3 | 4 | null = null
  let loreLogLine: string | null = null

  if (archetype === 'researchBypass') {
    researchTierGrant = tierFromHash(mixU32(h, 3, 1, 4))
    const p = pickStr(PREFIXES, h)
    const s = pickStr(SUBJECTS, p.next)
    const x = pickStr(SUFFIXES, s.next)
    titleLine = `${p.s} ${s.s}`
    bodyLines.push(x.s + '.')
    bodyLines.push(RESEARCH_FLAVOR[(p.next ^ s.next) % RESEARCH_FLAVOR.length]!)
    const tierLabel = ['Mining laser', 'Excavating laser', 'Scanner satellite', 'Depth scan'][researchTierGrant - 1]!
    bodyLines.push(`Unlock path: ${tierLabel} (tier ${researchTierGrant}).`)
  } else if (archetype === 'windfall') {
    const n = Math.max(1, Math.round(band * 2))
    const r = pickRootResource(h)
    resourceDelta[r.id] = (resourceDelta[r.id] ?? 0) + n
    const p = pickStr(PREFIXES, r.next)
    const s = pickStr(SUBJECTS, p.next)
    titleLine = `${p.s} yield`
    bodyLines.push(`${n} units of material favor the ${s.s}.`)
    bodyLines.push(WINDFALL_LINES[h % WINDFALL_LINES.length]!)
  } else if (archetype === 'drain') {
    const n = Math.max(1, Math.round(band))
    const r = pickRootResource(h)
    resourceDelta[r.id] = (resourceDelta[r.id] ?? 0) - n
    const p = pickStr(PREFIXES, r.next)
    titleLine = `${p.s} bleed`
    bodyLines.push(`Up to ${n} units vent from ${p.s.toLowerCase()} stores.`)
    bodyLines.push(DRAIN_LINES[h % DRAIN_LINES.length]!)
  } else {
    const p = pickStr(PREFIXES, h)
    const s = pickStr(SUBJECTS, p.next)
    titleLine = `${p.s} ${s.s}`
    const l = LORE_ONLY[h % LORE_ONLY.length]!
    bodyLines.push(l)
    loreLogLine = `${titleLine}: ${l}`
  }

  const asciiArtLines = pickDiscoveryAsciiLines(archetype, h, band)
  const resourceSummaryLine = formatResourceDeltaSummary(resourceDelta)

  return {
    id,
    foundAt: { x: voxelPos.x, y: voxelPos.y, z: voxelPos.z },
    titleLine,
    asciiArtLines,
    bodyLines,
    resourceSummaryLine,
    archetype,
    resourceDelta,
    researchTierGrant,
    loreLogLine,
  }
}

/** Apply accepted discovery: resources, research tiers (mirrors computronium thresholds), unlock points sync. */
export function applyDiscoveryAccept(
  offer: DiscoveryOffer,
  tallies: Record<ResourceId, number>,
  laserFlags: LaserUnlockApply,
  unlockPoints: { current: number },
  balance: GameBalance,
): void {
  for (const id of RESOURCE_IDS_ORDERED) {
    const d = offer.resourceDelta[id]
    if (d === undefined || d === 0) continue
    tallies[id] = Math.max(0, (tallies[id] ?? 0) + d)
  }

  if (offer.researchTierGrant !== null) {
    applyResearchTierGrant(offer.researchTierGrant, laserFlags)
    const per = balance.computroniumPointsPerStage
    const t = offer.researchTierGrant
    const threshold = per * t
    unlockPoints.current = Math.max(unlockPoints.current, threshold)
  }
}
