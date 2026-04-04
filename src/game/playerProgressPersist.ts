import type { CoreAsset, WreckArchetype } from './coreAssets'
import type { DiscoveryOffer } from './discoveryGen'
import type { DebrisState } from './debrisSim'
import type { DrossState } from './drossSim'
import type { ComputroniumUnlockId } from './computroniumResearchQueue'
import {
  COMPUTRONIUM_RESEARCH_STEP_COUNT,
  COMPUTRONIUM_UNLOCK_IDS,
} from './computroniumResearchQueue'
import type { RefineryRecipeSelection } from './refineryRecipeUnlock'
import {
  RESOURCE_IDS_ORDERED,
  ROOT_RESOURCE_IDS,
  type ResourceId,
  type ResourceTalliesBySource,
  type RootResourceId,
} from './resources'
import type { VoxelCell } from './voxelState'
import { VOXEL_KIND_DEFS, type VoxelKind } from './voxelKinds'
import type { PlayerTool } from '../ui/toolsPanel'

export const PLAYER_PROGRESS_STORAGE_KEY = 'roid:playerProgressV1' as const

export const PLAYER_PROGRESS_SNAPSHOT_VERSION = 1 as const

const VALID_VOXEL_KINDS = new Set<string>(Object.keys(VOXEL_KIND_DEFS))

const VALID_COMPUTRONIUM_IDS = new Set<string>(COMPUTRONIUM_UNLOCK_IDS)

const RESOURCE_ID_SET = new Set<string>(RESOURCE_IDS_ORDERED)

const ROOT_ID_SET = new Set<string>(ROOT_RESOURCE_IDS)

const PLAYER_TOOLS: ReadonlySet<string> = new Set<PlayerTool>([
  'pick',
  'inspect',
  'replicator',
  'seed',
  'reactor',
  'battery',
  'hub',
  'refinery',
  'hoover',
  'lifter',
  'cargoDrone',
  'orbitalLaser',
  'excavatingLaser',
  'scanner',
  'explosiveCharge',
  'depthScanner',
  'drossCollector',
  'scourge',
  'locust',
  'miningDrone',
  'computronium',
  'emCatapult',
  'drill',
])

export interface PlayerProgressUnlocksV1 {
  scourgeUnlocked: boolean
  locustUnlocked: boolean
  miningDroneUnlocked: boolean
  orbitalLaserUnlocked: boolean
  excavatingLaserUnlocked: boolean
  orbitalSatelliteCount: number
  excavatingSatelliteCount: number
  scannerLaserUnlocked: boolean
  scannerSatelliteCount: number
  depthScanUnlocked: boolean
  drossCollectorUnlocked: boolean
  drossCollectorSatelliteCount: number
  cargoDroneSatelliteCount: number
  emCatapultUnlocked: boolean
  explosiveChargeUnlocked: boolean
  lifterUnlocked: boolean
  cargoDroneToolUnlocked: boolean
  drillUnlocked: boolean
  debugUnlockAllTools: boolean
  computroniumUnlockPoints: number
  computroniumResearchOrder: ComputroniumUnlockId[]
  replicatorKillswitchEngaged: boolean
}

export interface PlayerProgressLifterFlightV1 {
  pos: { x: number; y: number; z: number }
  vel: { x: number; y: number; z: number }
  spawnMs: number
  discoveryPos: { x: number; y: number; z: number }
  units: number
  comp: Record<RootResourceId, number>
  originSource?: 'asteroid' | 'wreck'
}

/** Full run snapshot for localStorage (v1). */
export interface PlayerProgressSnapshotV1 {
  v: typeof PLAYER_PROGRESS_SNAPSHOT_VERSION
  savedAtMs: number
  gridSize: number
  currentSeed: number
  coreAsset: CoreAsset
  voxelCells: VoxelCell[]
  resourceTallies: Record<ResourceId, number>
  resourceTalliesFloatBaseline: Record<ResourceId, number>
  resourceTalliesBySource: ResourceTalliesBySource
  energyCurrent: number
  debugEnergyCapBonus: number
  selectedRefineryRoot: RefineryRecipeSelection
  unlocks: PlayerProgressUnlocksV1
  discoveryCounter: number
  discoveryConsumedPos: string[]
  pendingDiscoveries: DiscoveryOffer[]
  drossState: DrossState
  debrisState: DebrisState
  lifterFlights: PlayerProgressLifterFlightV1[]
  asteroidRotX: number
  asteroidRotY: number
  asteroidRotZ: number
  lastScanRefinedPreviewLine: string | null
  lastInspectHudLines: string[] | null
  sandboxMode: boolean
  selectedTool: PlayerTool
  notifiedRootForToolsDock: boolean
  notifiedComputroniumForToolsDock: boolean
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x)
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

