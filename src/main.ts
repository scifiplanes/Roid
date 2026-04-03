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
import { createStarTintComposer } from './scene/starTintComposer'
import { setSunFromAngles } from './scene/sunAngles'
import { createOrbitControls } from './scene/controls'
import {
  generateAsteroidVoxels,
  type VoxelPos,
} from './scene/asteroid/generateAsteroidVoxels'
import { generateWreckVoxels } from './scene/wreck/generateWreckVoxels'
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
import {
  convertRockCellToProcessedMatterInPlace,
  ROCK_LITHOLOGY_KINDS,
} from './game/convertRockToProcessedMatter'
import { deriveAsteroidProfile, discoveryDensityScale, formatProfileFingerprint } from './game/asteroidGenProfile'
import {
  enrichVoxelCells,
  type ReplicatorTransformTarget,
  type VoxelCell,
} from './game/voxelState'

const REPLICATOR_TARGET_DEBUG_LABEL: Record<ReplicatorTransformTarget, string> = {
  reactor: 'Reactor',
  battery: 'Battery',
  hub: 'Hub',
  refinery: 'Refinery',
  computronium: 'Computronium',
}
import { resourceHudCssColorForId } from './game/resourceOriginDepth'
import {
  addResourceYields,
  creditAllProcessedMatterUnitsToTallies,
  createEmptyResourceTallies,
  defaultUniformRootComposition,
  formatEnergyHudLine,
  formatResourceCostWithTallies,
  matterHudRefinedEntries,
  matterHudRootEntries,
  REFINED_MATERIAL_IDS_FOR_SCAN,
  RESOURCE_DEFS,
  RESOURCE_IDS_ORDERED,
  ROOT_RESOURCE_IDS,
  type ResourceId,
  type RootResourceId,
} from './game/resources'
import {
  canAfford,
  computeEnergyCap,
  getScaledExplosiveChargeArmCost,
  getScaledMiningDronePlaceCost,
  getScaledReplicatorPlaceCost,
  getScaledSatelliteDeployCost,
  stepEnergy,
  tryConvertCellToDepthScannerWithMeta,
  tryStartReplicatorTransform,
  getReplicatorTransformPendingCount,
  stepReplicatorTransforms,
  tryPayResources,
  trySpendEnergy,
  type StructureConvertKind,
} from './game/energyAndStructures'
import {
  applyInitialToolDebugConfigToResearch,
  buildComputroniumResearchOrder,
  countActiveComputronium,
  getRefineryRecipeUiPhase,
  getResearchPhaseForPlayerToolId,
  isToolAllowedByInitialDebugConfig,
  isRefineryRecipeUnlocked,
  stepComputronium,
  type ComputroniumUnlockId,
  type LaserUnlockApply,
  type RefineryRecipeUiState,
  type ResearchPhaseState,
} from './game/computroniumSim'
import { syncResearchFlagsFromPoints } from './game/computroniumResearchQueue'
import { hasAnyRootResource, isGameplayToolRosterAllowed } from './game/toolRosterPolicy'
import {
  applyDiscoveryAccept,
  discoveryPosKey,
  isDiscoverySite,
  tryDiscoveryClaim,
  type DiscoveryOffer,
} from './game/discoveryGen'
import { loadDiscoveryAutoResolve, saveDiscoveryAutoResolve } from './game/discoveryUiPrefs'
import {
  aggregateDrossBulkComposition,
  createDrossState,
  resetDrossState,
  spawnDrossFromRemovedCell,
  spawnDrossReplicatorScrap,
  stepDrossCollection,
  stepDrossHoover,
  totalDrossMass,
} from './game/drossSim'
import {
  collectDebris,
  createDebrisState,
  raycastDebris,
  spawnDebrisFromRemovedCell as spawnDebrisShardFromRemovedCell,
  stepDebris,
  type DebrisState,
} from './game/debrisSim'
import { createDebrisShardsGroup, type DebrisShardsHandle } from './scene/debrisShards'
import { createLifterFlightsGroup, type LifterFlightsHandle } from './scene/lifterFlights'
import { spawnScourgeAt, stepScourge } from './game/scourgeSim'
import { initMiningDroneCell, stepMiningDrones } from './game/miningDroneSim'
import { spawnLocustAt, stepLocust } from './game/locustSim'
import { pokeReplicator } from './game/replicatorSim'
import {
  asteroidHasKind,
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
  createToolHoldRingElement,
  createToolHoldSustainRipplesElement,
  onDebrisCollectFeedback,
  onMiningHitFeedback,
  onMiningHitFeedbackVisualOnly,
  playReplicatorConsumeClicks,
  startExcavatingLaserSustain,
  startHooverSustain,
  startOrbitalLaserSustain,
  stopExcavatingLaserSustain,
  stopHooverSustain,
  stopOrbitalLaserSustain,
  playHubToggle,
  playRefineryToggle,
  playReplicatorPlaceClick,
  playReplicatorTapClick,
  playScanPing,
  playExplosiveChargeDetonation,
  playDiscoveryFalseSignal,
  undoFrameShake,
  updateToolHoldRing,
  updateToolHoldSustainRipples,
} from './game/clickFeedback'
import { gameBalance, initGameBalanceFromPersisted } from './game/gameBalance'
import { perfMark, perfMeasure } from './game/perfMarks'
import {
  sampleAudioMeters,
  updateSettingsAudioMeterElement,
} from './game/audioMeters'
import { createPerfDebugOverlay, getPerfDebugOverlayStored } from './game/perfDebugOverlay'
import { applySfxReverbFromBalance, applySfxVolumeLinear } from './game/sfxReverbBus'
import persistedSnapshot from './game/gameBalance.persisted.json' with { type: 'json' }
import musicDebugSnapshot from './game/asteroidMusicDebug.persisted.json' with { type: 'json' }
import settingsClientSnapshot from './game/settingsClient.persisted.json' with { type: 'json' }
import { createDefaultAsteroidMusicDebug } from './game/asteroidMusicDebug'
import {
  createDefaultSunLightDebug,
  randomAsteroidAxisRotationRad,
  randomKeyLightIntensityFactorForAsteroid,
  randomSunAnglesForAsteroid,
} from './game/sunLightDebug'
import { initAsteroidMusicDebugFromPersisted, schedulePersistAsteroidMusicDebug } from './game/asteroidMusicPersist'
import {
  countStructureVoxelsForMusic,
  createAsteroidAmbientMusic,
} from './game/asteroidAmbientMusic'
import { loadMusicVolumeLinear, saveMusicVolumeLinear } from './game/musicVolume'
import { loadSfxVolumeLinear, saveSfxVolumeLinear } from './game/sfxVolume'
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
import { loadPersistedPickThudDebug } from './game/pickThudPersist'
import { pickThudDebug } from './game/pickThudDebug'
import {
  applyAudioMasterDebug,
  setAudioMasterDebugGetter,
} from './game/masterOutputChain'
import { createOverlaysMenu } from './ui/overlaysMenu'
import { createSettingsMenu } from './ui/settingsMenu'
import { COLOR_SCHEME_OPTIONS, DEFAULT_COLOR_SCHEME, getColorSchemeClass, type ColorSchemeId } from './ui/colorScheme'
import { DEFAULT_FONT_ID, FONT_OPTIONS, getFontClass, type FontId } from './ui/fontTheme'
import { updateDrossFog } from './scene/drossFog'
import { createPauseButton } from './ui/pauseButton'
import { createDrossParticlesGroup } from './scene/drossParticles'
import { createSatelliteDotsGroup } from './scene/satelliteDots'
import { getSandboxModeEnabled, subscribeSandboxMode } from './game/sandboxMode'
import {
  projectVoxelPosToClient,
  segmentFirstBorderHitTowardRect,
} from './scene/voxelScreenProjection'
import { loadGameStartTipsDismissed, saveGameStartTipsDismissed } from './game/gameStartTipsPrefs'
import { createGameStartTipsModal } from './ui/gameStartTipsModal'
import { createDiscoveryModal } from './ui/discoveryModal'
import {
  createSatelliteInspectModal,
  type SatelliteInspectKind,
} from './ui/satelliteInspectModal'
import { createRefineryRecipesModal } from './ui/refineryRecipesModal'
import { createSeedAssemblyModal, type SeedAssemblySelection } from './ui/seedAssemblyModal'
import {
  createToolsPanel,
  getPlayerToolForHotkeyCode,
  type LaserSatelliteRowSnapshot,
  type PlayerTool,
  type SatelliteDeployKind,
} from './ui/toolsPanel'
import { stepDepthReveal } from './game/depthScannerSim'
import { formatInspectHudLines } from './game/inspectVoxel'
import {
  bulkCompositionToRockHintColor,
  clearDepthRevealState,
  clearSurfaceScanTint,
  compositionToScanColor,
  formatScanRefinedPreviewLine,
  getActiveScanVisualizationDebug,
  setScanVisualizationDebugGetter,
} from './game/scanVisualization'
import { createDefaultScanVisualizationDebug } from './game/scanVisualizationDebug'
import { createDefaultLocalStarTintDebug } from './game/localStarTintDebug'
import {
  loadPersistedLocalStarTintDebug,
  schedulePersistLocalStarTintDebug,
} from './game/localStarTintPersist'
import {
  rebuildReplicatorSimHotLists,
  resetReplicatorSimAccumulators,
  stepReplicators,
  type ReplicatorNeighborIndex,
} from './game/replicatorSim'
import { clampGameSpeedMult, loadGameSpeedMult, saveGameSpeedMult } from './game/gameSpeedDebug'
import { applyRendererPixelRatio, loadMaxPixelRatioCap, saveMaxPixelRatioCap } from './game/rendererPrefs'
import { packVoxelKey } from './game/spatialKey'
import { stepHubs } from './game/hubSim'
import { stepCargoDrones } from './game/cargoDroneSim'
import { defaultRefineryRecipeSelection } from './game/refineryRecipeUnlock'
import { stepRefineryProcessing } from './game/refineryProcessSim'
import {
  createAudioContextNow,
  ensureAudioContextInitialized,
  isAudioContextReady,
  onAudioContextStateChange,
  resetAudioInitializedAfterBackgrounding,
  resumeAudioContextSync,
  setAudioSessionPlayback,
} from './game/audioContext'
import { autoLoadBundledDebugPreset } from './game/autoLoadDebugPreset'
import {
  loadSunAnglesFromLocalStorage,
  loadSunLightDebugPartialFromLocalStorage,
  registerSettingsClientSnapshot,
  schedulePersistSettingsClient,
  seedSettingsClientLocalStorageFromBundleIfMissing,
  writeSunAnglesToLocalStorage,
  writeSunLightDebugToLocalStorage,
} from './game/settingsClientPersist'
import { loadColorSchemeId, saveColorSchemeId } from './game/colorSchemePrefs'
import { loadFontId, saveFontId } from './game/fontPrefs'
import {
  deleteSeedPreset,
  getActiveSeedSelection,
  getSeedPresetById,
  getSeedPresets,
  getSelectedSeedPresetId,
  setActiveSeedSelection,
  setSelectedSeedPresetId,
  upsertSeedPreset,
  type SeedSelection,
} from './game/seedInventory'
import { currentComputroniumTier, type SeedRecipeAvailabilityState } from './game/seedRecipes'
import { SEED_DEFS, type SeedId } from './game/seedDefs'
import { createEmptyResourceTalliesBySource, type ResourceTalliesBySource } from './game/resources'
import type { CoreAsset } from './game/coreAssets'
import { deriveWreckProfile } from './game/wreckGenProfile'

await autoLoadBundledDebugPreset()

initGameBalanceFromPersisted(persistedSnapshot)
seedSettingsClientLocalStorageFromBundleIfMissing(settingsClientSnapshot)

let musicVolumeLinear = loadMusicVolumeLinear()
let sfxVolumeLinear = loadSfxVolumeLinear()
let gameSpeedMult = loadGameSpeedMult()
applySfxVolumeLinear(sfxVolumeLinear)
const asteroidMusicDebug = createDefaultAsteroidMusicDebug()
const sunLightDebug = createDefaultSunLightDebug()
Object.assign(sunLightDebug, loadSunLightDebugPartialFromLocalStorage())
const scanVisualizationDebug = createDefaultScanVisualizationDebug()
Object.assign(scanVisualizationDebug, loadPersistedScanVisualizationDebug())
setScanVisualizationDebugGetter(() => scanVisualizationDebug)
const localStarTintDebug = createDefaultLocalStarTintDebug()
Object.assign(localStarTintDebug, loadPersistedLocalStarTintDebug())
const audioMasterDebug = createDefaultAudioMasterDebug()
Object.assign(audioMasterDebug, loadPersistedAudioMasterDebug())
setAudioMasterDebugGetter(() => audioMasterDebug)
Object.assign(pickThudDebug, loadPersistedPickThudDebug())
initAsteroidMusicDebugFromPersisted(musicDebugSnapshot, asteroidMusicDebug)

function bumpMusicToolTapActivity(): void {
  musicToolTapActivityRemainSec = asteroidMusicDebug.interactionToolTapDurationSec
}

const asteroidAmbientMusic = createAsteroidAmbientMusic({
  getDebug: () => asteroidMusicDebug,
  getMusicVolume: () => musicVolumeLinear,
})

const app = document.querySelector<HTMLDivElement>('#app')!
app.replaceChildren()

const audioUnlockFallback = document.createElement('button')
audioUnlockFallback.type = 'button'
audioUnlockFallback.setAttribute('aria-label', 'Enable audio')
audioUnlockFallback.style.cssText =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0'

const viewport = document.createElement('div')
viewport.id = 'viewport'
app.append(audioUnlockFallback, viewport)

const audioFallbackBtn = document.createElement('button')
audioFallbackBtn.id = 'audio-fallback-btn'
audioFallbackBtn.textContent = 'TAP TO ENABLE AUDIO'
audioFallbackBtn.style.display = 'none'
audioFallbackBtn.addEventListener('touchend', (e) => {
  e.preventDefault()
  setAudioSessionPlayback()
  createAudioContextNow()
  void resumeAudioContextSync().then(() => { void initializeAudio() })
})
audioFallbackBtn.addEventListener('click', () => {
  setAudioSessionPlayback()
  createAudioContextNow()
  void resumeAudioContextSync().then(() => { void initializeAudio() })
})
viewport.appendChild(audioFallbackBtn)

function showAudioFallbackButton(): void {
  audioFallbackBtn.style.display = 'block'
}

function hideAudioFallbackButton(): void {
  audioFallbackBtn.style.display = 'none'
}

const initializeAudio = async () => {
  await ensureAudioContextInitialized()
  if (isAudioContextReady()) {
    asteroidAmbientMusic.tryEnsureGraph()
    hideAudioFallbackButton()
  } else {
    showAudioFallbackButton()
  }
}

onAudioContextStateChange(() => {
  if (isAudioContextReady()) {
    asteroidAmbientMusic.tryEnsureGraph()
    hideAudioFallbackButton()
  }
})

let audioUnlockDone = false

const gestureUnlockAudio = () => {
  setAudioSessionPlayback()
  createAudioContextNow()
  void resumeAudioContextSync().then(() => {
    if (!audioUnlockDone && isAudioContextReady()) {
      audioUnlockDone = true
    }
    void initializeAudio()
  })
}

viewport.addEventListener('touchend', gestureUnlockAudio, { passive: true })
viewport.addEventListener('mousedown', gestureUnlockAudio, { passive: true })
document.addEventListener('click', gestureUnlockAudio, { passive: true })
document.addEventListener('keydown', gestureUnlockAudio, { passive: true })

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    audioUnlockDone = false
    resetAudioInitializedAfterBackgrounding()
  }
})

const { scene, camera, renderer, sun, stepStarfield } = setupScene(viewport)
applyRendererPixelRatio(renderer)
const starTintComposer = createStarTintComposer(renderer, scene, camera, () => localStarTintDebug)
sun.intensity = KEY_LIGHT_INTENSITY_BASE * randomKeyLightIntensityFactorForAsteroid()

const SUN_RADIUS = Math.hypot(8, 12, 10)
const startSunAngles = loadSunAnglesFromLocalStorage() ?? randomSunAnglesForAsteroid()
let sunAzimuthDeg = startSunAngles.azimuthDeg
let sunElevationDeg = startSunAngles.elevationDeg
/** Throttle localStorage + project JSON while key-light azimuth auto-rotates. */
let lastPersistedSunAnglesWallMs = 0

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
  writeSunAnglesToLocalStorage(sunAzimuthDeg, sunElevationDeg)
  schedulePersistSettingsClient()
}

const gridSize = 33
const voxelSize = 0.92

let currentSeed = 42
starTintComposer.setTintFromSeed(currentSeed)
let computroniumResearchOrder: ComputroniumUnlockId[] = buildComputroniumResearchOrder(currentSeed)
let currentAsset: CoreAsset = {
  id: 'core-asset',
  kind: 'asteroid',
  seed: currentSeed,
  gridSize,
  profile: deriveAsteroidProfile(currentSeed),
}

function currentAsteroidProfile() {
  return currentAsset.kind === 'asteroid' ? (currentAsset.profile as ReturnType<typeof deriveAsteroidProfile>) : deriveAsteroidProfile(currentAsset.seed)
}

function generateCoreAssetVoxels(kind: CoreAsset['kind'], seed: number): VoxelPos[] {
  if (kind === 'wreck') {
    const { profile } = deriveWreckProfile(seed)
    return generateWreckVoxels({
      gridSize,
      seed,
      profile,
    })
  }
  const asteroidProfile = currentAsteroidProfile()
  return applyImpactCraters(
    generateAsteroidVoxels({
      gridSize,
      seed,
      ...asteroidProfile.shape,
    }),
    gridSize,
    seed,
    asteroidProfile,
    gameBalance.impactCraterRangeMult,
    gameBalance.impactCraterRadiusMinVoxels,
    gameBalance.impactCraterRadiusMaxVoxels,
    gameBalance.impactCraterCountMin,
    gameBalance.impactCraterCountMax,
  )
}

function enrichCoreAssetVoxels(positions: VoxelPos[], kind: CoreAsset['kind']): VoxelCell[] {
  const asteroidProfile = currentAsteroidProfile()
  const cells = enrichVoxelCells(positions, {
    seed: currentSeed,
    gridSize,
    baseRadius: asteroidProfile.shape.baseRadius,
    noiseAmplitude: asteroidProfile.shape.noiseAmplitude,
    profile: asteroidProfile,
    coreAssetKind: kind,
  })
  const originSource = kind === 'wreck' ? 'wreck' : 'asteroid'
  for (const cell of cells) {
    cell.originSource = originSource
  }
  return cells
}

