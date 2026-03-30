import { gameBalance } from '../game/gameBalance'
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
import { loadToolsBarCollapsed, saveToolsBarCollapsed } from './uiLayoutPrefs'

export type PlayerTool =
  | 'pick'
  | 'inspect'
  | 'replicator'
  | 'reactor'
  | 'battery'
  | 'hub'
  | 'refinery'
  | 'orbitalLaser'
  | 'excavatingLaser'
  | 'scanner'
  | 'explosiveCharge'
  | 'depthScanner'
  | 'drossCollector'
  | 'computronium'

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
}

export type SatelliteDeployKind = 'orbital' | 'excavating' | 'scanner' | 'drossCollector'

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
  /** Per-arm affordability: resources plus energy (see balance). */
  canAffordExplosiveChargeArm?: () => boolean
  /** When set, tool cost lines show `have/need` per resource (and optional energy for Charge). */
  getResourceTallies?: () => Record<ResourceId, number>
  /** Current energy for explosive Charge `E have/need`; use with `getResourceTallies`. */
  getCurrentEnergy?: () => number
}

type CostToolKind =
  | 'replicatorPlace'
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

const TOOLS: ReadonlyArray<{
  id: PlayerTool
  fKey: string
  label: string
  title: string
  /** Very short blurb for the selected-tool status line (with costs). */
  short: string
  costTool?: CostToolKind
  laserSatelliteKind?: 'orbital' | 'excavating' | 'scanner'
}> = [
  {
    id: 'pick',
    fKey: 'F1',
    label: 'Pick',
    title: 'Pick rocks.',
    short: 'Pick rocks.',
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
    id: 'computronium',
    fKey: 'F12',
    label: 'Computronium',
    title:
      'Convert a mature replicator into computronium (resource cost). Active computronium spends energy and unlocks laser tools over time. Click existing computronium to toggle off',
    short: 'Replicator → computronium; research unlocks',
    costTool: 'computronium',
  },
]

function costForTool(kind: CostToolKind): Partial<Record<ResourceId, number>> {
  if (kind === 'replicatorPlace') return getScaledReplicatorPlaceCost()
  if (kind === 'reactor') return getScaledReactorBuildCost()
  if (kind === 'battery') return getScaledBatteryBuildCost()
  if (kind === 'hub') return getScaledHubBuildCost()
  if (kind === 'refinery') return getScaledRefineryBuildCost()
  if (kind === 'explosiveChargeArm') return getScaledExplosiveChargeArmCost()
  if (kind === 'depthScanner') return getScaledDepthScannerBuildCost()
  if (kind === 'computronium') return getScaledComputroniumBuildCost()
  if (kind === 'drossCollectorInfo') return {}
  return {}
}

const GIBBERISH_ALPHABET =
  '█▓▒░▀▄▌▐┤┘┌┴┬├┼│─┼╪Øµþÿ¿½¼£¥ßðþÞ¦§'

/** How often researching laser labels reshuffle (much slower than frame rate). */
const GIBBERISH_INTERVAL_MS = 2000

