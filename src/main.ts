import './style.css'
import {
  loadMatterHudCollapsed,
  loadMatterHudCompact,
  saveMatterHudCollapsed,
  saveMatterHudCompact,
} from './ui/uiLayoutPrefs'
import {
  Color,
  DirectionalLightHelper,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Raycaster,
  Vector2,
  Vector3,
} from 'three'
import { KEY_LIGHT_INTENSITY_BASE, setupScene } from './scene/setupScene'
import { setSunFromAngles } from './scene/sunAngles'
import { createOrbitControls } from './scene/controls'
import {
  generateAsteroidVoxels,
  type VoxelPos,
} from './scene/asteroid/generateAsteroidVoxels'
import { applyImpactCraters } from './scene/asteroid/impactCraters'
import {
  buildAsteroidMesh,
  disposeAsteroidBundle,
  reapplyRockInstanceColors,
  setDepthOverlayRockMaterials,
  sortDepthOverlayRockInstancesByViewDistance,
  type AsteroidRenderBundle,
} from './scene/asteroid/buildAsteroidMesh'
import { raycastFirstOccupiedCellIndex } from './game/voxelGridRaycast'
import { compositionToYields } from './game/compositionYields'
import { deriveAsteroidProfile, formatProfileFingerprint } from './game/asteroidGenProfile'
import { enrichVoxelCells, hpForVoxelKind, type VoxelCell } from './game/voxelState'
import type { VoxelKind } from './game/voxelKinds'
import { resourceHudCssColorForId } from './game/resourceOriginDepth'
import {
  addResourceYields,
  createEmptyResourceTallies,
  defaultUniformRootComposition,
  formatEnergyHudLine,
  formatResourceCostWithTallies,
  matterHudRefinedEntries,
  matterHudRootEntries,
  REFINED_MATERIAL_IDS_FOR_SCAN,
  RESOURCE_DEFS,
  ROOT_RESOURCE_IDS,
  type ResourceId,
  type RootResourceId,
} from './game/resources'
import {
  canAfford,
  computeEnergyCap,
  getScaledExplosiveChargeArmCost,
  getScaledReplicatorPlaceCost,
  getScaledSatelliteDeployCost,
  stepEnergy,
  tryConvertCellToDepthScannerWithMeta,
  tryConvertReplicatorToComputronium,
  tryConvertReplicatorToKind,
  tryPayResources,
  trySpendEnergy,
  type StructureConvertKind,
} from './game/energyAndStructures'
import {
  countActiveComputronium,
  getDepthScanToolUiPhase,
  getDrossCollectorDeployUiPhase,
  getExplosiveChargeToolUiPhase,
  getLaserToolUiPhase,
  stepComputronium,
  type LaserUnlockApply,
} from './game/computroniumSim'
import {
  applyDiscoveryAccept,
  discoveryPosKey,
  isDiscoverySite,
  tryDiscoveryClaim,
  type DiscoveryOffer,
} from './game/discoveryGen'
import { loadDiscoveryAutoResolve, saveDiscoveryAutoResolve } from './game/discoveryUiPrefs'
import {
  createDrossState,
  resetDrossState,
  spawnDrossFromRemovedCell,
  spawnDrossReplicatorScrap,
  stepDrossCollection,
  totalDrossMass,
} from './game/drossSim'
import {
  batteryToolUnlocked,
  computroniumToolUnlocked,
  getStructureToolUiPhase as structureToolPhaseFromCells,
  hubToolUnlocked,
  reactorToolUnlocked,
  refineryToolUnlocked,
} from './game/structureToolPrereqs'
import {
  applyFrameShake,
  createMineRippleElement,
  onMiningHitFeedback,
  onMiningHitFeedbackVisualOnly,
  playReplicatorConsumeClicks,
  startExcavatingLaserSustain,
  startOrbitalLaserSustain,
  stopExcavatingLaserSustain,
  stopOrbitalLaserSustain,
  playHubToggle,
  playRefineryToggle,
  playReplicatorPlaceClick,
  playScanPing,
  playExplosiveChargeDetonation,
  undoFrameShake,
} from './game/clickFeedback'
import { gameBalance, initGameBalanceFromPersisted } from './game/gameBalance'
import { applySfxReverbFromBalance } from './game/sfxReverbBus'
import persistedSnapshot from './game/gameBalance.persisted.json' with { type: 'json' }
import musicDebugSnapshot from './game/asteroidMusicDebug.persisted.json' with { type: 'json' }
import { createDefaultAsteroidMusicDebug } from './game/asteroidMusicDebug'
import {
  createDefaultSunLightDebug,
  randomAsteroidAxisRotationRad,
  randomKeyLightIntensityFactorForAsteroid,
  randomRotationDegPerSecForAsteroid,
  randomSunAnglesForAsteroid,
} from './game/sunLightDebug'
import { initAsteroidMusicDebugFromPersisted, schedulePersistAsteroidMusicDebug } from './game/asteroidMusicPersist'
import {
  countStructureVoxelsForMusic,
  createAsteroidAmbientMusic,
} from './game/asteroidAmbientMusic'
import { loadMusicVolumeLinear, saveMusicVolumeLinear } from './game/musicVolume'
import {
  loadOverlayVisualizationPrefs,
  saveOverlayVisualizationPrefs,
} from './game/overlayVisualizationPrefs'
import {
  loadPersistedScanVisualizationDebug,
  schedulePersistScanVisualizationDebug,
} from './game/scanVisualizationPersist'
import { createDefaultAudioMasterDebug } from './game/audioMasterDebug'
import {
  loadPersistedAudioMasterDebug,
  schedulePersistAudioMasterDebug,
} from './game/audioMasterPersist'
import {
  applyAudioMasterDebug,
  setAudioMasterDebugGetter,
} from './game/masterOutputChain'
import { createOverlaysMenu } from './ui/overlaysMenu'
import { createSettingsMenu } from './ui/settingsMenu'
import { updateDrossFog } from './scene/drossFog'
import { createDrossParticlesGroup } from './scene/drossParticles'
import { createSatelliteDotsGroup } from './scene/satelliteDots'
import { createDiscoveryModal } from './ui/discoveryModal'
import {
  createSatelliteInspectModal,
  type SatelliteInspectKind,
} from './ui/satelliteInspectModal'
import { createToolsPanel, type LaserSatelliteRowSnapshot, type PlayerTool } from './ui/toolsPanel'
import { stepDepthReveal } from './game/depthScannerSim'
import { formatInspectHudLines } from './game/inspectVoxel'
import {
  clearDepthRevealState,
  clearSurfaceScanTint,
  compositionToScanColor,
  formatScanRefinedPreviewLine,
  setScanVisualizationDebugGetter,
} from './game/scanVisualization'
import { createDefaultScanVisualizationDebug } from './game/scanVisualizationDebug'
import { resetReplicatorSimAccumulators, stepReplicators } from './game/replicatorSim'
import { stepHubs } from './game/hubSim'
import { stepRefineryProcessing } from './game/refineryProcessSim'
import { ensureAudioContextInitialized } from './game/audioContext'
import { autoLoadBundledDebugPreset } from './game/autoLoadDebugPreset'

await autoLoadBundledDebugPreset()

initGameBalanceFromPersisted(persistedSnapshot)

let musicVolumeLinear = loadMusicVolumeLinear()
const asteroidMusicDebug = createDefaultAsteroidMusicDebug()
const sunLightDebug = createDefaultSunLightDebug()
const scanVisualizationDebug = createDefaultScanVisualizationDebug()
Object.assign(scanVisualizationDebug, loadPersistedScanVisualizationDebug())
setScanVisualizationDebugGetter(() => scanVisualizationDebug)
const audioMasterDebug = createDefaultAudioMasterDebug()
Object.assign(audioMasterDebug, loadPersistedAudioMasterDebug())
setAudioMasterDebugGetter(() => audioMasterDebug)
initAsteroidMusicDebugFromPersisted(musicDebugSnapshot, asteroidMusicDebug)
const asteroidAmbientMusic = createAsteroidAmbientMusic({
  getDebug: () => asteroidMusicDebug,
  getMusicVolume: () => musicVolumeLinear,
})

const app = document.querySelector<HTMLDivElement>('#app')!
app.replaceChildren()

const viewport = document.createElement('div')
viewport.id = 'viewport'
app.appendChild(viewport)

const initializeAudio = async () => {
  await ensureAudioContextInitialized()
  asteroidAmbientMusic.tryEnsureGraph()
}

const audioEventOptions = { passive: true }

viewport.addEventListener('pointerdown', () => void initializeAudio(), audioEventOptions)
viewport.addEventListener('pointerup', () => void initializeAudio(), audioEventOptions)
viewport.addEventListener('touchstart', () => void initializeAudio(), audioEventOptions)
viewport.addEventListener('touchend', () => void initializeAudio(), audioEventOptions)
viewport.addEventListener('mousedown', () => void initializeAudio(), audioEventOptions)

document.addEventListener('click', () => void initializeAudio(), audioEventOptions)
document.addEventListener('focus', () => void initializeAudio(), audioEventOptions)

const { scene, camera, renderer, sun, stepStarfield } = setupScene(viewport)
sun.intensity = KEY_LIGHT_INTENSITY_BASE * randomKeyLightIntensityFactorForAsteroid()

const SUN_RADIUS = Math.hypot(8, 12, 10)
const startSunAngles = randomSunAnglesForAsteroid()
let sunAzimuthDeg = startSunAngles.azimuthDeg
let sunElevationDeg = startSunAngles.elevationDeg

let asteroidRotX = 0
let asteroidRotY = 0
let asteroidRotZ = 0
function randomizeAsteroidOrientation(): void {
  const r = randomAsteroidAxisRotationRad()
  asteroidRotX = r.x
  asteroidRotY = r.y
  asteroidRotZ = r.z
}
function applyAsteroidGroupRotation(): void {
  asteroidBundle.group.rotation.set(asteroidRotX, asteroidRotY, asteroidRotZ)
}

function applySunFromState(): void {
  setSunFromAngles(sun, sunAzimuthDeg, sunElevationDeg, SUN_RADIUS)
}

applySunFromState()
randomizeAsteroidOrientation()

let sunDirectionHelper: DirectionalLightHelper | null = null

function syncSunDirectionHelper(): void {
  if (sunLightDebug.showSunHelper) {
    if (!sunDirectionHelper) {
      sunDirectionHelper = new DirectionalLightHelper(sun, 8, 0xffddaa)
      scene.add(sunDirectionHelper)
    }
  } else if (sunDirectionHelper) {
    scene.remove(sunDirectionHelper)
    sunDirectionHelper.dispose()
    sunDirectionHelper = null
  }
}