function parseResourceTallies(raw: unknown): Record<ResourceId, number> | null {
  if (!isRecord(raw)) return null
  const out = {} as Record<ResourceId, number>
  for (const id of RESOURCE_IDS_ORDERED) {
    const v = raw[id]
    if (v === undefined) {
      out[id] = 0
      continue
    }
    if (!isFiniteNumber(v) || v < 0) return null
    out[id] = v
  }
  return out
}

function parseResourceTalliesBySource(raw: unknown): ResourceTalliesBySource | null {
  if (!isRecord(raw)) return null
  const ast = parseResourceTallies(raw.asteroid)
  const wr = parseResourceTallies(raw.wreck)
  if (!ast || !wr) return null
  return { asteroid: ast, wreck: wr }
}

function parseRootComposition(raw: unknown): Record<RootResourceId, number> | null {
  if (!isRecord(raw)) return null
  const out = {} as Record<RootResourceId, number>
  for (const id of ROOT_RESOURCE_IDS) {
    const v = raw[id]
    if (v === undefined) {
      out[id] = 0
      continue
    }
    if (!isFiniteNumber(v) || v < 0) return null
    out[id] = v
  }
  return out
}

function parseVoxelPos(raw: unknown): { x: number; y: number; z: number } | null {
  if (!isRecord(raw)) return null
  if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || !isFiniteNumber(raw.z)) return null
  return { x: raw.x, y: raw.y, z: raw.z }
}

const WRECK_ARCHETYPES = new Set<string>([
  'hullChunk',
  'truss',
  'cargoPod',
  'stationPanel',
  'antenna',
])

function parseVoxelCells(raw: unknown): VoxelCell[] | null {
  if (!Array.isArray(raw)) return null
  const out: VoxelCell[] = []
  for (const item of raw) {
    if (!isRecord(item)) return null
    const pos = parseVoxelPos(item.pos)
    if (!pos) return null
    const kind = item.kind
    if (typeof kind !== 'string' || !VALID_VOXEL_KINDS.has(kind)) return null
    if (!isFiniteNumber(item.hpRemaining) || item.hpRemaining < 0) return null
    out.push(item as unknown as VoxelCell)
  }
  return out
}

function parseCoreAsset(raw: unknown): CoreAsset | null {
  if (!isRecord(raw)) return null
  if (raw.id !== 'core-asset') return null
  if (raw.kind !== 'asteroid' && raw.kind !== 'wreck') return null
  if (!isFiniteNumber(raw.seed)) return null
  if (!isFiniteNumber(raw.gridSize)) return null
  if (raw.kind === 'asteroid') {
    if (raw.profile === undefined) return null
    return {
      id: 'core-asset',
      kind: 'asteroid',
      seed: raw.seed,
      gridSize: raw.gridSize,
      profile: raw.profile,
    }
  }
  if (typeof raw.archetype !== 'string' || !WRECK_ARCHETYPES.has(raw.archetype)) return null
  if (!isRecord(raw.profile)) return null
  return {
    id: 'core-asset',
    kind: 'wreck',
    seed: raw.seed,
    gridSize: raw.gridSize,
    archetype: raw.archetype as WreckArchetype,
    profile: raw.profile as CoreAsset extends { kind: 'wreck' } ? CoreAsset['profile'] : never,
  }
}

function parseResearchOrder(raw: unknown): ComputroniumUnlockId[] | null {
  if (!Array.isArray(raw)) return null
  const out: ComputroniumUnlockId[] = []
  for (const id of raw) {
    if (typeof id !== 'string' || !VALID_COMPUTRONIUM_IDS.has(id)) return null
    out.push(id as ComputroniumUnlockId)
  }
  if (out.length !== COMPUTRONIUM_RESEARCH_STEP_COUNT) return null
  const seen = new Set<string>()
  for (const id of out) {
    if (seen.has(id)) return null
    seen.add(id)
  }
  for (const id of COMPUTRONIUM_UNLOCK_IDS) {
    if (!seen.has(id)) return null
  }
  return out
}

