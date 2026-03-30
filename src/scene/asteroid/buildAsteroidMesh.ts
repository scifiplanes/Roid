import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Vector3,
} from 'three'
import { compositeDepthScanSusceptibility } from '../../game/compositionYields'
import { cellParticipatesInDepthReveal } from '../../game/depthScannerSim'
import { gameBalance } from '../../game/gameBalance'
import type { ScanVisualizationDebug } from '../../game/scanVisualizationDebug'
import {
  blendBulkRockHintOntoBase,
  compositionToBulkRockHintColor,
  compositionToDepthScanColor,
  densityToHeatmapRgb,
  getActiveScanVisualizationDebug,
} from '../../game/scanVisualization'
import type { VoxelCell } from '../../game/voxelState'
import {
  getKindDef,
  REPLICATOR_PROCESSING_TINT,
  REPLICATOR_STOCK_TINT,
  REPLICATOR_STOCK_TINT_LERP,
  type VoxelKind,
} from '../../game/voxelKinds'
import { replicatorResourceFill01 } from '../../game/localStores'
import {
  addDepthOverlayAlphaMulAttribute,
  flagDepthOverlayAlphaMulNeedsUpdate,
  patchMeshStandardMaterialDepthOverlayAlphaMul,
  setDepthOverlayAlphaMulAt,
} from './depthOverlayAlphaInstancing'
import {
  addScanOverlayUnlitAttribute,
  flagScanOverlayUnlitNeedsUpdate,
  patchMeshStandardMaterialScanOverlayUnlit,
  setScanOverlayUnlitAt,
} from './scanOverlayUnlitInstancing'
import {
  addScanEmissiveSuppressAttribute,
  flagScanEmissiveSuppressNeedsUpdate,
  patchMeshStandardMaterialScanEmissiveSuppress,
  setScanEmissiveSuppressAt,
} from './scanEmissiveInstancing'

export interface AsteroidMeshOptions {
  /** World-space edge length of each voxel cube. */
  voxelSize: number
  /** Grid center in cell indices is (gridSize−1)/2; mesh is centered at origin. */
  gridSize: number
  /** Base rock color (instance tint multiplies kind tint × this). */
  baseColor?: Color
  /** Overrides default rock `MeshStandardMaterial.metalness` for solid + eating layers. */
  rockMetalness?: number
}

export interface AsteroidRenderBundle {
  group: Group
  /** Shared geometry; dispose once when replacing the bundle. */
  geometry: BoxGeometry
  solid: InstancedMesh
  eating: InstancedMesh
  reactor: InstancedMesh
  battery: InstancedMesh
  hub: InstancedMesh
  hubStandby: InstancedMesh
  refinery: InstancedMesh
  refineryStandby: InstancedMesh
  depthScanner: InstancedMesh
  computronium: InstancedMesh
  computroniumStandby: InstancedMesh
}

const _m = new Matrix4()
const _c = new Color()
const _blend = new Color()
const _depthBase = new Color()
const _depthCompose = new Color()
const _voidColor = new Color(0, 0, 0)
const _bulkRockHint = new Color()
const _depthHeatmap = new Color()
const _surfaceHeatmap = new Color()
const _debugLodeHeatmap = new Color()
const _depthSortInv = new Matrix4()
const _depthSortCamLocal = new Vector3()
/** Reused for depth-overlay back-to-front sort (avoid slice + O(n log n) world transforms in comparator). */
const _depthSortDistSq: number[] = []
const _depthSortOrder: number[] = []
const _depthSortCellCopy: number[] = []

/** Unrevealed depth cells: how much refined hue vs rock base (discriminability). */
const DEPTH_OVERLAY_HINT_LERP = 0.38
/** Brightness scales from unrevealed hint toward full tint visibility with reveal progress. */
const DEPTH_OVERLAY_SHADE_UNREVEALED = 0.58
const DEPTH_OVERLAY_SHADE_REVEALED = 1

function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function isEatingRock(cell: VoxelCell): boolean {
  return cell.replicatorEating === true && cell.kind !== 'replicator'
}

function kindUsesBulkRockHint(kind: VoxelKind): boolean {
  return (
    kind === 'regolith' ||
    kind === 'silicateRock' ||
    kind === 'metalRich' ||
    kind === 'processedMatter'
  )
}

function setCellMatrixAt(
  mesh: InstancedMesh,
  j: number,
  cell: VoxelCell,
  center: number,
  voxelSize: number,
): void {
  const { pos } = cell
  const px = (pos.x - center) * voxelSize
  const py = (pos.y - center) * voxelSize
  const pz = (pos.z - center) * voxelSize
  _m.makeTranslation(px, py, pz)
  mesh.setMatrixAt(j, _m)
}

/** Squared distance in asteroid local space (same ordering as world space for rigid `group` transform). */
function voxelCenterLocalDistSq(
  cell: VoxelCell,
  center: number,
  voxelSize: number,
  cameraLocal: Vector3,
): number {
  const { pos } = cell
  const px = (pos.x - center) * voxelSize
  const py = (pos.y - center) * voxelSize
  const pz = (pos.z - center) * voxelSize
  const dx = px - cameraLocal.x
  const dy = py - cameraLocal.y
  const dz = pz - cameraLocal.z
  return dx * dx + dy * dy + dz * dz
}

function sortRockCellIndicesByViewDistanceDesc(
  cellIndices: number[],
  count: number,
  cells: VoxelCell[],
  center: number,
  voxelSize: number,
  cameraLocal: Vector3,
): void {
  if (count <= 1) return
  while (_depthSortDistSq.length < count) _depthSortDistSq.push(0)
  while (_depthSortOrder.length < count) _depthSortOrder.push(0)
  while (_depthSortCellCopy.length < count) _depthSortCellCopy.push(0)
  for (let j = 0; j < count; j++) {
    _depthSortDistSq[j] = voxelCenterLocalDistSq(cells[cellIndices[j]!], center, voxelSize, cameraLocal)
    _depthSortOrder[j] = j
  }
  _depthSortOrder.length = count
  _depthSortOrder.sort((a, b) => {
    const da = _depthSortDistSq[a]!
    const db = _depthSortDistSq[b]!
    if (db !== da) return db - da
    return a - b
  })
  for (let j = 0; j < count; j++) _depthSortCellCopy[j] = cellIndices[_depthSortOrder[j]!]!
  for (let j = 0; j < count; j++) cellIndices[j] = _depthSortCellCopy[j]!
}

function minInstanceDistSqToCamera(
  mesh: InstancedMesh,
  cells: VoxelCell[],
  center: number,
  voxelSize: number,
  cameraLocal: Vector3,
): number {
  const cellIndices = mesh.userData.cellIndices as number[] | undefined
  if (!cellIndices || mesh.count <= 0) return Infinity
  let m = Infinity
  for (let j = 0; j < mesh.count; j++) {
    const d = voxelCenterLocalDistSq(cells[cellIndices[j]], center, voxelSize, cameraLocal)
    if (d < m) m = d
  }
  return m
}