function onLightAngleChange(azimuthDeg: number, elevationDeg: number): void {
  sunElevationDeg = elevationDeg
  if (!sunLightDebug.rotateSunAzimuth) {
    sunAzimuthDeg = azimuthDeg
  }
  applySunFromState()
}

const gridSize = 33
const voxelSize = 0.92

let currentSeed = 42
let asteroidProfile = deriveAsteroidProfile(currentSeed)
const positions = applyImpactCraters(
  generateAsteroidVoxels({
    gridSize,
    seed: currentSeed,
    ...asteroidProfile.shape,
  }),
  gridSize,
  currentSeed,
  asteroidProfile,
  gameBalance.impactCraterRangeMult,
  gameBalance.impactCraterRadiusMinVoxels,
  gameBalance.impactCraterRadiusMaxVoxels,
  gameBalance.impactCraterCountMin,
  gameBalance.impactCraterCountMax,
)
let voxelCells: VoxelCell[] = enrichVoxelCells(positions, {
  seed: currentSeed,
  gridSize,
  baseRadius: asteroidProfile.shape.baseRadius,
  noiseAmplitude: asteroidProfile.shape.noiseAmplitude,
  profile: asteroidProfile,
})

/** Cached for ambient music tick; updated in `replaceAsteroidMesh`. */
let structureVoxelCountForMusic = 0

let voxelPosToIndex: Map<string, number> | null = null
function voxelPosKey(p: VoxelPos): string {
  return `${p.x},${p.y},${p.z}`
}
function invalidateVoxelPosIndexMap(): void {
  voxelPosToIndex = null
}
function getVoxelPosIndexMap(): Map<string, number> {
  if (!voxelPosToIndex) {
    voxelPosToIndex = new Map()
    for (let i = 0; i < voxelCells.length; i++) {
      voxelPosToIndex.set(voxelPosKey(voxelCells[i].pos), i)
    }
  }
  return voxelPosToIndex
}

let asteroidBundle: AsteroidRenderBundle = buildAsteroidMesh(voxelCells, {
  voxelSize,
  gridSize,
  baseColor: new Color(
    asteroidProfile.rockBaseColorRgb.r,
    asteroidProfile.rockBaseColorRgb.g,
    asteroidProfile.rockBaseColorRgb.b,
  ),
  rockMetalness: asteroidProfile.rockMetalness,
})
scene.add(asteroidBundle.group)
applyAsteroidGroupRotation()
structureVoxelCountForMusic = countStructureVoxelsForMusic(voxelCells)

const drossState = createDrossState()
const drossParticles = createDrossParticlesGroup()
asteroidBundle.group.add(drossParticles.group)

let orbitVisualRadius = asteroidProfile.shape.baseRadius * voxelSize * 1.5
const satelliteDots = createSatelliteDotsGroup()
satelliteDots.setCounts(0, 0, 0, 0, orbitVisualRadius)
scene.add(satelliteDots.group)

const controls = createOrbitControls(camera, renderer.domElement)

const resourceTallies = createEmptyResourceTallies()
const DEBUG_RESOURCE_GRANT: Partial<Record<ResourceId, number>> = (() => {
  const roots: Partial<Record<ResourceId, number>> = {
    regolithMass: 50,
    silicates: 50,
    metals: 50,
    volatiles: 50,
    sulfides: 50,
    oxides: 50,
    carbonaceous: 50,
    hydrates: 50,
    ices: 50,
    refractories: 50,
    phosphates: 50,
    halides: 50,
  }
  const refined: Partial<Record<ResourceId, number>> = {}
  for (const id of REFINED_MATERIAL_IDS_FOR_SCAN) refined[id] = 30
  return { ...roots, ...refined }
})()
/** Debug-only flat cap bonus (reset on Regenerate asteroid). Not persisted. */
let debugEnergyCapBonus = 0
const DEBUG_ENERGY_GRANT = 50
/** Per click; matches one battery voxel's nominal storage at mult 1. */
const DEBUG_ENERGY_CAP_STEP = 80
const energyState = { current: 0 }

const matterHudWrap = document.createElement('div')
matterHudWrap.className = 'matter-hud-wrap'

let matterHudCompact = loadMatterHudCompact()
function syncMatterHudCompactUi(): void {
  matterHudWrap.classList.toggle('matter-hud-wrap--spacious', !matterHudCompact)
}
syncMatterHudCompactUi()

const matterHudShell = document.createElement('div')
matterHudShell.className = 'matter-hud-shell'

const matterHudMinBtn = document.createElement('button')
matterHudMinBtn.type = 'button'
matterHudMinBtn.className = 'matter-hud-minimize'
matterHudMinBtn.setAttribute('aria-controls', 'matter-hud')

const MATTER_HUD_ICON_MIN = `<svg class="matter-hud-minimize-svg" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect fill="currentColor" x="1" y="9" width="10" height="2" /></svg>`
const MATTER_HUD_ICON_EXPAND = `<svg class="matter-hud-minimize-svg" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M5 1h2v4h4v2H7v4H5V7H1V5h4V1z" /></svg>`

const discoveryHudStrip = document.createElement('div')
discoveryHudStrip.className = 'discovery-hud-strip'
discoveryHudStrip.setAttribute('aria-label', 'Pending discoveries')
discoveryHudStrip.hidden = true

const matterHud = document.createElement('div')
matterHud.id = 'matter-hud'

const pendingDiscoveries: DiscoveryOffer[] = []
let discoveryAutoResolve = loadDiscoveryAutoResolve()

let matterHudCollapsed = loadMatterHudCollapsed()

function syncMatterHudUi(): void {
  matterHudShell.classList.toggle('matter-hud-shell--collapsed', matterHudCollapsed)
  matterHudMinBtn.setAttribute('aria-expanded', String(!matterHudCollapsed))
  matterHudMinBtn.innerHTML = matterHudCollapsed ? MATTER_HUD_ICON_EXPAND : MATTER_HUD_ICON_MIN
  matterHudMinBtn.setAttribute('aria-label', matterHudCollapsed ? 'Expand resource HUD' : 'Minimize resource HUD')
  matterHudMinBtn.title = matterHudCollapsed ? 'Show resource HUD' : 'Hide resource HUD'
}

syncMatterHudUi()

matterHudMinBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  matterHudCollapsed = !matterHudCollapsed
  saveMatterHudCollapsed(matterHudCollapsed)
  syncMatterHudUi()
})

matterHudShell.append(matterHudMinBtn, matterHud)
matterHudWrap.append(discoveryHudStrip, matterHudShell)
viewport.appendChild(matterHudWrap)

const pickRipple = createMineRippleElement()
viewport.appendChild(pickRipple)

const overlayVizLoaded = loadOverlayVisualizationPrefs()
let surfaceScanOverlayVisible = overlayVizLoaded.surfaceScanOverlayVisible
let depthOverlayVisible = overlayVizLoaded.depthOverlayVisible

function persistOverlayVisualizationPrefs(): void {
  saveOverlayVisualizationPrefs({ surfaceScanOverlayVisible, depthOverlayVisible })
}
/** Last scanner hit refined-material preview (HUD); cleared on regenerate. */
let lastScanRefinedPreviewLine: string | null = null
/** Last Inspect tool readout (HUD); cleared on regenerate. */
let lastInspectHudLines: string[] | null = null

function hasAnyDepthScannerVoxel(): boolean {
  for (let i = 0; i < voxelCells.length; i++) {
    if (voxelCells[i].kind === 'depthScanner') return true
  }
  return false
}

function depthOverlayUnlocked(): boolean {
  return depthScanUnlocked && hasAnyDepthScannerVoxel()
}

function depthOverlayTintActive(): boolean {
  return depthOverlayVisible && depthOverlayUnlocked()
}

function syncDepthOverlayMaterials(): void {
  setDepthOverlayRockMaterials(
    asteroidBundle,
    depthOverlayTintActive(),
    gameBalance.depthOverlayRockOpacity,
  )
}

const surfaceScanTintMapScratch = new Color()
const surfaceScanTintIndexMapReuse = new Map<number, Color>()
const tintColorBorrowPool: Color[] = []
let tintColorBorrowNext = 0

function resetTintColorBorrowPool(): void {
  tintColorBorrowNext = 0
}

function borrowTintColorForScanMap(): Color {
  if (tintColorBorrowNext >= tintColorBorrowPool.length) tintColorBorrowPool.push(new Color())
  return tintColorBorrowPool[tintColorBorrowNext++]!
}

/**
 * Colors for the surface-scan overlay: recomputed from live composition + debug each frame so
 * tints match `compositionToScanColor` / legend when sliders change (`surfaceScanTintRgb` only
 * marks voxels that have been scanned).
 */
function buildSurfaceScanTintIndexMap(): Map<number, Color> | null {
  if (!surfaceScanOverlayVisible) return null
  resetTintColorBorrowPool()
  const m = surfaceScanTintIndexMapReuse
  m.clear()
  for (let i = 0; i < voxelCells.length; i++) {
    if (voxelCells[i].surfaceScanTintRgb === undefined) continue
    compositionToScanColor(voxelCells[i], surfaceScanTintMapScratch)
    const c = borrowTintColorForScanMap()
    c.copy(surfaceScanTintMapScratch)
    m.set(i, c)
  }
  return m.size > 0 ? m : null
}

function reapplyAllRockColorsNoLaser(): void {
  reapplyRockInstanceColors(
    asteroidBundle,
    voxelCells,
    { voxelSize, gridSize },
    scanVisualizationDebug,
    null,
    null,
    1,
    buildSurfaceScanTintIndexMap(),
    depthOverlayTintActive(),
    buildDiscoveryScanHintIndices(),
  )
  syncDepthOverlayMaterials()
}

let refreshToolCosts: () => void = () => {}

/** When true, matter HUD must rebuild (tallies, scan/inspect lines, etc.). Energy line is handled separately. */
let matterHudDirty = true
let lastMatterHudEnergyLine = ''

function markMatterHudDirty(): void {
  matterHudDirty = true
}

setResourceHud()

function appendMatterHudPlainLine(frag: DocumentFragment, text: string): void {
  frag.appendChild(document.createTextNode(text))
  frag.appendChild(document.createElement('br'))
}

function appendMatterHudColoredResourceLine(
  frag: DocumentFragment,
  entries: readonly { id: ResourceId; n: number }[],
): void {
  for (let i = 0; i < entries.length; i++) {
    const { id, n } = entries[i]!
    const span = document.createElement('span')
    span.className = 'matter-hud-res'
    span.style.color = resourceHudCssColorForId(id)
    span.textContent = `${RESOURCE_DEFS[id].hudAbbrev} ${n}`
    frag.appendChild(span)
    if (i < entries.length - 1) frag.appendChild(document.createTextNode(', '))
  }
  frag.appendChild(document.createElement('br'))
}