const initialPositions = generateCoreAssetVoxels(currentAsset.kind, currentSeed)
let voxelCells: VoxelCell[] = enrichCoreAssetVoxels(initialPositions, currentAsset.kind)

/** Cached for ambient music tick; updated in `replaceAsteroidMesh`. */
let structureVoxelCountForMusic = 0

/** When true, replicator rock feeding and replicator→structure timers do not advance. */
let replicatorKillswitchEngaged = false

let voxelPosToIndex: Map<number, number> | null = null
let replicatorNeighborIndex: ReplicatorNeighborIndex | null = null

function invalidateVoxelPosIndexMap(): void {
  voxelPosToIndex = null
  replicatorNeighborIndex = null
}

/** One pass builds both position→index (raycast) and position→cell (sim) maps. */
function ensureSpatialIndices(): void {
  if (voxelPosToIndex !== null && replicatorNeighborIndex !== null) return
  rebuildReplicatorSimHotLists(voxelCells)
  const vi = new Map<number, number>()
  const ri: ReplicatorNeighborIndex = new Map()
  for (let i = 0; i < voxelCells.length; i++) {
    const cell = voxelCells[i]!
    const k = packVoxelKey(cell.pos.x, cell.pos.y, cell.pos.z, gridSize)
    vi.set(k, i)
    ri.set(k, cell)
  }
  voxelPosToIndex = vi
  replicatorNeighborIndex = ri
}

function getVoxelPosIndexMap(): Map<number, number> {
  ensureSpatialIndices()
  return voxelPosToIndex!
}

function getReplicatorNeighborIndex(): ReplicatorNeighborIndex {
  ensureSpatialIndices()
  return replicatorNeighborIndex!
}

const initialProfileForMesh = currentAsteroidProfile()
let asteroidBundle: AsteroidRenderBundle = buildAsteroidMesh(voxelCells, {
  voxelSize,
  gridSize,
  baseColor: new Color(
    initialProfileForMesh.rockBaseColorRgb.r,
    initialProfileForMesh.rockBaseColorRgb.g,
    initialProfileForMesh.rockBaseColorRgb.b,
  ),
  rockMetalness: initialProfileForMesh.rockMetalness,
})
scene.add(asteroidBundle.group)
applyAsteroidGroupRotation()
structureVoxelCountForMusic = countStructureVoxelsForMusic(voxelCells)

const drossState = createDrossState()
let debrisState: DebrisState = createDebrisState()
const drossParticles = createDrossParticlesGroup()
asteroidBundle.group.add(drossParticles.group)
const debrisVisual: DebrisShardsHandle = createDebrisShardsGroup()
asteroidBundle.group.add(debrisVisual.group)
const lifterFlightsVisual: LifterFlightsHandle = createLifterFlightsGroup()
asteroidBundle.group.add(lifterFlightsVisual.group)

interface LifterFlight {
  pos: { x: number; y: number; z: number }
  vel: { x: number; y: number; z: number }
  spawnMs: number
  discoveryPos: VoxelPos
  units: number
  comp: Record<RootResourceId, number>
  originSource?: 'asteroid' | 'wreck'
}

const lifterFlights: LifterFlight[] = []

const debrisBracketLayer = document.createElement('div')
debrisBracketLayer.className = 'debris-brackets-layer'
viewport.appendChild(debrisBracketLayer)

const _debrisWorldPos = new Vector3()
const _debrisNdc = new Vector3()
const _lifterCamLocal = new Vector3()
const debrisBracketsById = new Map<number, HTMLDivElement>()

let orbitVisualRadius = currentAsteroidProfile().shape.baseRadius * voxelSize * 1.5
const satelliteDots = createSatelliteDotsGroup()
satelliteDots.setCounts(0, 0, 0, 0, 0, orbitVisualRadius)
scene.add(satelliteDots.group)

const controls = createOrbitControls(camera, renderer.domElement)

/** Baseline for skipping depth-overlay resort when the camera and rock pose are static. */
const lastDepthViewCam = new Vector3(Number.NaN, Number.NaN, Number.NaN)
const lastDepthViewTarget = new Vector3(Number.NaN, Number.NaN, Number.NaN)
const lastDepthAsteroidRot = new Vector3(Number.NaN, Number.NaN, Number.NaN)
const DEPTH_VIEW_EPS_SQ = 1e-7

function resetDepthOverlayViewBaseline(): void {
  lastDepthViewCam.set(Number.NaN, Number.NaN, Number.NaN)
}

function depthOverlayViewChanged(): boolean {
  const cam = camera.position
  const tgt = controls.target
  if (!Number.isFinite(lastDepthViewCam.x)) {
    lastDepthViewCam.copy(cam)
    lastDepthViewTarget.copy(tgt)
    lastDepthAsteroidRot.set(asteroidRotX, asteroidRotY, asteroidRotZ)
    return true
  }
  const camMoved = cam.distanceToSquared(lastDepthViewCam) > DEPTH_VIEW_EPS_SQ
  const tgtMoved = tgt.distanceToSquared(lastDepthViewTarget) > DEPTH_VIEW_EPS_SQ
  const rotMoved =
    Math.abs(asteroidRotX - lastDepthAsteroidRot.x) > 1e-9 ||
    Math.abs(asteroidRotY - lastDepthAsteroidRot.y) > 1e-9 ||
    Math.abs(asteroidRotZ - lastDepthAsteroidRot.z) > 1e-9
  lastDepthViewCam.copy(cam)
  lastDepthViewTarget.copy(tgt)
  lastDepthAsteroidRot.set(asteroidRotX, asteroidRotY, asteroidRotZ)
  return camMoved || tgtMoved || rotMoved
}

const resourceTallies = createEmptyResourceTallies()
const resourceTalliesFloatBaseline = createEmptyResourceTallies()
/**
 * PM→root credits since last matter HUD float sync (merged across ticks).
 * Anchors gain floats at the relevant voxel (hub, PM cell, cargo pickup, lifter source, etc.).
 */
const pendingWorldAnchoredRootGainsByKey = new Map<
  number,
  { pos: VoxelPos; delta: Partial<Record<RootResourceId, number>> }
>()

/** Batched HUD gain floats: at most one combined flush per second to reduce overlap. */
const MATTER_HUD_GAIN_FLOAT_MERGE_MS = 1000
const pendingGainFloatMergeById = createEmptyResourceTallies()
const pendingGainFloatAnchoredAccum = new Map<
  number,
  { pos: VoxelPos; delta: Partial<Record<RootResourceId, number>> }
>()
/** Hoover tool: screen-anchored root gains (merged for debounced flush). */
let pendingGainFloatHooverPointer: {
  clientX: number
  clientY: number
  delta: Partial<Record<RootResourceId, number>>
} | null = null
const HOVER_POINTER_GAIN_KEY = 0
const pendingHooverPointerRootGainsMerge = new Map<
  number,
  { clientX: number; clientY: number; delta: Partial<Record<RootResourceId, number>> }
>()
/** Nudge floats so labels sit beside the cursor, not under it. */
const HOOVER_GAIN_FLOAT_CLIENT_OFFSET_X = 10
const HOOVER_GAIN_FLOAT_CLIENT_OFFSET_Y = -6
let matterHudGainFloatFlushTimer: ReturnType<typeof setTimeout> | null = null

function mergeAnchoredGainsMapIntoAccum(
  from: Map<number, { pos: VoxelPos; delta: Partial<Record<RootResourceId, number>> }>,
): void {
  for (const [k, v] of from) {
    const prev = pendingGainFloatAnchoredAccum.get(k)
    if (!prev) {
      pendingGainFloatAnchoredAccum.set(k, {
        pos: { x: v.pos.x, y: v.pos.y, z: v.pos.z },
        delta: { ...v.delta },
      })
    } else {
      for (const id of ROOT_RESOURCE_IDS) {
        const n = v.delta[id]
        if (n === undefined || n <= 0) continue
        prev.delta[id] = (prev.delta[id] ?? 0) + n
      }
    }
  }
  from.clear()
}

/**
 * Credits can record voxel-anchored gains after the last `syncMatterHudResourceGainFloats` but before the
 * debounced flush runs; those entries stay in `pendingWorldAnchoredRootGainsByKey` until pulled here.
 */
function pullPendingWorldAnchoredIntoGainFloatBatch(): void {
  if (pendingWorldAnchoredRootGainsByKey.size === 0) return
  for (const { delta } of pendingWorldAnchoredRootGainsByKey.values()) {
    for (const id of ROOT_RESOURCE_IDS) {
      const n = delta[id]
      if (n === undefined || n <= 0) continue
      pendingGainFloatMergeById[id] = (pendingGainFloatMergeById[id] ?? 0) + n
    }
  }
  mergeAnchoredGainsMapIntoAccum(pendingWorldAnchoredRootGainsByKey)
}

function mergeHooverPointerGainsMapIntoAccum(
  from: Map<number, { clientX: number; clientY: number; delta: Partial<Record<RootResourceId, number>> }>,
): void {
  if (from.size === 0) return
  for (const v of from.values()) {
    if (!pendingGainFloatHooverPointer) {
      pendingGainFloatHooverPointer = {
        clientX: v.clientX,
        clientY: v.clientY,
        delta: { ...v.delta },
      }
    } else {
      pendingGainFloatHooverPointer.clientX = v.clientX
      pendingGainFloatHooverPointer.clientY = v.clientY
      for (const id of ROOT_RESOURCE_IDS) {
        const n = v.delta[id]
        if (n === undefined || n <= 0) continue
        pendingGainFloatHooverPointer.delta[id] = (pendingGainFloatHooverPointer.delta[id] ?? 0) + n
      }
    }
  }
  from.clear()
}

function pullPendingHooverPointerIntoGainFloatBatch(): void {
  if (pendingHooverPointerRootGainsMerge.size === 0) return
  for (const { delta } of pendingHooverPointerRootGainsMerge.values()) {
    for (const id of ROOT_RESOURCE_IDS) {
      const n = delta[id]
      if (n === undefined || n <= 0) continue
      pendingGainFloatMergeById[id] = (pendingGainFloatMergeById[id] ?? 0) + n
    }
  }
  mergeHooverPointerGainsMapIntoAccum(pendingHooverPointerRootGainsMerge)
}

function flushPendingMatterHudGainFloats(): void {
  matterHudGainFloatFlushTimer = null
  pullPendingWorldAnchoredIntoGainFloatBatch()
  pullPendingHooverPointerIntoGainFloatBatch()

  const totalEntries: { id: ResourceId; n: number }[] = []
  for (const id of RESOURCE_IDS_ORDERED) {
    const n = pendingGainFloatMergeById[id] ?? 0
    if (n > 0) totalEntries.push({ id, n })
  }
  if (
    totalEntries.length === 0 &&
    pendingGainFloatAnchoredAccum.size === 0 &&
    pendingGainFloatHooverPointer === null
  ) {
    return
  }

  const anchoredSumById = createEmptyResourceTallies()
  let anchoredVoxelCount = 0
  for (const { delta } of pendingGainFloatAnchoredAccum.values()) {
    let any = false
    for (const id of ROOT_RESOURCE_IDS) {
      const v = delta[id]
      if (v === undefined || v <= 0) continue
      anchoredSumById[id] = (anchoredSumById[id] ?? 0) + v
      any = true
    }
    if (any) anchoredVoxelCount += 1
  }
  if (pendingGainFloatHooverPointer) {
    let any = false
    for (const id of ROOT_RESOURCE_IDS) {
      const v = pendingGainFloatHooverPointer.delta[id]
      if (v === undefined || v <= 0) continue
      anchoredSumById[id] = (anchoredSumById[id] ?? 0) + v
      any = true
    }
    if (any) anchoredVoxelCount += 1
  }

  const remainder: { id: ResourceId; n: number }[] = []
  for (const e of totalEntries) {
    const anchoredPart = anchoredSumById[e.id] ?? 0
    const rem = Math.max(0, e.n - anchoredPart)
    if (rem > 0) remainder.push({ id: e.id, n: rem })
  }

  const remainderFloatCount = remainder.length > 0 ? 1 : 0
  const wouldSpawnMultipleFloats = anchoredVoxelCount + remainderFloatCount > 1

  // #region agent log
  fetch('http://127.0.0.1:7481/ingest/59523295-7b3c-4817-bc0e-c2fb63f1b767', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fd2cbb' },
    body: JSON.stringify({
      sessionId: 'fd2cbb',
      location: 'main.ts:flushPendingMatterHudGainFloats',
      message: 'gain_float_flush_plan',
      data: {
        wouldSpawnMultipleFloats,
        anchoredVoxelCount,
        hasRemainder: remainder.length > 0,
        remainderIds: remainder.map((e) => e.id),
        totalEntryIds: totalEntries.map((e) => e.id),
      },
      timestamp: Date.now(),
      hypothesisId: 'H1',
    }),
  }).catch(() => {})
  // #endregion

  if (wouldSpawnMultipleFloats) {
    // #region agent log
    fetch('http://127.0.0.1:7481/ingest/59523295-7b3c-4817-bc0e-c2fb63f1b767', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fd2cbb' },
      body: JSON.stringify({
        sessionId: 'fd2cbb',
        location: 'main.ts:flushPendingMatterHudGainFloats',
        message: 'append_gain_float',
        data: {
          placement: 'pointer',
          reason: 'collapse_multi_float',
          entries: totalEntries.map((e) => ({ id: e.id, n: e.n })),
        },
        timestamp: Date.now(),
        hypothesisId: 'H1',
      }),
    }).catch(() => {})
    // #endregion
    appendMatterHudGainFloatDom(totalEntries, 'pointer', 0)
  } else {
    const canvasRect = renderer.domElement.getBoundingClientRect()
    let gainFloatStagger = 0
    for (const { pos, delta } of pendingGainFloatAnchoredAccum.values()) {
      const anchoredEntries: { id: ResourceId; n: number }[] = []
      for (const id of ROOT_RESOURCE_IDS) {
        const n = delta[id]
        if (n === undefined || n <= 0) continue
        anchoredEntries.push({ id, n })
      }
      if (anchoredEntries.length === 0) continue

      const { clientX, clientY, onScreen } = projectVoxelPosToClient(
        pos,
        gridSize,
        voxelSize,
        asteroidBundle.group,
        camera,
        canvasRect,
      )
      const idx = gainFloatStagger++
      if (onScreen) {
        // #region agent log
        fetch('http://127.0.0.1:7481/ingest/59523295-7b3c-4817-bc0e-c2fb63f1b767', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fd2cbb' },
          body: JSON.stringify({
            sessionId: 'fd2cbb',
            location: 'main.ts:flushPendingMatterHudGainFloats',
            message: 'append_gain_float',
            data: {
              placement: 'voxel_projected',
              reason: 'anchored_on_screen',
              pos: { x: pos.x, y: pos.y, z: pos.z },
              clientX,
              clientY,
              entries: anchoredEntries.map((e) => ({ id: e.id, n: e.n })),
            },
            timestamp: Date.now(),
            hypothesisId: 'H2',
          }),
        }).catch(() => {})
        // #endregion
        appendMatterHudGainFloatDom(anchoredEntries, { clientX, clientY }, idx)
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7481/ingest/59523295-7b3c-4817-bc0e-c2fb63f1b767', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fd2cbb' },
          body: JSON.stringify({
            sessionId: 'fd2cbb',
            location: 'main.ts:flushPendingMatterHudGainFloats',
            message: 'append_gain_float',
            data: {
              placement: 'default_hud_strip',
              reason: 'anchored_off_screen',
              pos: { x: pos.x, y: pos.y, z: pos.z },
              entries: anchoredEntries.map((e) => ({ id: e.id, n: e.n })),
            },
            timestamp: Date.now(),
            hypothesisId: 'H2',
          }),
        }).catch(() => {})
        // #endregion
        appendMatterHudGainFloatDom(anchoredEntries, 'default', idx)
      }
    }

    if (pendingGainFloatHooverPointer) {
      const hp = pendingGainFloatHooverPointer
      const hooverEntries: { id: ResourceId; n: number }[] = []
      for (const id of ROOT_RESOURCE_IDS) {
        const n = hp.delta[id]
        if (n === undefined || n <= 0) continue
        hooverEntries.push({ id, n })
      }
      if (hooverEntries.length > 0) {
        const idx = gainFloatStagger++
        appendMatterHudGainFloatDom(
          hooverEntries,
          {
            clientX: hp.clientX + HOOVER_GAIN_FLOAT_CLIENT_OFFSET_X,
            clientY: hp.clientY + HOOVER_GAIN_FLOAT_CLIENT_OFFSET_Y,
          },
          idx,
        )
      }
    }

    if (remainder.length > 0) {
      // #region agent log
      fetch('http://127.0.0.1:7481/ingest/59523295-7b3c-4817-bc0e-c2fb63f1b767', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fd2cbb' },
        body: JSON.stringify({
          sessionId: 'fd2cbb',
          location: 'main.ts:flushPendingMatterHudGainFloats',
          message: 'append_gain_float',
          data: {
            placement: 'pointer',
            reason: 'remainder_unanchored_or_refined',
            entries: remainder.map((e) => ({ id: e.id, n: e.n })),
          },
          timestamp: Date.now(),
          hypothesisId: 'H2',
        }),
      }).catch(() => {})
      // #endregion
      appendMatterHudGainFloatDom(remainder, 'pointer', gainFloatStagger++)
    }
  }

  Object.assign(pendingGainFloatMergeById, createEmptyResourceTallies())
  pendingGainFloatAnchoredAccum.clear()
  pendingGainFloatHooverPointer = null
}

function schedulePendingMatterHudGainFloatFlush(): void {
  if (matterHudGainFloatFlushTimer !== null) return
  matterHudGainFloatFlushTimer = setTimeout(flushPendingMatterHudGainFloats, MATTER_HUD_GAIN_FLOAT_MERGE_MS)
}

function mergePendingHooverPointerRootGains(
  clientX: number,
  clientY: number,
  delta: Partial<Record<RootResourceId, number>>,
): void {
  let nonempty = false
  for (const id of ROOT_RESOURCE_IDS) {
    if ((delta[id] ?? 0) > 0) {
      nonempty = true
      break
    }
  }
  if (!nonempty) return
  const prev = pendingHooverPointerRootGainsMerge.get(HOVER_POINTER_GAIN_KEY)
  if (!prev) {
    pendingHooverPointerRootGainsMerge.set(HOVER_POINTER_GAIN_KEY, {
      clientX,
      clientY,
      delta: { ...delta },
    })
  } else {
    prev.clientX = clientX
    prev.clientY = clientY
    for (const id of ROOT_RESOURCE_IDS) {
      const v = delta[id]
      if (v === undefined || v <= 0) continue
      prev.delta[id] = (prev.delta[id] ?? 0) + v
    }
  }
}