/**
 * Back-to-front instance order for transparent rock: farthest voxel in slot 0, nearest in slot count−1.
 * Rewrites instance matrices; call {@link reapplyRockInstanceColors} after to refresh colors.
 * Updates `solid` / `eating` `renderOrder` when both layers are visible so the globally nearer layer draws last.
 */
export function sortDepthOverlayRockInstancesByViewDistance(
  bundle: AsteroidRenderBundle,
  cells: VoxelCell[],
  voxelSize: number,
  gridSize: number,
  cameraPosition: Vector3,
): void {
  const center = (gridSize - 1) / 2
  const { group, solid, eating } = bundle
  group.updateMatrixWorld(true)
  _depthSortInv.copy(group.matrixWorld).invert()
  _depthSortCamLocal.copy(cameraPosition).applyMatrix4(_depthSortInv)

  if (solid.visible && solid.count > 0) {
    const cellIndices = solid.userData.cellIndices as number[] | undefined
    if (cellIndices) {
      sortRockCellIndicesByViewDistanceDesc(
        cellIndices,
        solid.count,
        cells,
        center,
        voxelSize,
        _depthSortCamLocal,
      )
      for (let j = 0; j < solid.count; j++) {
        setCellMatrixAt(solid, j, cells[cellIndices[j]], center, voxelSize)
      }
      solid.instanceMatrix.needsUpdate = true
    }
  }

  if (eating.visible && eating.count > 0) {
    const cellIndices = eating.userData.cellIndices as number[] | undefined
    if (cellIndices) {
      sortRockCellIndicesByViewDistanceDesc(
        cellIndices,
        eating.count,
        cells,
        center,
        voxelSize,
        _depthSortCamLocal,
      )
      for (let j = 0; j < eating.count; j++) {
        setCellMatrixAt(eating, j, cells[cellIndices[j]], center, voxelSize)
      }
      eating.instanceMatrix.needsUpdate = true
    }
  }

  solid.renderOrder = 0
  eating.renderOrder = 0
  if (solid.visible && solid.count > 0 && eating.visible && eating.count > 0) {
    const minS = minInstanceDistSqToCamera(solid, cells, center, voxelSize, _depthSortCamLocal)
    const minE = minInstanceDistSqToCamera(eating, cells, center, voxelSize, _depthSortCamLocal)
    if (minE < minS) {
      eating.renderOrder = 1
    } else {
      solid.renderOrder = 1
    }
  }
}

/**
 * Solid + eating replicators + emissive reactor (teal) + hub (yellow) + refinery (orange-red) + battery (blue, pulsed in main).
 */