function setResourceHud(): void {
  const cap = computeEnergyCap(voxelCells, debugEnergyCapBonus)
  const frag = document.createDocumentFragment()
  appendMatterHudPlainLine(frag, formatProfileFingerprint(asteroidProfile))
  const roots = matterHudRootEntries(resourceTallies)
  if (roots.length > 0) appendMatterHudColoredResourceLine(frag, roots)
  const refined = matterHudRefinedEntries(resourceTallies)
  if (refined.length > 0) appendMatterHudColoredResourceLine(frag, refined)
  if (lastScanRefinedPreviewLine) {
    appendMatterHudPlainLine(frag, `Scan → ${lastScanRefinedPreviewLine}`)
  }
  if (lastInspectHudLines) {
    for (const line of lastInspectHudLines) {
      appendMatterHudPlainLine(frag, line)
    }
  }
  appendMatterHudPlainLine(frag, formatEnergyHudLine(energyState.current, cap))
  matterHud.replaceChildren(frag)
  lastMatterHudEnergyLine = formatEnergyHudLine(energyState.current, cap)
  matterHudDirty = false
  refreshToolCosts()
}

function replaceAsteroidMesh(cells: VoxelCell[]): void {
  drossParticles.group.removeFromParent()
  scene.remove(asteroidBundle.group)
  disposeAsteroidBundle(asteroidBundle)
  asteroidBundle = buildAsteroidMesh(cells, {
    voxelSize,
    gridSize,
    baseColor: new Color(
      asteroidProfile.rockBaseColorRgb.r,
      asteroidProfile.rockBaseColorRgb.g,
      asteroidProfile.rockBaseColorRgb.b,
    ),
    rockMetalness: asteroidProfile.rockMetalness,
  })
  scene.add(asteroidBundle.group)
  asteroidBundle.group.add(drossParticles.group)
  applyAsteroidGroupRotation()
  invalidateVoxelPosIndexMap()
  if (laserPointerDown || excavatingLaserPointerDown) {
    refreshLaserRockHighlightColors()
  } else if (hasActiveExplosiveFuse(performance.now())) {
    refreshExplosiveFuseRockColors()
  } else {
    reapplyAllRockColorsNoLaser()
  }
  syncOverlaysDepthRow()
  structureVoxelCountForMusic = countStructureVoxelsForMusic(voxelCells)
}

let syncSunRotationSpeedUi: () => void = () => {}

function regenerateAsteroid(): void {
  currentSeed = Math.floor(Math.random() * 0xffffffff) >>> 0
  asteroidProfile = deriveAsteroidProfile(currentSeed)
  const nextPositions = applyImpactCraters(
    generateAsteroidVoxels({
      gridSize,
      seed: currentSeed,
      ...asteroidProfile.shape,
    }),
    gridSize,
    currentSeed,
    asteroidProfile,
    gameBalance.impactCraterRangeMult,
    gameBalance.impactCraterRadiusMinVoxels,
    gameBalance.impactCraterRadiusMaxVoxels,
    gameBalance.impactCraterCountMin,
    gameBalance.impactCraterCountMax,
  )
  voxelCells = enrichVoxelCells(nextPositions, {
    seed: currentSeed,
    gridSize,
    baseRadius: asteroidProfile.shape.baseRadius,
    noiseAmplitude: asteroidProfile.shape.noiseAmplitude,
    profile: asteroidProfile,
  })
  orbitVisualRadius = asteroidProfile.shape.baseRadius * voxelSize * 1.5
  resetReplicatorSimAccumulators()
  Object.assign(resourceTallies, createEmptyResourceTallies())
  lastScanRefinedPreviewLine = null
  lastInspectHudLines = null
  debugEnergyCapBonus = 0
  energyState.current = 0
  orbitalLaserUnlocked = false
  excavatingLaserUnlocked = false
  orbitalSatelliteCount = 0
  excavatingSatelliteCount = 0
  scannerLaserUnlocked = false
  scannerSatelliteCount = 0
  depthScanUnlocked = false
  drossCollectorUnlocked = false
  drossCollectorSatelliteCount = 0
  debugUnlockAllTools = false
  computroniumUnlockPoints.current = 0
  discoveryCounter.current = 0
  discoveryConsumedPos.clear()
  pendingDiscoveries.length = 0
  syncDiscoveryHud()
  resetDrossState(drossState)
  invalidateVoxelPosIndexMap()
  setResourceHud()
  const nextSun = randomSunAnglesForAsteroid()
  sunAzimuthDeg = nextSun.azimuthDeg
  sunElevationDeg = nextSun.elevationDeg
  applySunFromState()
  randomizeAsteroidOrientation()
  replaceAsteroidMesh(voxelCells)
  setSelectedTool('pick', { skipBeforeToolChange: true })
  satelliteInspectModal.hide()
  satelliteDots.setCounts(0, 0, 0, 0, orbitVisualRadius)
  asteroidAmbientMusic.setSeed(currentSeed)
  asteroidAmbientMusic.resetVoiceSmoothing()
  sunLightDebug.rotationDegPerSec = randomRotationDegPerSecForAsteroid()
  sun.intensity = KEY_LIGHT_INTENSITY_BASE * randomKeyLightIntensityFactorForAsteroid()
  syncLightAngleSliders(sunAzimuthDeg, sunElevationDeg)
  syncSunRotationSpeedUi()
}

let setSelectedTool: (tool: PlayerTool, options?: { skipBeforeToolChange?: boolean }) => void = () => {}

let orbitalLaserUnlocked = false
let excavatingLaserUnlocked = false
let scannerLaserUnlocked = false
let depthScanUnlocked = false
let orbitalSatelliteCount = 0
let excavatingSatelliteCount = 0
let scannerSatelliteCount = 0
let drossCollectorUnlocked = false
let drossCollectorSatelliteCount = 0
/** Debug cheat: bypass structure gates, explosive research gate (Settings → Unlock all tools). Reset on Regenerate. */
let debugUnlockAllTools = false

/** Cumulative unlock points from active computronium (reset on Regenerate). */
const computroniumUnlockPoints = { current: 0 }

/** Discovery modal RNG counter; reset on Regenerate. */
const discoveryCounter = { current: 0 }
/** Positions (`x,y,z`) that have already triggered a discovery claim this run. */
const discoveryConsumedPos = new Set<string>()

/**
 * Surface-scan overlay: bright hint only on voxels already tinted by the scanner satellite
 * (`surfaceScanTintRgb`) that are still-eligible discovery sites. Avoids lighting the whole
 * asteroid when the overlay is on or the mesh rebuilds (e.g. after placing a replicator).
 */
const discoveryScanHintIndicesReuse = new Set<number>()

function buildDiscoveryScanHintIndices(): Set<number> | null {
  if (!surfaceScanOverlayVisible) return null
  if (gameBalance.discoverySiteDensity <= 0) return null
  const s = discoveryScanHintIndicesReuse
  s.clear()
  for (let i = 0; i < voxelCells.length; i++) {
    const c = voxelCells[i]!
    if (c.surfaceScanTintRgb === undefined) continue
    if (discoveryConsumedPos.has(discoveryPosKey(c.pos))) continue
    if (isDiscoverySite(currentSeed, c.pos, gameBalance)) s.add(i)
  }
  return s.size > 0 ? s : null
}

function canSelectDepthScannerTool(): boolean {
  if (depthScanUnlocked) return true
  if (debugUnlockAllTools) return true
  const per = gameBalance.computroniumPointsPerStage
  const t4 = per * 4
  return (
    scannerLaserUnlocked &&
    countActiveComputronium(voxelCells) > 0 &&
    computroniumUnlockPoints.current < t4
  )
}

function getLaserSatelliteRow(): LaserSatelliteRowSnapshot {
  const oDeploy = getScaledSatelliteDeployCost('orbital', orbitalSatelliteCount)
  const eDeploy = getScaledSatelliteDeployCost('excavating', excavatingSatelliteCount)
  const sDeploy = getScaledSatelliteDeployCost('scanner', scannerSatelliteCount)
  const dDeploy = getScaledSatelliteDeployCost('drossCollector', drossCollectorSatelliteCount)
  return {
    orbital: {
      unlocked: orbitalLaserUnlocked,
      satelliteCount: orbitalSatelliteCount,
      deployCostLine: formatResourceCostWithTallies(resourceTallies, oDeploy),
      canAffordDeploy: orbitalLaserUnlocked && canAfford(resourceTallies, oDeploy),
    },
    excavating: {
      unlocked: excavatingLaserUnlocked,
      satelliteCount: excavatingSatelliteCount,
      deployCostLine: formatResourceCostWithTallies(resourceTallies, eDeploy),
      canAffordDeploy: excavatingLaserUnlocked && canAfford(resourceTallies, eDeploy),
    },
    scanner: {
      unlocked: scannerLaserUnlocked,
      satelliteCount: scannerSatelliteCount,
      deployCostLine: formatResourceCostWithTallies(resourceTallies, sDeploy),
      canAffordDeploy: scannerLaserUnlocked && canAfford(resourceTallies, sDeploy),
    },
    drossCollector: {
      unlocked: drossCollectorUnlocked,
      satelliteCount: drossCollectorSatelliteCount,
      deployCostLine: formatResourceCostWithTallies(resourceTallies, dDeploy),
      canAffordDeploy: drossCollectorUnlocked && canAfford(resourceTallies, dDeploy),
    },
  }
}

function onDeploySatellite(kind: 'orbital' | 'excavating' | 'scanner' | 'drossCollector'): boolean {
  if (kind === 'orbital') {
    if (!orbitalLaserUnlocked) return false
    const cost = getScaledSatelliteDeployCost('orbital', orbitalSatelliteCount)
    if (!tryPayResources(resourceTallies, cost)) return false
    orbitalSatelliteCount += 1
  } else if (kind === 'excavating') {
    if (!excavatingLaserUnlocked) return false
    const cost = getScaledSatelliteDeployCost('excavating', excavatingSatelliteCount)
    if (!tryPayResources(resourceTallies, cost)) return false
    excavatingSatelliteCount += 1
  } else if (kind === 'scanner') {
    if (!scannerLaserUnlocked) return false
    const cost = getScaledSatelliteDeployCost('scanner', scannerSatelliteCount)
    if (!tryPayResources(resourceTallies, cost)) return false
    scannerSatelliteCount += 1
  } else {
    if (!drossCollectorUnlocked) return false
    const cost = getScaledSatelliteDeployCost('drossCollector', drossCollectorSatelliteCount)
    if (!tryPayResources(resourceTallies, cost)) return false
    drossCollectorSatelliteCount += 1
  }
  setResourceHud()
  satelliteDots.setCounts(
    orbitalSatelliteCount,
    excavatingSatelliteCount,
    scannerSatelliteCount,
    drossCollectorSatelliteCount,
    orbitVisualRadius,
  )
  return true
}

