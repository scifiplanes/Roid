import { ROOT_RESOURCE_IDS, type ResourceId } from './resources'
import type { InitialToolDebugConfig } from './computroniumSim'
import type { PlayerTool } from '../ui/toolsPanel'

const PHASE_ONLY_TOOLS: ReadonlySet<PlayerTool> = new Set([
  'orbitalLaser',
  'excavatingLaser',
  'scanner',
  'explosiveCharge',
  'depthScanner',
  'reactor',
  'battery',
  'hub',
  'refinery',
  'computronium',
  'drossCollector',
  'emCatapult',
  'scourge',
  'locust',
  'miningDrone',
  'lifter',
  'cargoDrone',
  'drill',
])

/**
 * Tools whose dock visibility / selection is driven by structure phases, computronium research
 * phases, etc.—not by Debug → Starting tools alone.
 */
export function isPhaseOnlyTool(tool: PlayerTool): boolean {
  return PHASE_ONLY_TOOLS.has(tool)
}

export function hasAnyRootResource(
  tallies: Readonly<Partial<Record<ResourceId, number>>>,
): boolean {
  for (const id of ROOT_RESOURCE_IDS) {
    if ((tallies[id] ?? 0) > 0) return true
  }
  return false
}

export interface ToolRosterPolicyInput {
  debugUnlockAllTools: boolean
  isToolAllowedByInitialDebugConfig: (tool: keyof InitialToolDebugConfig) => boolean
  resourceTallies: Readonly<Partial<Record<ResourceId, number>>>
  /** At least one computronium voxel on the current asteroid (Seed tool only). */
  hasComputroniumVoxel: boolean
}

/** Roster + tool-switch allow (matches tools dock and `beforeToolChange` first guard). */
export function isGameplayToolRosterAllowed(tool: PlayerTool, p: ToolRosterPolicyInput): boolean {
  if (p.debugUnlockAllTools) return true
  if (isPhaseOnlyTool(tool)) return true
  if (tool === 'replicator') {
    return p.isToolAllowedByInitialDebugConfig(tool) && hasAnyRootResource(p.resourceTallies)
  }
  if (tool === 'seed') {
    return (
      p.isToolAllowedByInitialDebugConfig(tool) &&
      hasAnyRootResource(p.resourceTallies) &&
      p.hasComputroniumVoxel
    )
  }
  return p.isToolAllowedByInitialDebugConfig(tool as keyof InitialToolDebugConfig)
}