export function buildAsteroidMesh(cells: VoxelCell[], options: AsteroidMeshOptions): AsteroidRenderBundle {
  const {
    voxelSize,
    gridSize,
    baseColor = new Color(0.58, 0.52, 0.48),
    rockMetalness: rockMetalnessOpt,
  } = options
  const rockM = rockMetalnessOpt ?? 0.05
  const eatingM = rockMetalnessOpt !== undefined ? Math.min(0.32, rockMetalnessOpt + 0.015) : 0.06
  const center = (gridSize - 1) / 2
  const n = cells.length

  const baseGeometry = new BoxGeometry(voxelSize, voxelSize, voxelSize)

  const solidMat = new MeshStandardMaterial({
    color: baseColor,
    metalness: rockM,
    roughness: 0.92,
  })

  const eatingMat = new MeshStandardMaterial({
    color: baseColor,
    metalness: eatingM,
    roughness: 0.82,
    emissive: new Color(0.08, 0.72, 0.64),
    emissiveIntensity: 0.1,
  })

  const reactorMat = new MeshStandardMaterial({
    color: new Color(0.02, 0.2, 0.18),
    metalness: 0.22,
    roughness: 0.42,
    emissive: new Color(0.08, 0.95, 0.9),
    emissiveIntensity: 1.05,
  })

  const batteryMat = new MeshStandardMaterial({
    color: new Color(0.04, 0.08, 0.22),
    metalness: 0.18,
    roughness: 0.48,
    emissive: new Color(0.08, 0.18, 0.95),
    emissiveIntensity: 0.42,
  })

  const hubMat = new MeshStandardMaterial({
    color: new Color(0.18, 0.14, 0.02),
    metalness: 0.2,
    roughness: 0.45,
    emissive: new Color(0.96, 0.86, 0.14),
    emissiveIntensity: 0.55,
  })

  const hubStandbyMat = new MeshStandardMaterial({
    color: new Color(0.12, 0.11, 0.06),
    metalness: 0.12,
    roughness: 0.72,
    emissive: new Color(0.22, 0.18, 0.05),
    emissiveIntensity: 0.07,
  })

  const refineryMat = new MeshStandardMaterial({
    color: new Color(0.22, 0.06, 0.02),
    metalness: 0.22,
    roughness: 0.42,
    emissive: new Color(0.98, 0.38, 0.12),
    emissiveIntensity: 0.52,
  })

  const refineryStandbyMat = new MeshStandardMaterial({
    color: new Color(0.14, 0.06, 0.04),
    metalness: 0.14,
    roughness: 0.7,
    emissive: new Color(0.28, 0.1, 0.05),
    emissiveIntensity: 0.065,
  })

  const depthScannerMat = new MeshStandardMaterial({
    color: new Color(0.12, 0.08, 0.18),
    metalness: 0.2,
    roughness: 0.5,
    emissive: new Color(0.45, 0.22, 0.85),
    emissiveIntensity: 0.52,
  })

  const computroniumMat = new MeshStandardMaterial({
    color: new Color(0.2, 0.05, 0.26),
    metalness: 0.26,
    roughness: 0.4,
    emissive: new Color(0.78, 0.12, 0.95),
    emissiveIntensity: 0.92,
  })

  const computroniumStandbyMat = new MeshStandardMaterial({
    color: new Color(0.12, 0.09, 0.14),
    metalness: 0.11,
    roughness: 0.76,
    emissive: new Color(0.05, 0.03, 0.07),
    emissiveIntensity: 0.055,
  })

  for (const m of [
    eatingMat,
    reactorMat,
    batteryMat,
    hubMat,
    hubStandbyMat,
    refineryMat,
    refineryStandbyMat,
    depthScannerMat,
    computroniumMat,
    computroniumStandbyMat,
  ]) {
    patchMeshStandardMaterialScanEmissiveSuppress(m)
  }
  patchMeshStandardMaterialDepthOverlayAlphaMul(solidMat)
  patchMeshStandardMaterialDepthOverlayAlphaMul(eatingMat)
  patchMeshStandardMaterialScanOverlayUnlit(solidMat)
  patchMeshStandardMaterialScanOverlayUnlit(eatingMat)

  function emissiveInstancedMesh(
    mat: MeshStandardMaterial,
    maxInst: number,
    name: string,
    cellIndices: number[],
    withDepthOverlayAlpha = false,
  ): InstancedMesh {
    const geo = baseGeometry.clone()
    addScanEmissiveSuppressAttribute(geo, maxInst)
    if (withDepthOverlayAlpha) {
      addDepthOverlayAlphaMulAttribute(geo, maxInst)
      addScanOverlayUnlitAttribute(geo, maxInst)
    }
    const mesh = new InstancedMesh(geo, mat, maxInst)
    mesh.name = name
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    mesh.userData.cellIndices = cellIndices
    return mesh
  }

  const solidIndices: number[] = []
  const eatingIndices: number[] = []
  const reactorIndices: number[] = []
  const batteryIndices: number[] = []
  const hubIndices: number[] = []
  const hubStandbyIndices: number[] = []
  const refineryIndices: number[] = []
  const refineryStandbyIndices: number[] = []
  const depthScannerIndices: number[] = []
  const computroniumIndices: number[] = []
  const computroniumStandbyIndices: number[] = []
  for (let i = 0; i < n; i++) {
    const cell = cells[i]
    if (isEatingRock(cell)) eatingIndices.push(i)
    else if (cell.kind === 'reactor') reactorIndices.push(i)
    else if (cell.kind === 'battery') batteryIndices.push(i)
    else if (cell.kind === 'depthScanner') depthScannerIndices.push(i)
    else if (cell.kind === 'computronium' && cell.computroniumDisabled === true) {
      computroniumStandbyIndices.push(i)
    } else if (cell.kind === 'computronium') computroniumIndices.push(i)
    else if (cell.kind === 'hub' && cell.hubDisabled === true) hubStandbyIndices.push(i)
    else if (cell.kind === 'hub') hubIndices.push(i)
    else if (cell.kind === 'refinery' && cell.refineryDisabled === true) refineryStandbyIndices.push(i)
    else if (cell.kind === 'refinery') refineryIndices.push(i)
    else solidIndices.push(i)
  }

  const ns = Math.max(solidIndices.length, 1)
  const ne = Math.max(eatingIndices.length, 1)
  const nr = Math.max(reactorIndices.length, 1)
  const nb = Math.max(batteryIndices.length, 1)
  const nd = Math.max(depthScannerIndices.length, 1)
  const nh = Math.max(hubIndices.length, 1)
  const nhs = Math.max(hubStandbyIndices.length, 1)
  const nf = Math.max(refineryIndices.length, 1)
  const nfs = Math.max(refineryStandbyIndices.length, 1)
  const ncm = Math.max(computroniumIndices.length, 1)
  const ncs = Math.max(computroniumStandbyIndices.length, 1)

  addDepthOverlayAlphaMulAttribute(baseGeometry, ns)
  addScanOverlayUnlitAttribute(baseGeometry, ns)
  const solid = new InstancedMesh(baseGeometry, solidMat, ns)
  solid.name = 'asteroid-solid'
  solid.instanceMatrix.setUsage(DynamicDrawUsage)
  solid.userData.cellIndices = solidIndices

  const eating = emissiveInstancedMesh(eatingMat, ne, 'asteroid-eating', eatingIndices, true)
  const reactor = emissiveInstancedMesh(reactorMat, nr, 'asteroid-reactor', reactorIndices)
  const battery = emissiveInstancedMesh(batteryMat, nb, 'asteroid-battery', batteryIndices)
  const depthScanner = emissiveInstancedMesh(depthScannerMat, nd, 'asteroid-depth-scanner', depthScannerIndices)
  const hub = emissiveInstancedMesh(hubMat, nh, 'asteroid-hub', hubIndices)
  const hubStandby = emissiveInstancedMesh(hubStandbyMat, nhs, 'asteroid-hub-standby', hubStandbyIndices)
  const refinery = emissiveInstancedMesh(refineryMat, nf, 'asteroid-refinery', refineryIndices)
  const refineryStandby = emissiveInstancedMesh(
    refineryStandbyMat,
    nfs,
    'asteroid-refinery-standby',
    refineryStandbyIndices,
  )
  const computronium = emissiveInstancedMesh(computroniumMat, ncm, 'asteroid-computronium', computroniumIndices)
  const computroniumStandby = emissiveInstancedMesh(
    computroniumStandbyMat,
    ncs,
    'asteroid-computronium-standby',
    computroniumStandbyIndices,
  )

  const matureReplicatorTint = getKindDef('replicator').colorTint
  const scanVizForBuild = getActiveScanVisualizationDebug()

  if (n === 0) {
    _m.makeScale(0, 0, 0)
    _c.copy(baseColor).multiplyScalar(0.5)
    for (const mesh of [
      solid,
      eating,
      reactor,
      battery,
      depthScanner,
      computronium,
      computroniumStandby,
      hub,
      hubStandby,
      refinery,
      refineryStandby,
    ]) {
      mesh.setMatrixAt(0, _m)
      mesh.setColorAt(0, _c)
      mesh.count = 0
    }
    eating.visible = false
    reactor.visible = false
    battery.visible = false
    depthScanner.visible = false
    computronium.visible = false
    computroniumStandby.visible = false
    hub.visible = false
    hubStandby.visible = false
    refinery.visible = false
    refineryStandby.visible = false
  } else {
    for (let j = 0; j < solidIndices.length; j++) {
      const i = solidIndices[j]
      const cell = cells[i]
      setCellMatrixAt(solid, j, cell, center, voxelSize)
      const { pos, kind } = cell
      const rockDef = getKindDef(kind)
      let kindTint = rockDef.colorTint
      if (kind === 'replicator') {
        const fill = replicatorResourceFill01(cell)
        _blend.copy(matureReplicatorTint).lerp(REPLICATOR_STOCK_TINT, fill * REPLICATOR_STOCK_TINT_LERP)
        kindTint = _blend
      }
      const h = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
      const tv = 0.78 + (h % 40) / 200
      _c.copy(baseColor).multiply(kindTint).multiplyScalar(tv)
      if (kind === 'processedMatter') {
        _c.multiplyScalar(0.78)
      }
      if (kindUsesBulkRockHint(kind)) {
        compositionToBulkRockHintColor(cell, _bulkRockHint, scanVizForBuild)
        blendBulkRockHintOntoBase(_c, _bulkRockHint, scanVizForBuild.baseRockBulkHintLerp, _c)
      }
      solid.setColorAt(j, _c)
    }
    solid.count = solidIndices.length

    if (eatingIndices.length === 0) {
      _m.makeScale(0, 0, 0)
      eating.setMatrixAt(0, _m)
      eating.setColorAt(0, _c)
      eating.count = 0
      eating.visible = false
    } else {
      eating.visible = true
      for (let j = 0; j < eatingIndices.length; j++) {
        const i = eatingIndices[j]
        const cell = cells[i]
        setCellMatrixAt(eating, j, cell, center, voxelSize)
        const { pos, kind, hpRemaining } = cell
        const rockDef = getKindDef(kind)
        const maxHp = rockDef.maxDurability
        const tLinear = maxHp > 0 ? 1 - hpRemaining / maxHp : 0
        const t = tLinear * tLinear * (3 - 2 * tLinear)
        _blend.copy(rockDef.colorTint).lerp(REPLICATOR_PROCESSING_TINT, 0.12 + t * 0.88)
        const h = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.82 + (h % 40) / 200
        _c.copy(baseColor).multiply(_blend).multiplyScalar(tv)
        if (kindUsesBulkRockHint(kind)) {
          compositionToBulkRockHintColor(cell, _bulkRockHint, scanVizForBuild)
          blendBulkRockHintOntoBase(_c, _bulkRockHint, scanVizForBuild.baseRockBulkHintLerp * 0.72, _c)
        }
        eating.setColorAt(j, _c)
      }
      eating.count = eatingIndices.length
    }

    const reactorTint = getKindDef('reactor').colorTint
    if (reactorIndices.length === 0) {
      _m.makeScale(0, 0, 0)
      reactor.setMatrixAt(0, _m)
      reactor.setColorAt(0, _c)
      reactor.count = 0
      reactor.visible = false
    } else {
      reactor.visible = true
      for (let j = 0; j < reactorIndices.length; j++) {
        const i = reactorIndices[j]
        const cell = cells[i]
        setCellMatrixAt(reactor, j, cell, center, voxelSize)
        const { pos } = cell
        const h = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.88 + (h % 40) / 200
        _c.copy(baseColor).multiply(reactorTint).multiplyScalar(tv)
        reactor.setColorAt(j, _c)
      }
      reactor.count = reactorIndices.length
    }

    const batteryTint = getKindDef('battery').colorTint
    if (batteryIndices.length === 0) {
      _m.makeScale(0, 0, 0)
      battery.setMatrixAt(0, _m)
      battery.setColorAt(0, _c)
      battery.count = 0
      battery.visible = false
    } else {
      battery.visible = true
      for (let j = 0; j < batteryIndices.length; j++) {
        const i = batteryIndices[j]
        const cell = cells[i]
        setCellMatrixAt(battery, j, cell, center, voxelSize)
        const { pos } = cell
        const h = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.85 + (h % 40) / 200
        _c.copy(baseColor).multiply(batteryTint).multiplyScalar(tv)
        battery.setColorAt(j, _c)
      }
      battery.count = batteryIndices.length
    }

    const depthScannerTint = getKindDef('depthScanner').colorTint
    if (depthScannerIndices.length === 0) {
      _m.makeScale(0, 0, 0)
      depthScanner.setMatrixAt(0, _m)
      depthScanner.setColorAt(0, _c)
      depthScanner.count = 0
      depthScanner.visible = false
    } else {
      depthScanner.visible = true
      for (let j = 0; j < depthScannerIndices.length; j++) {
        const i = depthScannerIndices[j]
        const cell = cells[i]
        setCellMatrixAt(depthScanner, j, cell, center, voxelSize)
        const { pos } = cell
        const h = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.87 + (h % 40) / 200
        _c.copy(baseColor).multiply(depthScannerTint).multiplyScalar(tv)
        depthScanner.setColorAt(j, _c)
      }
      depthScanner.count = depthScannerIndices.length
    }

    const computroniumTint = getKindDef('computronium').colorTint
    if (computroniumIndices.length === 0) {
      _m.makeScale(0, 0, 0)
      computronium.setMatrixAt(0, _m)
      computronium.setColorAt(0, _c)
      computronium.count = 0
      computronium.visible = false
    } else {
      computronium.visible = true
      for (let j = 0; j < computroniumIndices.length; j++) {
        const i = computroniumIndices[j]
        const cell = cells[i]
        setCellMatrixAt(computronium, j, cell, center, voxelSize)
        const { pos } = cell
        const h = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.9 + (h % 40) / 200
        _c.copy(baseColor).multiply(computroniumTint).multiplyScalar(tv)
        computronium.setColorAt(j, _c)
      }
      computronium.count = computroniumIndices.length
    }

    if (computroniumStandbyIndices.length === 0) {
      _m.makeScale(0, 0, 0)
      computroniumStandby.setMatrixAt(0, _m)
      computroniumStandby.setColorAt(0, _c)
      computroniumStandby.count = 0
      computroniumStandby.visible = false
    } else {
      computroniumStandby.visible = true
      for (let j = 0; j < computroniumStandbyIndices.length; j++) {
        const i = computroniumStandbyIndices[j]
        const cell = cells[i]
        setCellMatrixAt(computroniumStandby, j, cell, center, voxelSize)
        const { pos } = cell
        const h = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.68 + (h % 40) / 200
        _c.copy(baseColor).multiply(computroniumTint).multiplyScalar(tv * 0.52)
        computroniumStandby.setColorAt(j, _c)
      }
      computroniumStandby.count = computroniumStandbyIndices.length
    }

    const hubTint = getKindDef('hub').colorTint
    if (hubIndices.length === 0) {
      _m.makeScale(0, 0, 0)
      hub.setMatrixAt(0, _m)
      hub.setColorAt(0, _c)
      hub.count = 0
      hub.visible = false
    } else {
      hub.visible = true
      for (let j = 0; j < hubIndices.length; j++) {
        const i = hubIndices[j]
        const cell = cells[i]
        setCellMatrixAt(hub, j, cell, center, voxelSize)
        const { pos } = cell
        const h = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.86 + (h % 40) / 200
        _c.copy(baseColor).multiply(hubTint).multiplyScalar(tv)
        hub.setColorAt(j, _c)
      }
      hub.count = hubIndices.length
    }

    if (hubStandbyIndices.length === 0) {
      _m.makeScale(0, 0, 0)
      hubStandby.setMatrixAt(0, _m)
      hubStandby.setColorAt(0, _c)
      hubStandby.count = 0
      hubStandby.visible = false
    } else {
      hubStandby.visible = true
      const hubStandbyTint = getKindDef('hub').colorTint
      for (let j = 0; j < hubStandbyIndices.length; j++) {
        const i = hubStandbyIndices[j]
        const cell = cells[i]
        setCellMatrixAt(hubStandby, j, cell, center, voxelSize)
        const { pos } = cell
        const h = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.72 + (h % 40) / 200
        _c.copy(baseColor).multiply(hubStandbyTint).multiplyScalar(tv * 0.55)
        hubStandby.setColorAt(j, _c)
      }
      hubStandby.count = hubStandbyIndices.length
    }

    const refineryTint = getKindDef('refinery').colorTint
    if (refineryIndices.length === 0) {
      _m.makeScale(0, 0, 0)
      refinery.setMatrixAt(0, _m)
      refinery.setColorAt(0, _c)
      refinery.count = 0
      refinery.visible = false
    } else {
      refinery.visible = true
      for (let j = 0; j < refineryIndices.length; j++) {
        const i = refineryIndices[j]
        const cell = cells[i]
        setCellMatrixAt(refinery, j, cell, center, voxelSize)
        const { pos } = cell
        const h = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.86 + (h % 40) / 200
        _c.copy(baseColor).multiply(refineryTint).multiplyScalar(tv)
        refinery.setColorAt(j, _c)
      }
      refinery.count = refineryIndices.length
    }

    if (refineryStandbyIndices.length === 0) {
      _m.makeScale(0, 0, 0)
      refineryStandby.setMatrixAt(0, _m)
      refineryStandby.setColorAt(0, _c)
      refineryStandby.count = 0
      refineryStandby.visible = false
    } else {
      refineryStandby.visible = true
      const standbyTint = getKindDef('refinery').colorTint
      for (let j = 0; j < refineryStandbyIndices.length; j++) {
        const i = refineryStandbyIndices[j]
        const cell = cells[i]
        setCellMatrixAt(refineryStandby, j, cell, center, voxelSize)
        const { pos } = cell
        const h = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.72 + (h % 40) / 200
        _c.copy(baseColor).multiply(standbyTint).multiplyScalar(tv * 0.55)
        refineryStandby.setColorAt(j, _c)
      }
      refineryStandby.count = refineryStandbyIndices.length
    }

    solid.instanceMatrix.needsUpdate = true
    if (solid.instanceColor) solid.instanceColor.needsUpdate = true
    eating.instanceMatrix.needsUpdate = true
    if (eating.instanceColor) eating.instanceColor.needsUpdate = true
    reactor.instanceMatrix.needsUpdate = true
    if (reactor.instanceColor) reactor.instanceColor.needsUpdate = true
    battery.instanceMatrix.needsUpdate = true
    if (battery.instanceColor) battery.instanceColor.needsUpdate = true
    depthScanner.instanceMatrix.needsUpdate = true
    if (depthScanner.instanceColor) depthScanner.instanceColor.needsUpdate = true
    hub.instanceMatrix.needsUpdate = true
    if (hub.instanceColor) hub.instanceColor.needsUpdate = true
    hubStandby.instanceMatrix.needsUpdate = true
    if (hubStandby.instanceColor) hubStandby.instanceColor.needsUpdate = true
    refinery.instanceMatrix.needsUpdate = true
    if (refinery.instanceColor) refinery.instanceColor.needsUpdate = true
    refineryStandby.instanceMatrix.needsUpdate = true
    if (refineryStandby.instanceColor) refineryStandby.instanceColor.needsUpdate = true
    computronium.instanceMatrix.needsUpdate = true
    if (computronium.instanceColor) computronium.instanceColor.needsUpdate = true
    computroniumStandby.instanceMatrix.needsUpdate = true
    if (computroniumStandby.instanceColor) computroniumStandby.instanceColor.needsUpdate = true
  }

  const group = new Group()
  group.name = 'asteroid'
  group.add(
    solid,
    eating,
    reactor,
    battery,
    depthScanner,
    computronium,
    computroniumStandby,
    hub,
    hubStandby,
    refinery,
    refineryStandby,
  )

  return {
    group,
    geometry: baseGeometry,
    solid,
    eating,
    reactor,
    battery,
    hub,
    hubStandby,
    refinery,
    refineryStandby,
    depthScanner,
    computronium,
    computroniumStandby,
  }
}