function mergePendingWorldAnchoredRootGains(
  pos: VoxelPos,
  delta: Partial<Record<RootResourceId, number>>,
  anchoredGainSource: 'lifter_discovery' | 'hub_pm' | 'cargo_drone',
): void {
  let nonempty = false
  for (const id of ROOT_RESOURCE_IDS) {
    if ((delta[id] ?? 0) > 0) {
      nonempty = true
      break
    }
  }
  if (!nonempty) return
  // #region agent log
  fetch('http://127.0.0.1:7481/ingest/59523295-7b3c-4817-bc0e-c2fb63f1b767', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fd2cbb' },
    body: JSON.stringify({
      sessionId: 'fd2cbb',
      location: 'main.ts:mergePendingWorldAnchoredRootGains',
      message: 'anchored_root_gain_queued',
      data: {
        anchoredGainSource,
        pos: { x: pos.x, y: pos.y, z: pos.z },
        deltaKeys: ROOT_RESOURCE_IDS.filter((id) => (delta[id] ?? 0) > 0),
      },
      timestamp: Date.now(),
      hypothesisId: 'H5',
    }),
  }).catch(() => {})
  // #endregion
  const k = packVoxelKey(pos.x, pos.y, pos.z, gridSize)
  const prev = pendingWorldAnchoredRootGainsByKey.get(k)
  if (!prev) {
    pendingWorldAnchoredRootGainsByKey.set(k, {
      pos: { x: pos.x, y: pos.y, z: pos.z },
      delta: { ...delta },
    })
  } else {
    for (const id of ROOT_RESOURCE_IDS) {
      const v = delta[id]
      if (v === undefined || v <= 0) continue
      prev.delta[id] = (prev.delta[id] ?? 0) + v
    }
  }
}
const resourceTalliesBySource: ResourceTalliesBySource = createEmptyResourceTalliesBySource(
  createEmptyResourceTallies,
)
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

const discoveryPendingLayer = document.createElement('div')
discoveryPendingLayer.className = 'discovery-pending-layer'
discoveryPendingLayer.setAttribute('aria-label', 'Pending discoveries')
discoveryPendingLayer.hidden = true

const discoveryPendingSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
discoveryPendingSvg.setAttribute('class', 'discovery-pending-svg')
discoveryPendingSvg.setAttribute('aria-hidden', 'true')

const discoveryPendingChips = document.createElement('div')
discoveryPendingChips.className = 'discovery-pending-chips'

discoveryPendingLayer.append(discoveryPendingSvg, discoveryPendingChips)

const matterHud = document.createElement('div')
matterHud.id = 'matter-hud'

/** Full-screen layer so gain floats stack above tools dock / settings; `pointer-events: none` in CSS. */
const resourceGainOverlay = document.createElement('div')
resourceGainOverlay.className = 'resource-gain-overlay'
resourceGainOverlay.setAttribute('aria-hidden', 'true')

const pendingDiscoveries: DiscoveryOffer[] = []
/** Filled in `syncDiscoveryHud` for O(1) lookup in `updateDiscoveryPendingAnchors`. */
const discoveryPendingDomById = new Map<string, { wrap: HTMLElement; line: SVGLineElement }>()
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
  schedulePersistSettingsClient()
})

matterHudShell.append(matterHudMinBtn, matterHud)
matterHudWrap.append(matterHudShell)
viewport.appendChild(matterHudWrap)
viewport.appendChild(discoveryPendingLayer)
app.appendChild(resourceGainOverlay)

const pickRipple = createMineRippleElement()
viewport.appendChild(pickRipple)

const toolHoldSustainRipples = createToolHoldSustainRipplesElement()
viewport.appendChild(toolHoldSustainRipples)

const toolHoldRing = createToolHoldRingElement()
viewport.appendChild(toolHoldRing)

const falseSignalToast = document.createElement('div')
falseSignalToast.className = 'false-signal-toast'
falseSignalToast.setAttribute('role', 'status')
falseSignalToast.setAttribute('aria-live', 'polite')
falseSignalToast.textContent = 'False Signal'
viewport.appendChild(falseSignalToast)

let falseSignalToastTimer: ReturnType<typeof setTimeout> | null = null
function showFalseSignalToast(): void {
  falseSignalToast.classList.add('false-signal-toast--visible')
  if (falseSignalToastTimer !== null) clearTimeout(falseSignalToastTimer)
  falseSignalToastTimer = setTimeout(() => {
    falseSignalToastTimer = null
    falseSignalToast.classList.remove('false-signal-toast--visible')
  }, 1800)
}

const overlayVizLoaded = loadOverlayVisualizationPrefs()
let surfaceScanOverlayVisible = overlayVizLoaded.surfaceScanOverlayVisible
let depthOverlayVisible = overlayVizLoaded.depthOverlayVisible

const snapshotColorScheme = (settingsClientSnapshot as { colorScheme?: ColorSchemeId } | undefined)?.colorScheme
let colorScheme: ColorSchemeId = loadColorSchemeId(snapshotColorScheme ?? DEFAULT_COLOR_SCHEME)

const snapshotFontId = (settingsClientSnapshot as { fontId?: FontId } | undefined)?.fontId
let fontId: FontId = loadFontId(snapshotFontId ?? DEFAULT_FONT_ID)

function applyColorSchemeToApp(next: ColorSchemeId): void {
  const classList = app.classList
  for (const opt of COLOR_SCHEME_OPTIONS) {
    classList.remove(getColorSchemeClass(opt.id))
  }
  classList.add(getColorSchemeClass(next))
}

function applyFontToApp(next: FontId): void {
  const classList = app.classList
  for (const opt of FONT_OPTIONS) {
    classList.remove(getFontClass(opt.id))
  }
  classList.add(getFontClass(next))
}

applyColorSchemeToApp(colorScheme)
applyFontToApp(fontId)

function persistOverlayVisualizationPrefs(): void {
  saveOverlayVisualizationPrefs({ surfaceScanOverlayVisible, depthOverlayVisible })
  schedulePersistSettingsClient()
}

registerSettingsClientSnapshot(() => ({
  sunAzimuthDeg,
  sunElevationDeg,
  sunLightDebug,
  scanVisualizationDebug,
  localStarTintDebug,
  audioMasterDebug,
  surfaceScanOverlayVisible,
  depthOverlayVisible,
  discoveryAutoResolve,
  musicVolumeLinear,
  sfxVolumeLinear,
  matterHudCollapsed,
  matterHudCompact,
  colorScheme,
  fontId,
  gameSpeedMult,
}))
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

/** Bumped when voxel/tint/balance data affecting cached scan or discovery maps changes. */
let rockTintCacheGeneration = 0
let lastBuiltSurfaceScanTintGen = -1
let lastBuiltDiscoveryHintGen = -1

function invalidateRockTintCaches(): void {
  rockTintCacheGeneration++
}

/** When true, full rock instance colors must be recomputed (see depth-overlay tick path). */
let rockInstanceColorsDirty = true
/** Optional small dirty set for partial `reapplyRockInstanceColors` (cleared after apply). */
let rockColorDirtySubset: Set<number> | null = null
const ROCK_COLOR_PARTIAL_MAX = 48

function markRockInstanceColorsDirty(cellIndex?: number): void {
  rockInstanceColorsDirty = true
  if (cellIndex === undefined) {
    rockColorDirtySubset = null
  } else {
    if (!rockColorDirtySubset) rockColorDirtySubset = new Set()
    rockColorDirtySubset.add(cellIndex)
  }
}

function resetTintColorBorrowPool(): void {
  tintColorBorrowNext = 0
}

function borrowTintColorForScanMap(): Color {
  if (tintColorBorrowNext >= tintColorBorrowPool.length) tintColorBorrowPool.push(new Color())
  return tintColorBorrowPool[tintColorBorrowNext++]!
}

/**
 * Colors for the surface-scan overlay: cached until tint data or `invalidateRockTintCaches`.
 * Live debug sliders call `invalidateRockTintCaches` via `onScanVisualizationDebugChange`.
 */
function buildSurfaceScanTintIndexMap(): Map<number, Color> | null {
  if (!surfaceScanOverlayVisible) return null
  if (lastBuiltSurfaceScanTintGen === rockTintCacheGeneration) {
    return surfaceScanTintIndexMapReuse.size > 0 ? surfaceScanTintIndexMapReuse : null
  }
  lastBuiltSurfaceScanTintGen = rockTintCacheGeneration
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

/** When non-null, those voxel indices are drawn with the rare-lode density heatmap (Settings → Debug). */
let debugLodeDisplayIndices: Set<number> | null = null

function reapplyAllRockColorsNoLaser(): void {
  const onlyCellIndices =
    rockColorDirtySubset !== null &&
    rockColorDirtySubset.size > 0 &&
    rockColorDirtySubset.size <= ROCK_COLOR_PARTIAL_MAX &&
    !depthOverlayTintActive()
      ? rockColorDirtySubset
      : null
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
    debugLodeDisplayIndices,
    onlyCellIndices,
  )
  rockColorDirtySubset = null
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

function formatCoreAssetFingerprint(asset: CoreAsset): string {
  if (asset.kind === 'asteroid') {
    return formatProfileFingerprint(currentAsteroidProfile())
  }
  const tail = (asset.seed >>> 0).toString(16).slice(-4).padStart(4, '0')
  const archetypeLabel = (() => {
    switch (asset.archetype) {
      case 'truss':
        return 'truss segment'
      case 'cargoPod':
        return 'cargo pod'
      case 'stationPanel':
        return 'station panel'
      case 'antenna':
        return 'antenna mast'
      case 'hullChunk':
      default:
        return 'hull fragment'
    }
  })()
  return `Wreck · ${archetypeLabel} · ${tail}`
}

function spawnDebrisPickupFloat(
  clientX: number,
  clientY: number,
  reward: Partial<Record<ResourceId, number>>,
): void {
  const entries: { id: ResourceId; n: number }[] = []
  for (const id of ROOT_RESOURCE_IDS) {
    const n = reward[id]
    if (n !== undefined && n > 0) entries.push({ id, n })
  }
  if (entries.length === 0) return
  const wrap = document.createElement('div')
  wrap.className = 'debris-pickup-float'
  wrap.setAttribute('aria-hidden', 'true')
  const r = viewport.getBoundingClientRect()
  wrap.style.left = `${clientX - r.left}px`
  wrap.style.top = `${clientY - r.top}px`
  for (let i = 0; i < entries.length; i++) {
    const { id, n } = entries[i]!
    const span = document.createElement('span')
    span.className = 'debris-pickup-float-res'
    span.style.color = resourceHudCssColorForId(id)
    span.textContent = `${RESOURCE_DEFS[id].hudAbbrev} +${n}`
    wrap.appendChild(span)
    if (i < entries.length - 1) wrap.appendChild(document.createTextNode(', '))
  }
  viewport.appendChild(wrap)
  const onEnd = (): void => {
    wrap.removeEventListener('animationend', onEnd)
    wrap.remove()
  }
  wrap.addEventListener('animationend', onEnd)
}

/** Line spacing for simultaneous world-anchored gain floats (voxel / hoover); stacked upward. */
const MATTER_HUD_GAIN_WORLD_STACK_PX = 15

/**
 * Screen-space spread for simultaneous **HUD-adjacent** floats (`default` / string `pointer`
 * placements). Golden-angle spiral so labels fan out instead of stacking; radius grows so
 * later messages clear wide resource lines.
 * Stagger is applied via CSS variables in keyframes (margin fought the transform animation).
 */
function matterHudGainHudAdjacentStaggerOffsets(index: number): { dx: number; dy: number } {
  if (index <= 0) return { dx: 0, dy: 0 }
  const goldenAngle = 2.39996322972865332
  const baseR = 48
  const stepR = 56
  const r = baseR + (index - 1) * stepR
  const a = index * goldenAngle
  return {
    dx: Math.round(Math.cos(a) * r),
    dy: Math.round(Math.sin(a) * r),
  }
}

/** Vertical stack for simultaneous **world-anchored** floats (`{ clientX, clientY }`). */
function matterHudGainWorldStaggerOffsets(index: number): { dx: number; dy: number } {
  if (index <= 0) return { dx: 0, dy: 0 }
  return { dx: 0, dy: -index * MATTER_HUD_GAIN_WORLD_STACK_PX }
}

/** Center-bottom of `#matter-hud`, or the shell when minimized — used for non-voxel gain floats (not canvas pointer). */
function resourceMenuGainAnchorClient(): { x: number; y: number; usedShell: boolean } {
  const hudRect = matterHud.getBoundingClientRect()
  const shellRect = matterHudShell.getBoundingClientRect()
  const usedShell = !(hudRect.width > 0 && hudRect.height > 0)
  const menuRect = usedShell ? shellRect : hudRect
  return {
    x: menuRect.left + menuRect.width * 0.5,
    y: menuRect.bottom,
    usedShell,
  }
}

function appendMatterHudGainFloatDom(
  entries: { id: ResourceId; n: number }[],
  placement: 'default' | 'pointer' | { clientX: number; clientY: number },
  staggerIndex = 0,
): void {
  if (entries.length === 0) return
  const hudAdjacent = placement === 'default' || placement === 'pointer'
  const { dx, dy } = hudAdjacent
    ? matterHudGainHudAdjacentStaggerOffsets(staggerIndex)
    : matterHudGainWorldStaggerOffsets(staggerIndex)
  const wrap = document.createElement('div')
  wrap.setAttribute('aria-hidden', 'true')
  wrap.style.setProperty('--gain-stagger-x', `${dx}px`)
  wrap.style.setProperty('--gain-stagger-y', `${dy}px`)
  wrap.style.animationDelay = `${Math.min(staggerIndex * 0.1, 0.9)}s`
  wrap.style.zIndex = String(16 + staggerIndex)
  const overlayRect = resourceGainOverlay.getBoundingClientRect()
  if (placement === 'default') {
    const { x: menuX, y: menuY } = resourceMenuGainAnchorClient()
    wrap.className = 'matter-hud-gain-float matter-hud-gain-float--overlay-pinned'
    if (!matterHudCompact) wrap.classList.add('matter-hud-gain-float--spacious')
    wrap.style.left = `${menuX - overlayRect.left}px`
    wrap.style.top = `${menuY - overlayRect.top}px`
  } else if (placement === 'pointer') {
    const { x: menuX, y: menuY } = resourceMenuGainAnchorClient()
    wrap.className = 'matter-hud-gain-float matter-hud-gain-float--at-pointer'
    if (!matterHudCompact) wrap.classList.add('matter-hud-gain-float--spacious')
    wrap.style.left = `${menuX - overlayRect.left}px`
    wrap.style.top = `${menuY - overlayRect.top}px`
  } else {
    wrap.className = 'matter-hud-gain-float matter-hud-gain-float--at-pointer'
    if (!matterHudCompact) wrap.classList.add('matter-hud-gain-float--spacious')
    wrap.classList.add('matter-hud-gain-float--entries-vertical')
    wrap.style.left = `${placement.clientX - overlayRect.left}px`
    wrap.style.top = `${placement.clientY - overlayRect.top}px`
  }
  for (let i = 0; i < entries.length; i++) {
    const { id, n } = entries[i]!
    const span = document.createElement('span')
    span.className = 'matter-hud-gain-float-res'
    span.style.color = resourceHudCssColorForId(id)
    span.textContent = `${RESOURCE_DEFS[id].hudAbbrev} +${n}`
    wrap.appendChild(span)
    if (hudAdjacent && i < entries.length - 1) wrap.appendChild(document.createTextNode(', '))
  }
  resourceGainOverlay.appendChild(wrap)
  const onEnd = (): void => {
    wrap.removeEventListener('animationend', onEnd)
    wrap.remove()
  }
  wrap.addEventListener('animationend', onEnd)
}

function syncMatterHudResourceGainFloats(): void {
  const totalEntries: { id: ResourceId; n: number }[] = []
  for (const id of RESOURCE_IDS_ORDERED) {
    const curr = resourceTallies[id] ?? 0
    const prev = resourceTalliesFloatBaseline[id] ?? 0
    const d = curr - prev
    if (d > 0) totalEntries.push({ id, n: d })
  }
  for (const id of RESOURCE_IDS_ORDERED) {
    resourceTalliesFloatBaseline[id] = resourceTallies[id] ?? 0
  }
  if (totalEntries.length === 0) {
    return
  }

  // #region agent log
  fetch('http://127.0.0.1:7481/ingest/59523295-7b3c-4817-bc0e-c2fb63f1b767', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'fd2cbb' },
    body: JSON.stringify({
      sessionId: 'fd2cbb',
      location: 'main.ts:syncMatterHudResourceGainFloats',
      message: 'tally_delta_gain_detected',
      data: {
        entries: totalEntries.map((e) => ({ id: e.id, n: e.n })),
        pendingAnchoredKeysBeforeMerge: pendingWorldAnchoredRootGainsByKey.size,
      },
      timestamp: Date.now(),
      hypothesisId: 'H3',
    }),
  }).catch(() => {})
  // #endregion

  for (const e of totalEntries) {
    pendingGainFloatMergeById[e.id] = (pendingGainFloatMergeById[e.id] ?? 0) + e.n
  }
  mergeAnchoredGainsMapIntoAccum(pendingWorldAnchoredRootGainsByKey)
  mergeHooverPointerGainsMapIntoAccum(pendingHooverPointerRootGainsMerge)
  schedulePendingMatterHudGainFloatFlush()
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
  perfMark('roid-set-resource-hud-start')
  syncMatterHudResourceGainFloats()
  const cap = computeEnergyCap(voxelCells, debugEnergyCapBonus)
  const frag = document.createDocumentFragment()
  appendMatterHudPlainLine(frag, formatCoreAssetFingerprint(currentAsset))
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
  const energyLine = formatEnergyHudLine(energyState.current, cap)
  const energyEl = document.createElement('span')
  energyEl.id = 'matter-hud-energy'
  energyEl.textContent = energyLine
  frag.appendChild(energyEl)
  frag.appendChild(document.createElement('br'))
  matterHud.replaceChildren(frag)
  lastMatterHudEnergyLine = energyLine
  matterHudDirty = false
  refreshToolCosts()
  perfMark('roid-set-resource-hud-end')
  perfMeasure('roid-set-resource-hud', 'roid-set-resource-hud-start', 'roid-set-resource-hud-end')
}

