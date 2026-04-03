import { describe, expect, it } from 'vitest'
import { hasAnyRootResource, isGameplayToolRosterAllowed, isPhaseOnlyTool } from './toolRosterPolicy'
import type { InitialToolDebugConfig } from './computroniumSim'

function cfg(partial: Partial<InitialToolDebugConfig>): InitialToolDebugConfig {
  const base: InitialToolDebugConfig = {
    pick: true,
    inspect: true,
    hoover: true,
    replicator: true,
    seed: true,
    reactor: false,
    battery: false,
    hub: false,
    refinery: false,
    computronium: false,
    orbitalLaser: false,
    excavatingLaser: false,
    scanner: false,
    explosiveCharge: false,
    depthScanner: false,
    drossCollector: false,
    scourge: false,
    locust: false,
    miningDrone: false,
    lifter: false,
    cargoDrone: false,
    emCatapult: false,
  }
  return { ...base, ...partial }
}

describe('toolRosterPolicy', () => {
  it('hasAnyRootResource is false with empty tallies', () => {
    expect(hasAnyRootResource({})).toBe(false)
  })

  it('hasAnyRootResource is true when a root is positive', () => {
    expect(hasAnyRootResource({ regolithMass: 0.1 })).toBe(true)
  })

  it('isPhaseOnlyTool is true for orbital laser', () => {
    expect(isPhaseOnlyTool('orbitalLaser')).toBe(true)
  })

  it('allows phase-only tools regardless of debug starting-tools flags', () => {
    const allow = (t: keyof InitialToolDebugConfig) => cfg({ orbitalLaser: false })[t] === true
    expect(
      isGameplayToolRosterAllowed('orbitalLaser', {
        debugUnlockAllTools: false,
        isToolAllowedByInitialDebugConfig: allow,
        resourceTallies: {},
      }),
    ).toBe(true)
  })

  it('blocks replicator until first root when debug allows replicator', () => {
    const allow = (t: keyof InitialToolDebugConfig) => cfg({ replicator: true })[t] === true
    expect(
      isGameplayToolRosterAllowed('replicator', {
        debugUnlockAllTools: false,
        isToolAllowedByInitialDebugConfig: allow,
        resourceTallies: {},
      }),
    ).toBe(false)
    expect(
      isGameplayToolRosterAllowed('replicator', {
        debugUnlockAllTools: false,
        isToolAllowedByInitialDebugConfig: allow,
        resourceTallies: { silicates: 1 },
      }),
    ).toBe(true)
  })
})
