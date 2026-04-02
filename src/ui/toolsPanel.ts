import { gameBalance, patchGameBalance } from '../game/gameBalance'
import {
  getScaledBatteryBuildCost,
  getScaledComputroniumBuildCost,
  getScaledDepthScannerBuildCost,
  getScaledExplosiveChargeArmCost,
  getScaledHubBuildCost,
  getScaledReactorBuildCost,
  getScaledRefineryBuildCost,
  getScaledReplicatorPlaceCost,
} from '../game/energyAndStructures'
import type { LaserToolId, LaserToolUiPhase } from '../game/computroniumSim'
import type { StructureToolId } from '../game/structureToolPrereqs'
import {
  formatResourceCost,
  formatResourceCostWithTallies,
  type ResourceId,
} from '../game/resources'
import { schedulePersistSettingsClient } from '../game/settingsClientPersist'
import { GIBBERISH_INTERVAL_MS, randomGibberish } from './researchGibberish'
import { loadToolsBarCollapsed, saveToolsBarCollapsed } from './uiLayoutPrefs'

export type PlayerTool =
  | 'pick'
  | 'inspect'
  | 'replicator'
  | 'seed'
  | 'reactor'
  | 'battery'
  | 'hub'
  | 'refinery'
  | 'hoover'
  | 'lifter'
  | 'cargoDrone'
  | 'orbitalLaser'
  | 'excavatingLaser'
  | 'scanner'
  | 'explosiveCharge'
  | 'depthScanner'
  | 'drossCollector'
  | 'scourge'
  | 'locust'
  | 'miningDrone'
  | 'computronium'
  | 'emCatapult'

type ToolCategoryId =
  | 'all'
  | 'basic'
  | 'structures'
  | 'lasers'
  | 'scanningDepth'
  | 'cleanup'
  | 'travel'

type ToolFilterId = ToolCategoryId

const TOOL_CATEGORY: Readonly<Record<PlayerTool, ToolCategoryId>> = {
  pick: 'basic',
  inspect: 'basic',
  hoover: 'basic',
  lifter: 'basic',
  cargoDrone: 'basic',
  replicator: 'structures',
  seed: 'structures',
  reactor: 'structures',
  battery: 'structures',
  hub: 'structures',
  refinery: 'structures',
  computronium: 'scanningDepth',
  orbitalLaser: 'lasers',
  excavatingLaser: 'lasers',
  scanner: 'scanningDepth',
  explosiveCharge: 'lasers',
  depthScanner: 'scanningDepth',
  drossCollector: 'cleanup',
  scourge: 'cleanup',
  locust: 'cleanup',
  miningDrone: 'cleanup',
  emCatapult: 'travel',
}

export interface LaserSatelliteRowSnapshot {
  orbital: {
    unlocked: boolean
    satelliteCount: number
    deployCostLine: string
    canAffordDeploy: boolean
  }
  excavating: {
    unlocked: boolean
    satelliteCount: number
    deployCostLine: string
    canAffordDeploy: boolean
  }
  scanner: {
    unlocked: boolean
    satelliteCount: number
    deployCostLine: string
    canAffordDeploy: boolean
  }
  drossCollector: {
    unlocked: boolean
    satelliteCount: number
    deployCostLine: string
    canAffordDeploy: boolean
  }
  cargoDrone: {
    unlocked: boolean
    satelliteCount: number
    deployCostLine: string
    canAffordDeploy: boolean
  }
}

export type SatelliteDeployKind =
  | 'orbital'
  | 'excavating'
  | 'scanner'
  | 'drossCollector'
  | 'cargoDrone'

/** Which main-row tool must be selected for each +sat deploy button (contextual row). */
const SATELLITE_DEPLOY_TOOL: Record<SatelliteDeployKind, PlayerTool> = {
  orbital: 'orbitalLaser',
  excavating: 'excavatingLaser',
  scanner: 'scanner',
  drossCollector: 'drossCollector',
  cargoDrone: 'cargoDrone',
}

export interface ToolsPanelOptions {
  initialTool?: PlayerTool
  onToolChange?: (tool: PlayerTool) => void
  /** Return false to cancel switching tools (e.g. cannot pay laser unlock). */
  beforeToolChange?: (from: PlayerTool, to: PlayerTool) => boolean
  /** Shown on satellite deploy buttons and for laser tool cost labels when unlocked. */
  getLaserSatelliteRow?: () => LaserSatelliteRowSnapshot
  /** Return true if deploy succeeded (resources paid and count updated). */
  onDeploySatellite?: (kind: SatelliteDeployKind) => boolean
  /** Remove satellites of the selected type (after confirmation); count is clamped to deployed. */
  onDecommissionSatellite?: (kind: SatelliteDeployKind, count: number) => void
  /** Tier-5 cleanup collector deploy row: visibility matches computronium ladder. */
  getDrossCollectorDeployUiPhase?: () => LaserToolUiPhase
  /** Main-row Cleanup tool (F13): same phase as deploy row; defaults to deploy phase if omitted. */
  getDrossCollectorToolUiPhase?: () => LaserToolUiPhase
  /** If set, unaffordable resource costs dim the tool (`aria-disabled`) and the status line notes unmet requirements. */
  canAffordResourceCost?: (cost: Partial<Record<ResourceId, number>>) => boolean
  /** Laser tools (F7–F9): hidden until research starts, gibberish labels while unlocking. */
  getLaserToolUiPhase?: (tool: LaserToolId) => LaserToolUiPhase
  /** Depth scan (F11): fourth computronium tier; same hidden / researching / unlocked pattern as lasers. */
  getDepthScanToolUiPhase?: () => LaserToolUiPhase
  /** F3–F6 / F4 / F12: hidden until prerequisite structures exist on the asteroid. */
  getStructureToolUiPhase?: (tool: StructureToolId) => 'hidden' | 'unlocked'
  /** F10: same phase as mining laser (computronium tier 1). */
  getExplosiveChargeToolUiPhase?: () => LaserToolUiPhase
  /** Tier 6: EM Catapult (new asteroid, keep research). */
  getEmCatapultToolUiPhase?: () => LaserToolUiPhase
  /** Per-arm affordability: resources plus energy (see balance). */
  canAffordExplosiveChargeArm?: () => boolean
  /** When set, tool cost lines show `have/need` per resource (and optional energy for Charge). */
  getResourceTallies?: () => Record<ResourceId, number>
  /** Current energy for explosive Charge `E have/need`; use with `getResourceTallies`. */
  getCurrentEnergy?: () => number
  /** Refinery tool: opens refinement recipe modal (global recipe selection). */
  openRefineryRecipesModal?: () => void
  /** Seed tool: opens Seed Assembly modal (per-replicator programming). */
  openSeedAssemblyModal?: () => void
  /** Replicator tool: pause feeding + transform progress after modal confirm. */
  onReplicatorKillswitch?: () => void
  /** Clear killswitch pause (no modal). */
  onReplicatorResume?: () => void
  /** Whether replicator feeding/transforms are frozen. */
  getReplicatorKillswitchEngaged?: () => boolean
  /** True when there is a replicator voxel or rock with replicator spread/eating. */
  hasReplicatorNetworkActivity?: () => boolean
  /** Called at the end of every `refreshToolCosts` (e.g. modal gibberish sync). */
  onAfterRefreshToolCosts?: () => void
  /** After `patchGameBalance` from the tools dock (e.g. depth lode opacity row). */
  onGameBalancePatch?: () => void
}

type CostToolKind =
  | 'replicatorPlace'
  | 'seedReplicatorPlace'
  | 'reactor'
  | 'battery'
  | 'hub'
  | 'refinery'
  | 'explosiveChargeArm'
  | 'depthScanner'
  | 'computronium'
  | 'orbitalLaserUnlock'
  | 'excavatingLaserUnlock'
  | 'scannerUnlock'
  | 'drossCollectorInfo'
  | 'scourgeInfo'
  | 'locustInfo'
  | 'miningDroneInfo'
  | 'cargoDroneInfo'
  | 'emCatapultInfo'

const TOOL_FILTERS: ReadonlyArray<{
  id: ToolFilterId
  label: string
}> = [
  { id: 'all', label: 'All' },
  { id: 'basic', label: 'Basics' },
  { id: 'structures', label: 'Structures' },
  { id: 'lasers', label: 'Lasers' },
  { id: 'scanningDepth', label: 'Scanning/Depth' },
  { id: 'cleanup', label: 'Cleanup' },
  { id: 'travel', label: 'Travel' },
]