function replaceAsteroidMesh(cells: VoxelCell[]): void {
  perfMark('roid-replace-mesh-start')
  try {
    debugLodeDisplayIndices = null
    invalidateRockTintCaches()
    markRockInstanceColorsDirty()
    resetDepthOverlayViewBaseline()
    drossParticles.group.removeFromParent()
    debrisVisual.group.removeFromParent()
    lifterFlightsVisual.group.removeFromParent()
    for (const [, el] of debrisBracketsById) el.remove()
    debrisBracketsById.clear()
    scene.remove(asteroidBundle.group)
    disposeAsteroidBundle(asteroidBundle)
    const asteroidProfile = currentAsteroidProfile()
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
    asteroidBundle.group.add(debrisVisual.group)
    asteroidBundle.group.add(lifterFlightsVisual.group)
    applyAsteroidGroupRotation()
    invalidateVoxelPosIndexMap()
    if (laserPointerDown || excavatingLaserPointerDown) {
      refreshLaserRockHighlightColors()
    } else if (hasActiveExplosiveFuse(performance.now())) {
      refreshExplosiveFuseRockColors()
    } else if (hasActiveLifterCharge(performance.now())) {
      refreshLifterRockColors()
    } else {
      reapplyAllRockColorsNoLaser()
    }
    syncOverlaysDepthRow()
    structureVoxelCountForMusic = countStructureVoxelsForMusic(voxelCells)
  } finally {
    perfMark('roid-replace-mesh-end')
    perfMeasure('roid-replace-mesh', 'roid-replace-mesh-start', 'roid-replace-mesh-end')
  }
}

let syncSunRotationSpeedUi: () => void = () => {}

let currentSeedAssemblySelection: SeedAssemblySelection = (() => {
  const sel: SeedSelection = getActiveSeedSelection()
  return {
    seedTypeId: sel.seedTypeId,
    lifetimeSec: sel.lifetimeSec,
    slots: sel.slots.map((s) => ({ ...s })),
    recipeStack: sel.recipeStack.slice(),
  }
})()

function pickNextCoreAssetKind(): CoreAsset['kind'] {
  const p = Math.min(1, Math.max(0, gameBalance.wreckSpawnProbability))
  if (p <= 0) return 'asteroid'
  if (p >= 1) return 'wreck'
  const r = Math.random()
  return r < p ? 'wreck' : 'asteroid'
}

function generateNewAsteroidGeometry(): void {
  currentSeed = Math.floor(Math.random() * 0xffffffff) >>> 0
  const kind = pickNextCoreAssetKind()
  if (kind === 'wreck') {
    const { archetype, profile } = deriveWreckProfile(currentSeed)
    currentAsset = {
      id: 'core-asset',
      kind: 'wreck',
      seed: currentSeed,
      gridSize,
      archetype,
      profile,
    }
  } else {
    currentAsset = {
      id: 'core-asset',
      kind: 'asteroid',
      seed: currentSeed,
      gridSize,
      profile: deriveAsteroidProfile(currentSeed),
    }
  }
  const nextPositions = generateCoreAssetVoxels(currentAsset.kind, currentSeed)
  voxelCells = enrichCoreAssetVoxels(nextPositions, currentAsset.kind)
  orbitVisualRadius = currentAsteroidProfile().shape.baseRadius * voxelSize * 1.5
}

function resetEconomyAndDrossForNewRockBody(): void {
  resetReplicatorSimAccumulators()
  replicatorKillswitchEngaged = false
  Object.assign(resourceTallies, createEmptyResourceTallies())
  Object.assign(resourceTalliesFloatBaseline, createEmptyResourceTallies())
  pendingWorldAnchoredRootGainsByKey.clear()
  pendingHooverPointerRootGainsMerge.clear()
  pendingGainFloatHooverPointer = null
  if (matterHudGainFloatFlushTimer !== null) {
    clearTimeout(matterHudGainFloatFlushTimer)
    matterHudGainFloatFlushTimer = null
  }
  Object.assign(pendingGainFloatMergeById, createEmptyResourceTallies())
  pendingGainFloatAnchoredAccum.clear()
  lastScanRefinedPreviewLine = null
  lastInspectHudLines = null
  debugEnergyCapBonus = 0
  energyState.current = 0
  discoveryCounter.current = 0
  discoveryConsumedPos.clear()
  pendingDiscoveries.length = 0
  syncDiscoveryHud()
  resetDrossState(drossState)
  lifterFlights.length = 0
  lifterFlightsVisual.syncPositions([])
  notifiedRootForToolsDock = false
  notifiedComputroniumForToolsDock = false
}

function resetAllResearchAndUnlocksForRegenerate(): void {
  scourgeUnlocked = false
  locustUnlocked = false
  miningDroneUnlocked = false
  orbitalLaserUnlocked = false
  excavatingLaserUnlocked = false
  orbitalSatelliteCount = 0
  excavatingSatelliteCount = 0
  scannerLaserUnlocked = false
  scannerSatelliteCount = 0
  depthScanUnlocked = false
  drossCollectorUnlocked = false
  drossCollectorSatelliteCount = 0
  cargoDroneSatelliteCount = 0
  emCatapultUnlocked = false
  explosiveChargeUnlocked = false
  lifterUnlocked = false
  cargoDroneToolUnlocked = false
  debugUnlockAllTools = false
  computroniumUnlockPoints.current = 0
  computroniumResearchOrder = buildComputroniumResearchOrder(currentSeed)

  const laserUnlockApply = laserUnlockApplyFromVars()
  applyInitialToolDebugConfigToResearch(
    computroniumUnlockPoints,
    laserUnlockApply,
    gameBalance,
    computroniumResearchOrder,
  )
  applyLaserUnlockApply(laserUnlockApply)

  selectedRefineryRoot = defaultRefineryRecipeSelection((r) =>
    isRefineryRecipeUnlocked(
      r,
      {
        unlockPoints: 0,
        activeComputronium: 0,
        debugUnlockAllRecipes: false,
      },
      gameBalance,
    ),
  )
}

function finalizeNewAsteroidPresentation(options: { zeroSatelliteDots: boolean }): void {
  invalidateVoxelPosIndexMap()
  setResourceHud()
  starTintComposer.setTintFromSeed(currentSeed)
  applySunFromState()
  randomizeAsteroidOrientation()
  replaceAsteroidMesh(voxelCells)
  ensureSelectedToolRosterFromPanel()
  satelliteInspectModal.hide()
  if (options.zeroSatelliteDots) {
    satelliteDots.setCounts(0, 0, 0, 0, 0, orbitVisualRadius)
  } else {
    satelliteDots.setCounts(
      orbitalSatelliteCount,
      excavatingSatelliteCount,
      scannerSatelliteCount,
      drossCollectorSatelliteCount,
      cargoDroneSatelliteCount,
      orbitVisualRadius,
    )
  }
  asteroidAmbientMusic.setSeed(currentSeed)
  asteroidAmbientMusic.resetVoiceSmoothing()
  sun.intensity = KEY_LIGHT_INTENSITY_BASE * randomKeyLightIntensityFactorForAsteroid()
  syncLightAngleSliders(sunAzimuthDeg, sunElevationDeg)
  syncSunRotationSpeedUi()
}

function regenerateAsteroid(): void {
  resetTransientToolInputAfterRockTransition()
  generateNewAsteroidGeometry()
  resetEconomyAndDrossForNewRockBody()
  resetAllResearchAndUnlocksForRegenerate()
  finalizeNewAsteroidPresentation({ zeroSatelliteDots: true })
}

function emCatapultToNewAsteroid(): void {
  resetTransientToolInputAfterRockTransition()
  generateNewAsteroidGeometry()
  computroniumResearchOrder = buildComputroniumResearchOrder(currentSeed)
  const laserUnlockApply = laserUnlockApplyFromVars()
  const researchFlagsChanged = syncResearchFlagsFromPoints(
    computroniumResearchOrder,
    computroniumUnlockPoints.current,
    gameBalance,
    laserUnlockApply,
  )
  applyLaserUnlockApply(laserUnlockApply)
  if (researchFlagsChanged) {
    refreshToolCosts()
    syncOverlaysDepthRow()
    satelliteDots.setCounts(
      orbitalSatelliteCount,
      excavatingSatelliteCount,
      scannerSatelliteCount,
      drossCollectorSatelliteCount,
      cargoDroneSatelliteCount,
      orbitVisualRadius,
    )
  }
  resetEconomyAndDrossForNewRockBody()
  clampRefinerySelection()
  finalizeNewAsteroidPresentation({ zeroSatelliteDots: false })
  bumpMusicToolTapActivity()
}

let orbitalLaserUnlocked = false
let excavatingLaserUnlocked = false
let scannerLaserUnlocked = false
let depthScanUnlocked = false
let scourgeUnlocked = false
let locustUnlocked = false
let miningDroneUnlocked = false
let orbitalSatelliteCount = 0
let excavatingSatelliteCount = 0
let scannerSatelliteCount = 0
let drossCollectorUnlocked = false
let drossCollectorSatelliteCount = 0
/** Cargo drone orbit fleet count. Reset on Regenerate; preserved on EM catapult. */
let cargoDroneSatelliteCount = 0
/** Tier 6 computronium: EM Catapult tool. Reset on full Regenerate; preserved on catapult-to-new-asteroid. */
let emCatapultUnlocked = false
let explosiveChargeUnlocked = false
let lifterUnlocked = false
/** Cargo tool + cargo sat row (separate from sweeper collector unlock). */
let cargoDroneToolUnlocked = false
/** Debug cheat: bypass structure gates, explosive research gate (Settings → Unlock all tools). Reset on Regenerate. */
let debugUnlockAllTools = false

/** After first root resource, refresh tools dock so Replicator can appear. */
let notifiedRootForToolsDock = false
/** After first computronium voxel, refresh tools dock so Seed can appear. */
let notifiedComputroniumForToolsDock = false

/** Cumulative unlock points from active computronium (reset on Regenerate). */
const computroniumUnlockPoints = { current: 0 }

function laserUnlockApplyFromVars(): LaserUnlockApply {
  return {
    orbitalLaserUnlocked,
    excavatingLaserUnlocked,
    scannerLaserUnlocked,
    depthScanUnlocked,
    drossCollectorUnlocked,
    emCatapultUnlocked,
    orbitalSatelliteCount,
    excavatingSatelliteCount,
    scannerSatelliteCount,
    drossCollectorSatelliteCount,
    cargoDroneSatelliteCount,
    explosiveChargeUnlocked,
    scourgeUnlocked,
    locustUnlocked,
    miningDroneUnlocked,
    lifterUnlocked,
    cargoDroneToolUnlocked,
  }
}

function applyLaserUnlockApply(f: LaserUnlockApply): void {
  orbitalLaserUnlocked = f.orbitalLaserUnlocked
  excavatingLaserUnlocked = f.excavatingLaserUnlocked
  scannerLaserUnlocked = f.scannerLaserUnlocked
  depthScanUnlocked = f.depthScanUnlocked
  drossCollectorUnlocked = f.drossCollectorUnlocked
  emCatapultUnlocked = f.emCatapultUnlocked
  orbitalSatelliteCount = f.orbitalSatelliteCount
  excavatingSatelliteCount = f.excavatingSatelliteCount
  scannerSatelliteCount = f.scannerSatelliteCount
  drossCollectorSatelliteCount = f.drossCollectorSatelliteCount
  cargoDroneSatelliteCount = f.cargoDroneSatelliteCount
  explosiveChargeUnlocked = f.explosiveChargeUnlocked
  scourgeUnlocked = f.scourgeUnlocked
  locustUnlocked = f.locustUnlocked
  miningDroneUnlocked = f.miningDroneUnlocked
  lifterUnlocked = f.lifterUnlocked
  cargoDroneToolUnlocked = f.cargoDroneToolUnlocked
}

function researchPhaseState(): ResearchPhaseState {
  return {
    order: computroniumResearchOrder,
    unlockPoints: computroniumUnlockPoints.current,
    activeComputronium: countActiveComputronium(voxelCells),
    flags: laserUnlockApplyFromVars(),
  }
}

/** Global refinery recipe: which root active refineries consume (see Refinery tool → Recipes). */
let selectedRefineryRoot: RootResourceId = 'regolithMass'

/** Discovery modal RNG counter; reset on Regenerate. */
const discoveryCounter = { current: 0 }
/** Positions (`x,y,z`) that have already triggered a discovery claim this run. */
const discoveryConsumedPos = new Set<string>()

/**
 * Scanner overlays: opaque unlit bright red on voxels already tinted by the scanner satellite
 * (`surfaceScanTintRgb`) that are still-eligible discovery sites. Shown when Surface scan and/or
 * Depth overlay is on. Does not roll discoveries.
 */
const discoveryScanHintIndicesReuse = new Set<number>()

function buildDiscoveryScanHintIndices(): Set<number> | null {
  if (!surfaceScanOverlayVisible && !depthOverlayTintActive()) return null
  if (gameBalance.discoverySiteDensity <= 0) return null
  if (lastBuiltDiscoveryHintGen === rockTintCacheGeneration) {
    return discoveryScanHintIndicesReuse.size > 0 ? discoveryScanHintIndicesReuse : null
  }
  lastBuiltDiscoveryHintGen = rockTintCacheGeneration
  const s = discoveryScanHintIndicesReuse
  s.clear()
  for (let i = 0; i < voxelCells.length; i++) {
    const c = voxelCells[i]!
    if (c.surfaceScanTintRgb === undefined) continue
    if (discoveryConsumedPos.has(discoveryPosKey(c.pos))) continue
    if (isDiscoverySite(currentSeed, c.pos, gameBalance, discoveryDensityScale(currentAsteroidProfile()))) s.add(i)
  }
  return s.size > 0 ? s : null
}

function canSelectDepthScannerTool(): boolean {
  if (depthScanUnlocked) return true
  if (debugUnlockAllTools) return true
  const ph = getResearchPhaseForPlayerToolId('depthScanner', gameBalance, researchPhaseState())
  return ph === 'researching' || ph === 'unlocked'
}

function canSelectEmCatapultTool(): boolean {
  if (emCatapultUnlocked) return true
  if (debugUnlockAllTools) return true
  const ph = getResearchPhaseForPlayerToolId('emCatapult', gameBalance, researchPhaseState())
  return ph === 'researching' || ph === 'unlocked'
}

function getLaserSatelliteRow(): LaserSatelliteRowSnapshot {
  const oDeploy = getScaledSatelliteDeployCost('orbital', orbitalSatelliteCount)
  const eDeploy = getScaledSatelliteDeployCost('excavating', excavatingSatelliteCount)
  const sDeploy = getScaledSatelliteDeployCost('scanner', scannerSatelliteCount)
  const dDeploy = getScaledSatelliteDeployCost('drossCollector', drossCollectorSatelliteCount)
  const cDeploy = getScaledSatelliteDeployCost('cargoDrone', cargoDroneSatelliteCount)
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
    cargoDrone: {
      unlocked: cargoDroneToolUnlocked,
      satelliteCount: cargoDroneSatelliteCount,
      deployCostLine: formatResourceCostWithTallies(resourceTallies, cDeploy),
      canAffordDeploy: cargoDroneToolUnlocked && canAfford(resourceTallies, cDeploy),
    },
  }
}

function onDeploySatellite(kind: SatelliteDeployKind): boolean {
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
  } else if (kind === 'drossCollector') {
    if (!drossCollectorUnlocked) return false
    const cost = getScaledSatelliteDeployCost('drossCollector', drossCollectorSatelliteCount)
    if (!tryPayResources(resourceTallies, cost)) return false
    drossCollectorSatelliteCount += 1
  } else {
    if (!cargoDroneToolUnlocked) return false
    const cost = getScaledSatelliteDeployCost('cargoDrone', cargoDroneSatelliteCount)
    if (!tryPayResources(resourceTallies, cost)) return false
    cargoDroneSatelliteCount += 1
  }
  setResourceHud()
  satelliteDots.setCounts(
    orbitalSatelliteCount,
    excavatingSatelliteCount,
    scannerSatelliteCount,
    drossCollectorSatelliteCount,
    cargoDroneSatelliteCount,
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
  } else if (kind === 'drossCollector') {
    const remove = Math.min(n, drossCollectorSatelliteCount)
    if (remove <= 0) return
    drossCollectorSatelliteCount -= remove
  } else {
    const remove = Math.min(n, cargoDroneSatelliteCount)
    if (remove <= 0) return
    cargoDroneSatelliteCount -= remove
  }
  setResourceHud()
  refreshToolCosts()
  satelliteDots.setCounts(
    orbitalSatelliteCount,
    excavatingSatelliteCount,
    scannerSatelliteCount,
    drossCollectorSatelliteCount,
    cargoDroneSatelliteCount,
    orbitVisualRadius,
  )
  invalidateRockTintCaches()
  reapplyAllRockColorsNoLaser()
}

function beforeToolChange(_from: PlayerTool, to: PlayerTool): boolean {
  if (
    !debugUnlockAllTools &&
    !isGameplayToolRosterAllowed(to, {
      debugUnlockAllTools,
      isToolAllowedByInitialDebugConfig,
      resourceTallies,
      hasComputroniumVoxel: asteroidHasKind(voxelCells, 'computronium'),
    })
  ) {
    return false
  }
  if (to === 'drossCollector') return true
  if (to === 'emCatapult') return canSelectEmCatapultTool()
  if (to === 'lifter') return debugUnlockAllTools || lifterUnlocked
  if (to === 'cargoDrone') return debugUnlockAllTools || cargoDroneToolUnlocked
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
  if (to === 'miningDrone') return debugUnlockAllTools || miningDroneUnlocked
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
    invalidateRockTintCaches()
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
    } else if (hasActiveLifterCharge(performance.now())) {
      refreshLifterRockColors()
    } else {
      reapplyAllRockColorsNoLaser()
    }
  },
  onDepthOverlayChange: (v) => {
    depthOverlayVisible = v
    persistOverlayVisualizationPrefs()
    invalidateRockTintCaches()
    reapplyAllRockColorsNoLaser()
  },
})
syncOverlaysDepthRow = overlaysMenu.syncDepthOverlayUnlock

const pauseButton = createPauseButton(app, {
  initialPaused: false,
  onTogglePause: (paused) => {
    setPaused(paused)
  },
})

const overlaysLeadingWrapper = document.createElement('div')
overlaysLeadingWrapper.className = 'settings-leading-actions'
overlaysLeadingWrapper.append(pauseButton.element, overlaysMenu.element)

const overlaysLeading = overlaysLeadingWrapper

const debugUnlockAllToolsHandlers: { apply: () => void } = {
  apply: () => {},
}

subscribeSandboxMode((on) => {
  if (on && !debugUnlockAllTools) {
    debugUnlockAllToolsHandlers.apply()
    addResourceYields(resourceTallies, DEBUG_RESOURCE_GRANT)
    const cap = computeEnergyCap(voxelCells, debugEnergyCapBonus)
    energyState.current = cap
    setResourceHud()
  }
})

const gameStartTipsModal = createGameStartTipsModal(app, {
  onDismiss: () => {
    saveGameStartTipsDismissed(true)
  },
})