const _hlOrbital = new Color(0.35, 0.72, 1.0)
const _hlExcav = new Color(1.0, 0.48, 0.1)
const _hlExplosive = new Color(1.0, 0.14, 0.06)

const _scanTint = new Color()
const _scanTintHsl = { h: 0, s: 0, l: 0 }

/** Smoothstep on linear remap of `lode` from `[floor, 1]` to `[0, 1]` (0 below floor). */
function surfaceScanRareLodeRamp(lode: number, floor: number): number {
  if (lode <= floor) return 0
  const span = 1 - floor
  const u = span > 1e-9 ? (lode - floor) / span : 1
  const linear = Math.min(1, Math.max(0, u))
  return linear * linear * (3 - 2 * linear)
}

function scanEmissiveSuppressFactor(
  cellIndex: number,
  scannerTints: ReadonlyMap<number, Color> | null,
  scanDebug: ScanVisualizationDebug,
): number {
  if (!scanDebug.suppressEmissiveWhenScanned) return 1
  if (!scannerTints?.has(cellIndex)) return 1
  return 0
}

/**
 * Re-tints all instanced voxel colors (matches `buildAsteroidMesh` logic) with optional laser highlight
 * on `highlight` cell indices (solid + eating only) and optional scanner composition tint on any instance.
 * Order per rock cell: base → scanner lerp → laser highlight (laser wins on overlap).
 * Pass `null` highlight or `null` mode to skip laser. Pass `null` scannerTints to skip scan overlay.
 * `discoveryScanHintIndices` — eligible scanned discovery sites: opaque unlit bright red (does not roll discoveries).
 * `debugLodeDisplayIndices` — when set, those rock voxels are drawn with the lode-density heatmap (debug).
 * `highlightPulse` (e.g. 0.78–1 from sin) modulates brightness while the mouse is held or fuse blinks.
 */