function decommissionSatelliteByKind(kind: SatelliteInspectKind, count: number = 1): void {
  if (count <= 0) return
  const n = Math.floor(count)
  if (n <= 0) return
  if (kind === 'orbital') {
    const remove = Math.min(n, orbitalSatelliteCount)
    if (remove <= 0) return
    orbitalSatelliteCount -= remove
  } else if (kind === 'excavating') {
    const remove = Math.min(n, excavatingSatelliteCount)
    if (remove <= 0) return
    excavatingSatelliteCount -= remove
  } else if (kind === 'scanner') {
    const remove = Math.min(n, scannerSatelliteCount)
    if (remove <= 0) return
    scannerSatelliteCount -= remove
  } else {
    const remove = Math.min(n, drossCollectorSatelliteCount)
    if (remove <= 0) return
    drossCollectorSatelliteCount -= remove
  }
  setResourceHud()
  refreshToolCosts()
  satelliteDots.setCounts(
    orbitalSatelliteCount,
    excavatingSatelliteCount,
    scannerSatelliteCount,
    drossCollectorSatelliteCount,
    orbitVisualRadius,
  )
  reapplyAllRockColorsNoLaser()
}

function beforeToolChange(_from: PlayerTool, to: PlayerTool): boolean {
  if (to === 'drossCollector') return true
  if (to === 'orbitalLaser') return orbitalLaserUnlocked
  if (to === 'excavatingLaser') return excavatingLaserUnlocked
  if (to === 'scanner') return scannerLaserUnlocked
  if (to === 'depthScanner') return canSelectDepthScannerTool()
  if (to === 'reactor')
    return debugUnlockAllTools || structureToolPhaseFromCells('reactor', voxelCells) === 'unlocked'
  if (to === 'hub')
    return debugUnlockAllTools || structureToolPhaseFromCells('hub', voxelCells) === 'unlocked'
  if (to === 'refinery')
    return debugUnlockAllTools || structureToolPhaseFromCells('refinery', voxelCells) === 'unlocked'
  if (to === 'battery')
    return debugUnlockAllTools || structureToolPhaseFromCells('battery', voxelCells) === 'unlocked'
  if (to === 'computronium')
    return debugUnlockAllTools || structureToolPhaseFromCells('computronium', voxelCells) === 'unlocked'
  return true
}

let syncOverlaysDepthRow: () => void = () => {}

function onBalanceChange(): void {
  setResourceHud()
  applySfxReverbFromBalance()
  syncDepthOverlayMaterials()
}

const overlaysMenu = createOverlaysMenu(app, {
  initialSurfaceScanVisible: surfaceScanOverlayVisible,
  initialDepthOverlayVisible: depthOverlayVisible,
  getDepthOverlayUnlocked: () => depthOverlayUnlocked(),
  getDepthOverlayLockedHint: () =>
    depthScanUnlocked
      ? 'Place a depth scanner on rock or processed matter (Depth scan tool)'
      : 'Unlock depth scan via computronium research (tier 4 after scanner satellite); keep ≥1 computronium on while points accrue',
  onSurfaceScanChange: (v) => {
    surfaceScanOverlayVisible = v
    persistOverlayVisualizationPrefs()
    if (
      (laserPointerDown && orbitalLaserUnlocked && lastLaserDragTool === 'orbitalLaser' && lastLaserDragClient) ||
      (excavatingLaserPointerDown &&
        excavatingLaserUnlocked &&
        lastLaserDragTool === 'excavatingLaser' &&
        lastLaserDragClient)
    ) {
      refreshLaserRockHighlightColors()
    } else if (hasActiveExplosiveFuse(performance.now())) {
      refreshExplosiveFuseRockColors()
    } else {
      reapplyAllRockColorsNoLaser()
    }
  },
  onDepthOverlayChange: (v) => {
    depthOverlayVisible = v
    persistOverlayVisualizationPrefs()
    reapplyAllRockColorsNoLaser()
  },
})
syncOverlaysDepthRow = overlaysMenu.syncDepthOverlayUnlock
const overlaysLeading = overlaysMenu.element

const debugUnlockAllToolsHandlers: { apply: () => void } = {
  apply: () => {},
}

const { syncSunRotationSpeed, syncLightAngleSliders } = createSettingsMenu(app, {
  leadingActions: overlaysLeading,
  onRegenerate: regenerateAsteroid,
  onLightAngleChange,
  initialAzimuthDeg: sunAzimuthDeg,
  initialElevationDeg: sunElevationDeg,
  initialDiscoveryAutoResolve: discoveryAutoResolve,
  onDiscoveryAutoResolveChange: (value) => {
    discoveryAutoResolve = value
    saveDiscoveryAutoResolve(value)
  },
  initialMatterHudCompact: matterHudCompact,
  onMatterHudCompactChange: (value) => {
    matterHudCompact = value
    saveMatterHudCompact(value)
    syncMatterHudCompactUi()
  },
  onBalanceChange,
  asteroidMusicDebug,
  sunLightDebug,
  getSunAnglesForLight: () => ({ az: sunAzimuthDeg, el: sunElevationDeg }),
  onSunLightDebugChange: syncSunDirectionHelper,
  scanVisualizationDebug,
  onScanVisualizationDebugChange: () => {
    reapplyAllRockColorsNoLaser()
    schedulePersistScanVisualizationDebug(scanVisualizationDebug)
  },
  audioMasterDebug,
  onAudioMasterDebugChange: () => {
    applyAudioMasterDebug(audioMasterDebug)
    schedulePersistAudioMasterDebug(audioMasterDebug)
  },
  onAsteroidMusicDebugChange: () => {
    asteroidAmbientMusic.applyDebugNow()
    schedulePersistAsteroidMusicDebug(asteroidMusicDebug)
  },
  initialMusicVolumeLinear: musicVolumeLinear,
  onMusicVolumeChange: (linear: number) => {
    musicVolumeLinear = linear
    saveMusicVolumeLinear(linear)
    asteroidAmbientMusic.tryEnsureGraph()
  },
  onDebugAddResources: () => {
    addResourceYields(resourceTallies, DEBUG_RESOURCE_GRANT)
    setResourceHud()
  },
  onDebugAddEnergy: () => {
    const cap = computeEnergyCap(voxelCells, debugEnergyCapBonus)
    energyState.current = Math.min(energyState.current + DEBUG_ENERGY_GRANT, cap)
    setResourceHud()
  },
  onDebugIncreaseEnergyCap: () => {
    debugEnergyCapBonus += DEBUG_ENERGY_CAP_STEP
    setResourceHud()
  },
  onDebugUnlockAllTools: () => {
    debugUnlockAllToolsHandlers.apply()
  },
})
syncSunRotationSpeedUi = syncSunRotationSpeed

const {
  getSelectedTool,
  refreshToolCosts: refreshCosts,
  setSelectedTool: setSelectedToolFromPanel,
} = createToolsPanel(app, {
  beforeToolChange,
  onToolChange(tool) {
    if (tool !== 'inspect') {
      lastInspectHudLines = null
      setResourceHud()
    }
  },
  getLaserSatelliteRow,
  onDeploySatellite,
  canAffordResourceCost: (cost) => canAfford(resourceTallies, cost),
  getLaserToolUiPhase: (tool) =>
    getLaserToolUiPhase(
      tool,
      {
        unlockPoints: computroniumUnlockPoints.current,
        activeComputronium: countActiveComputronium(voxelCells),
        orbitalLaserUnlocked,
        excavatingLaserUnlocked,
        scannerLaserUnlocked,
      },
      gameBalance,
    ),
  getDepthScanToolUiPhase: () =>
    getDepthScanToolUiPhase(
      {
        unlockPoints: computroniumUnlockPoints.current,
        activeComputronium: countActiveComputronium(voxelCells),
        scannerLaserUnlocked,
        depthScanUnlocked,
      },
      gameBalance,
    ),
  getStructureToolUiPhase: (tool) =>
    debugUnlockAllTools ? 'unlocked' : structureToolPhaseFromCells(tool, voxelCells),
  getExplosiveChargeToolUiPhase: () =>
    debugUnlockAllTools
      ? 'unlocked'
      : getExplosiveChargeToolUiPhase(
          {
            unlockPoints: computroniumUnlockPoints.current,
            activeComputronium: countActiveComputronium(voxelCells),
            orbitalLaserUnlocked,
          },
          gameBalance,
        ),
  canAffordExplosiveChargeArm: () =>
    canAfford(resourceTallies, getScaledExplosiveChargeArmCost()) &&
    energyState.current >= gameBalance.explosiveChargeEnergyPerArm,
  getResourceTallies: () => resourceTallies,
  getCurrentEnergy: () => energyState.current,
  getDrossCollectorDeployUiPhase: () =>
    getDrossCollectorDeployUiPhase(
      {
        unlockPoints: computroniumUnlockPoints.current,
        activeComputronium: countActiveComputronium(voxelCells),
        depthScanUnlocked,
        drossCollectorUnlocked,
      },
      gameBalance,
    ),
  getDrossCollectorToolUiPhase: () =>
    getDrossCollectorDeployUiPhase(
      {
        unlockPoints: computroniumUnlockPoints.current,
        activeComputronium: countActiveComputronium(voxelCells),
        depthScanUnlocked,
        drossCollectorUnlocked,
      },
      gameBalance,
    ),
  onDecommissionSatellite: decommissionSatelliteByKind,
})
refreshToolCosts = refreshCosts
setSelectedTool = setSelectedToolFromPanel