/** Wired after `createToolsPanel` so Debug → Starting tools checkboxes refresh the dock immediately. */
let onDebugInitialToolConfigChange: () => void = () => {}

const perfDebugOverlay = import.meta.env.DEV ? createPerfDebugOverlay(viewport) : null

const { syncSunRotationSpeed, syncLightAngleSliders } = createSettingsMenu(app, {
  getReplicatorTransformDebugLines: () => {
    const lines: string[] = []
    for (const c of voxelCells) {
      if (c.replicatorTransformTarget === undefined) continue
      const t = c.replicatorTransformTarget
      const label = REPLICATOR_TARGET_DEBUG_LABEL[t]
      const elapsedSec = (c.replicatorTransformElapsedMs ?? 0) / 1000
      const totalSec = (c.replicatorTransformTotalMs ?? 0) / 1000
      lines.push(
        `(${c.pos.x},${c.pos.y},${c.pos.z}) → ${label}  ${elapsedSec.toFixed(1)}s / ${totalSec.toFixed(1)}s`,
      )
    }
    return lines
  },
  leadingActions: overlaysLeading,
  onOpenTips: () => {
    gameStartTipsModal.show()
  },
  onRegenerate: regenerateAsteroid,
  onLightAngleChange,
  initialAzimuthDeg: sunAzimuthDeg,
  initialElevationDeg: sunElevationDeg,
  initialDiscoveryAutoResolve: discoveryAutoResolve,
  onDiscoveryAutoResolveChange: (value) => {
    discoveryAutoResolve = value
    saveDiscoveryAutoResolve(value)
    schedulePersistSettingsClient()
  },
  initialMatterHudCompact: matterHudCompact,
  onMatterHudCompactChange: (value) => {
    matterHudCompact = value
    saveMatterHudCompact(value)
    syncMatterHudCompactUi()
    schedulePersistSettingsClient()
  },
  initialMaxPixelRatioCap: loadMaxPixelRatioCap(),
  onMaxPixelRatioCapChange: (cap) => {
    saveMaxPixelRatioCap(cap)
    applyRendererPixelRatio(renderer)
    starTintComposer.setPixelRatio(renderer.getPixelRatio())
  },
  initialGameSpeedMult: gameSpeedMult,
  onGameSpeedMultChange: (mult: number) => {
    gameSpeedMult = clampGameSpeedMult(mult)
    saveGameSpeedMult(gameSpeedMult)
    schedulePersistSettingsClient()
  },
  initialColorScheme: colorScheme,
  onColorSchemeChange: (scheme) => {
    colorScheme = scheme
    applyColorSchemeToApp(colorScheme)
    saveColorSchemeId(colorScheme)
    schedulePersistSettingsClient()
  },
  initialFontId: fontId,
  onFontChange: (next) => {
    fontId = next
    applyFontToApp(fontId)
    saveFontId(fontId)
    schedulePersistSettingsClient()
  },
  onBalanceChange,
  asteroidMusicDebug,
  getMusicRootMidi: () => asteroidAmbientMusic.getEffectiveRootMidi(),
  sunLightDebug,
  getSunAnglesForLight: () => ({ az: sunAzimuthDeg, el: sunElevationDeg }),
  onSunLightDebugChange: () => {
    syncSunDirectionHelper()
    writeSunLightDebugToLocalStorage(sunLightDebug)
    schedulePersistSettingsClient()
  },
  scanVisualizationDebug,
  onScanVisualizationDebugChange: () => {
    invalidateRockTintCaches()
    reapplyAllRockColorsNoLaser()
    schedulePersistScanVisualizationDebug(scanVisualizationDebug)
    schedulePersistSettingsClient()
  },
  localStarTintDebug,
  onLocalStarTintDebugChange: () => {
    starTintComposer.setTintFromSeed(currentSeed)
    schedulePersistLocalStarTintDebug(localStarTintDebug)
    schedulePersistSettingsClient()
  },
  audioMasterDebug,
  onAudioMasterDebugChange: () => {
    applyAudioMasterDebug(audioMasterDebug)
    schedulePersistAudioMasterDebug(audioMasterDebug)
    schedulePersistSettingsClient()
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
    schedulePersistSettingsClient()
  },
  initialSfxVolumeLinear: sfxVolumeLinear,
  onSfxVolumeChange: (linear: number) => {
    sfxVolumeLinear = linear
    saveSfxVolumeLinear(linear)
    applySfxVolumeLinear(linear)
    schedulePersistSettingsClient()
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
  onDebugShowAllLodes: () => {
    const next = new Set<number>()
    const eps = 1e-6
    for (let i = 0; i < voxelCells.length; i++) {
      const rl = voxelCells[i].rareLodeStrength01
      if (rl !== undefined && rl > eps) next.add(i)
    }
    debugLodeDisplayIndices = next.size > 0 ? next : null
    invalidateRockTintCaches()
    reapplyAllRockColorsNoLaser()
  },
  onDebugClearLodeDisplay: () => {
    debugLodeDisplayIndices = null
    invalidateRockTintCaches()
    reapplyAllRockColorsNoLaser()
  },
  onDebugInitialToolConfigChange: () => onDebugInitialToolConfigChange(),
  ...(import.meta.env.DEV && perfDebugOverlay
    ? {
        initialPerfDebugOverlayVisible: getPerfDebugOverlayStored(),
        onPerfDebugOverlayChange: (on: boolean) => {
          perfDebugOverlay.setVisible(on)
        },
      }
    : {}),
})
syncSunRotationSpeedUi = syncSunRotationSpeed

function refineryRecipeUiState(): RefineryRecipeUiState {
  return {
    unlockPoints: computroniumUnlockPoints.current,
    activeComputronium: countActiveComputronium(voxelCells),
    debugUnlockAllRecipes: debugUnlockAllTools,
  }
}

function seedRecipeAvailabilityState(): SeedRecipeAvailabilityState {
  return {
    unlockPoints: computroniumUnlockPoints.current,
    pointsPerStage: gameBalance.computroniumPointsPerStage,
    debugUnlockAllSeedRecipes: debugUnlockAllTools,
  }
}

function unlockedSeedIdsFromResearch(): SeedId[] {
  if (debugUnlockAllTools) {
    return Object.keys(SEED_DEFS) as SeedId[]
  }
  const pointsPerStage = gameBalance.computroniumPointsPerStage
  const tier = currentComputroniumTier(computroniumUnlockPoints.current, pointsPerStage)
  const out: SeedId[] = []
  for (const id of Object.keys(SEED_DEFS) as SeedId[]) {
    const def = SEED_DEFS[id]
    if (def.requiredComputroniumTier <= tier) out.push(id)
  }
  return out.length > 0 ? out : (['basicSeed'] as SeedId[])
}

function clampRefinerySelection(): void {
  const st = refineryRecipeUiState()
  if (isRefineryRecipeUnlocked(selectedRefineryRoot, st, gameBalance)) return
  selectedRefineryRoot = defaultRefineryRecipeSelection((r) => isRefineryRecipeUnlocked(r, st, gameBalance))
}

const refineryRecipesModal = createRefineryRecipesModal(app, {
  getSelectedRoot: () => selectedRefineryRoot,
  onSelectRoot: (root) => {
    selectedRefineryRoot = root
    clampRefinerySelection()
  },
  getRecipePhase: (root) => getRefineryRecipeUiPhase(root, refineryRecipeUiState(), gameBalance),
  getResourceTallies: () => resourceTallies,
})

const {
  getSelectedTool,
  refreshToolCosts: refreshCosts,
  ensureSelectedToolRoster: ensureSelectedToolRosterFromPanel,
  setToolHoldFeedback,
  setSelectedTool,
} = createToolsPanel(app, {
  beforeToolChange,
  isToolRosterAllowed: (tool) =>
    isGameplayToolRosterAllowed(tool, {
      debugUnlockAllTools,
      isToolAllowedByInitialDebugConfig,
      resourceTallies,
      hasComputroniumVoxel: asteroidHasKind(voxelCells, 'computronium'),
    }),
  getComputroniumResearchToolPhase: (tool) => {
    if (debugUnlockAllTools) {
      const ph = getResearchPhaseForPlayerToolId(tool, gameBalance, researchPhaseState())
      if (ph !== undefined) return 'unlocked'
      return undefined
    }
    return getResearchPhaseForPlayerToolId(tool, gameBalance, researchPhaseState())
  },
  onToolChange(tool) {
    if (tool !== 'inspect') {
      lastInspectHudLines = null
      setResourceHud()
    }
  },
  getLaserSatelliteRow,
  onDeploySatellite,
  canAffordResourceCost: (cost) => (getSandboxModeEnabled() ? true : canAfford(resourceTallies, cost)),
  getStructureToolUiPhase: (tool) =>
    debugUnlockAllTools ? 'unlocked' : structureToolPhaseFromCells(tool, voxelCells),
  canAffordExplosiveChargeArm: () =>
    getSandboxModeEnabled() ||
    (canAfford(resourceTallies, getScaledExplosiveChargeArmCost()) &&
      energyState.current >= gameBalance.explosiveChargeEnergyPerArm),
  getResourceTallies: () => resourceTallies,
  getCurrentEnergy: () => energyState.current,
  getDrossCollectorDeployUiPhase: () =>
    debugUnlockAllTools
      ? 'unlocked'
      : getResearchPhaseForPlayerToolId('drossCollector', gameBalance, researchPhaseState()) ?? 'hidden',
  getDrossCollectorToolUiPhase: () =>
    debugUnlockAllTools
      ? 'unlocked'
      : getResearchPhaseForPlayerToolId('drossCollector', gameBalance, researchPhaseState()) ?? 'hidden',
  onDecommissionSatellite: decommissionSatelliteByKind,
  openRefineryRecipesModal: () => {
    clampRefinerySelection()
    refineryRecipesModal.show()
  },
  onReplicatorKillswitch: () => {
    replicatorKillswitchEngaged = true
    refreshToolCosts()
  },
  onReplicatorResume: () => {
    replicatorKillswitchEngaged = false
    refreshToolCosts()
  },
  getReplicatorKillswitchEngaged: () => replicatorKillswitchEngaged,
  hasReplicatorNetworkActivity: () => {
    for (const c of voxelCells) {
      if (c.kind === 'replicator') return true
      if (c.replicatorActive || c.replicatorEating) return true
    }
    return false
  },
  onAfterRefreshToolCosts: () => {
    clampRefinerySelection()
    refineryRecipesModal.refresh()
  },
  onGameBalancePatch: () => {
    invalidateRockTintCaches()
    reapplyAllRockColorsNoLaser()
  },
  openSeedAssemblyModal: (() => {
    let seedModal: ReturnType<typeof createSeedAssemblyModal> | null = null
    return () => {
      if (!seedModal) {
        seedModal = createSeedAssemblyModal(app, {
          getUnlockedSeedIds: unlockedSeedIdsFromResearch,
          getSeedRecipeAvailabilityState: seedRecipeAvailabilityState,
          getInitialSelection: (): SeedAssemblySelection => {
            const sel: SeedSelection = getActiveSeedSelection()
            currentSeedAssemblySelection = {
              seedTypeId: sel.seedTypeId,
              lifetimeSec: sel.lifetimeSec,
              slots: sel.slots.map((s) => ({ ...s })),
              recipeStack: sel.recipeStack.slice(),
            }
            return currentSeedAssemblySelection
          },
          onConfirm: (sel) => {
            currentSeedAssemblySelection = {
              seedTypeId: sel.seedTypeId,
              lifetimeSec: sel.lifetimeSec,
              slots: sel.slots.map((s) => ({ ...s })),
              recipeStack: sel.recipeStack.slice(),
            }
            const selectedPresetId = getSelectedSeedPresetId()
            const adhocStrain =
              selectedPresetId ??
              `adhoc:${sel.seedTypeId}:${sel.recipeStack.join('+') || 'none'}`
            setActiveSeedSelection({
              seedTypeId: sel.seedTypeId,
              lifetimeSec: sel.lifetimeSec,
              slots: sel.slots.map((s) => ({ ...s })),
              recipeStack: sel.recipeStack.slice(),
              strainId: adhocStrain,
            })
          },
          getPresets: () =>
            getSeedPresets().map((p) => ({
              id: p.id,
              name: p.name,
              selection: {
                seedTypeId: p.selection.seedTypeId,
                lifetimeSec: p.selection.lifetimeSec,
                slots: p.selection.slots.map((s) => ({ ...s })),
                recipeStack: p.selection.recipeStack.slice(),
              },
            })),
          getSelectedPresetId: () => getSelectedSeedPresetId(),
          onSelectPreset: (id) => {
            setSelectedSeedPresetId(id)
            if (!id) return
            const p = getSeedPresetById(id)
            if (!p) return
            const sel = p.selection
            currentSeedAssemblySelection = {
              seedTypeId: sel.seedTypeId,
              lifetimeSec: sel.lifetimeSec,
              slots: sel.slots.map((s) => ({ ...s })),
              recipeStack: sel.recipeStack.slice(),
            }
            setActiveSeedSelection({
              seedTypeId: sel.seedTypeId,
              lifetimeSec: sel.lifetimeSec,
              slots: sel.slots.map((s) => ({ ...s })),
              recipeStack: sel.recipeStack.slice(),
              strainId: sel.strainId ?? id,
            })
          },
          onDeletePreset: (id) => {
            deleteSeedPreset(id)
          },
          onSavePreset: ({ id, name, selection }) => {
            const newId = upsertSeedPreset(id, name, {
              seedTypeId: selection.seedTypeId,
              lifetimeSec: selection.lifetimeSec,
              slots: selection.slots.map((s) => ({ ...s })),
              recipeStack: selection.recipeStack.slice(),
            })
            setSelectedSeedPresetId(newId)
            setActiveSeedSelection({
              seedTypeId: selection.seedTypeId,
              lifetimeSec: selection.lifetimeSec,
              slots: selection.slots.map((s) => ({ ...s })),
              recipeStack: selection.recipeStack.slice(),
              strainId: newId,
            })
            currentSeedAssemblySelection = {
              seedTypeId: selection.seedTypeId,
              lifetimeSec: selection.lifetimeSec,
              slots: selection.slots.map((s) => ({ ...s })),
              recipeStack: selection.recipeStack.slice(),
            }
          },
        })
      }
      seedModal.show()
    }
  })(),
})

function shouldDeferToolHotkey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true
  if (e.repeat) return true
  const t = e.target
  if (!(t instanceof Element)) return false
  if (t.closest('input, textarea, select, [contenteditable]')) return true
  const modal = t.closest('[aria-modal="true"]')
  if (modal instanceof HTMLElement && !modal.hidden) return true
  return false
}

document.addEventListener('keydown', (e) => {
  if (shouldDeferToolHotkey(e)) return
  const tool = getPlayerToolForHotkeyCode(e.code)
  if (tool === undefined) return
  e.preventDefault()
  setSelectedTool(tool)
})

refreshToolCosts = refreshCosts
onDebugInitialToolConfigChange = () => {
  refreshCosts()
}

function projectDiscoveryFoundAt(pos: VoxelPos) {
  return projectVoxelPosToClient(
    pos,
    gridSize,
    voxelSize,
    asteroidBundle.group,
    camera,
    renderer.domElement.getBoundingClientRect(),
  )
}

function updateDiscoveryPendingAnchors(): void {
  if (pendingDiscoveries.length === 0) return
  const w = window.innerWidth
  const h = window.innerHeight
  discoveryPendingSvg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  discoveryPendingSvg.setAttribute('width', String(w))
  discoveryPendingSvg.setAttribute('height', String(h))

  const canvasRect = renderer.domElement.getBoundingClientRect()
  const CHIP = 28
  const half = CHIP / 2

  for (let idx = 0; idx < pendingDiscoveries.length; idx++) {
    const offer = pendingDiscoveries[idx]!
    const dom = discoveryPendingDomById.get(offer.id)
    if (!dom) continue
    const { wrap, line } = dom

    const { clientX: vx, clientY: vy, onScreen } = projectVoxelPosToClient(
      offer.foundAt,
      gridSize,
      voxelSize,
      asteroidBundle.group,
      camera,
      canvasRect,
    )

    let cx: number
    let cy: number
    if (onScreen) {
      cx = vx + 44
      cy = vy - 44 - idx * 36
      cx = Math.min(Math.max(half + 8, cx), w - half - 8)
      cy = Math.min(Math.max(half + 8, cy), h - half - 8)
    } else {
      cx = w - half - 16
      cy = 80 + half + idx * 40
    }

    wrap.style.left = `${cx - half}px`
    wrap.style.top = `${cy - half}px`

    if (onScreen) {
      const wr = wrap.getBoundingClientRect()
      const wcx = wr.left + wr.width / 2
      const wcy = wr.top + wr.height / 2
      const end = segmentFirstBorderHitTowardRect(vx, vy, wcx, wcy, wr)
      line.setAttribute('x1', String(vx))
      line.setAttribute('y1', String(vy))
      line.setAttribute('x2', String(end.x))
      line.setAttribute('y2', String(end.y))
      line.setAttribute('opacity', '1')
    } else {
      line.setAttribute('opacity', '0')
    }
  }
}

const discoveryModal = createDiscoveryModal(app, {
  projectFoundAt: projectDiscoveryFoundAt,
  onOk(offer) {
    const laserUnlockApply = laserUnlockApplyFromVars()
    applyDiscoveryAccept(
      offer,
      resourceTallies,
      laserUnlockApply,
      computroniumUnlockPoints,
      gameBalance,
      computroniumResearchOrder,
    )
    applyLaserUnlockApply(laserUnlockApply)
    setResourceHud()
    refreshToolCosts()
    syncOverlaysDepthRow()
    satelliteDots.setCounts(
      orbitalSatelliteCount,
      excavatingSatelliteCount,
      scannerSatelliteCount,
      drossCollectorSatelliteCount,
      cargoDroneSatelliteCount,
      orbitVisualRadius,
    )
    invalidateRockTintCaches()
    reapplyAllRockColorsNoLaser()
  },
})

const satelliteInspectModal = createSatelliteInspectModal(app, {
  onDecommission: decommissionSatelliteByKind,
})

function syncDiscoveryHud(): void {
  discoveryPendingChips.replaceChildren()
  discoveryPendingSvg.replaceChildren()
  discoveryPendingDomById.clear()
  if (pendingDiscoveries.length === 0) {
    discoveryPendingLayer.hidden = true
    return
  }
  discoveryPendingLayer.hidden = false
  for (const offer of pendingDiscoveries) {
    const wrap = document.createElement('div')
    wrap.className = 'discovery-pending-chip-wrap'
    wrap.dataset.discoveryId = offer.id
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
    wrap.appendChild(btn)
    discoveryPendingChips.appendChild(wrap)

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.classList.add('discovery-pending-connector-line')
    line.dataset.discoveryId = offer.id
    discoveryPendingSvg.appendChild(line)
    discoveryPendingDomById.set(offer.id, { wrap, line })
  }
  updateDiscoveryPendingAnchors()
}

