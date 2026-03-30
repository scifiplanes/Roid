import { cellParticipatesInDepthReveal } from './depthScannerSim'
import { compositeDensityMidpointGcm3 } from './compositionYields'
import { formatScanRefinedPreviewLine } from './scanVisualization'
import type { VoxelCell } from './voxelState'
import { hpForVoxelKind } from './voxelState'
import type { VoxelKind } from './voxelKinds'
import { getKindDef } from './voxelKinds'

const KIND_LABEL: Record<VoxelKind, string> = {
  regolith: 'Regolith',
  silicateRock: 'Silicate rock',
  metalRich: 'Metal-rich rock',
  processedMatter: 'Processed matter',
  replicator: 'Replicator',
  reactor: 'Reactor',
  battery: 'Battery',
  hub: 'Hub',
  refinery: 'Refinery',
  depthScanner: 'Depth scanner',
  computronium: 'Computronium',
}

export function voxelHasCompositionIntel(cell: VoxelCell): boolean {
  if (cell.surfaceScanTintRgb !== undefined) return true
  if (!cellParticipatesInDepthReveal(cell)) return false
  return (cell.depthRevealProgress ?? 0) > 0
}

function pushStructureNotes(lines: string[], cell: VoxelCell, nowMs: number): void {
  const { kind } = cell
  if (kind === 'hub') {
    lines.push(cell.hubDisabled === true ? 'Hub: standby' : 'Hub: active')
  }
  if (kind === 'refinery') {
    lines.push(cell.refineryDisabled === true ? 'Refinery: off' : 'Refinery: on')
  }
  if (kind === 'computronium') {
    lines.push(cell.computroniumDisabled === true ? 'Computronium: off' : 'Computronium: on')
  }
  if (kind === 'replicator') {
    if (cell.replicatorEating) lines.push('Replicator: consuming rock')
    else if (cell.replicatorActive) lines.push('Replicator: mature')
    else lines.push('Replicator')
  }
  if (kind === 'processedMatter' && cell.processedMatterUnits != null && cell.processedMatterUnits > 0) {
    lines.push(`Processed matter units: ${Math.round(cell.processedMatterUnits)}`)
  }
  const fuseEnd = cell.explosiveFuseEndMs
  if (fuseEnd != null && nowMs < fuseEnd) {
    lines.push('Explosive: armed (timed fuse)')
  }
}

/**
 * HUD lines for the Inspect tool (first line starts with `Inspect →`).
 */
export function formatInspectHudLines(cell: VoxelCell, nowMs: number): string[] {
  const { pos, kind } = cell
  const label = KIND_LABEL[kind]
  const lines: string[] = [`Inspect → (${pos.x}, ${pos.y}, ${pos.z}) · ${label}`]

  const def = getKindDef(kind)
  if (def.maxDurability > 0) {
    const maxHp = hpForVoxelKind(kind)
    lines.push(`HP: ${cell.hpRemaining} / ${maxHp}`)
  }

  pushStructureNotes(lines, cell, nowMs)

  const intel = voxelHasCompositionIntel(cell)
  if (!intel) {
    lines.push('Composition: unknown (surface- or depth-scan this region)')
    return lines
  }

  const d = cell.depthRevealProgress
  if (cellParticipatesInDepthReveal(cell) && d != null && d > 0 && d < 1) {
    lines.push(`Depth reveal: ${Math.round(d * 100)}%`)
  }

  lines.push(`Refined preview: ${formatScanRefinedPreviewLine(cell)}`)

  const bulk = cell.bulkComposition ?? cell.processedMatterRootComposition
  const rho = compositeDensityMidpointGcm3(bulk)
  if (Number.isFinite(rho)) {
    lines.push(`Bulk density (midpoint): ${rho.toFixed(2)} g/cm³`)
  }

  return lines
}