const discoveryModal = createDiscoveryModal(app, {
  onOk(offer) {
    const laserUnlockApply: LaserUnlockApply = {
      orbitalLaserUnlocked,
      excavatingLaserUnlocked,
      scannerLaserUnlocked,
      depthScanUnlocked,
      drossCollectorUnlocked,
      orbitalSatelliteCount,
      excavatingSatelliteCount,
      scannerSatelliteCount,
      drossCollectorSatelliteCount,
    }
    applyDiscoveryAccept(offer, resourceTallies, laserUnlockApply, computroniumUnlockPoints, gameBalance)
    orbitalLaserUnlocked = laserUnlockApply.orbitalLaserUnlocked
    excavatingLaserUnlocked = laserUnlockApply.excavatingLaserUnlocked
    scannerLaserUnlocked = laserUnlockApply.scannerLaserUnlocked
    depthScanUnlocked = laserUnlockApply.depthScanUnlocked
    drossCollectorUnlocked = laserUnlockApply.drossCollectorUnlocked
    orbitalSatelliteCount = laserUnlockApply.orbitalSatelliteCount
    excavatingSatelliteCount = laserUnlockApply.excavatingSatelliteCount
    scannerSatelliteCount = laserUnlockApply.scannerSatelliteCount
    drossCollectorSatelliteCount = laserUnlockApply.drossCollectorSatelliteCount
    setResourceHud()
    refreshToolCosts()
    syncOverlaysDepthRow()
    satelliteDots.setCounts(
      orbitalSatelliteCount,
      excavatingSatelliteCount,
      scannerSatelliteCount,
      drossCollectorSatelliteCount,
      orbitVisualRadius,
    )
    reapplyAllRockColorsNoLaser()
  },
})

const satelliteInspectModal = createSatelliteInspectModal(app, {
  onDecommission: decommissionSatelliteByKind,
})

function syncDiscoveryHud(): void {
  discoveryHudStrip.replaceChildren()
  if (pendingDiscoveries.length === 0) {
    discoveryHudStrip.hidden = true
    return
  }
  discoveryHudStrip.hidden = false
  for (const offer of pendingDiscoveries) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'discovery-hud-icon discovery-hud-icon--pulse'
    btn.textContent = '◆'
    btn.title = offer.titleLine
    btn.setAttribute('aria-label', `Open discovery: ${offer.titleLine}`)
    const offerRef = offer
    btn.addEventListener('click', () => {
      const idx = pendingDiscoveries.indexOf(offerRef)
      if (idx < 0) return
      pendingDiscoveries.splice(idx, 1)
      syncDiscoveryHud()
      discoveryModal.show(offerRef)
    })
    discoveryHudStrip.appendChild(btn)
  }
}

function tryDiscoveryAt(pos: VoxelPos): void {
  const offer = tryDiscoveryClaim(currentSeed, pos, gameBalance, discoveryConsumedPos, discoveryCounter)
  if (offer) {
    if (discoveryAutoResolve) {
      discoveryModal.show(offer)
    } else {
      pendingDiscoveries.push(offer)
      syncDiscoveryHud()
    }
  }
  reapplyAllRockColorsNoLaser()
}

function applyDebugUnlockAllTools(): void {
  debugUnlockAllTools = true
  orbitalLaserUnlocked = true
  excavatingLaserUnlocked = true
  scannerLaserUnlocked = true
  depthScanUnlocked = true
  drossCollectorUnlocked = true
  orbitalSatelliteCount = Math.max(1, orbitalSatelliteCount)
  excavatingSatelliteCount = Math.max(1, excavatingSatelliteCount)
  scannerSatelliteCount = Math.max(1, scannerSatelliteCount)
  drossCollectorSatelliteCount = Math.max(1, drossCollectorSatelliteCount)
  setResourceHud()
  refreshToolCosts()
  syncOverlaysDepthRow()
  satelliteDots.setCounts(
    orbitalSatelliteCount,
    excavatingSatelliteCount,
    scannerSatelliteCount,
    drossCollectorSatelliteCount,
    orbitVisualRadius,
  )
}
debugUnlockAllToolsHandlers.apply = applyDebugUnlockAllTools

const raycaster = new Raycaster()
const pointerNdc = new Vector2()
const _asteroidInvWorld = new Matrix4()
const _rayLocalOrigin = new Vector3()
const _rayLocalDir = new Vector3()

const CLICK_MAX_PX = 6
let pointerDown: { x: number; y: number } | null = null
let laserPointerDown = false
let excavatingLaserPointerDown = false
/** Cursor position during laser drag (for voxel highlight). */
let lastLaserDragClient: { x: number; y: number } | null = null
let lastLaserDragTool: 'orbitalLaser' | 'excavatingLaser' | null = null
/** Orbit disabled until pointerup after arming explosive charge on a voxel (avoids CLICK_MAX_PX vs orbit). */
let explosiveChargeAwaitingUp = false
const LASER_LITHOLOGY: ReadonlySet<VoxelKind> = new Set(['regolith', 'silicateRock', 'metalRich'])
const ORBITAL_LASER_ENERGY_BASE = 2.75
const EXCAVATING_LASER_ENERGY_BASE = 2.1
const SCANNER_ENERGY_BASE = 1.65

const NEIGHBOR_DELTAS: ReadonlyArray<[number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

function normalizeRootSnapshot(bulk: Record<RootResourceId, number> | undefined): Record<RootResourceId, number> {
  if (!bulk) return defaultUniformRootComposition()
  let s = 0
  for (const r of ROOT_RESOURCE_IDS) s += bulk[r]
  if (s <= 0) return defaultUniformRootComposition()
  const o = defaultUniformRootComposition()
  for (const r of ROOT_RESOURCE_IDS) o[r] = bulk[r] / s
  return o
}

function convertCellToProcessedMatter(cell: VoxelCell): void {
  const bulk = cell.bulkComposition ?? defaultUniformRootComposition()
  const yields = compositionToYields(cell.kind, bulk)
  let matterUnits = 0
  for (const r of ROOT_RESOURCE_IDS) matterUnits += yields[r] ?? 0
  matterUnits = Math.max(3, matterUnits)
  cell.kind = 'processedMatter'
  cell.hpRemaining = hpForVoxelKind('processedMatter')
  cell.processedMatterUnits = matterUnits
  cell.processedMatterRootComposition = normalizeRootSnapshot(cell.bulkComposition)
  cell.bulkComposition = undefined
  cell.replicatorActive = false
  cell.replicatorEating = false
  cell.replicatorEatAccumulatorMs = 0
  cell.replicatorMsPerHp = undefined
  cell.storedResources = undefined
  cell.passiveRemainder = undefined
  clearSurfaceScanTint(cell)
  clearDepthRevealState(cell)
  tryDiscoveryAt(cell.pos)
}

function collectOrbitalLaserTargetIndices(
  centerIdx: number,
  maxCount: number,
  cells: VoxelCell[],
  posMap: Map<string, number>,
): number[] {
  const center = cells[centerIdx]
  if (!LASER_LITHOLOGY.has(center.kind)) return []
  const out: number[] = [centerIdx]
  const seen = new Set<number>([centerIdx])
  const queue: number[] = [centerIdx]
  while (queue.length > 0 && out.length < maxCount) {
    const cur = queue.shift()!
    const p = cells[cur].pos
    for (const [dx, dy, dz] of NEIGHBOR_DELTAS) {
      if (out.length >= maxCount) break
      const key = `${p.x + dx},${p.y + dy},${p.z + dz}`
      const ni = posMap.get(key)
      if (ni === undefined || seen.has(ni)) continue
      const nc = cells[ni]
      if (!LASER_LITHOLOGY.has(nc.kind)) continue
      seen.add(ni)
      out.push(ni)
      queue.push(ni)
    }
  }
  return out
}

/**
 * Indices to tint while mining laser is held: always includes the voxel under the cursor
 * (even after it becomes processed matter), plus up to `maxCount - 1` lithology neighbors.
 */
function collectOrbitalLaserVisualHighlightIndices(
  centerIdx: number,
  maxCount: number,
  cells: VoxelCell[],
  posMap: Map<string, number>,
): number[] {
  const center = cells[centerIdx]
  const out: number[] = []
  const seen = new Set<number>()

  function pushUnique(idx: number): void {
    if (seen.has(idx)) return
    seen.add(idx)
    out.push(idx)
  }

  pushUnique(centerIdx)

  const queue: number[] = []
  if (LASER_LITHOLOGY.has(center.kind)) {
    queue.push(centerIdx)
  } else {
    const p = center.pos
    for (const [dx, dy, dz] of NEIGHBOR_DELTAS) {
      const key = `${p.x + dx},${p.y + dy},${p.z + dz}`
      const ni = posMap.get(key)
      if (ni === undefined || seen.has(ni)) continue
      if (LASER_LITHOLOGY.has(cells[ni].kind)) {
        pushUnique(ni)
        queue.push(ni)
        if (out.length >= maxCount) return out
      }
    }
  }

  while (queue.length > 0 && out.length < maxCount) {
    const cur = queue.shift()!
    const p = cells[cur].pos
    for (const [dx, dy, dz] of NEIGHBOR_DELTAS) {
      if (out.length >= maxCount) break
      const key = `${p.x + dx},${p.y + dy},${p.z + dz}`
      const ni = posMap.get(key)
      if (ni === undefined || seen.has(ni)) continue
      if (!LASER_LITHOLOGY.has(cells[ni].kind)) continue
      pushUnique(ni)
      queue.push(ni)
    }
  }

  return out
}

function collectScannerNeighborIndices(
  centerIdx: number,
  posMap: Map<string, number>,
  r: number,
): number[] {
  const c = voxelCells[centerIdx]!.pos
  const out: number[] = []
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        const key = `${c.x + dx},${c.y + dy},${c.z + dz}`
        const j = posMap.get(key)
        if (j !== undefined) out.push(j)
      }
    }
  }
  return out
}

const EXPLOSIVE_CHARGE_FUSE_MS = 2600

function hasActiveExplosiveFuse(nowMs: number): boolean {
  for (let i = 0; i < voxelCells.length; i++) {
    const end = voxelCells[i].explosiveFuseEndMs
    if (end != null && nowMs < end) return true
  }
  return false
}

function refreshExplosiveFuseRockColors(): void {
  const meshOpts = { voxelSize, gridSize }
  const t = performance.now()
  const pulse = 0.58 + 0.42 * (0.5 + 0.5 * Math.sin(t * 0.095))
  const highlight = new Set<number>()
  for (let i = 0; i < voxelCells.length; i++) {
    const end = voxelCells[i].explosiveFuseEndMs
    if (end != null && t < end) highlight.add(i)
  }
  reapplyRockInstanceColors(
    asteroidBundle,
    voxelCells,
    meshOpts,
    scanVisualizationDebug,
    highlight,
    'explosiveFuse',
    pulse,
    buildSurfaceScanTintIndexMap(),
    depthOverlayTintActive(),
    buildDiscoveryScanHintIndices(),
  )
  syncDepthOverlayMaterials()
}