function tryDiscoveryAt(pos: VoxelPos): void {
  const result = tryDiscoveryClaim(
    currentSeed,
    pos,
    gameBalance,
    discoveryConsumedPos,
    discoveryCounter,
    discoveryDensityScale(currentAsteroidProfile()),
  )
  if (result.kind === 'offer') {
    const offer = result.offer
    if (discoveryAutoResolve) {
      discoveryModal.show(offer)
    } else {
      pendingDiscoveries.push(offer)
      syncDiscoveryHud()
    }
  } else if (result.kind === 'falseSignal') {
    playDiscoveryFalseSignal()
    showFalseSignalToast()
  }
  invalidateRockTintCaches()
  reapplyAllRockColorsNoLaser()
}

function applyDebugUnlockAllTools(): void {
  debugUnlockAllTools = true
  orbitalLaserUnlocked = true
  excavatingLaserUnlocked = true
  scannerLaserUnlocked = true
  depthScanUnlocked = true
  drossCollectorUnlocked = true
  emCatapultUnlocked = true
  explosiveChargeUnlocked = true
  scourgeUnlocked = true
  locustUnlocked = true
  miningDroneUnlocked = true
  lifterUnlocked = true
  cargoDroneToolUnlocked = true
  orbitalSatelliteCount = Math.max(1, orbitalSatelliteCount)
  excavatingSatelliteCount = Math.max(1, excavatingSatelliteCount)
  scannerSatelliteCount = Math.max(1, scannerSatelliteCount)
  drossCollectorSatelliteCount = Math.max(1, drossCollectorSatelliteCount)
  cargoDroneSatelliteCount = Math.max(1, cargoDroneSatelliteCount)
  setResourceHud()
  refreshToolCosts()
  syncOverlaysDepthRow()
  satelliteDots.setCounts(
    orbitalSatelliteCount,
    excavatingSatelliteCount,
    scannerSatelliteCount,
    drossCollectorSatelliteCount,
    cargoDroneSatelliteCount,
    orbitVisualRadius,
  )
  clampRefinerySelection()
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
let hooverPointerDown = false
let lastHooverClient: { x: number; y: number } | null = null
/** Post-replicator-poke music activity boost; decremented in sim tick while > 0. */
let musicPokeActivityRemainSec = 0
/** Short music activity boost after other tool actions (non-poke); decremented in sim tick while > 0. */
let musicToolTapActivityRemainSec = 0
/** Cursor position during laser drag (for voxel highlight). */
let lastLaserDragClient: { x: number; y: number } | null = null
let lastLaserDragTool: 'orbitalLaser' | 'excavatingLaser' | null = null
/** Orbit disabled until pointerup after arming explosive charge on a voxel (avoids CLICK_MAX_PX vs orbit). */
let explosiveChargeAwaitingUp = false

/** Throttle full `replaceAsteroidMesh` during sustained orbital/excavating laser drag. */
let pendingLaserAsteroidMeshReplace = false
let lastLaserAsteroidMeshReplaceMs = 0
const LASER_MESH_REPLACE_MIN_MS = 48

function scheduleLaserAsteroidMeshReplace(): void {
  const t = performance.now()
  if (t - lastLaserAsteroidMeshReplaceMs >= LASER_MESH_REPLACE_MIN_MS) {
    lastLaserAsteroidMeshReplaceMs = t
    pendingLaserAsteroidMeshReplace = false
    replaceAsteroidMesh(voxelCells)
  } else {
    pendingLaserAsteroidMeshReplace = true
  }
}

function flushPendingLaserAsteroidMeshReplace(): void {
  if (!pendingLaserAsteroidMeshReplace) return
  const t = performance.now()
  if (
    t - lastLaserAsteroidMeshReplaceMs >= LASER_MESH_REPLACE_MIN_MS ||
    (!laserPointerDown && !excavatingLaserPointerDown)
  ) {
    pendingLaserAsteroidMeshReplace = false
    lastLaserAsteroidMeshReplaceMs = t
    replaceAsteroidMesh(voxelCells)
  }
}

/** Dedupes `setToolHoldFeedback` so pointermove does not re-sync the cost strip every frame. */
let lastHoldFeedbackMsg: string | null = null

/**
 * Clears laser/hoover/explosive drag state and re-enables orbit after a full rock-body swap
 * (EM catapult or Regenerate). Avoids stuck `controls.enabled` / pointer flags vs new geometry.
 */
function resetTransientToolInputAfterRockTransition(): void {
  pointerDown = null
  laserPointerDown = false
  excavatingLaserPointerDown = false
  hooverPointerDown = false
  lastHooverClient = null
  lastLaserDragClient = null
  lastLaserDragTool = null
  explosiveChargeAwaitingUp = false
  pendingLaserAsteroidMeshReplace = false
  controls.enabled = true
  stopOrbitalLaserSustain()
  stopExcavatingLaserSustain()
  stopHooverSustain()
  clearLaserRockHighlightColors()
  lastHoldFeedbackMsg = null
  syncPressHoldToolFeedback()
}

function syncPressHoldToolFeedback(): void {
  let msg: string | null = null
  let ring: { x: number; y: number } | null = null

  if (hooverPointerDown && lastHooverClient) {
    msg = 'ACTIVE — hold on the rock to vacuum debris'
    ring = lastHooverClient
  } else if (laserPointerDown && lastLaserDragClient && lastLaserDragTool === 'orbitalLaser') {
    msg = 'Firing — drag on rock'
    ring = lastLaserDragClient
  } else if (excavatingLaserPointerDown && lastLaserDragClient) {
    msg = 'Firing — drag on targets'
    ring = lastLaserDragClient
  }

  if (msg !== lastHoldFeedbackMsg) {
    lastHoldFeedbackMsg = msg
    setToolHoldFeedback(msg)
  }

  if (ring) {
    updateToolHoldSustainRipples(toolHoldSustainRipples, true, ring.x, ring.y, viewport)
    updateToolHoldRing(toolHoldRing, true, ring.x, ring.y, viewport)
  } else {
    updateToolHoldSustainRipples(toolHoldSustainRipples, false, 0, 0, viewport)
    updateToolHoldRing(toolHoldRing, false, 0, 0, viewport)
  }
}

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

function convertCellToProcessedMatter(cell: VoxelCell): void {
  convertRockCellToProcessedMatterInPlace(cell, {
    originSource: currentAsset.kind === 'wreck' ? 'wreck' : 'asteroid',
    onDiscovery: tryDiscoveryAt,
  })
}

function collectOrbitalLaserTargetIndices(
  centerIdx: number,
  maxCount: number,
  cells: VoxelCell[],
  posMap: Map<number, number>,
): number[] {
  const center = cells[centerIdx]
  if (!ROCK_LITHOLOGY_KINDS.has(center.kind)) return []
  const out: number[] = [centerIdx]
  const seen = new Set<number>([centerIdx])
  const queue: number[] = [centerIdx]
  while (queue.length > 0 && out.length < maxCount) {
    const cur = queue.shift()!
    const p = cells[cur].pos
    for (const [dx, dy, dz] of NEIGHBOR_DELTAS) {
      if (out.length >= maxCount) break
      const key = packVoxelKey(p.x + dx, p.y + dy, p.z + dz, gridSize)
      const ni = posMap.get(key)
      if (ni === undefined || seen.has(ni)) continue
      const nc = cells[ni]
      if (!ROCK_LITHOLOGY_KINDS.has(nc.kind)) continue
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
  posMap: Map<number, number>,
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
  if (ROCK_LITHOLOGY_KINDS.has(center.kind)) {
    queue.push(centerIdx)
  } else {
    const p = center.pos
    for (const [dx, dy, dz] of NEIGHBOR_DELTAS) {
      const key = packVoxelKey(p.x + dx, p.y + dy, p.z + dz, gridSize)
      const ni = posMap.get(key)
      if (ni === undefined || seen.has(ni)) continue
      if (ROCK_LITHOLOGY_KINDS.has(cells[ni].kind)) {
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
      const key = packVoxelKey(p.x + dx, p.y + dy, p.z + dz, gridSize)
      const ni = posMap.get(key)
      if (ni === undefined || seen.has(ni)) continue
      if (!ROCK_LITHOLOGY_KINDS.has(cells[ni].kind)) continue
      pushUnique(ni)
      queue.push(ni)
    }
  }

  return out
}

function collectScannerNeighborIndices(
  centerIdx: number,
  posMap: Map<number, number>,
  r: number,
): number[] {
  const c = voxelCells[centerIdx]!.pos
  const out: number[] = []
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        const key = packVoxelKey(c.x + dx, c.y + dy, c.z + dz, gridSize)
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
    debugLodeDisplayIndices,
  )
  syncDepthOverlayMaterials()
}

function hasActiveLifterCharge(nowMs: number): boolean {
  const need = gameBalance.lifterChargeMs
  for (let i = 0; i < voxelCells.length; i++) {
    const start = voxelCells[i].lifterChargeStartMs
    if (start != null && nowMs - start < need) return true
  }
  return false
}

function refreshLifterRockColors(): void {
  const meshOpts = { voxelSize, gridSize }
  const t = performance.now()
  const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 0.088))
  const highlight = new Set<number>()
  const need = gameBalance.lifterChargeMs
  for (let i = 0; i < voxelCells.length; i++) {
    const start = voxelCells[i].lifterChargeStartMs
    if (start != null && t - start < need) highlight.add(i)
  }
  reapplyRockInstanceColors(
    asteroidBundle,
    voxelCells,
    meshOpts,
    scanVisualizationDebug,
    highlight,
    'lifter',
    pulse,
    buildSurfaceScanTintIndexMap(),
    depthOverlayTintActive(),
    buildDiscoveryScanHintIndices(),
    debugLodeDisplayIndices,
  )
  syncDepthOverlayMaterials()
}

function lifterVelocityTowardCameraLocal(localPos: { x: number; y: number; z: number }): {
  x: number
  y: number
  z: number
} {
  _asteroidInvWorld.copy(asteroidBundle.group.matrixWorld).invert()
  _lifterCamLocal.copy(camera.position).applyMatrix4(_asteroidInvWorld)
  const dx = _lifterCamLocal.x - localPos.x
  const dy = _lifterCamLocal.y - localPos.y
  const dz = _lifterCamLocal.z - localPos.z
  const len = Math.hypot(dx, dy, dz) || 1
  const sp = gameBalance.lifterFlightSpeed / 1000
  return { x: (dx / len) * sp, y: (dy / len) * sp, z: (dz / len) * sp }
}

function clearLifterChargeExceptCellIndex(keepIdx: number | null): void {
  for (let i = 0; i < voxelCells.length; i++) {
    if (i === keepIdx) continue
    voxelCells[i].lifterChargeStartMs = undefined
  }
}

function tryLifterAt(clientX: number, clientY: number): void {
  if (voxelCells.length === 0) return
  if (!debugUnlockAllTools && !drossCollectorUnlocked) return
  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return
  const cell = voxelCells[i]
  if (cell.kind !== 'processedMatter' || (cell.processedMatterUnits ?? 0) < 1) return
  const now = performance.now()
  clearLifterChargeExceptCellIndex(i)
  cell.lifterChargeStartMs = now
  markRockInstanceColorsDirty()
  refreshLifterRockColors()
  bumpMusicToolTapActivity()
}

function stepLifterCharges(nowMs: number): void {
  const need = gameBalance.lifterChargeMs
  const pending: {
    idx: number
    cell: VoxelCell
  }[] = []
  for (let i = 0; i < voxelCells.length; i++) {
    const cell = voxelCells[i]
    const start = cell.lifterChargeStartMs
    if (start == null) continue
    if (cell.kind !== 'processedMatter' || (cell.processedMatterUnits ?? 0) < 1) {
      cell.lifterChargeStartMs = undefined
      markRockInstanceColorsDirty()
      continue
    }
    if (nowMs - start < need) continue
    pending.push({ idx: i, cell })
  }
  if (pending.length === 0) return

  pending.sort((a, b) => b.idx - a.idx)
  const center = (gridSize - 1) / 2
  const newFlights: LifterFlight[] = []
  for (const { idx, cell } of pending) {
    cell.lifterChargeStartMs = undefined
    const units = cell.processedMatterUnits ?? 0
    const comp = cell.processedMatterRootComposition ?? defaultUniformRootComposition()
    const discoveryPos = { ...cell.pos }
    const lp = {
      x: (cell.pos.x - center) * voxelSize,
      y: (cell.pos.y - center) * voxelSize,
      z: (cell.pos.z - center) * voxelSize,
    }
    const vel = lifterVelocityTowardCameraLocal(lp)
    voxelCells.splice(idx, 1)
    newFlights.push({
      pos: { ...lp },
      vel,
      spawnMs: nowMs,
      discoveryPos,
      units,
      comp: { ...comp },
      originSource: cell.originSource,
    })
  }
  if (newFlights.length > 0) {
    replaceAsteroidMesh(voxelCells)
    for (const f of newFlights) lifterFlights.push(f)
  }
}

function stepLifterFlights(nowMs: number, dtMs: number): void {
  if (lifterFlights.length === 0) {
    lifterFlightsVisual.syncPositions([])
    return
  }
  const maxMs = gameBalance.lifterFlightMs
  for (let i = lifterFlights.length - 1; i >= 0; i--) {
    const f = lifterFlights[i]!
    if (nowMs - f.spawnMs >= maxMs) {
      const credited: Partial<Record<RootResourceId, number>> = {}
      creditAllProcessedMatterUnitsToTallies(resourceTallies, f.units, f.comp, credited)
      const origin =
        f.originSource === 'wreck' || f.originSource === 'asteroid' ? f.originSource : 'asteroid'
      const dest = resourceTalliesBySource[origin]
      for (const r of ROOT_RESOURCE_IDS) {
        const v = credited[r]
        if (v === undefined || v <= 0) continue
        dest[r] = (dest[r] ?? 0) + v
      }
      tryDiscoveryAt(f.discoveryPos)
      lifterFlights.splice(i, 1)
      mergePendingWorldAnchoredRootGains(f.discoveryPos, credited, 'lifter_discovery')
      markMatterHudDirty()
      continue
    }
    f.pos.x += f.vel.x * dtMs
    f.pos.y += f.vel.y * dtMs
    f.pos.z += f.vel.z * dtMs
  }
  lifterFlightsVisual.syncPositions(lifterFlights.map((fl) => fl.pos))
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
  bumpMusicToolTapActivity()
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
          const key = packVoxelKey(c.x + dx, c.y + dy, c.z + dz, gridSize)
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
    const center = (gridSize - 1) / 2
    const lp = {
      x: (cell.pos.x - center) * voxelSize,
      y: (cell.pos.y - center) * voxelSize,
      z: (cell.pos.z - center) * voxelSize,
    }
    spawnDebrisShardFromRemovedCell(
      debrisState,
      cell,
      lp,
      nowMs,
      {
        spawnChance: gameBalance.debrisSpawnChance,
        lifetimeMs: {
          min: gameBalance.debrisLifetimeMinSec * 1000,
          max: gameBalance.debrisLifetimeMaxSec * 1000,
        },
        speedPerSec: { min: gameBalance.debrisSpeedMin, max: gameBalance.debrisSpeedMax },
        rewardBaseUnits: 0.35,
        bonusUnits: 1,
        bonusChance: 0.12,
        asteroidRegime: currentAsteroidProfile().regime,
      },
    )
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
  if (trySpendEnergy(energyState, cost) <= 0) return
  const posMap = getVoxelPosIndexMap()
  const idx = collectScannerNeighborIndices(i, posMap, r)
  const scratch = new Color()
  for (const j of idx) {
    const cell = voxelCells[j]!
    compositionToScanColor(cell, scratch)
    cell.surfaceScanTintRgb = { r: scratch.r, g: scratch.g, b: scratch.b }
  }
  lastScanRefinedPreviewLine = formatScanRefinedPreviewLine(voxelCells[i]!)
  invalidateRockTintCaches()
  reapplyAllRockColorsNoLaser()
  playScanPing()
  setResourceHud()
  bumpMusicToolTapActivity()
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
      debugLodeDisplayIndices,
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
      debugLodeDisplayIndices,
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
    debugLodeDisplayIndices,
  )
  syncDepthOverlayMaterials()
}

function isLaserLithologyAt(clientX: number, clientY: number): boolean {
  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return false
  return ROCK_LITHOLOGY_KINDS.has(voxelCells[i].kind)
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
  'cargo-drone-satellites',
])

const SATELLITE_PICK_NAME_TO_KIND: Record<string, SatelliteInspectKind> = {
  'orbital-satellites': 'orbital',
  'excavating-satellites': 'excavating',
  'scanner-satellites': 'scanner',
  'dross-collector-satellites': 'drossCollector',
  'cargo-drone-satellites': 'cargoDrone',
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
    bundle.miningDrone,
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
      return 'Sweeper collectors: collection rate scales with deployed count (balance).'
    case 'cargoDrone':
      return 'Cargo drones: automatically move processed matter to root tallies after hubs each tick (balance).'
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
                : kind === 'drossCollector'
                  ? drossCollectorSatelliteCount
                  : cargoDroneSatelliteCount
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
        bumpMusicToolTapActivity()
        return
      }
    }
  }
  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return
  lastInspectHudLines = formatInspectHudLines(voxelCells[i]!, performance.now())
  setResourceHud()
  bumpMusicToolTapActivity()
}

function trySpawnScourgeAt(clientX: number, clientY: number): void {
  if (!gameBalance.scourgeEnabled) return
  if (!debugUnlockAllTools && !scourgeUnlocked) return
  if (voxelCells.length === 0) return
  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return
  const cell = voxelCells[i]
  spawnScourgeAt(cell)
  markRockInstanceColorsDirty()
  replaceAsteroidMesh(voxelCells)
  bumpMusicToolTapActivity()
}

function trySpawnLocustAt(clientX: number, clientY: number): void {
  if (!gameBalance.locustEnabled) return
  if (!debugUnlockAllTools && !locustUnlocked) return
  if (voxelCells.length === 0) return
  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return
  const cell = voxelCells[i]
  spawnLocustAt(cell)
  markRockInstanceColorsDirty()
  replaceAsteroidMesh(voxelCells)
  bumpMusicToolTapActivity()
}