function parseUnlocks(raw: unknown): PlayerProgressUnlocksV1 | null {
  if (!isRecord(raw)) return null
  const order = parseResearchOrder(raw.computroniumResearchOrder)
  if (!order) return null
  const intFields = [
    raw.orbitalSatelliteCount,
    raw.excavatingSatelliteCount,
    raw.scannerSatelliteCount,
    raw.drossCollectorSatelliteCount,
    raw.cargoDroneSatelliteCount,
  ]
  for (const n of intFields) {
    if (!isFiniteNumber(n) || n < 0 || !Number.isInteger(n)) return null
  }
  if (!isFiniteNumber(raw.computroniumUnlockPoints) || raw.computroniumUnlockPoints < 0) return null
  const bools = [
    'scourgeUnlocked',
    'locustUnlocked',
    'miningDroneUnlocked',
    'orbitalLaserUnlocked',
    'excavatingLaserUnlocked',
    'scannerLaserUnlocked',
    'depthScanUnlocked',
    'drossCollectorUnlocked',
    'emCatapultUnlocked',
    'explosiveChargeUnlocked',
    'lifterUnlocked',
    'cargoDroneToolUnlocked',
    'drillUnlocked',
    'debugUnlockAllTools',
    'replicatorKillswitchEngaged',
  ] as const
  for (const k of bools) {
    if (typeof raw[k] !== 'boolean') return null
  }
  return {
    scourgeUnlocked: raw.scourgeUnlocked as boolean,
    locustUnlocked: raw.locustUnlocked as boolean,
    miningDroneUnlocked: raw.miningDroneUnlocked as boolean,
    orbitalLaserUnlocked: raw.orbitalLaserUnlocked as boolean,
    excavatingLaserUnlocked: raw.excavatingLaserUnlocked as boolean,
    orbitalSatelliteCount: raw.orbitalSatelliteCount as number,
    excavatingSatelliteCount: raw.excavatingSatelliteCount as number,
    scannerLaserUnlocked: raw.scannerLaserUnlocked as boolean,
    scannerSatelliteCount: raw.scannerSatelliteCount as number,
    depthScanUnlocked: raw.depthScanUnlocked as boolean,
    drossCollectorUnlocked: raw.drossCollectorUnlocked as boolean,
    drossCollectorSatelliteCount: raw.drossCollectorSatelliteCount as number,
    cargoDroneSatelliteCount: raw.cargoDroneSatelliteCount as number,
    emCatapultUnlocked: raw.emCatapultUnlocked as boolean,
    explosiveChargeUnlocked: raw.explosiveChargeUnlocked as boolean,
    lifterUnlocked: raw.lifterUnlocked as boolean,
    cargoDroneToolUnlocked: raw.cargoDroneToolUnlocked as boolean,
    drillUnlocked: raw.drillUnlocked as boolean,
    debugUnlockAllTools: raw.debugUnlockAllTools as boolean,
    computroniumUnlockPoints: raw.computroniumUnlockPoints as number,
    computroniumResearchOrder: order,
    replicatorKillswitchEngaged: raw.replicatorKillswitchEngaged as boolean,
  }
}

function parseDrossState(raw: unknown): DrossState | null {
  if (!isRecord(raw)) return null
  if (!Array.isArray(raw.clusters)) return null
  if (!isRecord(raw.yieldRemainder)) return null
  const clusters: DrossState['clusters'] = []
  for (const c of raw.clusters) {
    if (!isRecord(c)) return null
    const pos = parseVoxelPos(c.pos)
    if (!pos) return null
    if (!isFiniteNumber(c.mass) || c.mass < 0) return null
    if (typeof c.kind !== 'string' || !VALID_VOXEL_KINDS.has(c.kind)) return null
    const bulk = parseRootComposition(c.bulk)
    if (!bulk) return null
    clusters.push({
      pos,
      mass: c.mass,
      kind: c.kind as VoxelKind,
      bulk,
    })
  }
  const yieldRemainder: DrossState['yieldRemainder'] = {}
  for (const id of RESOURCE_IDS_ORDERED) {
    const v = raw.yieldRemainder[id]
    if (v === undefined) continue
    if (!isFiniteNumber(v) || v < 0) return null
    yieldRemainder[id] = v
  }
  return { clusters, yieldRemainder }
}

function parseDebrisState(raw: unknown): DebrisState | null {
  if (!isRecord(raw)) return null
  if (!Array.isArray(raw.shards)) return null
  if (!isFiniteNumber(raw.nextId)) return null
  const shards: DebrisState['shards'] = []
  for (const s of raw.shards) {
    if (!isRecord(s)) return null
    if (!isFiniteNumber(s.id)) return null
    if (!isRecord(s.pos) || !isRecord(s.vel)) return null
    if (!isFiniteNumber(s.spawnTimeMs) || !isFiniteNumber(s.maxLifetimeMs)) return null
    if (!isRecord(s.bulk) || !isRecord(s.reward)) return null
    if (!isRecord(s.quat) || !isRecord(s.tintRgb)) return null
    shards.push(s as unknown as DebrisState['shards'][number])
  }
  return { shards, nextId: raw.nextId }
}