function tryExplosiveChargeAt(clientX: number, clientY: number): boolean {
  if (voxelCells.length === 0) return false
  if (!debugUnlockAllTools && !orbitalLaserUnlocked) return false
  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return false
  const cell = voxelCells[i]
  const now = performance.now()
  if (cell.explosiveFuseEndMs != null && now < cell.explosiveFuseEndMs) return false
  const armCost = getScaledExplosiveChargeArmCost()
  const e = gameBalance.explosiveChargeEnergyPerArm
  if (energyState.current < e || !canAfford(resourceTallies, armCost)) return false
  if (!tryPayResources(resourceTallies, armCost)) return false
  if (trySpendEnergy(energyState, e) < e) return false
  cell.explosiveFuseEndMs = now + EXPLOSIVE_CHARGE_FUSE_MS
  refreshExplosiveFuseRockColors()
  setResourceHud()
  return true
}

function stepExplosiveCharges(nowMs: number): void {
  const r = gameBalance.explosiveChargeBlastRadius
  const expired: VoxelPos[] = []
  for (let i = 0; i < voxelCells.length; i++) {
    const end = voxelCells[i].explosiveFuseEndMs
    if (end != null && nowMs >= end) {
      expired.push(voxelCells[i].pos)
    }
  }
  if (expired.length === 0) return

  const posMap = getVoxelPosIndexMap()
  const toRemove = new Set<number>()
  for (const c of expired) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          const key = `${c.x + dx},${c.y + dy},${c.z + dz}`
          const j = posMap.get(key)
          if (j !== undefined) toRemove.add(j)
        }
      }
    }
  }
  const sorted = [...toRemove].sort((a, b) => b - a)
  if (sorted.length === 0) return
  const removedCells = sorted.map((idx) => voxelCells[idx]!)
  for (const cell of removedCells) {
    spawnDrossFromRemovedCell(drossState, cell, gameBalance)
  }
  for (const idx of sorted) {
    voxelCells.splice(idx, 1)
  }
  playExplosiveChargeDetonation()
  replaceAsteroidMesh(voxelCells)
}

function tryScannerAt(clientX: number, clientY: number): void {
  if (!scannerLaserUnlocked || scannerSatelliteCount < 1) return
  if (voxelCells.length === 0) return
  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return

  const r = gameBalance.scannerScanRadius
  const scanVol = (2 * r + 1) ** 3
  const baseScanVol = 27
  const cost =
    SCANNER_ENERGY_BASE *
    gameBalance.scannerEnergyMult *
    scannerSatelliteCount *
    (scanVol / baseScanVol)
  if (energyState.current < cost) return

  trySpendEnergy(energyState, cost)
  const posMap = getVoxelPosIndexMap()
  const idx = collectScannerNeighborIndices(i, posMap, r)
  const scratch = new Color()
  for (const j of idx) {
    const cell = voxelCells[j]!
    compositionToScanColor(cell, scratch)
    cell.surfaceScanTintRgb = { r: scratch.r, g: scratch.g, b: scratch.b }
  }
  lastScanRefinedPreviewLine = formatScanRefinedPreviewLine(voxelCells[i]!)
  reapplyAllRockColorsNoLaser()
  playScanPing()
  setResourceHud()
}

/**
 * First voxel cell under the pointer (grid DDA in asteroid local space), or null if the ray misses all voxels.
 */
function asteroidRaycastCellIndex(clientX: number, clientY: number): number | null {
  if (voxelCells.length === 0) return null
  canvasPointerToNdc(clientX, clientY)
  raycaster.setFromCamera(pointerNdc, camera)
  _asteroidInvWorld.copy(asteroidBundle.group.matrixWorld).invert()
  _rayLocalOrigin.copy(raycaster.ray.origin).applyMatrix4(_asteroidInvWorld)
  _rayLocalDir.copy(raycaster.ray.direction).transformDirection(_asteroidInvWorld)
  return raycastFirstOccupiedCellIndex(
    _rayLocalOrigin,
    _rayLocalDir,
    voxelSize,
    gridSize,
    getVoxelPosIndexMap(),
  )
}

function getOrbitalHighlightIndices(clientX: number, clientY: number): number[] {
  if (!orbitalLaserUnlocked || orbitalSatelliteCount < 1) return []
  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return []
  const posMap = getVoxelPosIndexMap()
  return collectOrbitalLaserVisualHighlightIndices(i, orbitalSatelliteCount, voxelCells, posMap)
}

function refreshLaserRockHighlightColors(): void {
  const meshOpts = { voxelSize, gridSize }
  /** ~7.6 Hz pulse (rad/ms); strong swing for visible emissive flicker. */
  const t = performance.now()
  const pulse = 0.66 + 0.34 * (0.5 + 0.5 * Math.sin(t * 0.048))
  if (laserPointerDown && orbitalLaserUnlocked && lastLaserDragTool === 'orbitalLaser' && lastLaserDragClient) {
    const idx = getOrbitalHighlightIndices(lastLaserDragClient.x, lastLaserDragClient.y)
    reapplyRockInstanceColors(
      asteroidBundle,
      voxelCells,
      meshOpts,
      scanVisualizationDebug,
      new Set(idx),
      'orbital',
      pulse,
      buildSurfaceScanTintIndexMap(),
      depthOverlayTintActive(),
      buildDiscoveryScanHintIndices(),
    )
    syncDepthOverlayMaterials()
    return
  }
  if (
    excavatingLaserPointerDown &&
    excavatingLaserUnlocked &&
    lastLaserDragTool === 'excavatingLaser' &&
    lastLaserDragClient
  ) {
    const i = asteroidRaycastCellIndex(lastLaserDragClient.x, lastLaserDragClient.y)
    const set = i !== null ? new Set<number>([i]) : new Set<number>()
    reapplyRockInstanceColors(
      asteroidBundle,
      voxelCells,
      meshOpts,
      scanVisualizationDebug,
      set,
      'excavating',
      pulse,
      buildSurfaceScanTintIndexMap(),
      depthOverlayTintActive(),
      buildDiscoveryScanHintIndices(),
    )
    syncDepthOverlayMaterials()
  }
}

function clearLaserRockHighlightColors(): void {
  reapplyRockInstanceColors(
    asteroidBundle,
    voxelCells,
    { voxelSize, gridSize },
    scanVisualizationDebug,
    null,
    null,
    1,
    buildSurfaceScanTintIndexMap(),
    depthOverlayTintActive(),
    buildDiscoveryScanHintIndices(),
  )
  syncDepthOverlayMaterials()
}

function isLaserLithologyAt(clientX: number, clientY: number): boolean {
  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return false
  return LASER_LITHOLOGY.has(voxelCells[i].kind)
}

function isExcavatingTargetAt(clientX: number, clientY: number): boolean {
  return asteroidRaycastCellIndex(clientX, clientY) !== null
}

function canvasPointerToNdc(clientX: number, clientY: number): void {
  const rect = renderer.domElement.getBoundingClientRect()
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1
}

const SATELLITE_PICK_MESH_NAMES = new Set([
  'orbital-satellites',
  'excavating-satellites',
  'scanner-satellites',
  'dross-collector-satellites',
])

const SATELLITE_PICK_NAME_TO_KIND: Record<string, SatelliteInspectKind> = {
  'orbital-satellites': 'orbital',
  'excavating-satellites': 'excavating',
  'scanner-satellites': 'scanner',
  'dross-collector-satellites': 'drossCollector',
}

function asteroidVoxelPickMeshes(bundle: AsteroidRenderBundle): InstancedMesh[] {
  return [
    bundle.solid,
    bundle.eating,
    bundle.reactor,
    bundle.battery,
    bundle.hub,
    bundle.hubStandby,
    bundle.refinery,
    bundle.refineryStandby,
    bundle.depthScanner,
    bundle.computronium,
    bundle.computroniumStandby,
  ]
}

function formatSatelliteGameplayLine(kind: SatelliteInspectKind): string {
  switch (kind) {
    case 'orbital':
      return 'Mining laser: energy per burst scales with deployed count (balance multipliers apply).'
    case 'excavating':
      return 'Dig laser: damage and energy per shot scale with deployed count.'
    case 'scanner':
      return 'Scanner: neighborhood scan energy scales with deployed count and scan volume.'
    case 'drossCollector':
      return 'Dross collectors: collection rate scales with deployed count (balance).'
    default:
      return ''
  }
}

function tryInspectAt(clientX: number, clientY: number): void {
  if (voxelCells.length === 0) return
  canvasPointerToNdc(clientX, clientY)
  raycaster.setFromCamera(pointerNdc, camera)
  const pickList = [...satelliteDots.pickMeshes, ...asteroidVoxelPickMeshes(asteroidBundle)]
  const hits = raycaster.intersectObjects(pickList, false)
  const filtered = hits.filter((h) => h.object.name !== 'dross-instanced')
  filtered.sort((a, b) => a.distance - b.distance)
  const first = filtered[0]
  if (first && SATELLITE_PICK_MESH_NAMES.has(first.object.name) && first.instanceId != null) {
    const mesh = first.object as InstancedMesh
    const id = first.instanceId
    if (id < mesh.count) {
      const kind = SATELLITE_PICK_NAME_TO_KIND[mesh.name]
      if (kind) {
        const countForType =
          kind === 'orbital'
            ? orbitalSatelliteCount
            : kind === 'excavating'
              ? excavatingSatelliteCount
              : kind === 'scanner'
                ? scannerSatelliteCount
                : drossCollectorSatelliteCount
        lastInspectHudLines = null
        setResourceHud()
        satelliteInspectModal.show({
          kind,
          markerIndex: id + 1,
          markerTotal: mesh.count,
          orbitRadius: orbitVisualRadius,
          countForType,
          gameplayLine: formatSatelliteGameplayLine(kind),
        })
        return
      }
    }
  }
  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return
  lastInspectHudLines = formatInspectHudLines(voxelCells[i]!, performance.now())
  setResourceHud()
}

function tryPickAt(clientX: number, clientY: number): void {
  if (voxelCells.length === 0) return

  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return

  const cell = voxelCells[i]
  if (
    cell.kind === 'replicator' ||
    cell.kind === 'reactor' ||
    cell.kind === 'battery' ||
    cell.kind === 'hub' ||
    cell.kind === 'refinery' ||
    cell.kind === 'depthScanner' ||
    cell.kind === 'computronium' ||
    cell.kind === 'processedMatter'
  )
    return

  const popped = cell.hpRemaining === 1
  cell.hpRemaining -= 1
  onMiningHitFeedback(clientX, clientY, viewport, pickRipple, cell.kind, popped)
  if (cell.hpRemaining > 0) return

  tryDiscoveryAt(cell.pos)

  const bulk = cell.bulkComposition ?? defaultUniformRootComposition()
  addResourceYields(resourceTallies, compositionToYields(cell.kind, bulk))
  spawnDrossFromRemovedCell(drossState, cell, gameBalance)
  voxelCells.splice(i, 1)
  setResourceHud()
  replaceAsteroidMesh(voxelCells)
}