function tryPlaceMiningDroneAt(clientX: number, clientY: number): void {
  if (!gameBalance.miningDroneEnabled) return
  if (!debugUnlockAllTools && !miningDroneUnlocked) return
  if (voxelCells.length === 0) return
  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return
  const cell = voxelCells[i]
  if (!ROCK_LITHOLOGY_KINDS.has(cell.kind)) return
  if (cell.replicatorEating || cell.replicatorActive) return
  if (!tryPayResources(resourceTallies, getScaledMiningDronePlaceCost())) return
  initMiningDroneCell(cell)
  setResourceHud()
  markRockInstanceColorsDirty()
  replaceAsteroidMesh(voxelCells)
  bumpMusicToolTapActivity()
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
    cell.kind === 'miningDrone' ||
    cell.kind === 'processedMatter'
  )
    return

  const popped = cell.hpRemaining === 1
  cell.hpRemaining -= 1
  bumpMusicToolTapActivity()
  onMiningHitFeedback(clientX, clientY, viewport, pickRipple, cell.kind, popped)
  if (cell.hpRemaining > 0) return

  tryDiscoveryAt(cell.pos)
  spawnDrossFromRemovedCell(drossState, cell, gameBalance)
  const center = (gridSize - 1) / 2
  const lp = {
    x: (cell.pos.x - center) * voxelSize,
    y: (cell.pos.y - center) * voxelSize,
    z: (cell.pos.z - center) * voxelSize,
  }
  spawnDebrisShardFromRemovedCell(
    debrisState,
    cell,
    lp,
    performance.now(),
    {
      spawnChance: gameBalance.debrisSpawnChance,
      lifetimeMs: {
        min: gameBalance.debrisLifetimeMinSec * 1000,
        max: gameBalance.debrisLifetimeMaxSec * 1000,
      },
      speedPerSec: { min: gameBalance.debrisSpeedMin, max: gameBalance.debrisSpeedMax },
      rewardBaseUnits: 0.2,
      bonusUnits: 1,
      bonusChance: 0.08,
      asteroidRegime: currentAsteroidProfile().regime,
    },
  )
  voxelCells.splice(i, 1)
  setResourceHud()
  replaceAsteroidMesh(voxelCells)
}

function trySeedToolAt(clientX: number, clientY: number): void {
  if (voxelCells.length === 0) return

  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return

  const cell = voxelCells[i]

  const activeSel: SeedSelection = getActiveSeedSelection()
  const seedDef = SEED_DEFS[activeSel.seedTypeId]
  const chosenLifetime = Math.min(
    seedDef.maxLifetimeSec,
    Math.max(seedDef.minLifetimeSec, activeSel.lifetimeSec ?? seedDef.lifetimeSec),
  )

  if (cell.kind === 'replicator') {
    cell.seedRuntime = {
      seedTypeId: activeSel.seedTypeId,
      lifetimeTotalSec: chosenLifetime,
      lifetimeRemainingSec: chosenLifetime,
      activeRecipes: activeSel.recipeStack.slice(),
      slots: activeSel.slots.map((s) => ({ ...s })),
      currentSlotIndex: 0,
      currentSlotRemainingSec:
        activeSel.slots[0] && Number.isFinite(activeSel.slots[0]!.durationSec)
          ? activeSel.slots[0]!.durationSec
          : 0,
    }
    markRockInstanceColorsDirty()
    setResourceHud()
    bumpMusicToolTapActivity()
    return
  }

  if (
    cell.kind === 'reactor' ||
    cell.kind === 'battery' ||
    cell.kind === 'hub' ||
    cell.kind === 'refinery' ||
    cell.kind === 'depthScanner' ||
    cell.kind === 'computronium' ||
    cell.kind === 'miningDrone' ||
    cell.kind === 'processedMatter'
  )
    return

  if (cell.replicatorActive || cell.replicatorEating) return

  if (!tryPayResources(resourceTallies, getScaledReplicatorPlaceCost())) return

  clearSurfaceScanTint(cell)
  clearDepthRevealState(cell)
  cell.replicatorActive = true
  cell.replicatorEating = true
  cell.replicatorEatAccumulatorMs = 0
  cell.replicatorStrainId = activeSel.strainId
  cell.seedRuntime = {
    seedTypeId: activeSel.seedTypeId,
    lifetimeTotalSec: chosenLifetime,
    lifetimeRemainingSec: chosenLifetime,
    activeRecipes: activeSel.recipeStack.slice(),
    slots: activeSel.slots.map((s) => ({ ...s })),
    currentSlotIndex: 0,
    currentSlotRemainingSec:
      activeSel.slots[0] && Number.isFinite(activeSel.slots[0]!.durationSec)
        ? activeSel.slots[0]!.durationSec
        : 0,
  }
  replaceAsteroidMesh(voxelCells)
  setResourceHud()
  playReplicatorPlaceClick()
  bumpMusicToolTapActivity()
}

function tryPlaceReplicator(clientX: number, clientY: number): void {
  if (voxelCells.length === 0) return

  const i = asteroidRaycastCellIndex(clientX, clientY)
  if (i === null) return

  const cell = voxelCells[i]
  if (cell.kind === 'replicator') {
    const now = performance.now()
    pokeReplicator(cell, now)
    musicPokeActivityRemainSec = asteroidMusicDebug.interactionPokeDurationSec
    markRockInstanceColorsDirty()
    playReplicatorTapClick()
    return
  }
  if (cell.kind === 'processedMatter') return
  if (cell.kind === 'miningDrone') return
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
  bumpMusicToolTapActivity()
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
  if (!tryStartReplicatorTransform(cell, targetKind, resourceTallies)) return

  setResourceHud()
  bumpMusicToolTapActivity()
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
  bumpMusicToolTapActivity()
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
    bumpMusicToolTapActivity()
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
    bumpMusicToolTapActivity()
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
    bumpMusicToolTapActivity()
    return
  }

  if (!tryStartReplicatorTransform(cell, 'computronium', resourceTallies)) return

  setResourceHud()
  bumpMusicToolTapActivity()
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
    if (!ROCK_LITHOLOGY_KINDS.has(cell.kind)) continue
    convertCellToProcessedMatter(cell)
  }

  setResourceHud()
  scheduleLaserAsteroidMeshReplace()
}

/**
 * Dig laser mining burst: early returns — not unlocked or no excavating satellites; empty rock;
 * raycast miss; insufficient energy (`resetEconomyAndDrossForNewRockBody` zeros E after catapult).
 */
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
  const center = (gridSize - 1) / 2
  const lp = {
    x: (cell.pos.x - center) * voxelSize,
    y: (cell.pos.y - center) * voxelSize,
    z: (cell.pos.z - center) * voxelSize,
  }
  spawnDebrisShardFromRemovedCell(
    debrisState,
    cell,
    lp,
    performance.now(),
    {
      spawnChance: gameBalance.debrisSpawnChance,
      lifetimeMs: {
        min: gameBalance.debrisLifetimeMinSec * 1000,
        max: gameBalance.debrisLifetimeMaxSec * 1000,
      },
      speedPerSec: { min: gameBalance.debrisSpeedMin, max: gameBalance.debrisSpeedMax },
      rewardBaseUnits: 0.25,
      bonusUnits: 1,
      bonusChance: 0.1,
      asteroidRegime: currentAsteroidProfile().regime,
    },
  )
  voxelCells.splice(i, 1)
  setResourceHud()
  scheduleLaserAsteroidMeshReplace()
}

const canvas = renderer.domElement

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  pointerDown = { x: e.clientX, y: e.clientY }
  if (getSelectedTool() === 'hoover') {
    // Only start hoovering when the pointer is over the asteroid; otherwise let orbit controls handle the drag.
    const hitIdx = asteroidRaycastCellIndex(e.clientX, e.clientY)
    if (hitIdx === null) {
      return
    }
    hooverPointerDown = true
    lastHooverClient = { x: e.clientX, y: e.clientY }
    controls.enabled = false
    startHooverSustain()
    syncPressHoldToolFeedback()
    return
  }
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
    syncPressHoldToolFeedback()
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
    syncPressHoldToolFeedback()
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
  if (hooverPointerDown) {
    if (getSelectedTool() !== 'hoover') {
      hooverPointerDown = false
      lastHooverClient = null
      controls.enabled = true
      stopHooverSustain()
      syncPressHoldToolFeedback()
      return
    }
    lastHooverClient = { x: e.clientX, y: e.clientY }
  }
  if (laserPointerDown) {
    if (getSelectedTool() !== 'orbitalLaser') {
      laserPointerDown = false
      lastLaserDragClient = null
      lastLaserDragTool = null
      stopOrbitalLaserSustain()
      controls.enabled = true
      clearLaserRockHighlightColors()
      syncPressHoldToolFeedback()
      return
    }
    lastLaserDragClient = { x: e.clientX, y: e.clientY }
    tryOrbitalLaserHit(e.clientX, e.clientY)
    syncPressHoldToolFeedback()
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
      syncPressHoldToolFeedback()
      return
    }
    lastLaserDragClient = { x: e.clientX, y: e.clientY }
    tryExcavatingLaserHit(e.clientX, e.clientY)
  }
  syncPressHoldToolFeedback()
})