function parseLifterFlights(raw: unknown): PlayerProgressLifterFlightV1[] | null {
  if (!Array.isArray(raw)) return null
  const out: PlayerProgressLifterFlightV1[] = []
  for (const f of raw) {
    if (!isRecord(f)) return null
    const pos = parseVoxelPos(f.pos)
    const vel = parseVoxelPos(f.vel)
    const dp = parseVoxelPos(f.discoveryPos)
    if (!pos || !vel || !dp) return null
    if (!isFiniteNumber(f.spawnMs) || !isFiniteNumber(f.units)) return null
    const comp = parseRootComposition(f.comp)
    if (!comp) return null
    const lf: PlayerProgressLifterFlightV1 = {
      pos,
      vel,
      spawnMs: f.spawnMs,
      discoveryPos: dp,
      units: f.units,
      comp,
    }
    if (f.originSource === 'asteroid' || f.originSource === 'wreck') {
      lf.originSource = f.originSource
    }
    out.push(lf)
  }
  return out
}

function parseDiscoveryOffers(raw: unknown): DiscoveryOffer[] | null {
  if (!Array.isArray(raw)) return null
  const out: DiscoveryOffer[] = []
  for (const o of raw) {
    if (!isRecord(o)) return null
    if (typeof o.id !== 'string') return null
    const foundAt = parseVoxelPos(o.foundAt)
    if (!foundAt) return null
    if (typeof o.titleLine !== 'string') return null
    if (!Array.isArray(o.asciiArtLines) || !o.asciiArtLines.every((x) => typeof x === 'string')) return null
    if (!Array.isArray(o.bodyLines) || !o.bodyLines.every((x) => typeof x === 'string')) return null
    if (o.resourceSummaryLine !== null && typeof o.resourceSummaryLine !== 'string') return null
    if (
      o.archetype !== 'windfall' &&
      o.archetype !== 'drain' &&
      o.archetype !== 'lore' &&
      o.archetype !== 'researchBypass'
    ) {
      return null
    }
    if (!isRecord(o.resourceDelta)) return null
    for (const k of Object.keys(o.resourceDelta)) {
      if (!RESOURCE_ID_SET.has(k)) return null
      const v = o.resourceDelta[k]
      if (!isFiniteNumber(v)) return null
    }
    if (o.researchTierGrant !== null && o.researchTierGrant !== 1 && o.researchTierGrant !== 2 && o.researchTierGrant !== 3 && o.researchTierGrant !== 4) {
      return null
    }
    if (o.loreLogLine !== null && typeof o.loreLogLine !== 'string') return null
    out.push(o as unknown as DiscoveryOffer)
  }
  return out
}

function parseSelectedRefineryRoot(raw: unknown): RefineryRecipeSelection | null {
  if (typeof raw !== 'string') return null
  if (raw === 'idle') return 'idle'
  if (!ROOT_ID_SET.has(raw)) return null
  return raw as RootResourceId
}

function parseSelectedTool(raw: unknown): PlayerTool | null {
  if (typeof raw !== 'string' || !PLAYER_TOOLS.has(raw)) return null
  return raw as PlayerTool
}

/**
 * Parse and validate snapshot JSON. Returns null if invalid or grid mismatch.
 */