function tryPlaceReplicator(clientX: number, clientY: number): void {
  if (voxelCells.length === 0) return

  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return

  const cell = voxelCells[i]
  if (cell.kind === 'replicator') return
  if (cell.kind === 'processedMatter') return
  if (cell.replicatorActive || cell.replicatorEating) return

  if (!tryPayResources(resourceTallies, getScaledReplicatorPlaceCost())) return

  clearSurfaceScanTint(cell)
  clearDepthRevealState(cell)
  cell.replicatorActive = true
  cell.replicatorEating = true
  cell.replicatorEatAccumulatorMs = 0
  replaceAsteroidMesh(voxelCells)
  setResourceHud()
  playReplicatorPlaceClick()
}

function tryConvertStructure(clientX: number, clientY: number, targetKind: StructureConvertKind): void {
  if (voxelCells.length === 0) return
  if (targetKind === 'reactor' && !debugUnlockAllTools && !reactorToolUnlocked(voxelCells)) return
  if (targetKind === 'hub' && !debugUnlockAllTools && !hubToolUnlocked(voxelCells)) return
  if (targetKind === 'refinery' && !debugUnlockAllTools && !refineryToolUnlocked(voxelCells)) return
  if (targetKind === 'battery' && !debugUnlockAllTools && !batteryToolUnlocked(voxelCells)) return

  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return

  const cell = voxelCells[i]
  if (!tryConvertReplicatorToKind(cell, targetKind, resourceTallies)) return

  replaceAsteroidMesh(voxelCells)
  setResourceHud()
  playReplicatorPlaceClick()
  syncOverlaysDepthRow()
}

function tryPlaceDepthScannerAt(clientX: number, clientY: number): void {
  if (voxelCells.length === 0) return
  if (!canSelectDepthScannerTool()) return

  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return

  const cell = voxelCells[i]
  const hadScannerBefore = hasAnyDepthScannerVoxel()
  const conv = tryConvertCellToDepthScannerWithMeta(cell, resourceTallies)
  if (!conv.ok) return

  replaceAsteroidMesh(voxelCells)
  setResourceHud()
  playReplicatorPlaceClick()
  syncOverlaysDepthRow()
  if (!hadScannerBefore) {
    overlaysMenu.setDepthOverlayChecked(true)
  }

  tryDiscoveryAt(cell.pos)
}

function tryHubToolAt(clientX: number, clientY: number): void {
  if (voxelCells.length === 0) return

  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return

  const cell = voxelCells[i]
  if (cell.kind === 'hub') {
    const wasDisabled = cell.hubDisabled === true
    if (wasDisabled) {
      cell.hubDisabled = undefined
      playHubToggle(true)
    } else {
      cell.hubDisabled = true
      playHubToggle(false)
    }
    replaceAsteroidMesh(voxelCells)
    return
  }

  tryConvertStructure(clientX, clientY, 'hub')
}

function tryRefineryToolAt(clientX: number, clientY: number): void {
  if (voxelCells.length === 0) return

  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return

  const cell = voxelCells[i]
  if (cell.kind === 'refinery') {
    const wasDisabled = cell.refineryDisabled === true
    if (wasDisabled) {
      cell.refineryDisabled = undefined
      playRefineryToggle(true)
    } else {
      cell.refineryDisabled = true
      playRefineryToggle(false)
    }
    replaceAsteroidMesh(voxelCells)
    return
  }

  tryConvertStructure(clientX, clientY, 'refinery')
}

function tryComputroniumToolAt(clientX: number, clientY: number): void {
  if (voxelCells.length === 0) return
  if (!debugUnlockAllTools && !computroniumToolUnlocked(voxelCells)) return

  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return

  const cell = voxelCells[i]
  if (cell.kind === 'computronium') {
    if (cell.computroniumDisabled === true) {
      cell.computroniumDisabled = undefined
    } else {
      cell.computroniumDisabled = true
    }
    replaceAsteroidMesh(voxelCells)
    return
  }

  if (!tryConvertReplicatorToComputronium(cell, resourceTallies)) return

  replaceAsteroidMesh(voxelCells)
  setResourceHud()
  playReplicatorPlaceClick()
}

function tryOrbitalLaserHit(clientX: number, clientY: number): void {
  if (!orbitalLaserUnlocked || orbitalSatelliteCount < 1) return
  if (voxelCells.length === 0) return

  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return

  const posMap = getVoxelPosIndexMap()
  const targets = collectOrbitalLaserTargetIndices(i, orbitalSatelliteCount, voxelCells, posMap)
  if (targets.length === 0) return

  const cost =
    ORBITAL_LASER_ENERGY_BASE * gameBalance.orbitalLaserEnergyMult * orbitalSatelliteCount
  if (energyState.current < cost) return

  trySpendEnergy(energyState, cost)
  for (const ti of targets) {
    const cell = voxelCells[ti]
    if (!LASER_LITHOLOGY.has(cell.kind)) continue
    convertCellToProcessedMatter(cell)
  }

  setResourceHud()
  replaceAsteroidMesh(voxelCells)
}

function tryExcavatingLaserHit(clientX: number, clientY: number): void {
  if (!excavatingLaserUnlocked || excavatingSatelliteCount < 1) return
  if (voxelCells.length === 0) return

  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return

  const cell = voxelCells[i]

  const cost =
    EXCAVATING_LASER_ENERGY_BASE * gameBalance.excavatingLaserEnergyMult * excavatingSatelliteCount
  if (energyState.current < cost) return

  trySpendEnergy(energyState, cost)
  const dmg = excavatingSatelliteCount
  cell.hpRemaining -= dmg
  const destroyed = cell.hpRemaining <= 0
  onMiningHitFeedbackVisualOnly(clientX, clientY, viewport, pickRipple, destroyed)
  if (!destroyed) {
    setResourceHud()
    return
  }
  spawnDrossFromRemovedCell(drossState, cell, gameBalance)
  voxelCells.splice(i, 1)
  setResourceHud()
  replaceAsteroidMesh(voxelCells)
}

const canvas = renderer.domElement

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  pointerDown = { x: e.clientX, y: e.clientY }
  if (getSelectedTool() === 'orbitalLaser') {
    if (!orbitalLaserUnlocked || !isLaserLithologyAt(e.clientX, e.clientY)) {
      return
    }
    laserPointerDown = true
    lastLaserDragTool = 'orbitalLaser'
    lastLaserDragClient = { x: e.clientX, y: e.clientY }
    controls.enabled = false
    startOrbitalLaserSustain()
    refreshLaserRockHighlightColors()
    tryOrbitalLaserHit(e.clientX, e.clientY)
    return
  }
  if (getSelectedTool() === 'excavatingLaser') {
    if (!excavatingLaserUnlocked || !isExcavatingTargetAt(e.clientX, e.clientY)) {
      return
    }
    excavatingLaserPointerDown = true
    lastLaserDragTool = 'excavatingLaser'
    lastLaserDragClient = { x: e.clientX, y: e.clientY }
    controls.enabled = false
    startExcavatingLaserSustain()
    refreshLaserRockHighlightColors()
    tryExcavatingLaserHit(e.clientX, e.clientY)
    return
  }
  if (getSelectedTool() === 'explosiveCharge') {
    if (tryExplosiveChargeAt(e.clientX, e.clientY)) {
      controls.enabled = false
      explosiveChargeAwaitingUp = true
    }
    return
  }
})

canvas.addEventListener('pointermove', (e) => {
  if (laserPointerDown) {
    if (getSelectedTool() !== 'orbitalLaser') {
      laserPointerDown = false
      lastLaserDragClient = null
      lastLaserDragTool = null
      stopOrbitalLaserSustain()
      controls.enabled = true
      clearLaserRockHighlightColors()
      return
    }
    lastLaserDragClient = { x: e.clientX, y: e.clientY }
    tryOrbitalLaserHit(e.clientX, e.clientY)
    return
  }
  if (excavatingLaserPointerDown) {
    if (getSelectedTool() !== 'excavatingLaser') {
      excavatingLaserPointerDown = false
      lastLaserDragClient = null
      lastLaserDragTool = null
      stopExcavatingLaserSustain()
      controls.enabled = true
      clearLaserRockHighlightColors()
      return
    }
    lastLaserDragClient = { x: e.clientX, y: e.clientY }
    tryExcavatingLaserHit(e.clientX, e.clientY)
  }
})

canvas.addEventListener('pointerup', (e) => {
  if (e.button !== 0) return
  if (explosiveChargeAwaitingUp) {
    explosiveChargeAwaitingUp = false
    controls.enabled = true
    pointerDown = null
    return
  }
  if (laserPointerDown) {
    laserPointerDown = false
    lastLaserDragClient = null
    lastLaserDragTool = null
    stopOrbitalLaserSustain()
    controls.enabled = true
    pointerDown = null
    clearLaserRockHighlightColors()
    return
  }
  if (excavatingLaserPointerDown) {
    excavatingLaserPointerDown = false
    lastLaserDragClient = null
    lastLaserDragTool = null
    stopExcavatingLaserSustain()
    controls.enabled = true
    pointerDown = null
    clearLaserRockHighlightColors()
    return
  }
  if (!pointerDown) return
  const dx = e.clientX - pointerDown.x
  const dy = e.clientY - pointerDown.y
  const moved = Math.hypot(dx, dy)
  pointerDown = null
  if (moved > CLICK_MAX_PX) return
  const tool = getSelectedTool()
  if (tool === 'orbitalLaser' || tool === 'excavatingLaser') return
  if (tool === 'scanner') {
    tryScannerAt(e.clientX, e.clientY)
    return
  }
  if (tool === 'inspect') {
    tryInspectAt(e.clientX, e.clientY)
    return
  }
  if (tool === 'pick') {
    tryPickAt(e.clientX, e.clientY)
  } else if (tool === 'replicator') {
    tryPlaceReplicator(e.clientX, e.clientY)
  } else if (tool === 'reactor') {
    tryConvertStructure(e.clientX, e.clientY, 'reactor')
  } else if (tool === 'battery') {
    tryConvertStructure(e.clientX, e.clientY, 'battery')
  } else if (tool === 'hub') {
    tryHubToolAt(e.clientX, e.clientY)
  } else if (tool === 'refinery') {
    tryRefineryToolAt(e.clientX, e.clientY)
  } else if (tool === 'depthScanner') {
    tryPlaceDepthScannerAt(e.clientX, e.clientY)
  } else if (tool === 'computronium') {
    tryComputroniumToolAt(e.clientX, e.clientY)
  }
})