export function reapplyRockInstanceColors(
  bundle: AsteroidRenderBundle,
  cells: VoxelCell[],
  options: AsteroidMeshOptions,
  scanDebug: ScanVisualizationDebug,
  highlight: ReadonlySet<number> | null,
  highlightMode: 'orbital' | 'excavating' | 'explosiveFuse' | null,
  highlightPulse = 1,
  scannerTints: ReadonlyMap<number, Color> | null = null,
  depthOverlayActive = false,
  discoveryScanHintIndices: ReadonlySet<number> | null = null,
  debugLodeDisplayIndices: ReadonlySet<number> | null = null,
): void {
  const { baseColor = new Color(0.58, 0.52, 0.48) } = options
  const {
    solid,
    eating,
    reactor,
    battery,
    depthScanner,
    computronium,
    computroniumStandby,
    hub,
    hubStandby,
    refinery,
    refineryStandby,
  } = bundle
  const matureReplicatorTint = getKindDef('replicator').colorTint

  function applyDepthOverlayRock(cell: VoxelCell, out: Color, cellIndex: number): void {
    if (!depthOverlayActive) return
    if (!cellParticipatesInDepthReveal(cell)) return
    const prog = Math.min(1, cell.depthRevealProgress ?? 0)
    const lode0 = cell.rareLodeStrength01 ?? 0
    const lodeFloor = gameBalance.depthOverlayLodeOpaqueStrengthFloor
    if (lode0 >= lodeFloor) {
      const d = Math.min(1, lode0 * prog)
      densityToHeatmapRgb(d, out)
      out.multiplyScalar(1.12)
      return
    }
    let compRgb = cell.depthTintRgb
    if (!compRgb) {
      compositionToDepthScanColor(cell, _depthCompose)
      compRgb = {
        r: _depthCompose.r,
        g: _depthCompose.g,
        b: _depthCompose.b,
      }
      cell.depthTintRgb = compRgb
    }
    const lode = lode0
    const density = Math.min(1, lode * prog)
    densityToHeatmapRgb(density, _depthHeatmap)
    const wHeat =
      gameBalance.depthOverlayHeatmapBlend * smoothstep01(0.015, 1, density)
    _blend.setRGB(compRgb.r, compRgb.g, compRgb.b)
    _blend.lerp(_depthHeatmap, wHeat)
    _depthBase.copy(out)
    const mix = DEPTH_OVERLAY_HINT_LERP + (1 - DEPTH_OVERLAY_HINT_LERP) * prog
    out.copy(_depthBase).lerp(_blend, mix)
    let shade =
      DEPTH_OVERLAY_SHADE_UNREVEALED + (DEPTH_OVERLAY_SHADE_REVEALED - DEPTH_OVERLAY_SHADE_UNREVEALED) * prog
    if (scannerTints?.has(cellIndex)) {
      shade = Math.min(1, shade * 1.07)
    }
    out.multiplyScalar(shade)

    const S = compositeDepthScanSusceptibility(cell.bulkComposition)
    const rockDef = getKindDef(cell.kind)
    const md = Math.max(0, rockDef.maxDurability)
    const durabilityNorm = Math.min(1, Math.max(0.25, md / 4))
    const durabilityFactor =
      1 + (durabilityNorm - 1) * gameBalance.depthOverlayDurabilityOpacityMix
    const byProg =
      gameBalance.depthOverlayRockOpacity +
      (gameBalance.depthOverlayScannedVoxelOpacity - gameBalance.depthOverlayRockOpacity) * prog
    let effectiveOpacity = Math.min(1, Math.max(0.05, byProg * durabilityFactor))
    const k = gameBalance.depthOverlaySusceptibilityOpacityBoost
    effectiveOpacity = effectiveOpacity + (1 - effectiveOpacity) * (1 - S) * k
    if (
      prog >= gameBalance.depthOverlaySolidRevealProgress ||
      lode >= gameBalance.depthOverlayLodeOpaqueStrengthFloor
    ) {
      effectiveOpacity = 1
    }
    out.lerp(_voidColor, 1 - effectiveOpacity)
  }

  function applyDiscoveryScanHint(cellIndex: number, out: Color): void {
    if (!discoveryScanHintIndices?.has(cellIndex)) return
    out.setRGB(1, 0.06, 0.06)
    out.multiplyScalar(2.2)
  }

  function applyScannerTint(cellIndex: number, out: Color): void {
    if (!scannerTints?.has(cellIndex)) return
    const cell = cells[cellIndex]!
    const lode = cell.rareLodeStrength01 ?? 0
    const floor = gameBalance.depthOverlayLodeOpaqueStrengthFloor
    if (lode >= floor) {
      const prog = Math.min(1, cell.depthRevealProgress ?? 0)
      const d = depthOverlayActive ? Math.min(1, lode * prog) : lode
      densityToHeatmapRgb(d, out)
      out.multiplyScalar(1.12)
      return
    }
    _scanTint.copy(scannerTints.get(cellIndex)!).multiplyScalar(scanDebug.applyTintRgbMul)
    _scanTint.getHSL(_scanTintHsl)
    _scanTintHsl.s = Math.min(1, _scanTintHsl.s * 1.06 + 0.02)
    _scanTint.setHSL(_scanTintHsl.h, _scanTintHsl.s, _scanTintHsl.l)
    _scanTint.r = Math.min(1, _scanTint.r)
    _scanTint.g = Math.min(1, _scanTint.g)
    _scanTint.b = Math.min(1, _scanTint.b)
    densityToHeatmapRgb(lode, _surfaceHeatmap)
    const lodeRamp = surfaceScanRareLodeRamp(lode, floor)
    _scanTint.lerp(_surfaceHeatmap, lodeRamp * gameBalance.surfaceScanLodeHeatmapBlend)
    const baseLerp = scanDebug.compositionLerp
    const boostMax = gameBalance.surfaceScanRareLodeLerpBoostMax
    const effectiveLerp = Math.min(1, baseLerp + (1 - baseLerp) * lodeRamp * boostMax)
    out.lerp(_scanTint, effectiveLerp)
  }

  function applyDebugLodeDisplay(cellIndex: number, cell: VoxelCell, out: Color): void {
    if (!debugLodeDisplayIndices?.has(cellIndex)) return
    const rl = cell.rareLodeStrength01
    if (rl === undefined || rl <= 1e-6) return
    densityToHeatmapRgb(rl, _debugLodeHeatmap)
    out.copy(_debugLodeHeatmap)
    out.multiplyScalar(1.12)
  }

  function computeDepthOverlayAlphaMulForCell(cell: VoxelCell): number {
    if (!depthOverlayActive) return 1
    if (!cellParticipatesInDepthReveal(cell)) return 1
    const prog = Math.min(1, cell.depthRevealProgress ?? 0)
    const lode = cell.rareLodeStrength01 ?? 0
    const d = Math.min(1, lode * prog)
    if (d < gameBalance.depthOverlayLodeFullOpacityMinDensity) return 1
    const rockOp = Math.max(0.05, gameBalance.depthOverlayRockOpacity)
    return Math.min(1 / rockOp, 25)
  }

  function applyLaserHighlight(cellIndex: number, out: Color): void {
    if (!highlight || !highlightMode || !highlight.has(cellIndex)) return
    if (highlightMode === 'explosiveFuse') {
      out.lerp(_hlExplosive, 0.88)
      out.multiplyScalar(2.45 * highlightPulse)
      return
    }
    const hc = highlightMode === 'orbital' ? _hlOrbital : _hlExcav
    const isOrb = highlightMode === 'orbital'
    const a = isOrb ? 0.78 : 0.72
    const bright = isOrb ? 2.05 : 1.92
    out.lerp(hc, a)
    out.multiplyScalar(bright * highlightPulse)
  }

  const solidIndices = solid.userData.cellIndices as number[] | undefined
  if (solidIndices && solid.count > 0) {
    for (let j = 0; j < solid.count; j++) {
      const i = solidIndices[j]
      const cell = cells[i]
      const { pos, kind } = cell
      const rockDef = getKindDef(kind)
      let kindTint = rockDef.colorTint
      if (kind === 'replicator') {
        const fill = replicatorResourceFill01(cell)
        _blend.copy(matureReplicatorTint).lerp(REPLICATOR_STOCK_TINT, fill * REPLICATOR_STOCK_TINT_LERP)
        kindTint = _blend
      }
      const h = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
      const tv = 0.78 + (h % 40) / 200
      _c.copy(baseColor).multiply(kindTint).multiplyScalar(tv)
      if (kind === 'processedMatter') {
        _c.multiplyScalar(0.78)
      }
      if (kindUsesBulkRockHint(kind)) {
        compositionToBulkRockHintColor(cell, _bulkRockHint, scanDebug)
        blendBulkRockHintOntoBase(_c, _bulkRockHint, scanDebug.baseRockBulkHintLerp, _c)
      }
      applyDepthOverlayRock(cell, _c, i)
      applyScannerTint(i, _c)
      applyDiscoveryScanHint(i, _c)
      applyDebugLodeDisplay(i, cell, _c)
      applyLaserHighlight(i, _c)
      solid.setColorAt(j, _c)
      const discoveryHint = discoveryScanHintIndices?.has(i) ?? false
      setScanOverlayUnlitAt(solid, j, discoveryHint ? 1 : 0)
      setDepthOverlayAlphaMulAt(
        solid,
        j,
        discoveryHint && depthOverlayActive
          ? Math.min(1 / Math.max(0.05, gameBalance.depthOverlayRockOpacity), 25)
          : computeDepthOverlayAlphaMulForCell(cell),
      )
    }
    if (solid.instanceColor) solid.instanceColor.needsUpdate = true
    flagDepthOverlayAlphaMulNeedsUpdate(solid)
    flagScanOverlayUnlitNeedsUpdate(solid)
  }

  if (eating.visible && eating.count > 0) {
    const eatingIndices = eating.userData.cellIndices as number[] | undefined
    if (eatingIndices) {
      for (let j = 0; j < eating.count; j++) {
        const i = eatingIndices[j]
        const cell = cells[i]
        const { pos, kind, hpRemaining } = cell
        const rockDef = getKindDef(kind)
        const maxHp = rockDef.maxDurability
        const tLinear = maxHp > 0 ? 1 - hpRemaining / maxHp : 0
        const t = tLinear * tLinear * (3 - 2 * tLinear)
        _blend.copy(rockDef.colorTint).lerp(REPLICATOR_PROCESSING_TINT, 0.12 + t * 0.88)
        const h = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.82 + (h % 40) / 200
        _c.copy(baseColor).multiply(_blend).multiplyScalar(tv)
        if (kindUsesBulkRockHint(kind)) {
          compositionToBulkRockHintColor(cell, _bulkRockHint, scanDebug)
          blendBulkRockHintOntoBase(_c, _bulkRockHint, scanDebug.baseRockBulkHintLerp * 0.72, _c)
        }
        applyDepthOverlayRock(cell, _c, i)
        applyScannerTint(i, _c)
        applyDiscoveryScanHint(i, _c)
        applyDebugLodeDisplay(i, cell, _c)
        applyLaserHighlight(i, _c)
        eating.setColorAt(j, _c)
        setScanEmissiveSuppressAt(eating, j, scanEmissiveSuppressFactor(i, scannerTints, scanDebug))
        const discoveryHintE = discoveryScanHintIndices?.has(i) ?? false
        setScanOverlayUnlitAt(eating, j, discoveryHintE ? 1 : 0)
        setDepthOverlayAlphaMulAt(
          eating,
          j,
          discoveryHintE && depthOverlayActive
            ? Math.min(1 / Math.max(0.05, gameBalance.depthOverlayRockOpacity), 25)
            : computeDepthOverlayAlphaMulForCell(cell),
        )
      }
      if (eating.instanceColor) eating.instanceColor.needsUpdate = true
      flagScanEmissiveSuppressNeedsUpdate(eating)
      flagDepthOverlayAlphaMulNeedsUpdate(eating)
      flagScanOverlayUnlitNeedsUpdate(eating)
    }
  }

  const reactorTint = getKindDef('reactor').colorTint
  if (reactor.visible && reactor.count > 0) {
    const reactorIndices = reactor.userData.cellIndices as number[] | undefined
    if (reactorIndices) {
      for (let j = 0; j < reactor.count; j++) {
        const i = reactorIndices[j]
        const cell = cells[i]
        const { pos } = cell
        const hh = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.88 + (hh % 40) / 200
        _c.copy(baseColor).multiply(reactorTint).multiplyScalar(tv)
        applyScannerTint(i, _c)
        applyLaserHighlight(i, _c)
        reactor.setColorAt(j, _c)
        setScanEmissiveSuppressAt(reactor, j, scanEmissiveSuppressFactor(i, scannerTints, scanDebug))
      }
      if (reactor.instanceColor) reactor.instanceColor.needsUpdate = true
      flagScanEmissiveSuppressNeedsUpdate(reactor)
    }
  }

  const batteryTint = getKindDef('battery').colorTint
  if (battery.visible && battery.count > 0) {
    const batteryIndices = battery.userData.cellIndices as number[] | undefined
    if (batteryIndices) {
      for (let j = 0; j < battery.count; j++) {
        const i = batteryIndices[j]
        const cell = cells[i]
        const { pos } = cell
        const hh = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.85 + (hh % 40) / 200
        _c.copy(baseColor).multiply(batteryTint).multiplyScalar(tv)
        applyScannerTint(i, _c)
        applyLaserHighlight(i, _c)
        battery.setColorAt(j, _c)
        setScanEmissiveSuppressAt(battery, j, scanEmissiveSuppressFactor(i, scannerTints, scanDebug))
      }
      if (battery.instanceColor) battery.instanceColor.needsUpdate = true
      flagScanEmissiveSuppressNeedsUpdate(battery)
    }
  }

  const depthScannerTint = getKindDef('depthScanner').colorTint
  if (depthScanner.visible && depthScanner.count > 0) {
    const depthScannerIndices = depthScanner.userData.cellIndices as number[] | undefined
    if (depthScannerIndices) {
      for (let j = 0; j < depthScanner.count; j++) {
        const i = depthScannerIndices[j]
        const cell = cells[i]
        const { pos } = cell
        const hh = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.87 + (hh % 40) / 200
        _c.copy(baseColor).multiply(depthScannerTint).multiplyScalar(tv)
        applyScannerTint(i, _c)
        applyLaserHighlight(i, _c)
        depthScanner.setColorAt(j, _c)
        setScanEmissiveSuppressAt(depthScanner, j, scanEmissiveSuppressFactor(i, scannerTints, scanDebug))
      }
      if (depthScanner.instanceColor) depthScanner.instanceColor.needsUpdate = true
      flagScanEmissiveSuppressNeedsUpdate(depthScanner)
    }
  }

  const hubTint = getKindDef('hub').colorTint
  if (hub.visible && hub.count > 0) {
    const hubIndices = hub.userData.cellIndices as number[] | undefined
    if (hubIndices) {
      for (let j = 0; j < hub.count; j++) {
        const i = hubIndices[j]
        const cell = cells[i]
        const { pos } = cell
        const hh = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.86 + (hh % 40) / 200
        _c.copy(baseColor).multiply(hubTint).multiplyScalar(tv)
        applyScannerTint(i, _c)
        applyLaserHighlight(i, _c)
        hub.setColorAt(j, _c)
        setScanEmissiveSuppressAt(hub, j, scanEmissiveSuppressFactor(i, scannerTints, scanDebug))
      }
      if (hub.instanceColor) hub.instanceColor.needsUpdate = true
      flagScanEmissiveSuppressNeedsUpdate(hub)
    }
  }

  if (hubStandby.visible && hubStandby.count > 0) {
    const hubStandbyIndices = hubStandby.userData.cellIndices as number[] | undefined
    if (hubStandbyIndices) {
      for (let j = 0; j < hubStandby.count; j++) {
        const i = hubStandbyIndices[j]
        const cell = cells[i]
        const { pos } = cell
        const hh = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.72 + (hh % 40) / 200
        _c.copy(baseColor).multiply(hubTint).multiplyScalar(tv * 0.55)
        applyScannerTint(i, _c)
        applyLaserHighlight(i, _c)
        hubStandby.setColorAt(j, _c)
        setScanEmissiveSuppressAt(hubStandby, j, scanEmissiveSuppressFactor(i, scannerTints, scanDebug))
      }
      if (hubStandby.instanceColor) hubStandby.instanceColor.needsUpdate = true
      flagScanEmissiveSuppressNeedsUpdate(hubStandby)
    }
  }

  const refineryTint = getKindDef('refinery').colorTint
  if (refinery.visible && refinery.count > 0) {
    const refineryIndices = refinery.userData.cellIndices as number[] | undefined
    if (refineryIndices) {
      for (let j = 0; j < refinery.count; j++) {
        const i = refineryIndices[j]
        const cell = cells[i]
        const { pos } = cell
        const hh = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.86 + (hh % 40) / 200
        _c.copy(baseColor).multiply(refineryTint).multiplyScalar(tv)
        applyScannerTint(i, _c)
        applyLaserHighlight(i, _c)
        refinery.setColorAt(j, _c)
        setScanEmissiveSuppressAt(refinery, j, scanEmissiveSuppressFactor(i, scannerTints, scanDebug))
      }
      if (refinery.instanceColor) refinery.instanceColor.needsUpdate = true
      flagScanEmissiveSuppressNeedsUpdate(refinery)
    }
  }

  if (refineryStandby.visible && refineryStandby.count > 0) {
    const refineryStandbyIndices = refineryStandby.userData.cellIndices as number[] | undefined
    if (refineryStandbyIndices) {
      for (let j = 0; j < refineryStandby.count; j++) {
        const i = refineryStandbyIndices[j]
        const cell = cells[i]
        const { pos } = cell
        const hh = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.72 + (hh % 40) / 200
        _c.copy(baseColor).multiply(refineryTint).multiplyScalar(tv * 0.55)
        applyScannerTint(i, _c)
        applyLaserHighlight(i, _c)
        refineryStandby.setColorAt(j, _c)
        setScanEmissiveSuppressAt(refineryStandby, j, scanEmissiveSuppressFactor(i, scannerTints, scanDebug))
      }
      if (refineryStandby.instanceColor) refineryStandby.instanceColor.needsUpdate = true
      flagScanEmissiveSuppressNeedsUpdate(refineryStandby)
    }
  }

  const computroniumTint = getKindDef('computronium').colorTint
  if (computronium.visible && computronium.count > 0) {
    const computroniumIndices = computronium.userData.cellIndices as number[] | undefined
    if (computroniumIndices) {
      for (let j = 0; j < computronium.count; j++) {
        const i = computroniumIndices[j]
        const cell = cells[i]
        const { pos } = cell
        const hh = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.9 + (hh % 40) / 200
        _c.copy(baseColor).multiply(computroniumTint).multiplyScalar(tv)
        applyScannerTint(i, _c)
        applyLaserHighlight(i, _c)
        computronium.setColorAt(j, _c)
        setScanEmissiveSuppressAt(computronium, j, scanEmissiveSuppressFactor(i, scannerTints, scanDebug))
      }
      if (computronium.instanceColor) computronium.instanceColor.needsUpdate = true
      flagScanEmissiveSuppressNeedsUpdate(computronium)
    }
  }

  if (computroniumStandby.visible && computroniumStandby.count > 0) {
    const computroniumStandbyIndices = computroniumStandby.userData.cellIndices as number[] | undefined
    if (computroniumStandbyIndices) {
      for (let j = 0; j < computroniumStandby.count; j++) {
        const i = computroniumStandbyIndices[j]
        const cell = cells[i]
        const { pos } = cell
        const hh = (pos.x * 73 + pos.y * 137 + pos.z * 211) >>> 0
        const tv = 0.68 + (hh % 40) / 200
        _c.copy(baseColor).multiply(computroniumTint).multiplyScalar(tv * 0.52)
        applyScannerTint(i, _c)
        applyLaserHighlight(i, _c)
        computroniumStandby.setColorAt(j, _c)
        setScanEmissiveSuppressAt(computroniumStandby, j, scanEmissiveSuppressFactor(i, scannerTints, scanDebug))
      }
      if (computroniumStandby.instanceColor) computroniumStandby.instanceColor.needsUpdate = true
      flagScanEmissiveSuppressNeedsUpdate(computroniumStandby)
    }
  }
}