export function parsePlayerProgressSnapshot(
  parsed: unknown,
  expectedGridSize: number,
): PlayerProgressSnapshotV1 | null {
  if (!isRecord(parsed)) return null
  if (parsed.v !== PLAYER_PROGRESS_SNAPSHOT_VERSION) return null
  if (!isFiniteNumber(parsed.savedAtMs)) return null
  if (!isFiniteNumber(parsed.gridSize) || parsed.gridSize !== expectedGridSize) return null
  if (!isFiniteNumber(parsed.currentSeed)) return null
  const coreAsset = parseCoreAsset(parsed.coreAsset)
  if (!coreAsset) return null
  const cells = parseVoxelCells(parsed.voxelCells)
  if (!cells) return null
  const resourceTallies = parseResourceTallies(parsed.resourceTallies)
  const resourceTalliesFloatBaseline = parseResourceTallies(parsed.resourceTalliesFloatBaseline)
  const resourceTalliesBySource = parseResourceTalliesBySource(parsed.resourceTalliesBySource)
  if (!resourceTallies || !resourceTalliesFloatBaseline || !resourceTalliesBySource) return null
  if (!isFiniteNumber(parsed.energyCurrent) || parsed.energyCurrent < 0) return null
  if (!isFiniteNumber(parsed.debugEnergyCapBonus) || parsed.debugEnergyCapBonus < 0) return null
  const selectedRefineryRoot = parseSelectedRefineryRoot(parsed.selectedRefineryRoot)
  if (!selectedRefineryRoot) return null
  const unlocks = parseUnlocks(parsed.unlocks)
  if (!unlocks) return null
  if (!isFiniteNumber(parsed.discoveryCounter) || parsed.discoveryCounter < 0) return null
  if (!Array.isArray(parsed.discoveryConsumedPos) || !parsed.discoveryConsumedPos.every((x) => typeof x === 'string')) {
    return null
  }
  const pendingDiscoveries = parseDiscoveryOffers(parsed.pendingDiscoveries)
  if (!pendingDiscoveries) return null
  const drossState = parseDrossState(parsed.drossState)
  const debrisState = parseDebrisState(parsed.debrisState)
  const lifterFlights = parseLifterFlights(parsed.lifterFlights)
  if (!drossState || !debrisState || !lifterFlights) return null
  if (
    !isFiniteNumber(parsed.asteroidRotX) ||
    !isFiniteNumber(parsed.asteroidRotY) ||
    !isFiniteNumber(parsed.asteroidRotZ)
  ) {
    return null
  }
  if (parsed.lastScanRefinedPreviewLine !== null && typeof parsed.lastScanRefinedPreviewLine !== 'string') {
    return null
  }
  if (
    parsed.lastInspectHudLines !== null &&
    (!Array.isArray(parsed.lastInspectHudLines) || !parsed.lastInspectHudLines.every((x) => typeof x === 'string'))
  ) {
    return null
  }
  if (typeof parsed.sandboxMode !== 'boolean') return null
  const selectedTool = parseSelectedTool(parsed.selectedTool)
  if (!selectedTool) return null
  if (typeof parsed.notifiedRootForToolsDock !== 'boolean') return null
  if (typeof parsed.notifiedComputroniumForToolsDock !== 'boolean') return null

  return {
    v: PLAYER_PROGRESS_SNAPSHOT_VERSION,
    savedAtMs: parsed.savedAtMs,
    gridSize: parsed.gridSize,
    currentSeed: parsed.currentSeed,
    coreAsset,
    voxelCells: cells,
    resourceTallies,
    resourceTalliesFloatBaseline,
    resourceTalliesBySource,
    energyCurrent: parsed.energyCurrent,
    debugEnergyCapBonus: parsed.debugEnergyCapBonus,
    selectedRefineryRoot,
    unlocks,
    discoveryCounter: parsed.discoveryCounter,
    discoveryConsumedPos: parsed.discoveryConsumedPos.slice(),
    pendingDiscoveries,
    drossState,
    debrisState,
    lifterFlights,
    asteroidRotX: parsed.asteroidRotX,
    asteroidRotY: parsed.asteroidRotY,
    asteroidRotZ: parsed.asteroidRotZ,
    lastScanRefinedPreviewLine: parsed.lastScanRefinedPreviewLine,
    lastInspectHudLines: parsed.lastInspectHudLines,
    sandboxMode: parsed.sandboxMode,
    selectedTool,
    notifiedRootForToolsDock: parsed.notifiedRootForToolsDock,
    notifiedComputroniumForToolsDock: parsed.notifiedComputroniumForToolsDock,
  }
}

export function tryReadPlayerProgressFromLocalStorage(expectedGridSize: number): PlayerProgressSnapshotV1 | null {
  try {
    const raw = localStorage.getItem(PLAYER_PROGRESS_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return parsePlayerProgressSnapshot(parsed, expectedGridSize)
  } catch {
    return null
  }
}

export function tryWritePlayerProgressToLocalStorage(json: string): boolean {
  try {
    localStorage.setItem(PLAYER_PROGRESS_STORAGE_KEY, json)
    return true
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('[playerProgress] save failed', e)
    }
    return false
  }
}

export function clearPlayerProgressFromLocalStorage(): void {
  try {
    localStorage.removeItem(PLAYER_PROGRESS_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function serializePlayerProgressSnapshot(snapshot: PlayerProgressSnapshotV1): string {
  return JSON.stringify(snapshot)
}