const TOOLS: ReadonlyArray<{
  id: PlayerTool
  fKey: string
  label: string
  title: string
  /** Very short blurb for the selected-tool status line (with costs). */
  short: string
  costTool?: CostToolKind
  laserSatelliteKind?: 'orbital' | 'excavating' | 'scanner' | 'cargoDrone'
}> = [
  {
    id: 'pick',
    fKey: 'F1',
    label: 'Poke',
    title: 'Poke rocks.',
    short: 'Poke rocks.',
  },
  {
    id: 'seed',
    fKey: 'F15',
    label: 'Seed',
    title:
      'Program Replicators with Seeds. Select a Seed stack, then place Replicators that follow that programming until their Seed lifetime expires.',
    short: 'Configure custom Replicator seeds',
    costTool: 'seedReplicatorPlace',
  },
  {
    id: 'inspect',
    fKey: 'Ins',
    label: 'Inspect',
    title:
      'Show info in top menu. Click a voxel for position, kind, and state; orbit markers open satellite info. Bulk/refined composition only after surface scan or depth reveal on that cell',
    short: 'Show info in top menu',
  },
  {
    id: 'replicator',
    fKey: 'F2',
    label: 'Replicator',
    title: 'Convert rocks into stored resources and itself',
    short: 'Rocks → stored resources; spreads',
    costTool: 'replicatorPlace',
  },
  {
    id: 'reactor',
    fKey: 'F3',
    label: 'Reactor',
    title: 'Generate energy. Convert a mature replicator into a reactor',
    short: 'Replicator → reactor; generates energy',
    costTool: 'reactor',
  },
  {
    id: 'battery',
    fKey: 'F4',
    label: 'Battery',
    title: 'Convert a mature replicator into a battery; increases energy storage cap',
    short: 'Replicator → battery; raises energy cap',
    costTool: 'battery',
  },
  {
    id: 'hub',
    fKey: 'F5',
    label: 'Hub',
    title:
      'Collects resources. Convert a mature replicator into a hub, or click an existing hub to toggle it on/off (standby saves energy). Pulls local stock into global root tallies.',
    short: 'Replicator → hub; collects resources; toggles',
    costTool: 'hub',
  },
  {
    id: 'refinery',
    fKey: 'F6',
    label: 'Refinery',
    title:
      'Process resources. Convert a mature replicator into a refinery, or click an existing refinery to toggle it on/off. Processes global root resources into second-order resources.',
    short: 'Replicator → refinery; process resources; toggles',
    costTool: 'refinery',
  },
  {
    id: 'hoover',
    fKey: 'HV',
    label: 'Hoover',
    title: 'Hold on debris to vacuum dross into resources (no energy cost).',
    short: 'Vacuum local debris into resources',
  },
  {
    id: 'lifter',
    fKey: 'LF',
    label: 'Lifter',
    title:
      'Click processed matter (mining laser) to charge; when ready it flies off and credits roots like a hub pull.',
    short: 'Pickup processed matter → roots (after charge)',
  },
  {
    id: 'cargoDrone',
    fKey: 'CD',
    label: 'Cargo drone',
    title:
      'Deploy cargo drones with + Cargo sat (mining laser tier). Orbit fleet automatically transfers processed matter into root tallies over time (after hubs on each tick).',
    short: 'Orbit drones → PM → roots (auto)',
    costTool: 'cargoDroneInfo',
    laserSatelliteKind: 'cargoDrone',
  },
  {
    id: 'orbitalLaser',
    fKey: 'F7',
    label: 'Laser',
    title:
      'Hold and drag on rock to make processed matter (uses energy); a hub consolidates it into roots, then refineries refine',
    short: 'Drag rock → processed matter (uses energy)',
    costTool: 'orbitalLaserUnlock',
    laserSatelliteKind: 'orbital',
  },
  {
    id: 'excavatingLaser',
    fKey: 'F8',
    label: 'Dig laser',
    title: 'Hold and drag to destroy any voxel (uses energy); no resource drops',
    short: 'Drag to destroy voxels (uses energy)',
    costTool: 'excavatingLaserUnlock',
    laserSatelliteKind: 'excavating',
  },
  {
    id: 'scanner',
    fKey: 'F9',
    label: 'Scan',
    title:
      'Click rock to scan a voxel neighborhood (uses energy; radius in Debug → balance); persistent refined-material tint; eye menu toggles Surface scan overlay',
    short: 'Scan rock neighborhood (uses energy)',
    costTool: 'scannerUnlock',
    laserSatelliteKind: 'scanner',
  },
  {
    id: 'explosiveCharge',
    fKey: 'F10',
    label: 'Charge',
    title:
      'Click any voxel to arm; blinks then explodes (blast radius in Debug → balance). Unlocks with computronium research tier 1 (same milestone as mining laser). Per arm: resources + energy',
    short: 'Arm voxel; timed blast',
    costTool: 'explosiveChargeArm',
  },
  {
    id: 'depthScanner',
    fKey: 'F11',
    label: 'Depth scan',
    title:
      'Convert rock or processed matter into a depth scanner (resource cost); unlocks after computronium research tier 4 (scanner satellite tier first); passive interior reveal; eye menu → Depth overlay',
    short: 'Place depth scanner; passive interior reveal',
    costTool: 'depthScanner',
  },
  {
    id: 'drossCollector',
    fKey: 'F13',
    label: 'Cleanup',
    title:
      'Computronium tier 5 unlocks cleanup collector satellites. Deploy with + Cleanup sat; collectors convert debris into resources. No voxel action on the asteroid.',
    short: 'Cleanup satellites; debris → resources',
    costTool: 'drossCollectorInfo',
  },
  {
    id: 'scourge',
    fKey: 'F16',
    label: 'Scourge',
    title:
      'Place a Scourge seed on rock. Seeds spread flood-fill style, consuming neighboring rock into cleanup dross mass while Debug → balance Scourge settings cap per-tick conversions.',
    short: 'Place Scourge seed; rock → dross',
    costTool: 'scourgeInfo',
  },
  {
    id: 'locust',
    fKey: 'F17',
    label: 'Locust',
    title:
      'Place a Locust seed on rock. Locust behaves like Scourge but replicates along the front, growing a thicker cleanup wave as it advances.',
    short: 'Place Locust seed; front-replicating rock → dross',
    costTool: 'locustInfo',
  },
  {
    id: 'miningDrone',
    fKey: 'F18',
    label: 'Mining drone',
    title:
      'Place a mining drone on rock. Each step it moves into a random neighboring rock voxel, leaving processed matter behind (tier 5 computronium research, same as Scourge/Locust).',
    short: 'Rock → drone; travels → PM trail',
    costTool: 'miningDroneInfo',
  },
  {
    id: 'computronium',
    fKey: 'F12',
    label: 'Computronium',
    title:
      'Convert a mature replicator into computronium (resource cost). Active computronium spends energy and unlocks laser tools over time. Click existing computronium to toggle off',
    short: 'Replicator → computronium; research unlocks',
    costTool: 'computronium',
  },
  {
    id: 'emCatapult',
    fKey: 'F14',
    label: 'EM Catapult',
    title:
      'After computronium tier 6 (cleanup tier first): click the view to travel to a new procedural asteroid. Keeps research tiers, satellite unlocks, and deploy counts; resets resources, energy, and surface structures. Settings → Regenerate asteroid still resets everything.',
    short: 'New asteroid; keep research',
    costTool: 'emCatapultInfo',
  },
]

function costForTool(kind: CostToolKind): Partial<Record<ResourceId, number>> {
  if (kind === 'replicatorPlace') return getScaledReplicatorPlaceCost()
  if (kind === 'seedReplicatorPlace') return getScaledReplicatorPlaceCost()
  if (kind === 'reactor') return getScaledReactorBuildCost()
  if (kind === 'battery') return getScaledBatteryBuildCost()
  if (kind === 'hub') return getScaledHubBuildCost()
  if (kind === 'refinery') return getScaledRefineryBuildCost()
  if (kind === 'explosiveChargeArm') return getScaledExplosiveChargeArmCost()
  if (kind === 'depthScanner') return getScaledDepthScannerBuildCost()
  if (kind === 'computronium') return getScaledComputroniumBuildCost()
  if (kind === 'drossCollectorInfo') return {}
  if (kind === 'scourgeInfo') return {}
  if (kind === 'locustInfo') return {}
  if (kind === 'miningDroneInfo') return {}
  if (kind === 'cargoDroneInfo') return {}
  if (kind === 'emCatapultInfo') return {}
  return {}
}