const depthOverlayMatLast = new WeakMap<AsteroidRenderBundle, { active: boolean; opacity: number }>()

export function setDepthOverlayRockMaterials(
  bundle: AsteroidRenderBundle,
  active: boolean,
  rockOpacity: number,
): void {
  const a = Math.min(1, Math.max(0.05, rockOpacity))
  const prev = depthOverlayMatLast.get(bundle)
  if (prev && prev.active === active && prev.opacity === a) return
  depthOverlayMatLast.set(bundle, { active, opacity: a })

  const solid = bundle.solid.material as MeshStandardMaterial
  const eating = bundle.eating.material as MeshStandardMaterial
  solid.transparent = active
  eating.transparent = active
  solid.opacity = active ? a : 1
  eating.opacity = active ? a : 1
  solid.depthWrite = !active
  eating.depthWrite = !active
  if (!active) {
    bundle.solid.renderOrder = 0
    bundle.eating.renderOrder = 0
  }
}

export function disposeAsteroidBundle(bundle: AsteroidRenderBundle): void {
  const seen = new Set<BufferGeometry>()
  const disposeGeo = (g: BufferGeometry): void => {
    if (seen.has(g)) return
    seen.add(g)
    g.dispose()
  }
  disposeGeo(bundle.geometry)
  for (const mesh of [
    bundle.solid,
    bundle.eating,
    bundle.reactor,
    bundle.battery,
    bundle.depthScanner,
    bundle.computronium,
    bundle.computroniumStandby,
    bundle.hub,
    bundle.hubStandby,
    bundle.refinery,
    bundle.refineryStandby,
  ]) {
    if (mesh.geometry !== bundle.geometry) disposeGeo(mesh.geometry)
  }
  const mats = [
    bundle.solid.material,
    bundle.eating.material,
    bundle.reactor.material,
    bundle.battery.material,
    bundle.depthScanner.material,
    bundle.computronium.material,
    bundle.computroniumStandby.material,
    bundle.hub.material,
    bundle.hubStandby.material,
    bundle.refinery.material,
    bundle.refineryStandby.material,
  ]
  for (const m of mats) {
    if (!Array.isArray(m)) m.dispose()
  }
}

/** Map raycast hit to `voxelCells` index. */
export function cellIndexFromAsteroidHit(
  hit:
    | {
        object: unknown
        instanceId?: number
      }
    | undefined,
): number | null {
  if (!hit || hit.instanceId === undefined || hit.instanceId < 0) return null
  const mesh = hit.object as InstancedMesh
  const arr = mesh.userData.cellIndices as number[] | undefined
  if (!arr || hit.instanceId >= arr.length) return null
  return arr[hit.instanceId]
}
