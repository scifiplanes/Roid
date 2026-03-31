import type { VoxelPos } from '../scene/asteroid/generateAsteroidVoxels'
import { float01FromSeed, type AsteroidGenProfile } from './asteroidGenProfile'
import type { VoxelKind } from './voxelKinds'
import { gameBalance } from './gameBalance'
import { getKindDef } from './voxelKinds'
import { computeBulkComposition, latticeHash } from './compositionYields'
import { applyRareLodeEnrichment } from './rareLodeField'
import type { ResourceId, RootResourceId } from './resources'

/** Mature replicator → voxel conversion target (paid; completes after delay). */
export type ReplicatorTransformTarget =
  | 'reactor'
  | 'battery'
  | 'hub'
  | 'refinery'
  | 'computronium'

function initialRockHp(kind: VoxelKind, maxDurability: number): number {
  if (
    kind === 'replicator' ||
    kind === 'reactor' ||
    kind === 'battery' ||
    kind === 'hub' ||
    kind === 'refinery' ||
    kind === 'depthScanner' ||
    kind === 'computronium'
  )
    return maxDurability
  if (maxDurability <= 0) return 0
  return Math.max(1, Math.round(maxDurability * gameBalance.durabilityMult))
}

/** HP for a cell when setting `kind` at runtime (e.g. mining laser). */
export function hpForVoxelKind(kind: VoxelKind): number {
  const def = getKindDef(kind)
  return initialRockHp(kind, def.maxDurability)
}

export interface VoxelCell {
  pos: VoxelPos
  kind: VoxelKind
  hpRemaining: number
  /** Set when a replicator is placed on this cell (eating or mature). */
  replicatorActive?: boolean
  /** While true and the cell is still rock, the sim consumes HP over time. */
  replicatorEating?: boolean
  /** Milliseconds accumulated toward the next HP tick while eating. */
  replicatorEatAccumulatorMs?: number
  /** Per-cell feed cadence while eating (ms per HP); set when eating starts, slight jitter. */
  replicatorMsPerHp?: number
  /** Mature replicator → structure/computronium conversion in progress (kind stays `replicator` until done). */
  replicatorTransformTarget?: ReplicatorTransformTarget
  replicatorTransformElapsedMs?: number
  /** Snapshot at conversion start; immune to balance slider mid-flight. */
  replicatorTransformTotalMs?: number
  /** Until this wall-clock time (ms), a tap-triggered visual pulse is applied to this replicator. */
  replicatorTapPulseEndMs?: number
  /** Unrefined resources held at this voxel (replicator output, etc.); consolidated into global root tallies by hubs. */
  storedResources?: Partial<Record<ResourceId, number>>
  /** Fractional passive income accumulator for this mature replicator. */
  passiveRemainder?: Partial<Record<ResourceId, number>>
  /** Unrefined mass units for `processedMatter` voxels (mining laser). */
  processedMatterUnits?: number
  /** Normalized root fractions for ablated rock (Hub credits roots from PM using this). */
  processedMatterRootComposition?: Record<RootResourceId, number>
  /** Per-cell mass fractions over root categories (lithology only). */
  bulkComposition?: Record<RootResourceId, number>
  /** Spectral rare-lode field strength at generation (0–1); preserved on processed matter from parent rock. */
  rareLodeStrength01?: number
  /** When true, this hub does not pull or spend energy (toggle with Hub tool). */
  hubDisabled?: boolean
  /** When true, this refinery does not process tallies or spend energy (toggle with Refinery tool). */
  refineryDisabled?: boolean
  /** When true, computronium does not drain energy or contribute to unlock progress (toggle with Computronium tool). */
  computroniumDisabled?: boolean
  /** Set when this voxel was surface-scanned (RGB snapshot at scan time; overlay rendering uses live `compositionToScanColor`). */
  surfaceScanTintRgb?: { r: number; g: number; b: number }
  /** 0–1 progress toward full depth-scan reveal (lithology / processed matter only). */
  depthRevealProgress?: number
  /** Cached refined composition RGB for depth overlay; set when progress becomes positive. */
  depthTintRgb?: { r: number; g: number; b: number }
  /** When set, explosive charge tool will detonate this cell at `performance.now()` >= this value (ms). */
  explosiveFuseEndMs?: number
}

const LITHO_AXIS_U = 0x4f1bbcdc
const LITHO_AXIS_V = 0x4e2b3d91

/**
 * Radial bands + hash jitter: outer shell → regolith, mid-depth → silicate mantle,
 * deep interior → metal-rich (differentiation analog). `crustProximity` is high near the surface;
 * may include a small anisotropic term (seed axis) so layering is not perfectly spherical.
 */
function pickKind(
  seed: number,
  pos: VoxelPos,
  crustProximity: number,
  profile: AsteroidGenProfile,
): VoxelKind {
  const h = latticeHash(seed + 17, pos.x, pos.y, pos.z)
  const pk = profile.pickKind
  const regolithEdge = 0.76 + pk.regolithThresholdOffset + h * 0.12 * pk.hashScale
  const metalEdge = 0.42 + pk.metalThresholdOffset - h * 0.14 * pk.hashScale
  if (crustProximity > regolithEdge) return 'regolith'
  if (crustProximity < metalEdge) return 'metalRich'
  return 'silicateRock'
}

export interface EnrichVoxelCellsParams {
  seed: number
  gridSize: number
  /** Generation baseRadius (voxel units). */
  baseRadius: number
  /** Generation noiseAmplitude — used to estimate outer bound for radial bands. */
  noiseAmplitude: number
  /** Spectral + regime + dials — lithology bands and bulk bias. */
  profile: AsteroidGenProfile
}

/**
 * Maps procedural positions to typed cells with full HP.
 * Lithology uses seeded hash plus radial depth proxy and optional axis blend (see pickKind).
 */
export function enrichVoxelCells(positions: VoxelPos[], params: EnrichVoxelCellsParams): VoxelCell[] {
  const { seed, gridSize, baseRadius, noiseAmplitude, profile } = params
  const center = (gridSize - 1) / 2
  const outerApprox = Math.max(baseRadius + noiseAmplitude, 1e-6)

  const axisU = float01FromSeed(seed, LITHO_AXIS_U) * 2 * Math.PI
  const axisV = float01FromSeed(seed, LITHO_AXIS_V) * Math.PI
  const ax = Math.sin(axisV) * Math.cos(axisU)
  const ay = Math.sin(axisV) * Math.sin(axisU)
  const az = Math.cos(axisV)
  const anisoWeight = 0.1 * profile.pickKind.hashScale

  const out: VoxelCell[] = []
  for (const pos of positions) {
    const dx = pos.x - center
    const dy = pos.y - center
    const dz = pos.z - center
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const radialCrust = Math.min(1, dist / outerApprox)
    const aligned = dist > 1e-9 ? (dx * ax + dy * ay + dz * az) / dist : 0
    const crustProximity = Math.min(1, Math.max(0, radialCrust + anisoWeight * aligned))

    const kind = pickKind(seed, pos, crustProximity, profile)
    const def = getKindDef(kind)
    const baseBulk = computeBulkComposition(seed, pos, kind, profile)
    const { bulk, rareLodeStrength01 } = applyRareLodeEnrichment(seed, pos, baseBulk, profile)
    out.push({
      pos,
      kind,
      hpRemaining: initialRockHp(kind, def.maxDurability),
      bulkComposition: bulk,
      rareLodeStrength01,
    })
  }
  return out
}
