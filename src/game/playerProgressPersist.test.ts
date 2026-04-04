import { describe, expect, it } from 'vitest'
import { COMPUTRONIUM_UNLOCK_IDS } from './computroniumResearchQueue'
import { createEmptyResourceTallies } from './resources'
import {
  parsePlayerProgressSnapshot,
  PLAYER_PROGRESS_SNAPSHOT_VERSION,
  serializePlayerProgressSnapshot,
  type PlayerProgressSnapshotV1,
} from './playerProgressPersist'

const GRID = 33

function minimalSnapshot(): PlayerProgressSnapshotV1 {
  const tallies = createEmptyResourceTallies()
  const bySource = { asteroid: createEmptyResourceTallies(), wreck: createEmptyResourceTallies() }
  return {
    v: PLAYER_PROGRESS_SNAPSHOT_VERSION,
    savedAtMs: 1_700_000_000_000,
    gridSize: GRID,
    currentSeed: 42,
    coreAsset: {
      id: 'core-asset',
      kind: 'asteroid',
      seed: 42,
      gridSize: GRID,
      profile: {},
    },
    voxelCells: [
      {
        pos: { x: 16, y: 16, z: 16 },
        kind: 'regolith',
        hpRemaining: 1,
        bulkComposition: {
          regolithMass: 1,
          silicates: 0,
          metals: 0,
          volatiles: 0,
          sulfides: 0,
          oxides: 0,
          carbonaceous: 0,
          hydrates: 0,
          ices: 0,
          refractories: 0,
          phosphates: 0,
          halides: 0,
        },
        rareLodeStrength01: 0,
      },
    ],
    resourceTallies: { ...tallies },
    resourceTalliesFloatBaseline: { ...tallies },
    resourceTalliesBySource: {
      asteroid: { ...bySource.asteroid },
      wreck: { ...bySource.wreck },
    },
    energyCurrent: 0,
    debugEnergyCapBonus: 0,
    selectedRefineryRoot: 'regolithMass',
    unlocks: {
      scourgeUnlocked: false,
      locustUnlocked: false,
      miningDroneUnlocked: false,
      orbitalLaserUnlocked: false,
      excavatingLaserUnlocked: false,
      orbitalSatelliteCount: 0,
      excavatingSatelliteCount: 0,
      scannerLaserUnlocked: false,
      scannerSatelliteCount: 0,
      depthScanUnlocked: false,
      drossCollectorUnlocked: false,
      drossCollectorSatelliteCount: 0,
      cargoDroneSatelliteCount: 0,
      emCatapultUnlocked: false,
      explosiveChargeUnlocked: false,
      lifterUnlocked: false,
      cargoDroneToolUnlocked: false,
      drillUnlocked: false,
      debugUnlockAllTools: false,
      computroniumUnlockPoints: 0,
      computroniumResearchOrder: COMPUTRONIUM_UNLOCK_IDS.slice() as PlayerProgressSnapshotV1['unlocks']['computroniumResearchOrder'],
      replicatorKillswitchEngaged: false,
    },
    discoveryCounter: 0,
    discoveryConsumedPos: [],
    pendingDiscoveries: [],
    drossState: { clusters: [], yieldRemainder: {} },
    debrisState: { shards: [], nextId: 1 },
    lifterFlights: [],
    asteroidRotX: 0,
    asteroidRotY: 0,
    asteroidRotZ: 0,
    lastScanRefinedPreviewLine: null,
    lastInspectHudLines: null,
    sandboxMode: false,
    selectedTool: 'pick',
    notifiedRootForToolsDock: false,
    notifiedComputroniumForToolsDock: false,
  }
}

describe('playerProgressPersist', () => {
  it('round-trips a minimal snapshot through JSON', () => {
    const original = minimalSnapshot()
    const json = serializePlayerProgressSnapshot(original)
    const parsed: unknown = JSON.parse(json)
    const again = parsePlayerProgressSnapshot(parsed, GRID)
    expect(again).not.toBeNull()
    expect(again!.v).toBe(PLAYER_PROGRESS_SNAPSHOT_VERSION)
    expect(again!.currentSeed).toBe(42)
    expect(again!.voxelCells.length).toBe(1)
    expect(again!.voxelCells[0]!.kind).toBe('regolith')
    expect(again!.selectedTool).toBe('pick')
  })

  it('rejects wrong grid size', () => {
    const original = minimalSnapshot()
    const json = serializePlayerProgressSnapshot(original)
    expect(parsePlayerProgressSnapshot(JSON.parse(json) as unknown, 32)).toBeNull()
  })

  it('accepts fractional computroniumUnlockPoints (runtime uses float accumulation)', () => {
    const original = minimalSnapshot()
    original.unlocks.computroniumUnlockPoints = 48.384
    const json = serializePlayerProgressSnapshot(original)
    const again = parsePlayerProgressSnapshot(JSON.parse(json) as unknown, GRID)
    expect(again).not.toBeNull()
    expect(again!.unlocks.computroniumUnlockPoints).toBe(48.384)
  })
})