canvas.addEventListener('pointerup', (e) => {
  if (e.button !== 0) return
  if (hooverPointerDown) {
    hooverPointerDown = false
    lastHooverClient = null
    controls.enabled = true
    stopHooverSustain()
    syncPressHoldToolFeedback()
    pointerDown = null
    return
  }
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
    flushPendingLaserAsteroidMeshReplace()
    controls.enabled = true
    syncPressHoldToolFeedback()
    pointerDown = null
    clearLaserRockHighlightColors()
    return
  }
  if (excavatingLaserPointerDown) {
    excavatingLaserPointerDown = false
    lastLaserDragClient = null
    lastLaserDragTool = null
    stopExcavatingLaserSustain()
    flushPendingLaserAsteroidMeshReplace()
    controls.enabled = true
    syncPressHoldToolFeedback()
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

  // Debris click: allow collecting drifting shards regardless of tool, as long
  // as the click is a short tap. Use asteroid-local ray like voxel picking.
  if (debrisState.shards.length > 0) {
    canvasPointerToNdc(e.clientX, e.clientY)
    raycaster.setFromCamera(pointerNdc, camera)
    _asteroidInvWorld.copy(asteroidBundle.group.matrixWorld).invert()
    _rayLocalOrigin.copy(raycaster.ray.origin).applyMatrix4(_asteroidInvWorld)
    _rayLocalDir.copy(raycaster.ray.direction).transformDirection(_asteroidInvWorld)
    const hit = raycaster.intersectObject(asteroidBundle.group, true)[0]
    const maxDist = hit ? hit.distance + 5 : 64
    const debrisHit = raycastDebris(
      debrisState,
      {
        origin: { x: _rayLocalOrigin.x, y: _rayLocalOrigin.y, z: _rayLocalOrigin.z },
        dir: { x: _rayLocalDir.x, y: _rayLocalDir.y, z: _rayLocalDir.z },
        maxDist,
      },
      0.45,
    )
    if (debrisHit) {
      const nowMs = performance.now()
      const cooldownMs = gameBalance.debrisPickupCooldownSec * 1000
      if (nowMs - debrisHit.shard.spawnTimeMs >= cooldownMs) {
        const reward = debrisHit.shard.reward
        if (collectDebris(debrisState, debrisHit.shard.id, resourceTallies)) {
          onDebrisCollectFeedback(e.clientX, e.clientY, viewport, pickRipple)
          spawnDebrisPickupFloat(e.clientX, e.clientY, reward)
          setResourceHud()
          bumpMusicToolTapActivity()
        }
        return
      }
    }
  }
  if (tool === 'emCatapult') {
    if (
      confirm(
        'Travel to a new asteroid? Research tiers, satellite unlocks, and deploy counts are kept. Resources, energy, and everything on this rock reset.',
      )
    ) {
      emCatapultToNewAsteroid()
    }
    return
  }
  if (tool === 'orbitalLaser' || tool === 'excavatingLaser') return
  if (tool === 'scanner') {
    tryScannerAt(e.clientX, e.clientY)
    return
  }
  if (tool === 'scourge') {
    trySpawnScourgeAt(e.clientX, e.clientY)
    return
  }
  if (tool === 'locust') {
    trySpawnLocustAt(e.clientX, e.clientY)
    return
  }
  if (tool === 'miningDrone') {
    tryPlaceMiningDroneAt(e.clientX, e.clientY)
    return
  }
  if (tool === 'inspect') {
    tryInspectAt(e.clientX, e.clientY)
    return
  }
  if (tool === 'lifter') {
    tryLifterAt(e.clientX, e.clientY)
    return
  }
  if (tool === 'pick') {
    const i = asteroidRaycastCellIndex(e.clientX, e.clientY)
    if (i !== null) {
      const cell = voxelCells[i]
      if (cell.kind === 'replicator') {
        const now = performance.now()
        // Move stored replicator yields straight into global tallies.
        const src = cell.storedResources
        if (src) {
          for (const id in src) {
            const v = src[id as ResourceId]
            if (!v || !Number.isFinite(v) || v <= 0) continue
            resourceTallies[id as ResourceId] += v
            src[id as ResourceId] = 0
          }
        }
        pokeReplicator(cell, now)
        musicPokeActivityRemainSec = asteroidMusicDebug.interactionPokeDurationSec
        markRockInstanceColorsDirty()
        playReplicatorTapClick()
        setResourceHud()
        return
      }
    }
    tryPickAt(e.clientX, e.clientY)
  } else if (tool === 'replicator') {
    tryPlaceReplicator(e.clientX, e.clientY)
  } else if (tool === 'seed') {
    trySeedToolAt(e.clientX, e.clientY)
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
  if (hooverPointerDown) {
    hooverPointerDown = false
    lastHooverClient = null
    controls.enabled = true
    stopHooverSustain()
  }
  if (explosiveChargeAwaitingUp) {
    explosiveChargeAwaitingUp = false
    controls.enabled = true
  }
  if (laserPointerDown) {
    laserPointerDown = false
    lastLaserDragClient = null
    lastLaserDragTool = null
    stopOrbitalLaserSustain()
    flushPendingLaserAsteroidMeshReplace()
    controls.enabled = true
    clearLaserRockHighlightColors()
  }
  if (excavatingLaserPointerDown) {
    excavatingLaserPointerDown = false
    lastLaserDragClient = null
    lastLaserDragTool = null
    stopExcavatingLaserSustain()
    flushPendingLaserAsteroidMeshReplace()
    controls.enabled = true
    clearLaserRockHighlightColors()
  }
  syncPressHoldToolFeedback()
})

function onResize(): void {
  const w = viewport.clientWidth || window.innerWidth
  const h = viewport.clientHeight || window.innerHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  applyRendererPixelRatio(renderer)
  starTintComposer.setSize(w, h)
  starTintComposer.setPixelRatio(renderer.getPixelRatio())
}

window.addEventListener('resize', onResize)
onResize()

let lastTickMs = performance.now()
const MAX_STEP_MS = 120
const SCOURGE_STEP_INTERVAL_MS = 1500
let scourgeStepAccumMs = 0
const LOCUST_STEP_INTERVAL_MS = 1500
let locustStepAccumMs = 0
let miningDroneStepAccumMs = 0

let isPaused = false

function setPaused(next: boolean): void {
  isPaused = next
}

function tick(): void {
  requestAnimationFrame(tick)
  const frameStartMs = performance.now()
  const now = performance.now()
  const dtMs = Math.min(MAX_STEP_MS, Math.max(0, now - lastTickMs))
  lastTickMs = now
  const simDtMs = dtMs * gameSpeedMult

  if (!isPaused) {
    perfMark('roid-sim-start')
    flushPendingLaserAsteroidMeshReplace()

    stepExplosiveCharges(now)
    stepLifterCharges(now)

    perfMark('roid-replicator-transform-start')
    const { meshDirty: transformMeshDirty, completedTransforms } = stepReplicatorTransforms(
      simDtMs,
      voxelCells,
      { paused: replicatorKillswitchEngaged },
    )
    perfMark('roid-replicator-transform-end')
    perfMeasure(
      'roid-replicator-transform',
      'roid-replicator-transform-start',
      'roid-replicator-transform-end',
    )
    if (completedTransforms > 0) {
      playReplicatorPlaceClick()
      markMatterHudDirty()
      syncOverlaysDepthRow()
    }

    perfMark('roid-replicator-feed-start')
    const {
      meshDirty,
      eatingVisualDirty: replicatorEatingVisualDirty,
      tallyChanged: replicatorTallyChanged,
      replicatorConsumeTicks,
      replicatorCannibalTicks,
    } = stepReplicators(simDtMs, voxelCells, {
      replicatorPaused: replicatorKillswitchEngaged,
      neighborIndex: getReplicatorNeighborIndex(),
      gridSize,
      onReplicatorRockHpConsumed(cell) {
        tryDiscoveryAt(cell.pos)
        if (Math.random() >= gameBalance.drossReplicatorSpawnChance) return
        spawnDrossReplicatorScrap(drossState, cell, gameBalance)
      },
    })
    perfMark('roid-replicator-feed-end')
    perfMeasure('roid-replicator-feed', 'roid-replicator-feed-start', 'roid-replicator-feed-end')
    if (replicatorConsumeTicks > 0) {
      playReplicatorConsumeClicks(replicatorConsumeTicks)
    }
    if (replicatorCannibalTicks > 0) {
      playReplicatorConsumeClicks(replicatorCannibalTicks)
    }
    if (replicatorEatingVisualDirty || replicatorTallyChanged) {
      markRockInstanceColorsDirty()
    }
    scourgeStepAccumMs += simDtMs
    if (scourgeStepAccumMs >= SCOURGE_STEP_INTERVAL_MS) {
      scourgeStepAccumMs -= SCOURGE_STEP_INTERVAL_MS
      perfMark('roid-scourge-step-start')
      const { changed, consumeTicks } = stepScourge(voxelCells, {
        drossState,
        balance: gameBalance,
        debrisState,
        nowMs: now,
        gridSize,
        voxelSize,
        asteroidRegime: currentAsteroidProfile().regime,
      })
      perfMark('roid-scourge-step-end')
      perfMeasure('roid-scourge-step', 'roid-scourge-step-start', 'roid-scourge-step-end')
      if (consumeTicks > 0) {
        // Reuse replicator rock-eating clicks for Scourge destroying voxels.
        playReplicatorConsumeClicks(consumeTicks)
      }
      if (changed) {
        markRockInstanceColorsDirty()
        replaceAsteroidMesh(voxelCells)
      }
    }
    locustStepAccumMs += simDtMs
    if (locustStepAccumMs >= LOCUST_STEP_INTERVAL_MS) {
      locustStepAccumMs -= LOCUST_STEP_INTERVAL_MS
      perfMark('roid-locust-step-start')
      const locustChanged = stepLocust(voxelCells, {
        drossState,
        balance: gameBalance,
        debrisState,
        nowMs: now,
        gridSize,
        voxelSize,
        asteroidRegime: currentAsteroidProfile().regime,
      })
      perfMark('roid-locust-step-end')
      perfMeasure('roid-locust-step', 'roid-locust-step-start', 'roid-locust-step-end')
      if (locustChanged) {
        markRockInstanceColorsDirty()
        replaceAsteroidMesh(voxelCells)
      }
    }
    miningDroneStepAccumMs += simDtMs
    if (miningDroneStepAccumMs >= gameBalance.miningDroneStepIntervalMs) {
      miningDroneStepAccumMs -= gameBalance.miningDroneStepIntervalMs
      perfMark('roid-mining-drones-step-start')
      const miningChanged = stepMiningDrones(voxelCells, {
        balance: gameBalance,
        gridSize,
        originSource: currentAsset.kind === 'wreck' ? 'wreck' : 'asteroid',
        onDiscovery: tryDiscoveryAt,
      })
      perfMark('roid-mining-drones-step-end')
      perfMeasure('roid-mining-drones-step', 'roid-mining-drones-step-start', 'roid-mining-drones-step-end')
      if (miningChanged) {
        markRockInstanceColorsDirty()
        replaceAsteroidMesh(voxelCells)
      }
    }
    if (!transformMeshDirty) {
      const nowMs = now
      if (getReplicatorTransformPendingCount() > 0) {
        markRockInstanceColorsDirty()
      } else {
        for (const c of voxelCells) {
          if (c.replicatorTapPulseEndMs !== undefined && c.replicatorTapPulseEndMs > nowMs) {
            markRockInstanceColorsDirty()
            break
          }
        }
      }
    }
    if (meshDirty || transformMeshDirty) {
      replaceAsteroidMesh(voxelCells)
    }

    stepEnergy(simDtMs / 1000, voxelCells, energyState, debugEnergyCapBonus)
    stepDebris(debrisState, now, simDtMs)
    debrisVisual.syncFromState(debrisState)
    stepLifterFlights(now, simDtMs)

    perfMark('roid-debris-brackets-start')
    // Screen-space brackets around debris shards (viewport-relative, stable per shard id).
    const cooldownMs = gameBalance.debrisPickupCooldownSec * 1000
    const nowMsUi = now
    const vw = viewport.clientWidth || window.innerWidth
    const vh = viewport.clientHeight || window.innerHeight
    const maxUi = 32
    const eligible: { id: number; sx: number; sy: number }[] = []
    if (debrisState.shards.length > 0) {
      for (const shard of debrisState.shards) {
        if (nowMsUi - shard.spawnTimeMs < cooldownMs) continue
        _debrisWorldPos.set(shard.pos.x, shard.pos.y, shard.pos.z)
        _debrisWorldPos.applyMatrix4(asteroidBundle.group.matrixWorld)
        _debrisNdc.copy(_debrisWorldPos).project(camera)
        // Skip shards behind the camera or outside clip space.
        if (_debrisNdc.z < -1 || _debrisNdc.z > 1) continue
        const sx = ((_debrisNdc.x + 1) / 2) * vw
        const sy = ((-_debrisNdc.y + 1) / 2) * vh
        if (sx < 0 || sx > vw || sy < 0 || sy > vh) continue
        eligible.push({ id: shard.id, sx, sy })
      }
    }
    // Sort by stable id so a consistent subset gets brackets.
    eligible.sort((a, b) => a.id - b.id)
    const used = new Set<number>()
    for (let i = 0; i < eligible.length && i < maxUi; i++) {
      const { id, sx, sy } = eligible[i]!
      let el = debrisBracketsById.get(id)
      if (!el) {
        el = document.createElement('div')
        el.className = 'debris-bracket'
        debrisBracketsById.set(id, el)
        debrisBracketLayer.appendChild(el)
      }
      el.style.left = `${sx}px`
      el.style.top = `${sy}px`
      used.add(id)
    }
    // Remove brackets for shards that no longer qualify.
    for (const [id, el] of debrisBracketsById) {
      if (!used.has(id)) {
        el.remove()
        debrisBracketsById.delete(id)
      }
    }
    perfMark('roid-debris-brackets-end')
    perfMeasure('roid-debris-brackets', 'roid-debris-brackets-start', 'roid-debris-brackets-end')

    const laserUnlockApply = laserUnlockApplyFromVars()
    perfMark('roid-computronium-start')
    const lasersFromComputronium = stepComputronium(
      simDtMs / 1000,
      voxelCells,
      energyState,
      computroniumUnlockPoints,
      laserUnlockApply,
      gameBalance,
      computroniumResearchOrder,
    )
    perfMark('roid-computronium-end')
    perfMeasure('roid-computronium', 'roid-computronium-start', 'roid-computronium-end')
    applyLaserUnlockApply(laserUnlockApply)
    if (lasersFromComputronium) {
      refreshToolCosts()
      syncOverlaysDepthRow()
      satelliteDots.setCounts(
        orbitalSatelliteCount,
        excavatingSatelliteCount,
        scannerSatelliteCount,
        drossCollectorSatelliteCount,
        cargoDroneSatelliteCount,
        orbitVisualRadius,
      )
    }

    if (!notifiedRootForToolsDock && hasAnyRootResource(resourceTallies)) {
      notifiedRootForToolsDock = true
      refreshToolCosts()
    }

    if (!notifiedComputroniumForToolsDock && asteroidHasKind(voxelCells, 'computronium')) {
      notifiedComputroniumForToolsDock = true
      refreshToolCosts()
    }

    perfMark('roid-step-hubs-start')
    const hubResult = stepHubs(simDtMs / 1000, voxelCells, resourceTallies, energyState, {
      posIndex: getReplicatorNeighborIndex(),
      gridSize,
      onProcessedMatterUnitTaken(cell) {
        tryDiscoveryAt(cell.pos)
      },
      onRootTalliesFromPm(cell, credited) {
        const origin =
          cell.originSource === 'wreck' || cell.originSource === 'asteroid'
            ? cell.originSource
            : 'asteroid'
        const dest = resourceTalliesBySource[origin]
        for (const r of ROOT_RESOURCE_IDS) {
          const v = credited[r]
          if (v === undefined || v <= 0) continue
          dest[r] = (dest[r] ?? 0) + v
        }
      },
    })
    for (const batch of hubResult.hubRootGains) {
      mergePendingWorldAnchoredRootGains(batch.hubPos, batch.delta, 'hub_pm')
    }
    perfMark('roid-step-hubs-end')
    perfMeasure('roid-step-hubs', 'roid-step-hubs-start', 'roid-step-hubs-end')
    if (hubResult.tallyChanged) {
      markMatterHudDirty()
    }
    if (hubResult.replicatorStoreChanged) {
      markRockInstanceColorsDirty()
    }
    if (hubResult.meshDirty) {
      replaceAsteroidMesh(voxelCells)
    }

    perfMark('roid-cargo-drones-start')
    const cargoDroneResult = stepCargoDrones(
      simDtMs / 1000,
      voxelCells,
      resourceTallies,
      cargoDroneSatelliteCount,
      {
        nowMs: now,
        gridSize,
        onRootTalliesFromPm(cell, credited) {
          const origin =
            cell.originSource === 'wreck' || cell.originSource === 'asteroid'
              ? cell.originSource
              : 'asteroid'
          const dest = resourceTalliesBySource[origin]
          for (const r of ROOT_RESOURCE_IDS) {
            const v = credited[r]
            if (v === undefined || v <= 0) continue
            dest[r] = (dest[r] ?? 0) + v
          }
        },
        onProcessedMatterUnitTaken(cell) {
          tryDiscoveryAt(cell.pos)
        },
      },
    )
    for (const batch of cargoDroneResult.cargoRootGains) {
      mergePendingWorldAnchoredRootGains(batch.cellPos, batch.delta, 'cargo_drone')
    }
    perfMark('roid-cargo-drones-end')
    perfMeasure('roid-cargo-drones', 'roid-cargo-drones-start', 'roid-cargo-drones-end')
    if (cargoDroneResult.tallyChanged) {
      markMatterHudDirty()
    }
    if (cargoDroneResult.meshDirty) {
      replaceAsteroidMesh(voxelCells)
    }

    perfMark('roid-refinery-start')
    const refineryResult = stepRefineryProcessing(simDtMs / 1000, voxelCells, resourceTallies, energyState, {
      selectedRoot: selectedRefineryRoot,
      isRecipeUnlocked: (r) => isRefineryRecipeUnlocked(r, refineryRecipeUiState(), gameBalance),
    })
    perfMark('roid-refinery-end')
    perfMeasure('roid-refinery', 'roid-refinery-start', 'roid-refinery-end')
    if (refineryResult.tallyChanged) {
      markMatterHudDirty()
    }

    perfMark('roid-depth-reveal-start')
    const depthProgressChanged = stepDepthReveal(
      simDtMs / 1000,
      voxelCells,
      gameBalance,
      depthScanUnlocked,
      gridSize,
    )
    perfMark('roid-depth-reveal-end')
    perfMeasure('roid-depth-reveal', 'roid-depth-reveal-start', 'roid-depth-reveal-end')
    if (depthProgressChanged) {
      invalidateRockTintCaches()
      if (depthOverlayTintActive()) {
        markRockInstanceColorsDirty()
      }
    }

    if (
      stepDrossCollection(
        simDtMs / 1000,
        drossState,
        resourceTallies,
        drossCollectorSatelliteCount,
        gameBalance,
      )
    ) {
      markMatterHudDirty()
    }

    if (hooverPointerDown && lastHooverClient && voxelCells.length > 0 && drossState.clusters.length > 0) {
      const idx = asteroidRaycastCellIndex(lastHooverClient.x, lastHooverClient.y)
      if (idx !== null) {
        const centerPos = voxelCells[idx]!.pos
        const rootBefore: Partial<Record<RootResourceId, number>> = {}
        for (const id of ROOT_RESOURCE_IDS) {
          rootBefore[id] = resourceTallies[id] ?? 0
        }
        if (
          stepDrossHoover(
            simDtMs / 1000,
            drossState,
            resourceTallies,
            centerPos,
            gameBalance.drossHooverRadiusVox,
            gameBalance,
          )
        ) {
          const hooverDelta: Partial<Record<RootResourceId, number>> = {}
          for (const id of ROOT_RESOURCE_IDS) {
            const d = (resourceTallies[id] ?? 0) - (rootBefore[id] ?? 0)
            if (d > 0) hooverDelta[id] = d
          }
          if (Object.keys(hooverDelta).length > 0 && lastHooverClient) {
            mergePendingHooverPointerRootGains(lastHooverClient.x, lastHooverClient.y, hooverDelta)
          }
          markMatterHudDirty()
        }
      }
    }

    perfMark('roid-sim-end')
    perfMeasure('roid-sim', 'roid-sim-start', 'roid-sim-end')

    perfMark('roid-dross-particles-start')
    drossParticles.syncFromState(drossState, gridSize, voxelSize, currentSeed, now, scanVisualizationDebug)
    perfMark('roid-dross-particles-end')
    perfMeasure('roid-dross-particles', 'roid-dross-particles-start', 'roid-dross-particles-end')

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

    const miningDroneMat = asteroidBundle.miningDrone.material as MeshStandardMaterial
    if (asteroidBundle.miningDrone.visible && asteroidBundle.miningDrone.count > 0) {
      miningDroneMat.emissiveIntensity = 0.42 + 0.09 * Math.sin(now * 0.00062)
    }

    const computroniumMat = asteroidBundle.computronium.material as MeshStandardMaterial
    if (asteroidBundle.computronium.visible && asteroidBundle.computronium.count > 0) {
      computroniumMat.emissiveIntensity = 0.82 + 0.12 * Math.sin(now * 0.00048)
    }

    satelliteDots.tick(now)

    const dtSecMusic = dtMs / 1000
    let musicInteractionSatelliteEquiv = 0
    if (hooverPointerDown) {
      musicInteractionSatelliteEquiv += gameBalance.drossHooverSatelliteEquiv
    }
    if (laserPointerDown) {
      musicInteractionSatelliteEquiv += asteroidMusicDebug.interactionOrbitalLaserHoldSatelliteEquiv
    }
    if (excavatingLaserPointerDown) {
      musicInteractionSatelliteEquiv += asteroidMusicDebug.interactionExcavatingLaserHoldSatelliteEquiv
    }
    if (musicPokeActivityRemainSec > 0) {
      musicInteractionSatelliteEquiv += asteroidMusicDebug.interactionPokeSatelliteEquiv
      musicPokeActivityRemainSec = Math.max(0, musicPokeActivityRemainSec - dtSecMusic)
    }
    if (musicToolTapActivityRemainSec > 0) {
      musicInteractionSatelliteEquiv += asteroidMusicDebug.interactionToolTapSatelliteEquiv
      musicToolTapActivityRemainSec = Math.max(0, musicToolTapActivityRemainSec - dtSecMusic)
    }

    perfMark('roid-music-start')
    asteroidAmbientMusic.tick(
      dtSecMusic,
      structureVoxelCountForMusic,
      orbitalSatelliteCount,
      excavatingSatelliteCount,
      scannerSatelliteCount,
      drossCollectorSatelliteCount,
      cargoDroneSatelliteCount,
      musicInteractionSatelliteEquiv,
    )
    perfMark('roid-music-end')
    perfMeasure('roid-music', 'roid-music-start', 'roid-music-end')

    const dtSec = simDtMs / 1000
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
      if (sunDegPerSecUse !== 0) {
        const t = performance.now()
        if (t - lastPersistedSunAnglesWallMs > 2000) {
          lastPersistedSunAnglesWallMs = t
          writeSunAnglesToLocalStorage(sunAzimuthDeg, sunElevationDeg)
          schedulePersistSettingsClient()
        }
      }
    }
  }


  if (sunDirectionHelper) {
    sunDirectionHelper.update()
  }

  controls.update()

  // Matter HUD + gain floats after controls so voxel projection matches this frame's camera.
  if (!isPaused) {
    const capHud = computeEnergyCap(voxelCells, debugEnergyCapBonus)
    const energyLineHud = formatEnergyHudLine(energyState.current, capHud)
    if (matterHudDirty) {
      setResourceHud()
    } else if (energyLineHud !== lastMatterHudEnergyLine) {
      lastMatterHudEnergyLine = energyLineHud
      const energyEl = document.getElementById('matter-hud-energy')
      if (energyEl) {
        energyEl.textContent = energyLineHud
      } else {
        setResourceHud()
      }
      refreshToolCosts()
    } else {
      refreshToolCosts()
    }
  }

  const orbitDist = camera.position.distanceTo(controls.target)
  const orbitSpan = controls.maxDistance - controls.minDistance
  const zoomBlacken01 =
    orbitSpan > 0
      ? Math.min(1, Math.max(0, (orbitDist - controls.minDistance) / orbitSpan))
      : 0

  const totalDross = totalDrossMass(drossState)
  let drossFogTint: Color | null = null
  if (totalDross > 0) {
    const bulk = aggregateDrossBulkComposition(drossState)
    if (bulk) {
      const debug = getActiveScanVisualizationDebug()
      const pos: VoxelPos = { x: 0, y: 0, z: 0 }
      const out = new Color()
      drossFogTint = bulkCompositionToRockHintColor(bulk, pos, out, debug)
    }
  }

  updateDrossFog(scene, totalDross, gameBalance, zoomBlacken01, drossFogTint)
  applyFrameShake(camera)
  updateDiscoveryPendingAnchors()
  if (discoveryModal.isOpen()) {
    discoveryModal.syncAnchor()
  }

  perfMark('roid-depth-overlay-start')
  const depthOn = depthOverlayTintActive()
  const laserDragActive =
    (laserPointerDown && orbitalLaserUnlocked && lastLaserDragTool === 'orbitalLaser' && lastLaserDragClient) ||
    (excavatingLaserPointerDown &&
      excavatingLaserUnlocked &&
      lastLaserDragTool === 'excavatingLaser' &&
      lastLaserDragClient)
  const fuseActive = hasActiveExplosiveFuse(now)
  const lifterChargeActive = hasActiveLifterCharge(now)

  if (depthOn) {
    const viewChanged = depthOverlayViewChanged()
    if (laserDragActive) {
      if (viewChanged) {
        sortDepthOverlayRockInstancesByViewDistance(
          asteroidBundle,
          voxelCells,
          voxelSize,
          gridSize,
          camera.position,
        )
      }
      refreshLaserRockHighlightColors()
    } else if (fuseActive) {
      if (viewChanged) {
        sortDepthOverlayRockInstancesByViewDistance(
          asteroidBundle,
          voxelCells,
          voxelSize,
          gridSize,
          camera.position,
        )
      }
      refreshExplosiveFuseRockColors()
    } else if (lifterChargeActive) {
      if (viewChanged) {
        sortDepthOverlayRockInstancesByViewDistance(
          asteroidBundle,
          voxelCells,
          voxelSize,
          gridSize,
          camera.position,
        )
      }
      refreshLifterRockColors()
    } else if (viewChanged || rockInstanceColorsDirty) {
      if (viewChanged) {
        sortDepthOverlayRockInstancesByViewDistance(
          asteroidBundle,
          voxelCells,
          voxelSize,
          gridSize,
          camera.position,
        )
      }
      reapplyAllRockColorsNoLaser()
      rockInstanceColorsDirty = false
    }
  } else {
    if (rockInstanceColorsDirty) {
      reapplyAllRockColorsNoLaser()
      rockInstanceColorsDirty = false
    }
    if (laserDragActive) {
      refreshLaserRockHighlightColors()
    } else if (fuseActive) {
      refreshExplosiveFuseRockColors()
    } else if (lifterChargeActive) {
      refreshLifterRockColors()
    }
  }
  perfMark('roid-depth-overlay-end')
  perfMeasure('roid-depth-overlay', 'roid-depth-overlay-start', 'roid-depth-overlay-end')

  perfMark('roid-render-start')
  starTintComposer.composer.render()
  perfMark('roid-render-end')
  perfMeasure('roid-render', 'roid-render-start', 'roid-render-end')
  undoFrameShake(camera)

  sampleAudioMeters()
  updateSettingsAudioMeterElement()
  if (import.meta.env.DEV && perfDebugOverlay) {
    perfDebugOverlay.onFrameEnd({
      frameStartMs,
      renderer,
      voxels: voxelCells.length,
      debrisShards: debrisState.shards.length,
      drossClusters: drossState.clusters.length,
    })
    try {
      performance.clearMeasures()
    } catch {
      /* ignore */
    }
  }
}

syncDepthOverlayMaterials()

if (!loadGameStartTipsDismissed()) {
  requestAnimationFrame(() => {
    gameStartTipsModal.show()
  })
}

tick()