function applyGibberishFixedWidths(ui: {
  fkeyEl: HTMLSpanElement
  labelEl: HTMLSpanElement
  costSpan: HTMLSpanElement
  gibLen: { fKey: number; label: number; cost: number }
}): void {
  const lock = (el: HTMLElement, ch: number): void => {
    el.style.display = 'inline-block'
    el.style.boxSizing = 'border-box'
    el.style.width = `${ch}ch`
    el.style.overflow = 'hidden'
    el.style.whiteSpace = 'nowrap'
  }
  lock(ui.fkeyEl, ui.gibLen.fKey)
  lock(ui.labelEl, ui.gibLen.label)
  ui.costSpan.textContent = ''
}

function clearGibberishFixedWidths(ui: {
  button: HTMLButtonElement
  fkeyEl?: HTMLSpanElement
  labelEl?: HTMLSpanElement
  costSpan: HTMLSpanElement
}): void {
  ui.button.classList.remove('tools-tool-researching')
  const clear = (el: HTMLElement): void => {
    el.style.display = ''
    el.style.boxSizing = ''
    el.style.width = ''
    el.style.overflow = ''
    el.style.whiteSpace = ''
  }
  if (ui.fkeyEl) clear(ui.fkeyEl)
  if (ui.labelEl) clear(ui.labelEl)
  clear(ui.costSpan)
}