function randomGibberish(len: number): string {
  let s = ''
  const n = Math.max(0, len | 0)
  for (let i = 0; i < n; i++) {
    s += GIBBERISH_ALPHABET[(Math.random() * GIBBERISH_ALPHABET.length) | 0]
  }
  return s
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
    getStructureToolUiPhase,
    getExplosiveChargeToolUiPhase,
    canAffordExplosiveChargeArm,
    getResourceTallies,
    getCurrentEnergy,
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

  let selected: PlayerTool = initialTool
  const buttons = new Map<PlayerTool, HTMLButtonElement>()
  const costUi = new Map<
    PlayerTool,
    {
      button: HTMLButtonElement
      costSpan: HTMLSpanElement
      baseTitle: string
      kind: CostToolKind
      laserSatelliteKind?: 'orbital' | 'excavating' | 'scanner'
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
    satRow.append(orbitalDeployBtn, excavatingDeployBtn, scannerDeployBtn, drossDeployBtn)
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
    if (
      getLaserToolUiPhase &&
      (tool === 'orbitalLaser' || tool === 'excavatingLaser' || tool === 'scanner')
    ) {
      if (getLaserToolUiPhase(tool) === 'hidden') return true
    }
    return false
  }

  function researchPhaseForTool(
    toolId: PlayerTool,
    ui: {
      laserSatelliteKind?: 'orbital' | 'excavating' | 'scanner'
    },
  ): LaserToolUiPhase | null {
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
    laserSatelliteKind?: 'orbital' | 'excavating' | 'scanner'
  }): boolean {
    if (!canAffordResourceCost) return true
    if (ui.kind === 'drossCollectorInfo') return true
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
    laserSatelliteKind?: 'orbital' | 'excavating' | 'scanner'
  }): void {
    if (ui.kind === 'drossCollectorInfo') {
      ui.costSpan.textContent = 'Tier 5'
      setToolBlockedByAffordance(ui.button, false)
      ui.button.title = `${ui.baseTitle} Unlocked: deploy collectors from + Cleanup sat.`
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
    const snap = getLaserSatelliteRow()
    const o = snap.orbital
    const e = snap.excavating
    const s = snap.scanner
    const d = snap.drossCollector
    const drossPhase = getDrossCollectorDeployUiPhase?.() ?? 'hidden'
    orbitalDeployBtn.hidden = !o.unlocked
    excavatingDeployBtn.hidden = !e.unlocked
    scannerDeployBtn.hidden = !s.unlocked
    drossDeployBtn.hidden = drossPhase === 'hidden'
    satRow.hidden = !o.unlocked && !e.unlocked && !s.unlocked && drossPhase === 'hidden'

    if (pendingSatelliteKind === 'orbital' && orbitalDeployBtn.hidden) pendingSatelliteKind = null
    if (pendingSatelliteKind === 'excavating' && excavatingDeployBtn.hidden) pendingSatelliteKind = null
    if (pendingSatelliteKind === 'scanner' && scannerDeployBtn.hidden) pendingSatelliteKind = null
    if (pendingSatelliteKind === 'drossCollector' && drossDeployBtn.hidden) pendingSatelliteKind = null

    orbitalDeployBtn.disabled = false
    excavatingDeployBtn.disabled = false
    scannerDeployBtn.disabled = false
    orbitalDeployBtn.title = `Select to deploy another mining satellite. Next deploy: ${o.deployCostLine}.`
    excavatingDeployBtn.title = `Select to deploy another dig laser satellite. Next deploy: ${e.deployCostLine}.`
    scannerDeployBtn.title = `Select to deploy another scanner satellite. Next deploy: ${s.deployCostLine}.`

    orbitalDeployBtn.classList.toggle('tools-sat-btn--active', pendingSatelliteKind === 'orbital')
    orbitalDeployBtn.setAttribute('aria-pressed', pendingSatelliteKind === 'orbital' ? 'true' : 'false')
    excavatingDeployBtn.classList.toggle('tools-sat-btn--active', pendingSatelliteKind === 'excavating')
    excavatingDeployBtn.setAttribute('aria-pressed', pendingSatelliteKind === 'excavating' ? 'true' : 'false')
    scannerDeployBtn.classList.toggle('tools-sat-btn--active', pendingSatelliteKind === 'scanner')
    scannerDeployBtn.setAttribute('aria-pressed', pendingSatelliteKind === 'scanner' ? 'true' : 'false')
    drossDeployBtn.classList.toggle('tools-sat-btn--active', pendingSatelliteKind === 'drossCollector')
    drossDeployBtn.setAttribute('aria-pressed', pendingSatelliteKind === 'drossCollector' ? 'true' : 'false')

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

    if (isToolHidden(selected)) {
      setSelectedTool('pick', { skipBeforeToolChange: true })
    }
    syncSelectedToolCostLine()
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
          : def.id === 'depthScanner' || def.id === 'explosiveCharge' || def.id === 'drossCollector'
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
    row.appendChild(btn)
  }

  const dockBody = document.createElement('div')
  dockBody.className = 'tools-dock-body'
  dockBody.id = 'tools-dock-body'
  dockBody.append(selectedCostStrip, row)
  if (onDeploySatellite) dockBody.append(satRow, satContextRow)

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

  return {
    getSelectedTool: () => selected,
    refreshToolCosts,
    setSelectedTool,
  }
}