canvas.addEventListener('pointercancel', () => {
  pointerDown = null
  if (explosiveChargeAwaitingUp) {
    explosiveChargeAwaitingUp = false
    controls.enabled = true
  }
  if (laserPointerDown) {
    laserPointerDown = false
    lastLaserDragClient = null
    lastLaserDragTool = null
    stopOrbitalLaserSustain()
    controls.enabled = true
    clearLaserRockHighlightColors()
  }
  if (excavatingLaserPointerDown) {
    excavatingLaserPointerDown = false
    lastLaserDragClient = null
    lastLaserDragTool = null
    stopExcavatingLaserSustain()
    controls.enabled = true
    clearLaserRockHighlightColors()
  }
})

function onResize(): void {
  const w = viewport.clientWidth || window.innerWidth
  const h = viewport.clientHeight || window.innerHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

window.addEventListener('resize', onResize)
onResize()

let lastTickMs = performance.now()
const MAX_STEP_MS = 120

function tick(): void {
  requestAnimationFrame(tick)
  const now = performance.now()
  const dtMs = Math.min(MAX_STEP_MS, Math.max(0, now - lastTickMs))
  lastTickMs = now

  stepExplosiveCharges(now)

  const { meshDirty, replicatorConsumeTicks } = stepReplicators(dtMs, voxelCells, {
    onReplicatorRockHpConsumed(cell) {
      tryDiscoveryAt(cell.pos)
      if (Math.random() >= gameBalance.drossReplicatorSpawnChance) return
      spawnDrossReplicatorScrap(drossState, cell, gameBalance)
    },
  })
  if (replicatorConsumeTicks > 0) {
    playReplicatorConsumeClicks(replicatorConsumeTicks)
  }
  if (meshDirty) {
    replaceAsteroidMesh(voxelCells)
  }

  stepEnergy(dtMs / 1000, voxelCells, energyState, debugEnergyCapBonus)

  const laserUnlockApply = {
    orbitalLaserUnlocked,
    excavatingLaserUnlocked,
    scannerLaserUnlocked,
    depthScanUnlocked,
    drossCollectorUnlocked,
    orbitalSatelliteCount,
    excavatingSatelliteCount,
    scannerSatelliteCount,
    drossCollectorSatelliteCount,
  }
  const lasersFromComputronium = stepComputronium(
    dtMs / 1000,
    voxelCells,
    energyState,
    computroniumUnlockPoints,
    laserUnlockApply,
    gameBalance,
  )
  if (lasersFromComputronium) {
    orbitalLaserUnlocked = laserUnlockApply.orbitalLaserUnlocked
    excavatingLaserUnlocked = laserUnlockApply.excavatingLaserUnlocked
    scannerLaserUnlocked = laserUnlockApply.scannerLaserUnlocked
    depthScanUnlocked = laserUnlockApply.depthScanUnlocked
    drossCollectorUnlocked = laserUnlockApply.drossCollectorUnlocked
    orbitalSatelliteCount = laserUnlockApply.orbitalSatelliteCount
    excavatingSatelliteCount = laserUnlockApply.excavatingSatelliteCount
    scannerSatelliteCount = laserUnlockApply.scannerSatelliteCount
    drossCollectorSatelliteCount = laserUnlockApply.drossCollectorSatelliteCount
    refreshToolCosts()
    syncOverlaysDepthRow()
    satelliteDots.setCounts(
      orbitalSatelliteCount,
      excavatingSatelliteCount,
      scannerSatelliteCount,
      drossCollectorSatelliteCount,
      orbitVisualRadius,
    )
  }

  const hubResult = stepHubs(dtMs / 1000, voxelCells, resourceTallies, energyState, {
    onProcessedMatterUnitTaken(cell) {
      tryDiscoveryAt(cell.pos)
    },
  })
  if (hubResult.tallyChanged) {
    markMatterHudDirty()
  }
  if (hubResult.meshDirty) {
    replaceAsteroidMesh(voxelCells)
  }

  const refineryResult = stepRefineryProcessing(dtMs / 1000, voxelCells, resourceTallies, energyState)
  if (refineryResult.tallyChanged) {
    markMatterHudDirty()
  }

  const depthProgressChanged = stepDepthReveal(dtMs / 1000, voxelCells, gameBalance, depthScanUnlocked)
  if (depthProgressChanged && depthOverlayTintActive()) {
    reapplyAllRockColorsNoLaser()
  }

  if (
    stepDrossCollection(
      dtMs / 1000,
      drossState,
      resourceTallies,
      drossCollectorSatelliteCount,
      gameBalance,
    )
  ) {
    markMatterHudDirty()
  }

  const capHud = computeEnergyCap(voxelCells, debugEnergyCapBonus)
  const energyLineHud = formatEnergyHudLine(energyState.current, capHud)
  if (matterHudDirty || energyLineHud !== lastMatterHudEnergyLine) {
    setResourceHud()
  } else {
    refreshToolCosts()
  }

  drossParticles.syncFromState(drossState, gridSize, voxelSize, currentSeed, now, scanVisualizationDebug)
  updateDrossFog(scene, totalDrossMass(drossState), gameBalance)

  const eatingMat = asteroidBundle.eating.material as MeshStandardMaterial
  if (asteroidBundle.eating.visible && asteroidBundle.eating.count > 0) {
    eatingMat.emissiveIntensity = 0.07 + 0.06 * Math.sin(now * 0.00145)
  }

  const batteryMat = asteroidBundle.battery.material as MeshStandardMaterial
  if (asteroidBundle.battery.visible && asteroidBundle.battery.count > 0) {
    batteryMat.emissiveIntensity = 0.32 + 0.14 * Math.sin(now * 0.00038)
  }

  const reactorMat = asteroidBundle.reactor.material as MeshStandardMaterial
  if (asteroidBundle.reactor.visible && asteroidBundle.reactor.count > 0) {
    reactorMat.emissiveIntensity = 0.98 + 0.05 * Math.sin(now * 0.0009)
  }

  const hubMat = asteroidBundle.hub.material as MeshStandardMaterial
  if (asteroidBundle.hub.visible && asteroidBundle.hub.count > 0) {
    hubMat.emissiveIntensity = 0.52 + 0.12 * Math.sin(now * 0.00072)
  }

  const hubStandbyMat = asteroidBundle.hubStandby.material as MeshStandardMaterial
  if (asteroidBundle.hubStandby.visible && asteroidBundle.hubStandby.count > 0) {
    hubStandbyMat.emissiveIntensity = 0.06 + 0.025 * Math.sin(now * 0.0005)
  }

  const refineryMat = asteroidBundle.refinery.material as MeshStandardMaterial
  if (asteroidBundle.refinery.visible && asteroidBundle.refinery.count > 0) {
    refineryMat.emissiveIntensity = 0.48 + 0.11 * Math.sin(now * 0.00068)
  }

  const refineryStandbyMat = asteroidBundle.refineryStandby.material as MeshStandardMaterial
  if (asteroidBundle.refineryStandby.visible && asteroidBundle.refineryStandby.count > 0) {
    refineryStandbyMat.emissiveIntensity = 0.055 + 0.022 * Math.sin(now * 0.00048)
  }

  const depthScannerMat = asteroidBundle.depthScanner.material as MeshStandardMaterial
  if (asteroidBundle.depthScanner.visible && asteroidBundle.depthScanner.count > 0) {
    depthScannerMat.emissiveIntensity = 0.48 + 0.1 * Math.sin(now * 0.00055)
  }

  const computroniumMat = asteroidBundle.computronium.material as MeshStandardMaterial
  if (asteroidBundle.computronium.visible && asteroidBundle.computronium.count > 0) {
    computroniumMat.emissiveIntensity = 0.82 + 0.12 * Math.sin(now * 0.00048)
  }

  if (
    !depthOverlayTintActive() &&
    ((laserPointerDown && orbitalLaserUnlocked && lastLaserDragTool === 'orbitalLaser' && lastLaserDragClient) ||
      (excavatingLaserPointerDown &&
        excavatingLaserUnlocked &&
        lastLaserDragTool === 'excavatingLaser' &&
        lastLaserDragClient))
  ) {
    refreshLaserRockHighlightColors()
  } else if (!depthOverlayTintActive() && hasActiveExplosiveFuse(now)) {
    refreshExplosiveFuseRockColors()
  }

  satelliteDots.tick(now)

  asteroidAmbientMusic.tick(
    dtMs / 1000,
    structureVoxelCountForMusic,
    orbitalSatelliteCount,
    excavatingSatelliteCount,
    scannerSatelliteCount,
    drossCollectorSatelliteCount,
  )

  const dtSec = dtMs / 1000
  const sunDegPerSec = Number(sunLightDebug.rotationDegPerSec)
  const sunDegPerSecUse = Number.isFinite(sunDegPerSec) ? sunDegPerSec : 0
  const starOmegaRadPerSec =
    sunLightDebug.rotateSunAzimuth && sunDegPerSecUse !== 0
      ? (sunDegPerSecUse * Math.PI) / 180
      : 0
  stepStarfield(dtSec, starOmegaRadPerSec)

  if (sunLightDebug.rotateSunAzimuth) {
    if (sunDegPerSecUse !== 0 && Number.isFinite(sunAzimuthDeg)) {
      sunAzimuthDeg = (sunAzimuthDeg + sunDegPerSecUse * dtSec + 360) % 360
    }
    applySunFromState()
  }

  if (sunDirectionHelper) {
    sunDirectionHelper.update()
  }

  controls.update()
  applyFrameShake(camera)
  if (depthOverlayTintActive()) {
    sortDepthOverlayRockInstancesByViewDistance(
      asteroidBundle,
      voxelCells,
      voxelSize,
      gridSize,
      camera.position,
    )
    if (
      (laserPointerDown && orbitalLaserUnlocked && lastLaserDragTool === 'orbitalLaser' && lastLaserDragClient) ||
      (excavatingLaserPointerDown &&
        excavatingLaserUnlocked &&
        lastLaserDragTool === 'excavatingLaser' &&
        lastLaserDragClient)
    ) {
      refreshLaserRockHighlightColors()
    } else if (hasActiveExplosiveFuse(now)) {
      refreshExplosiveFuseRockColors()
    } else {
      reapplyAllRockColorsNoLaser()
    }
  }
  renderer.render(scene, camera)
  undoFrameShake(camera)
}

syncDepthOverlayMaterials()
tick()