export function createToolsPanel(
  container: HTMLElement,
  {
    initialTool = 'pick',
    onToolChange,
    beforeToolChange,
    getLaserSatelliteRow,
    onDeploySatellite,
    onDecommissionSatellite,
    canAffordResourceCost,
    getLaserToolUiPhase,
    getDepthScanToolUiPhase,
    getDrossCollectorDeployUiPhase,
    getDrossCollectorToolUiPhase,
    getEmCatapultToolUiPhase,
    getStructureToolUiPhase,
    getExplosiveChargeToolUiPhase,
    canAffordExplosiveChargeArm,
    getResourceTallies,
    getCurrentEnergy,
    openRefineryRecipesModal,
    onReplicatorKillswitch,
    onReplicatorResume,
    getReplicatorKillswitchEngaged,
    hasReplicatorNetworkActivity,
    onAfterRefreshToolCosts,
    onGameBalancePatch,
    openSeedAssemblyModal,
  }: ToolsPanelOptions = {},
): {
  getSelectedTool: () => PlayerTool
  refreshToolCosts: () => void
  setSelectedTool: (tool: PlayerTool, options?: { skipBeforeToolChange?: boolean }) => void
} {
  const wrap = document.createElement('div')
  wrap.className = 'tools-overlay'
  wrap.setAttribute('role', 'toolbar')
  wrap.setAttribute('aria-label', 'Tools')

  const row = document.createElement('div')
  row.id = 'tools-panel'
  row.className = 'tools-row'

  const selectedCostStrip = document.createElement('div')
  selectedCostStrip.className = 'tools-selected-cost'
  selectedCostStrip.setAttribute('role', 'status')
  selectedCostStrip.setAttribute('aria-live', 'polite')
  selectedCostStrip.hidden = true

  const depthLodeOpacityRow = document.createElement('div')
  depthLodeOpacityRow.className = 'tools-depth-lode-opacity-row'
  depthLodeOpacityRow.hidden = true
  const depthLodeOpacityLabel = document.createElement('label')
  depthLodeOpacityLabel.className = 'tools-depth-lode-opacity-label'
  depthLodeOpacityLabel.htmlFor = 'tools-depth-lode-opacity-range'
  depthLodeOpacityLabel.textContent = 'Depth overlay — warm lode full opacity ≥'
  const depthLodeOpacityInput = document.createElement('input')
  depthLodeOpacityInput.type = 'range'
  depthLodeOpacityInput.id = 'tools-depth-lode-opacity-range'
  depthLodeOpacityInput.min = '0'
  depthLodeOpacityInput.max = '1'
  depthLodeOpacityInput.step = '0.02'
  depthLodeOpacityInput.value = String(gameBalance.depthOverlayLodeFullOpacityMinDensity)
  const depthLodeOpacityVal = document.createElement('span')
  depthLodeOpacityVal.className = 'tools-depth-lode-opacity-val'
  depthLodeOpacityVal.textContent = gameBalance.depthOverlayLodeFullOpacityMinDensity.toFixed(2)
  depthLodeOpacityRow.append(depthLodeOpacityLabel, depthLodeOpacityInput, depthLodeOpacityVal)
  depthLodeOpacityInput.addEventListener('input', () => {
    const n = Number(depthLodeOpacityInput.value)
    depthLodeOpacityVal.textContent = n.toFixed(2)
    patchGameBalance({ depthOverlayLodeFullOpacityMinDensity: n })
    onGameBalancePatch?.()
  })

  let selected: PlayerTool = initialTool
  const buttons = new Map<PlayerTool, HTMLButtonElement>()
  const buttonCategories = new Map<
    PlayerTool,
    {
      button: HTMLButtonElement
      category: ToolCategoryId
    }
  >()
  const costUi = new Map<
    PlayerTool,
    {
      button: HTMLButtonElement
      costSpan: HTMLSpanElement
      baseTitle: string
      kind: CostToolKind
      laserSatelliteKind?: 'orbital' | 'excavating' | 'scanner' | 'cargoDrone'
      fkeyEl?: HTMLSpanElement
      labelEl?: HTMLSpanElement
      gibLen?: { fKey: number; label: number; cost: number }
    }
  >()

  /** Last time researching gibberish text was regenerated; reset when nothing is researching. */
  let lastGibberishMs = 0

  /** Selected satellite deploy type (+sat buttons); launch happens via `satLaunchBtn`. */
  let pendingSatelliteKind: SatelliteDeployKind | null = null

  const satRow = document.createElement('div')
  satRow.className = 'tools-sat-row'

  const orbitalDeployBtn = document.createElement('button')
  orbitalDeployBtn.type = 'button'
  orbitalDeployBtn.className = 'tools-sat-btn'
  orbitalDeployBtn.textContent = '+ Mining sat'

  const excavatingDeployBtn = document.createElement('button')
  excavatingDeployBtn.type = 'button'
  excavatingDeployBtn.className = 'tools-sat-btn'
  excavatingDeployBtn.textContent = '+ Dig sat'

  const scannerDeployBtn = document.createElement('button')
  scannerDeployBtn.type = 'button'
  scannerDeployBtn.className = 'tools-sat-btn'
  scannerDeployBtn.textContent = '+ Scan sat'

  const drossDeployBtn = document.createElement('button')
  drossDeployBtn.type = 'button'
  drossDeployBtn.className = 'tools-sat-btn'
  drossDeployBtn.textContent = '+ Cleanup sat'

  const cargoDeployBtn = document.createElement('button')
  cargoDeployBtn.type = 'button'
  cargoDeployBtn.className = 'tools-sat-btn'
  cargoDeployBtn.textContent = '+ Cargo sat'

  const satContextRow = document.createElement('div')
  satContextRow.className = 'tools-sat-context'
  satContextRow.hidden = true

  const satContextStatus = document.createElement('div')
  satContextStatus.className = 'tools-sat-context-status'
  satContextStatus.setAttribute('role', 'status')
  satContextStatus.setAttribute('aria-live', 'polite')

  const satLaunchBtn = document.createElement('button')
  satLaunchBtn.type = 'button'
  satLaunchBtn.className = 'tools-sat-launch'
  satLaunchBtn.textContent = 'Launch satellite'

  const satContextActions = document.createElement('div')
  satContextActions.className = 'tools-sat-context-actions'
  satContextActions.append(satLaunchBtn)

  let satDecommissionBtn: HTMLButtonElement | undefined
  if (onDecommissionSatellite) {
    satDecommissionBtn = document.createElement('button')
    satDecommissionBtn.type = 'button'
    satDecommissionBtn.className = 'tools-sat-decommission'
    satDecommissionBtn.textContent = 'Decommission'
    satContextActions.append(satDecommissionBtn)
  }

  satContextRow.append(satContextStatus, satContextActions)

  const refineryContextRow = document.createElement('div')
  refineryContextRow.className = 'tools-refinery-context'
  refineryContextRow.hidden = true

  const refineryRecipesBtn = document.createElement('button')
  refineryRecipesBtn.type = 'button'
  refineryRecipesBtn.className = 'tools-refinery-recipes-btn'
  refineryRecipesBtn.textContent = 'Recipes'
  refineryRecipesBtn.title = 'Choose which root resource refineries process'
  refineryRecipesBtn.setAttribute('aria-label', 'Refinery recipes')
  refineryRecipesBtn.addEventListener('click', () => {
    openRefineryRecipesModal?.()
  })
  refineryContextRow.append(refineryRecipesBtn)

  function syncRefineryRecipeRow(): void {
    if (!openRefineryRecipesModal) {
      refineryContextRow.hidden = true
      return
    }
    const show = selected === 'refinery' && !isToolHidden('refinery')
    refineryContextRow.hidden = !show
  }

  let replicatorContextRow: HTMLDivElement | undefined
  let replicatorKillswitchBtn: HTMLButtonElement | undefined

  let openReplicatorKillswitchModal: () => void = () => {}

  let seedContextRow: HTMLDivElement | undefined
  let seedAssemblyBtn: HTMLButtonElement | undefined

  if (onReplicatorKillswitch) {
    const runKillswitch = onReplicatorKillswitch
    const runResume = onReplicatorResume
    const killswitchEngaged = getReplicatorKillswitchEngaged
    replicatorContextRow = document.createElement('div')
    replicatorContextRow.className = 'tools-refinery-context tools-replicator-context'
    replicatorContextRow.hidden = true

    replicatorKillswitchBtn = document.createElement('button')
    replicatorKillswitchBtn.type = 'button'
    replicatorKillswitchBtn.className = 'tools-refinery-recipes-btn tools-replicator-killswitch-btn'
    replicatorKillswitchBtn.textContent = 'Killswitch'
    replicatorKillswitchBtn.setAttribute('aria-label', 'Replicator killswitch')
    replicatorContextRow.append(replicatorKillswitchBtn)

    replicatorKillswitchBtn.addEventListener('click', () => {
      if (replicatorKillswitchBtn!.disabled) return
      if (killswitchEngaged?.()) {
        runResume?.()
        return
      }
      openReplicatorKillswitchModal()
    })

    const ksRoot = document.createElement('div')
    ksRoot.className = 'discovery-modal-root replicator-killswitch-modal'
    ksRoot.hidden = true
    ksRoot.setAttribute('role', 'presentation')

    const ksScrim = document.createElement('div')
    ksScrim.className = 'discovery-modal-scrim'

    const ksPanel = document.createElement('div')
    ksPanel.className = 'discovery-modal-panel'
    ksPanel.setAttribute('role', 'dialog')
    ksPanel.setAttribute('aria-modal', 'true')
    ksPanel.setAttribute('aria-labelledby', 'replicator-killswitch-modal-title')

    const ksTitle = document.createElement('div')
    ksTitle.id = 'replicator-killswitch-modal-title'
    ksTitle.className = 'discovery-modal-title'
    ksTitle.textContent = 'Replicator killswitch'

    const ksBody = document.createElement('div')
    ksBody.className = 'discovery-modal-body'
    const ksP = document.createElement('p')
    ksP.className = 'discovery-modal-p'
    ksP.textContent =
      'This pauses replicator feeding on rock and freezes in-progress replicator-to-structure timers. Replicator voxels stay in place; click Resume on the tools row to continue.'

    ksBody.append(ksP)

    const ksButtons = document.createElement('div')
    ksButtons.className = 'discovery-modal-buttons'

    const ksCancel = document.createElement('button')
    ksCancel.type = 'button'
    ksCancel.className = 'discovery-modal-btn discovery-modal-btn-ok'
    ksCancel.textContent = 'Cancel'

    const ksConfirm = document.createElement('button')
    ksConfirm.type = 'button'
    ksConfirm.className = 'discovery-modal-btn discovery-modal-btn-danger'
    ksConfirm.textContent = 'Pause network'

    ksButtons.append(ksCancel, ksConfirm)
    ksPanel.append(ksTitle, ksBody, ksButtons)
    ksRoot.append(ksScrim, ksPanel)
    container.appendChild(ksRoot)

    let ksEscapeHandler: ((e: KeyboardEvent) => void) | null = null

    function closeKsModal(): void {
      ksRoot.hidden = true
      if (ksEscapeHandler) {
        document.removeEventListener('keydown', ksEscapeHandler)
        ksEscapeHandler = null
      }
    }

    function submitKs(): void {
      runKillswitch()
      closeKsModal()
    }

    ksScrim.addEventListener('click', closeKsModal)
    ksCancel.addEventListener('click', closeKsModal)
    ksConfirm.addEventListener('click', submitKs)

    openReplicatorKillswitchModal = () => {
      ksRoot.hidden = false
      ksEscapeHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          closeKsModal()
        }
      }
      document.addEventListener('keydown', ksEscapeHandler)
      ksConfirm.focus()
    }
  }

  if (openSeedAssemblyModal) {
    seedContextRow = document.createElement('div')
    seedContextRow.className = 'tools-refinery-context tools-seed-context'
    seedContextRow.hidden = true

    seedAssemblyBtn = document.createElement('button')
    seedAssemblyBtn.type = 'button'
    seedAssemblyBtn.className = 'tools-refinery-recipes-btn tools-seed-assembly-btn'
    seedAssemblyBtn.textContent = 'Assembly'
    seedAssemblyBtn.setAttribute('aria-label', 'Seed assembly')
    seedAssemblyBtn.title = 'Configure Seed stacks for future Replicators'
    seedAssemblyBtn.addEventListener('click', () => {
      openSeedAssemblyModal?.()
    })

    seedContextRow.append(seedAssemblyBtn)
  }

  function syncDepthLodeOpacityRow(): void {
    const show =
      selected === 'depthScanner' &&
      !isToolHidden('depthScanner') &&
      getDepthScanToolUiPhase?.() !== 'hidden'
    depthLodeOpacityRow.hidden = !show
    if (show) {
      const v = gameBalance.depthOverlayLodeFullOpacityMinDensity
      depthLodeOpacityInput.value = String(v)
      depthLodeOpacityVal.textContent = v.toFixed(2)
    }
  }

  function syncReplicatorKillswitchRow(): void {
    if (!replicatorContextRow || !replicatorKillswitchBtn || !onReplicatorKillswitch) return
    const show = selected === 'replicator'
    replicatorContextRow.hidden = !show
    const engaged = getReplicatorKillswitchEngaged?.() ?? false
    const active = hasReplicatorNetworkActivity?.() ?? false
    replicatorKillswitchBtn.textContent = engaged ? 'Resume' : 'Killswitch'
    replicatorKillswitchBtn.disabled = !active && !engaged
    replicatorKillswitchBtn.setAttribute('aria-label', engaged ? 'Resume replicator network' : 'Replicator killswitch')
    if (engaged) {
      replicatorKillswitchBtn.title = 'Resume replicator feeding and replicator-to-structure timers.'
    } else if (active) {
      replicatorKillswitchBtn.title =
        'Pause replicator feeding and in-progress conversions (opens confirmation).'
    } else {
      replicatorKillswitchBtn.title = 'No active replicators or spread on rock.'
    }
  }

  function syncSeedContextRow(): void {
    if (!seedContextRow || !seedAssemblyBtn || !openSeedAssemblyModal) return
    const show = selected === 'seed'
    seedContextRow.hidden = !show
    seedAssemblyBtn.disabled = false
  }

  if (onDeploySatellite) {
    orbitalDeployBtn.addEventListener('click', () => {
      pendingSatelliteKind = 'orbital'
      syncSatelliteDeployRow()
    })
    excavatingDeployBtn.addEventListener('click', () => {
      pendingSatelliteKind = 'excavating'
      syncSatelliteDeployRow()
    })
    scannerDeployBtn.addEventListener('click', () => {
      pendingSatelliteKind = 'scanner'
      syncSatelliteDeployRow()
    })
    drossDeployBtn.addEventListener('click', () => {
      pendingSatelliteKind = 'drossCollector'
      syncSatelliteDeployRow()
    })
    cargoDeployBtn.addEventListener('click', () => {
      pendingSatelliteKind = 'cargoDrone'
      syncSatelliteDeployRow()
    })
    satRow.append(
      orbitalDeployBtn,
      excavatingDeployBtn,
      scannerDeployBtn,
      drossDeployBtn,
      cargoDeployBtn,
    )
  }

  function isToolHidden(tool: PlayerTool): boolean {
    if (getStructureToolUiPhase) {
      if (
        tool === 'reactor' ||
        tool === 'hub' ||
        tool === 'refinery' ||
        tool === 'battery' ||
        tool === 'computronium'
      ) {
        if (getStructureToolUiPhase(tool) === 'hidden') return true
      }
    }
    if (tool === 'depthScanner' && getDepthScanToolUiPhase?.() === 'hidden') return true
    if (
      tool === 'drossCollector' &&
      (getDrossCollectorToolUiPhase ?? getDrossCollectorDeployUiPhase)?.() === 'hidden'
    )
      return true
    if (tool === 'explosiveCharge' && getExplosiveChargeToolUiPhase?.() === 'hidden') return true
    if (tool === 'emCatapult' && getEmCatapultToolUiPhase?.() === 'hidden') return true
    if (
      getLaserToolUiPhase &&
      (tool === 'orbitalLaser' || tool === 'excavatingLaser' || tool === 'scanner')
    ) {
      if (getLaserToolUiPhase(tool) === 'hidden') return true
    }
    if (
      tool === 'scourge' ||
      tool === 'locust' ||
      tool === 'miningDrone' ||
      tool === 'lifter' ||
      tool === 'cargoDrone'
    ) {
      // Tier-5 cleanup ladder: Scourge, Locust, Mining drone, Lifter, Cargo drone.
      const phase = researchPhaseForTool(tool, {})
      if (phase === 'hidden') return true
    }
    return false
  }

  function researchPhaseForTool(
    toolId: PlayerTool,
    ui: {
      laserSatelliteKind?: 'orbital' | 'excavating' | 'scanner' | 'cargoDrone'
    },
  ): LaserToolUiPhase | null {
    if (ui.laserSatelliteKind === 'cargoDrone') {
      if (!getDrossCollectorToolUiPhase && !getDrossCollectorDeployUiPhase) return 'hidden'
      return (getDrossCollectorToolUiPhase ?? getDrossCollectorDeployUiPhase)!()
    }
    if (ui.laserSatelliteKind && getLaserToolUiPhase) {
      return getLaserToolUiPhase(toolId as LaserToolId)
    }
    if (toolId === 'depthScanner' && getDepthScanToolUiPhase) {
      return getDepthScanToolUiPhase()
    }
    if (toolId === 'drossCollector' && (getDrossCollectorToolUiPhase ?? getDrossCollectorDeployUiPhase)) {
      return (getDrossCollectorToolUiPhase ?? getDrossCollectorDeployUiPhase)!()
    }
    if (toolId === 'explosiveCharge' && getExplosiveChargeToolUiPhase) {
      return getExplosiveChargeToolUiPhase()
    }
    if (toolId === 'emCatapult' && getEmCatapultToolUiPhase) {
      return getEmCatapultToolUiPhase()
    }
    if (
      toolId === 'scourge' ||
      toolId === 'locust' ||
      toolId === 'miningDrone' ||
      toolId === 'lifter' ||
      toolId === 'cargoDrone'
    ) {
      // Tier 5: Scourge/Locust/Mining drone/Lifter/Cargo drone share the cleanup ladder.
      if (!getDrossCollectorToolUiPhase && !getDrossCollectorDeployUiPhase) return 'hidden'
      return (getDrossCollectorToolUiPhase ?? getDrossCollectorDeployUiPhase)!()
    }
    return null
  }

  function syncSelectedToolCostLine(): void {
    const def = TOOLS.find((t) => t.id === selected)
    if (!def) {
      selectedCostStrip.hidden = true
      selectedCostStrip.textContent = ''
      return
    }
    const name = def.label
    const short = def.short

    if (!costUi.has(selected)) {
      if (isToolHidden(selected)) {
        selectedCostStrip.hidden = true
        selectedCostStrip.textContent = ''
        return
      }
      selectedCostStrip.hidden = false
      selectedCostStrip.textContent = `${name}: ${short}`
      return
    }

    const ui = costUi.get(selected)!
    if (ui.button.hidden) {
      selectedCostStrip.hidden = true
      selectedCostStrip.textContent = ''
      return
    }
    const phase = researchPhaseForTool(selected, ui)
    if (phase === 'researching') {
      selectedCostStrip.hidden = false
      selectedCostStrip.textContent = `${name}: ${short} — Research in progress`
      return
    }
    const line = ui.costSpan.textContent.trim()
    selectedCostStrip.hidden = false
    let detail = line ? `${name}: ${short} — ${line}` : `${name}: ${short}`
    if (ui.button.getAttribute('aria-disabled') === 'true' && !getResourceTallies) {
      detail += ' — requirements not met'
    }
    selectedCostStrip.textContent = detail
  }

  function setPressed(tool: PlayerTool): void {
    if (isToolHidden(tool)) return
    if (tool === selected) return
    if (beforeToolChange && !beforeToolChange(selected, tool)) return
    selected = tool
    pendingSatelliteKind = null
    for (const [id, btn] of buttons) {
      const on = id === tool
      btn.setAttribute('aria-pressed', on ? 'true' : 'false')
      btn.classList.toggle('tools-tool-active', on)
    }
    onToolChange?.(tool)
    syncSelectedToolCostLine()
    if (onDeploySatellite && getLaserSatelliteRow) syncSatelliteDeployRow()
    syncRefineryRecipeRow()
    syncReplicatorKillswitchRow()
    syncDepthLodeOpacityRow()
    syncSeedContextRow()
  }

  function setSelectedTool(tool: PlayerTool, options?: { skipBeforeToolChange?: boolean }): void {
    if (!buttons.has(tool)) return
    if (isToolHidden(tool)) return
    if (options?.skipBeforeToolChange) {
      selected = tool
      pendingSatelliteKind = null
      for (const [id, btn] of buttons) {
        const on = id === tool
        btn.setAttribute('aria-pressed', on ? 'true' : 'false')
        btn.classList.toggle('tools-tool-active', on)
      }
      onToolChange?.(tool)
      syncSelectedToolCostLine()
      if (onDeploySatellite && getLaserSatelliteRow) syncSatelliteDeployRow()
      syncRefineryRecipeRow()
      syncReplicatorKillswitchRow()
      syncDepthLodeOpacityRow()
      syncSeedContextRow()
      return
    }
    setPressed(tool)
  }

  function formatResourceLine(cost: Partial<Record<ResourceId, number>>): string {
    if (getResourceTallies) return formatResourceCostWithTallies(getResourceTallies(), cost)
    return formatResourceCost(cost)
  }

  function formatExplosiveCostLine(): string {
    const cost = getScaledExplosiveChargeArmCost()
    const eNeed = gameBalance.explosiveChargeEnergyPerArm
    if (getResourceTallies && getCurrentEnergy) {
      return `${formatResourceCostWithTallies(getResourceTallies(), cost)} + E ${Math.floor(getCurrentEnergy())}/${eNeed}`
    }
    if (getResourceTallies) {
      return `${formatResourceCostWithTallies(getResourceTallies(), cost)} + ${eNeed} E`
    }
    return `${formatResourceCost(cost)} + ${eNeed} E`
  }

  /** Affordance only: use `aria-disabled` (not `disabled`) so the tool stays clickable to read requirements in the strip. */
  function setToolBlockedByAffordance(button: HTMLButtonElement, blocked: boolean): void {
    button.disabled = false
    if (blocked) button.setAttribute('aria-disabled', 'true')
    else button.removeAttribute('aria-disabled')
  }

  function costAffordableForUi(ui: {
    kind: CostToolKind
    laserSatelliteKind?: 'orbital' | 'excavating' | 'scanner' | 'cargoDrone'
  }): boolean {
    if (!canAffordResourceCost) return true
    if (ui.kind === 'drossCollectorInfo') return true
    if (ui.kind === 'cargoDroneInfo') return true
    if (ui.kind === 'emCatapultInfo') return true
    if (ui.kind === 'explosiveChargeArm') {
      if (!canAffordExplosiveChargeArm) return true
      return canAffordExplosiveChargeArm()
    }
    if (ui.laserSatelliteKind && getLaserSatelliteRow) {
      const slot = getLaserSatelliteRow()[ui.laserSatelliteKind]
      if (slot.unlocked) return true
      return false
    }
    return canAffordResourceCost(costForTool(ui.kind))
  }

  function applyCostToButton(ui: {
    button: HTMLButtonElement
    costSpan: HTMLSpanElement
    baseTitle: string
    kind: CostToolKind
    laserSatelliteKind?: 'orbital' | 'excavating' | 'scanner' | 'cargoDrone'
  }): void {
    if (ui.kind === 'drossCollectorInfo') {
      ui.costSpan.textContent = 'Tier 5'
      setToolBlockedByAffordance(ui.button, false)
      ui.button.title = `${ui.baseTitle} Unlocked: deploy collectors from + Cleanup sat.`
      ui.button.setAttribute('aria-label', ui.button.title)
      return
    }
    if (ui.kind === 'emCatapultInfo') {
      ui.costSpan.textContent = 'Tier 6'
      setToolBlockedByAffordance(ui.button, false)
      ui.button.title = `${ui.baseTitle} Unlocked: confirm on canvas to move to a new asteroid (research kept).`
      ui.button.setAttribute('aria-label', ui.button.title)
      return
    }
    if (ui.kind === 'explosiveChargeArm') {
      const costLine = formatExplosiveCostLine()
      ui.costSpan.textContent = costLine
      const affordable = costAffordableForUi(ui)
      const baseTitle = `${ui.baseTitle} Per arm: ${costLine}.`
      ui.button.title = affordable ? baseTitle : `${baseTitle} Insufficient resources or energy.`
      setToolBlockedByAffordance(ui.button, !affordable)
      ui.button.setAttribute('aria-label', ui.button.title)
      return
    }
    let costLine: string
    let titleSuffix: string
    if (ui.laserSatelliteKind && getLaserSatelliteRow) {
      const snap = getLaserSatelliteRow()
      const slot = snap[ui.laserSatelliteKind]
      if (!slot.unlocked) {
        costLine = 'Computronium'
        titleSuffix =
          'Locked until unlocked by computronium progress (Settings → Debug — balance: Unlock all tools).'
      } else {
        costLine = `${slot.satelliteCount} sat`
        titleSuffix = `Unlocked. Satellites: ${slot.satelliteCount}. Deploy: ${slot.deployCostLine}.`
      }
    } else {
      const cost = costForTool(ui.kind)
      costLine = formatResourceLine(cost)
      titleSuffix = `Cost: ${costLine}.`
    }
    ui.costSpan.textContent = costLine
    const affordable = costAffordableForUi(ui)
    const baseTitle = `${ui.baseTitle} ${titleSuffix}`
    ui.button.title = affordable
      ? baseTitle
      : ui.laserSatelliteKind && getLaserSatelliteRow && !getLaserSatelliteRow()[ui.laserSatelliteKind].unlocked
        ? baseTitle
        : `${baseTitle} Insufficient resources.`
    setToolBlockedByAffordance(ui.button, !affordable)
    ui.button.setAttribute('aria-label', ui.button.title)
  }

  const DEPLOY_LABEL: Record<SatelliteDeployKind, string> = {
    orbital: 'Mining satellite',
    excavating: 'Dig laser satellite',
    scanner: 'Scanner satellite',
    drossCollector: 'Cleanup collector satellite',
    cargoDrone: 'Cargo drone satellite',
  }

  let openSatDecommissionModal: (
    kind: SatelliteDeployKind,
    label: string,
    deployed: number,
  ) => void = () => {}

  if (onDecommissionSatellite) {
    const root = document.createElement('div')
    root.className = 'discovery-modal-root sat-decommission-modal'
    root.hidden = true
    root.setAttribute('role', 'presentation')

    const scrim = document.createElement('div')
    scrim.className = 'discovery-modal-scrim'

    const panel = document.createElement('div')
    panel.className = 'discovery-modal-panel'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')
    panel.setAttribute('aria-labelledby', 'sat-decommission-modal-title')

    const titleEl = document.createElement('div')
    titleEl.id = 'sat-decommission-modal-title'
    titleEl.className = 'discovery-modal-title'
    titleEl.textContent = 'Decommission satellites'

    const bodyEl = document.createElement('div')
    bodyEl.className = 'discovery-modal-body'

    const introP = document.createElement('p')
    introP.className = 'discovery-modal-p'

    const qtyRow = document.createElement('div')
    qtyRow.className = 'sat-decommission-modal-quantity'

    const qtyLabel = document.createElement('label')
    qtyLabel.className = 'sat-decommission-modal-quantity-label'
    qtyLabel.htmlFor = 'sat-decommission-count'
    qtyLabel.textContent = 'How many to decommission?'

    const countInput = document.createElement('input')
    countInput.id = 'sat-decommission-count'
    countInput.className = 'sat-decommission-modal-count-input'
    countInput.type = 'number'
    countInput.min = '1'
    countInput.step = '1'
    countInput.inputMode = 'numeric'

    qtyRow.append(qtyLabel, countInput)

    bodyEl.append(introP, qtyRow)

    const buttonsEl = document.createElement('div')
    buttonsEl.className = 'discovery-modal-buttons'

    const btnCancel = document.createElement('button')
    btnCancel.type = 'button'
    btnCancel.className = 'discovery-modal-btn discovery-modal-btn-ok'
    btnCancel.textContent = 'Cancel'

    const btnOk = document.createElement('button')
    btnOk.type = 'button'
    btnOk.className = 'discovery-modal-btn discovery-modal-btn-danger'
    btnOk.textContent = 'Decommission'

    buttonsEl.append(btnCancel, btnOk)
    panel.append(titleEl, bodyEl, buttonsEl)
    root.append(scrim, panel)
    container.appendChild(root)

    let escapeHandler: ((e: KeyboardEvent) => void) | null = null
    let pendingKind: SatelliteDeployKind | null = null
    let pendingMax = 0

    function close(): void {
      root.hidden = true
      if (escapeHandler) {
        document.removeEventListener('keydown', escapeHandler)
        escapeHandler = null
      }
      pendingKind = null
      pendingMax = 0
    }

    function submitDecommission(): void {
      if (pendingKind === null || !onDecommissionSatellite) return
      const max = pendingMax
      let n =
        max > 1 ? Math.floor(Number.parseInt(countInput.value, 10)) : 1
      if (!Number.isFinite(n)) n = 1
      n = Math.max(1, Math.min(max, n))
      onDecommissionSatellite(pendingKind, n)
      close()
    }

    scrim.addEventListener('click', close)
    btnCancel.addEventListener('click', close)
    btnOk.addEventListener('click', submitDecommission)
    countInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submitDecommission()
      }
    })

    openSatDecommissionModal = (kind, label, deployed) => {
      if (deployed <= 0) return
      pendingKind = kind
      pendingMax = deployed
      introP.textContent = `You have ${deployed} ${label.toLowerCase()} deployed. Decommission removes satellites from your fleet (not specific orbit markers). This cannot be undone.`
      if (deployed > 1) {
        qtyRow.hidden = false
        countInput.max = String(deployed)
        countInput.min = '1'
        countInput.value = '1'
        qtyLabel.textContent = 'How many to decommission?'
      } else {
        qtyRow.hidden = true
      }
      root.hidden = false
      escapeHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          close()
        }
      }
      document.addEventListener('keydown', escapeHandler)
      if (deployed > 1) {
        countInput.focus()
        countInput.select()
      } else {
        btnOk.focus()
      }
    }
  }

  function syncSatelliteDeployRow(): void {
    if (!onDeploySatellite || !getLaserSatelliteRow) return
    if (pendingSatelliteKind !== null) {
      if (SATELLITE_DEPLOY_TOOL[pendingSatelliteKind] !== selected) pendingSatelliteKind = null
    }
    const snap = getLaserSatelliteRow()
    const o = snap.orbital
    const e = snap.excavating
    const s = snap.scanner
    const d = snap.drossCollector
    const c = snap.cargoDrone
    const drossPhase = getDrossCollectorDeployUiPhase?.() ?? 'hidden'
    orbitalDeployBtn.hidden = !o.unlocked || selected !== 'orbitalLaser'
    excavatingDeployBtn.hidden = !e.unlocked || selected !== 'excavatingLaser'
    scannerDeployBtn.hidden = !s.unlocked || selected !== 'scanner'
    drossDeployBtn.hidden = drossPhase === 'hidden' || selected !== 'drossCollector'
    cargoDeployBtn.hidden = !c.unlocked || selected !== 'cargoDrone'
    satRow.hidden =
      orbitalDeployBtn.hidden &&
      excavatingDeployBtn.hidden &&
      scannerDeployBtn.hidden &&
      drossDeployBtn.hidden &&
      cargoDeployBtn.hidden

    if (pendingSatelliteKind === 'orbital' && orbitalDeployBtn.hidden) pendingSatelliteKind = null
    if (pendingSatelliteKind === 'excavating' && excavatingDeployBtn.hidden) pendingSatelliteKind = null
    if (pendingSatelliteKind === 'scanner' && scannerDeployBtn.hidden) pendingSatelliteKind = null
    if (pendingSatelliteKind === 'drossCollector' && drossDeployBtn.hidden) pendingSatelliteKind = null
    if (pendingSatelliteKind === 'cargoDrone' && cargoDeployBtn.hidden) pendingSatelliteKind = null

    orbitalDeployBtn.disabled = false
    excavatingDeployBtn.disabled = false
    scannerDeployBtn.disabled = false
    cargoDeployBtn.disabled = false
    orbitalDeployBtn.title = `Select to deploy another mining satellite. Next deploy: ${o.deployCostLine}.`
    excavatingDeployBtn.title = `Select to deploy another dig laser satellite. Next deploy: ${e.deployCostLine}.`
    scannerDeployBtn.title = `Select to deploy another scanner satellite. Next deploy: ${s.deployCostLine}.`
    cargoDeployBtn.title = `Select to deploy another cargo drone satellite. Next deploy: ${c.deployCostLine}.`

    orbitalDeployBtn.classList.toggle('tools-sat-btn--active', pendingSatelliteKind === 'orbital')
    orbitalDeployBtn.setAttribute('aria-pressed', pendingSatelliteKind === 'orbital' ? 'true' : 'false')
    excavatingDeployBtn.classList.toggle('tools-sat-btn--active', pendingSatelliteKind === 'excavating')
    excavatingDeployBtn.setAttribute('aria-pressed', pendingSatelliteKind === 'excavating' ? 'true' : 'false')
    scannerDeployBtn.classList.toggle('tools-sat-btn--active', pendingSatelliteKind === 'scanner')
    scannerDeployBtn.setAttribute('aria-pressed', pendingSatelliteKind === 'scanner' ? 'true' : 'false')
    drossDeployBtn.classList.toggle('tools-sat-btn--active', pendingSatelliteKind === 'drossCollector')
    drossDeployBtn.setAttribute('aria-pressed', pendingSatelliteKind === 'drossCollector' ? 'true' : 'false')
    cargoDeployBtn.classList.toggle('tools-sat-btn--active', pendingSatelliteKind === 'cargoDrone')
    cargoDeployBtn.setAttribute('aria-pressed', pendingSatelliteKind === 'cargoDrone' ? 'true' : 'false')

    if (drossPhase === 'researching') {
      drossDeployBtn.disabled = true
      drossDeployBtn.title = 'Research in progress (computronium tier 5).'
      drossDeployBtn.classList.remove('tools-sat-btn--active')
      drossDeployBtn.setAttribute('aria-pressed', 'false')
      if (pendingSatelliteKind === 'drossCollector') pendingSatelliteKind = null
    } else if (drossPhase === 'unlocked') {
      drossDeployBtn.disabled = false
      drossDeployBtn.title = `Select to deploy another cleanup collector satellite. Next deploy: ${d.deployCostLine}.`
    } else {
      drossDeployBtn.disabled = true
      drossDeployBtn.title = ''
    }

    if (pendingSatelliteKind === null) {
      satContextRow.hidden = true
      satContextStatus.textContent = ''
      satLaunchBtn.disabled = true
      satLaunchBtn.removeAttribute('aria-disabled')
      if (satDecommissionBtn) {
        satDecommissionBtn.disabled = true
        satDecommissionBtn.title = ''
      }
      return
    }

    satContextRow.hidden = satRow.hidden
    const slot = snap[pendingSatelliteKind]
    const label = DEPLOY_LABEL[pendingSatelliteKind]
    satContextStatus.textContent = `${label} — ${slot.deployCostLine}`

    let canLaunch = slot.unlocked && slot.canAffordDeploy
    if (pendingSatelliteKind === 'drossCollector') {
      if (drossPhase === 'researching' || drossPhase === 'hidden') canLaunch = false
    }

    satLaunchBtn.disabled = !canLaunch
    if (canLaunch) {
      satLaunchBtn.removeAttribute('aria-disabled')
      satLaunchBtn.title = `Deploy ${label.toLowerCase()} (deducts resources).`
      satLaunchBtn.setAttribute(
        'aria-label',
        `Deploy ${label.toLowerCase()}. Cost: ${slot.deployCostLine}.`,
      )
    } else {
      satLaunchBtn.title = slot.unlocked
        ? 'Insufficient resources for this deploy.'
        : 'Satellite type not unlocked.'
      satLaunchBtn.setAttribute('aria-label', satLaunchBtn.title)
    }

    if (satDecommissionBtn) {
      const canDecom = slot.satelliteCount > 0
      satDecommissionBtn.disabled = !canDecom
      if (canDecom) {
        satDecommissionBtn.title =
          slot.satelliteCount > 1
            ? `Decommission… opens a dialog to choose how many to remove (${slot.satelliteCount} deployed).`
            : `Decommission… confirms removal of your only ${label.toLowerCase()} (not a specific marker).`
        satDecommissionBtn.setAttribute(
          'aria-label',
          `Decommission ${label.toLowerCase()}. ${slot.satelliteCount} deployed. Opens confirmation dialog.`,
        )
      } else {
        satDecommissionBtn.title = 'No satellites of this type deployed.'
        satDecommissionBtn.setAttribute('aria-label', satDecommissionBtn.title)
      }
    }
  }

  function refreshToolCosts(): void {
    const now = performance.now()
    let anyResearching = false
    for (const [toolId, ui] of costUi) {
      const phase = researchPhaseForTool(toolId, ui)
      if (phase === 'researching') {
        anyResearching = true
        break
      }
    }

    let shouldRegenGibberish = false
    if (!anyResearching) {
      lastGibberishMs = 0
    } else if (lastGibberishMs === 0 || now - lastGibberishMs >= GIBBERISH_INTERVAL_MS) {
      shouldRegenGibberish = true
      lastGibberishMs = now
    }

    for (const [toolId, ui] of costUi) {
      const phase = researchPhaseForTool(toolId, ui)
      if (phase !== null) {
        if (phase === 'hidden') {
          clearGibberishFixedWidths(ui)
          ui.button.hidden = true
          ui.button.removeAttribute('aria-disabled')
          ui.button.disabled = true
          continue
        }
        ui.button.hidden = false
        if (phase === 'researching' && ui.fkeyEl && ui.labelEl && ui.gibLen) {
          ui.button.classList.add('tools-tool-researching')
          applyGibberishFixedWidths({
            fkeyEl: ui.fkeyEl,
            labelEl: ui.labelEl,
            costSpan: ui.costSpan,
            gibLen: ui.gibLen,
          })
          ui.button.removeAttribute('aria-disabled')
          ui.button.disabled = true
          ui.button.title = 'Research in progress.'
          ui.button.setAttribute('aria-label', 'Research in progress')
          if (shouldRegenGibberish) {
            ui.fkeyEl.textContent = randomGibberish(ui.gibLen.fKey)
            ui.labelEl.textContent = randomGibberish(ui.gibLen.label)
          }
          continue
        }
        clearGibberishFixedWidths(ui)
      }
      if (getStructureToolUiPhase) {
        const structureTools: StructureToolId[] = ['reactor', 'hub', 'refinery', 'battery', 'computronium']
        if (structureTools.includes(toolId as StructureToolId)) {
          if (getStructureToolUiPhase(toolId as StructureToolId) === 'hidden') {
            clearGibberishFixedWidths(ui)
            ui.button.hidden = true
            ui.button.removeAttribute('aria-disabled')
            ui.button.disabled = true
            continue
          }
          ui.button.hidden = false
        }
      }
      applyCostToButton(ui)
    }
    syncSatelliteDeployRow()
    syncRefineryRecipeRow()
    syncReplicatorKillswitchRow()
    syncDepthLodeOpacityRow()

    if (isToolHidden(selected)) {
      setSelectedTool('pick', { skipBeforeToolChange: true })
    }
    syncSelectedToolCostLine()
    syncToolFilterRow()
    onAfterRefreshToolCosts?.()
  }

  if (onDeploySatellite) {
    satLaunchBtn.addEventListener('click', () => {
      if (pendingSatelliteKind === null) return
      if (satLaunchBtn.disabled) return
      const ok = onDeploySatellite(pendingSatelliteKind)
      if (ok) refreshToolCosts()
    })
    if (onDecommissionSatellite && satDecommissionBtn) {
      satDecommissionBtn.addEventListener('click', () => {
        if (pendingSatelliteKind === null || !getLaserSatelliteRow) return
        if (satDecommissionBtn.disabled) return
        const kind = pendingSatelliteKind
        const slot = getLaserSatelliteRow()[kind]
        openSatDecommissionModal(kind, DEPLOY_LABEL[kind], slot.satelliteCount)
      })
    }
  }

  let activeFilter: ToolFilterId = 'all'

  function toolMatchesActiveFilter(toolId: PlayerTool): boolean {
    if (activeFilter === 'all') return true
    const meta = buttonCategories.get(toolId)
    if (!meta) return true
    return meta.category === activeFilter
  }

  function syncToolFilterRow(): void {
    for (const [toolId, btn] of buttons) {
      if (btn.disabled && btn.hidden) continue
      const byFilter = toolMatchesActiveFilter(toolId)
      // Do not override hidden state that comes from unlock logic; only further hide based on filter.
      if (!byFilter) {
        btn.hidden = true
      } else {
        // Only show if not already hidden due to unlock rules.
        if (!isToolHidden(toolId)) {
          btn.hidden = false
        }
      }
    }
  }

  for (const def of TOOLS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'tools-tool'
    const costLine =
      def.costTool === 'explosiveChargeArm'
        ? formatExplosiveCostLine()
        : def.costTool
          ? formatResourceLine(costForTool(def.costTool))
          : ''
    btn.title = costLine ? `${def.title} Cost: ${costLine}.` : def.title

    const fkeyEl = document.createElement('span')
    fkeyEl.className = 'tools-tool-fkey'
    fkeyEl.textContent = def.fKey
    btn.appendChild(fkeyEl)

    const labelEl = document.createElement('span')
    labelEl.className = 'tools-tool-label'
    labelEl.textContent = def.label
    btn.appendChild(labelEl)

    if (def.costTool) {
      const costEl = document.createElement('span')
      costEl.className = 'tools-tool-cost'
      costEl.textContent = costLine
      btn.appendChild(costEl)
      costUi.set(def.id, {
        button: btn,
        costSpan: costEl,
        baseTitle: def.title,
        kind: def.costTool,
        laserSatelliteKind: def.laserSatelliteKind,
        ...(def.laserSatelliteKind
          ? {
              fkeyEl,
              labelEl,
              gibLen: {
                fKey: Math.max(2, def.fKey.length),
                label: Math.max(3, def.label.length),
                cost: 'Computronium'.length,
              },
            }
          : def.id === 'depthScanner' ||
              def.id === 'explosiveCharge' ||
              def.id === 'drossCollector' ||
              def.id === 'emCatapult'
            ? {
                fkeyEl,
                labelEl,
                gibLen: {
                  fKey: Math.max(2, def.fKey.length),
                  label: Math.max(3, def.label.length),
                  cost: 'Computronium'.length,
                },
              }
            : {}),
      })
    }

    btn.setAttribute('aria-pressed', def.id === initialTool ? 'true' : 'false')
    btn.setAttribute('aria-label', def.title)
    if (def.id === initialTool) btn.classList.add('tools-tool-active')
    btn.addEventListener('click', () => setPressed(def.id))
    buttons.set(def.id, btn)
    buttonCategories.set(def.id, {
      button: btn,
      category: TOOL_CATEGORY[def.id],
    })
    row.appendChild(btn)
  }

  const filterRow = document.createElement('div')
  filterRow.className = 'tools-filter-row'
  filterRow.setAttribute('role', 'toolbar')

  const filterButtons = new Map<ToolFilterId, HTMLButtonElement>()

  function syncActiveFilterUi(): void {
    for (const [id, btn] of filterButtons) {
      const on = id === activeFilter
      btn.classList.toggle('tools-filter-btn-active', on)
      btn.setAttribute('aria-pressed', on ? 'true' : 'false')
    }
    syncToolFilterRow()
  }

  for (const def of TOOL_FILTERS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'tools-filter-btn'
    btn.textContent = def.label
    btn.setAttribute('data-filter-id', def.id)
    btn.setAttribute('aria-pressed', def.id === activeFilter ? 'true' : 'false')
    btn.addEventListener('click', () => {
      if (activeFilter === def.id) return
      activeFilter = def.id
      syncActiveFilterUi()
    })
    filterButtons.set(def.id, btn)
    filterRow.appendChild(btn)
  }

  const toolsBand = document.createElement('div')
  toolsBand.className = 'tools-dock-tools-band'
  toolsBand.append(row, filterRow)

  const contextCol = document.createElement('div')
  contextCol.className = 'tools-dock-context-col'
  if (onDeploySatellite) {
    contextCol.append(satRow, satContextRow)
  }
  if (openRefineryRecipesModal) {
    contextCol.append(refineryContextRow)
  }
  if (replicatorContextRow) {
    contextCol.append(replicatorContextRow)
  }
  if (seedContextRow) {
    contextCol.append(seedContextRow)
  }
  if (contextCol.childNodes.length > 0) {
    toolsBand.append(contextCol)
  }

  const dockBody = document.createElement('div')
  dockBody.className = 'tools-dock-body'
  dockBody.id = 'tools-dock-body'
  dockBody.append(depthLodeOpacityRow, selectedCostStrip, toolsBand)

  const dockShell = document.createElement('div')
  dockShell.className = 'tools-dock-shell'

  const dockMinBtn = document.createElement('button')
  dockMinBtn.type = 'button'
  dockMinBtn.className = 'tools-dock-minimize'
  dockMinBtn.setAttribute('aria-controls', 'tools-dock-body')

  const TOOLS_ICON_MIN = `<svg class="tools-dock-minimize-svg" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect fill="currentColor" x="1" y="9" width="10" height="2" /></svg>`
  const TOOLS_ICON_EXPAND = `<svg class="tools-dock-minimize-svg" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M5 1h2v4h4v2H7v4H5V7H1V5h4V1z" /></svg>`

  let toolsDockCollapsed = loadToolsBarCollapsed()

  function syncToolsDockUi(): void {
    wrap.classList.toggle('tools-overlay--collapsed', toolsDockCollapsed)
    dockShell.classList.toggle('tools-dock-shell--collapsed', toolsDockCollapsed)
    dockMinBtn.setAttribute('aria-expanded', String(!toolsDockCollapsed))
    dockMinBtn.innerHTML = toolsDockCollapsed ? TOOLS_ICON_EXPAND : TOOLS_ICON_MIN
    dockMinBtn.setAttribute('aria-label', toolsDockCollapsed ? 'Expand tools' : 'Minimize tools')
    dockMinBtn.title = toolsDockCollapsed ? 'Show tool bar' : 'Hide tool bar'
  }

  syncToolsDockUi()

  dockMinBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    toolsDockCollapsed = !toolsDockCollapsed
    saveToolsBarCollapsed(toolsDockCollapsed)
    syncToolsDockUi()
    schedulePersistSettingsClient()
  })

  dockShell.append(dockMinBtn, dockBody)
  wrap.appendChild(dockShell)
  container.appendChild(wrap)

  refreshToolCosts()
  syncActiveFilterUi()

  return {
    getSelectedTool: () => selected,
    refreshToolCosts,
    setSelectedTool,
  }
}
