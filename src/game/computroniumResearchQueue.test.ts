import { describe, expect, it } from 'vitest'
import { gameBalance } from './gameBalance'
import {
  buildComputroniumResearchOrder,
  COMPUTRONIUM_RESEARCH_STEP_COUNT,
  researchStepsCompleted,
  syncResearchFlagsFromPoints,
  type LaserUnlockApply,
} from './computroniumResearchQueue'

function emptyFlags(): LaserUnlockApply {
  return {
    orbitalLaserUnlocked: false,
    excavatingLaserUnlocked: false,
    scannerLaserUnlocked: false,
    depthScanUnlocked: false,
    drossCollectorUnlocked: false,
    emCatapultUnlocked: false,
    orbitalSatelliteCount: 0,
    excavatingSatelliteCount: 0,
    scannerSatelliteCount: 0,
    drossCollectorSatelliteCount: 0,
    cargoDroneSatelliteCount: 0,
    explosiveChargeUnlocked: false,
    scourgeUnlocked: false,
    locustUnlocked: false,
    miningDroneUnlocked: false,
    lifterUnlocked: false,
    cargoDroneToolUnlocked: false,
    drillUnlocked: false,
  }
}

describe('computroniumResearchQueue', () => {
  it('buildComputroniumResearchOrder is deterministic and permutes all ids', () => {
    const a = buildComputroniumResearchOrder(12345)
    const b = buildComputroniumResearchOrder(12345)
    const c = buildComputroniumResearchOrder(99999)
    expect(a.length).toBe(COMPUTRONIUM_RESEARCH_STEP_COUNT)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    const set = new Set(a)
    expect(set.size).toBe(a.length)
  })

  it('researchStepsCompleted matches floor(points / per)', () => {
    const per = gameBalance.computroniumPointsPerStage
    expect(researchStepsCompleted(0, per)).toBe(0)
    expect(researchStepsCompleted(per * 0.99, per)).toBe(0)
    expect(researchStepsCompleted(per * 1, per)).toBe(1)
    expect(researchStepsCompleted(per * 13, per)).toBe(COMPUTRONIUM_RESEARCH_STEP_COUNT)
  })

  it('syncResearchFlagsFromPoints unlocks one step per band', () => {
    const per = gameBalance.computroniumPointsPerStage
    const order = buildComputroniumResearchOrder(777)
    const flags = emptyFlags()
    syncResearchFlagsFromPoints(order, per * 0.5, gameBalance, flags)
    expect(
      [
        flags.orbitalLaserUnlocked,
        flags.excavatingLaserUnlocked,
        flags.scannerLaserUnlocked,
        flags.depthScanUnlocked,
        flags.explosiveChargeUnlocked,
        flags.drossCollectorUnlocked,
        flags.emCatapultUnlocked,
        flags.scourgeUnlocked,
        flags.locustUnlocked,
        flags.miningDroneUnlocked,
        flags.lifterUnlocked,
        flags.cargoDroneToolUnlocked,
      ].filter(Boolean).length,
    ).toBe(0)
    syncResearchFlagsFromPoints(order, per * 1.0, gameBalance, flags)
    expect(
      [
        flags.orbitalLaserUnlocked,
        flags.excavatingLaserUnlocked,
        flags.scannerLaserUnlocked,
        flags.depthScanUnlocked,
        flags.explosiveChargeUnlocked,
        flags.drossCollectorUnlocked,
        flags.emCatapultUnlocked,
        flags.scourgeUnlocked,
        flags.locustUnlocked,
        flags.miningDroneUnlocked,
        flags.lifterUnlocked,
        flags.cargoDroneToolUnlocked,
      ].filter(Boolean).length,
    ).toBe(1)
  })
})
