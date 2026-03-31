import type { LaserToolUiPhase } from '../game/computroniumSim'
import { resourceHudCssColorForId } from '../game/resourceOriginDepth'
import {
  refinementYieldForParent,
  RESOURCE_DEFS,
  RESOURCE_IDS_ORDERED,
  ROOT_RESOURCE_IDS,
  type ResourceId,
  type RootResourceId,
} from '../game/resources'
import { GIBBERISH_INTERVAL_MS, randomGibberish } from './researchGibberish'

export interface RefineryRecipesModalApi {
  show: () => void
  hide: () => void
  isOpen: () => boolean
  /** Reshuffle researching gibberish while open; rebuild rows when phases change. */
  refresh: () => void
}

function formatYieldSummary(root: RootResourceId): string {
  const y = refinementYieldForParent(root)
  const parts: string[] = []
  for (const id of Object.keys(y) as ResourceId[]) {
    const v = y[id]
    if (v === undefined || v <= 0) continue
    parts.push(RESOURCE_DEFS[id].displayName)
  }
  return parts.join(' · ')
}

function childIdsForRecipe(root: RootResourceId): ResourceId[] {
  const y = refinementYieldForParent(root)
  const out: ResourceId[] = []
  for (const id of RESOURCE_IDS_ORDERED) {
    if ((y[id] ?? 0) > 0) out.push(id)
  }
  return out
}

function shortSelectedRecipeTooltip(root: RootResourceId): string {
  const def = RESOURCE_DEFS[root]
  const yields = formatYieldSummary(root)
  if (root === 'ices') {
    return `One ${def.displayName.toLowerCase()} per step when in stock. Yields: ${yields}. Refineries also provide a tiny safety-valve trickle of surface ice over time so you cannot fully softlock on ice.`
  }
  return `One ${def.displayName.toLowerCase()} per step when in stock. Yields: ${yields}.`
}

function fillRecipeTickers(
  wrap: HTMLElement,
  root: RootResourceId,
  tallies: Record<ResourceId, number>,
): void {
  wrap.replaceChildren()
  const frag = document.createDocumentFragment()

  const rootSpan = document.createElement('span')
  rootSpan.className = 'matter-hud-res'
  rootSpan.style.color = resourceHudCssColorForId(root)
  rootSpan.textContent = `${RESOURCE_DEFS[root].hudAbbrev} ${Math.floor(tallies[root] ?? 0)}`
  frag.appendChild(rootSpan)

  const children = childIdsForRecipe(root)
  if (children.length > 0) {
    frag.appendChild(document.createTextNode(' → '))
    for (let i = 0; i < children.length; i++) {
      const cid = children[i]!
      const span = document.createElement('span')
      span.className = 'matter-hud-res'
      span.style.color = resourceHudCssColorForId(cid)
      span.textContent = `${RESOURCE_DEFS[cid].hudAbbrev} ${Math.floor(tallies[cid] ?? 0)}`
      frag.appendChild(span)
      if (i < children.length - 1) frag.appendChild(document.createTextNode(', '))
    }
  }

  wrap.appendChild(frag)
}

function phaseSignature(getRecipePhase: (root: RootResourceId) => LaserToolUiPhase): string {
  return ROOT_RESOURCE_IDS.map((r) => getRecipePhase(r)).join('')
}

export function createRefineryRecipesModal(
  container: HTMLElement,
  options: {
    getSelectedRoot: () => RootResourceId
    onSelectRoot: (root: RootResourceId) => void
    getRecipePhase: (root: RootResourceId) => LaserToolUiPhase
    /** Current tallies — same numbers as the matter HUD / resources display. */
    getResourceTallies: () => Record<ResourceId, number>
  },
): RefineryRecipesModalApi {
  const rootEl = document.createElement('div')
  rootEl.className = 'refinery-recipes-modal-root'
  rootEl.hidden = true
  rootEl.setAttribute('role', 'dialog')
  rootEl.setAttribute('aria-modal', 'true')
  rootEl.setAttribute('aria-label', 'Refinery recipes')

  const scrim = document.createElement('div')
  scrim.className = 'refinery-recipes-modal-scrim'

  const panel = document.createElement('div')
  panel.className = 'refinery-recipes-modal-panel'

  const title = document.createElement('div')
  title.className = 'refinery-recipes-modal-title'
  title.textContent = 'Refinery recipes'

  const intro = document.createElement('div')
  intro.className = 'refinery-recipes-modal-intro'
  intro.textContent =
    'Active refineries consume one unit of the selected root per tick (when available). Switch roots to steer which refined materials you accumulate.'

  const list = document.createElement('div')
  list.className = 'refinery-recipes-modal-list'
  list.setAttribute('role', 'radiogroup')
  list.setAttribute('aria-label', 'Root resource recipe')

  const buttons = document.createElement('div')
  buttons.className = 'refinery-recipes-modal-buttons'

  const btnClose = document.createElement('button')
  btnClose.type = 'button'
  btnClose.className = 'discovery-modal-btn discovery-modal-btn-ok'
  btnClose.textContent = 'Close'

  buttons.append(btnClose)

  panel.append(title, intro, list, buttons)
  rootEl.append(scrim, panel)
  container.appendChild(rootEl)

  type RowMeta = {
    root: RootResourceId
    phase: LaserToolUiPhase
    nameEl: HTMLSpanElement
    row: HTMLDivElement
    tickersWrap: HTMLDivElement
  }
  let rowMeta: RowMeta[] = []
  let lastPhaseSig = ''

  function applyRowTitles(): void {
    const sel = options.getSelectedRoot()
    for (const r of rowMeta) {
      const isSel = r.root === sel && r.phase === 'unlocked'
      r.row.title = isSel ? shortSelectedRecipeTooltip(r.root) : ''
    }
  }

  function updateAllTickers(): void {
    const tallies = options.getResourceTallies()
    for (const r of rowMeta) {
      fillRecipeTickers(r.tickersWrap, r.root, tallies)
    }
  }

  function buildList(): void {
    list.replaceChildren()
    rowMeta = []
    const selected = options.getSelectedRoot()
    const tallies = options.getResourceTallies()
    for (const rid of ROOT_RESOURCE_IDS) {
      const phase = options.getRecipePhase(rid)
      const row = document.createElement('div')
      row.className = 'refinery-recipes-modal-row'
      if (phase !== 'unlocked') row.classList.add('refinery-recipes-modal-row--locked')

      const radio = document.createElement('input')
      radio.type = 'radio'
      radio.name = 'refinery-recipe-root'
      radio.value = rid
      radio.className = 'refinery-recipes-modal-radio'
      radio.checked = selected === rid && phase === 'unlocked'
      radio.disabled = phase !== 'unlocked'
      const inputId = `refinery-recipe-${rid}`
      radio.id = inputId

      const label = document.createElement('label')
      label.className = 'refinery-recipes-modal-label'
      label.htmlFor = inputId

      const nameEl = document.createElement('span')
      nameEl.className = 'refinery-recipes-modal-name'
      if (phase === 'researching') {
        nameEl.classList.add('refinery-recipes-modal-name--researching')
        const n = Math.max(8, RESOURCE_DEFS[rid].displayName.length)
        nameEl.textContent = randomGibberish(n)
      } else {
        nameEl.textContent = RESOURCE_DEFS[rid].displayName
      }

      const tickersWrap = document.createElement('div')
      tickersWrap.className = 'refinery-recipes-modal-tickers'
      fillRecipeTickers(tickersWrap, rid, tallies)

      if (phase !== 'unlocked') {
        const sub = document.createElement('div')
        sub.className = 'refinery-recipes-modal-sub'
        if (phase === 'researching') {
          sub.textContent = 'Research in progress…'
          sub.classList.add('refinery-recipes-modal-sub--muted')
        } else {
          sub.textContent = 'Locked — requires computronium research'
          sub.classList.add('refinery-recipes-modal-sub--muted')
        }
        label.append(nameEl, sub, tickersWrap)
      } else {
        label.append(nameEl, tickersWrap)
      }

      row.append(radio, label)

      radio.addEventListener('change', () => {
        if (radio.checked && options.getRecipePhase(rid) === 'unlocked') {
          options.onSelectRoot(rid)
          applyRowTitles()
        }
      })

      list.appendChild(row)
      rowMeta.push({ root: rid, phase, nameEl, row, tickersWrap })
    }
    lastPhaseSig = phaseSignature(options.getRecipePhase)
    applyRowTitles()
  }

  let lastGibberishMs = 0

  function refreshGibberishOnly(): void {
    if (rootEl.hidden) return
    const now = performance.now()
    let anyResearching = false
    for (const r of rowMeta) {
      if (r.phase === 'researching') anyResearching = true
    }
    if (!anyResearching) {
      lastGibberishMs = 0
      return
    }
    if (lastGibberishMs === 0 || now - lastGibberishMs >= GIBBERISH_INTERVAL_MS) {
      lastGibberishMs = now
      for (const r of rowMeta) {
        if (r.phase === 'researching') {
          const n = Math.max(8, RESOURCE_DEFS[r.root].displayName.length)
          r.nameEl.textContent = randomGibberish(n)
        }
      }
    }
  }

  function refresh(): void {
    if (rootEl.hidden) return
    const sig = phaseSignature(options.getRecipePhase)
    if (sig !== lastPhaseSig || rowMeta.length === 0) {
      buildList()
    } else {
      updateAllTickers()
    }
    refreshGibberishOnly()
  }

  let escapeHandler: ((e: KeyboardEvent) => void) | null = null

  function close(): void {
    if (escapeHandler) {
      document.removeEventListener('keydown', escapeHandler)
      escapeHandler = null
    }
    rootEl.hidden = true
    lastGibberishMs = 0
  }

  scrim.addEventListener('click', close)
  btnClose.addEventListener('click', close)

  return {
    show(): void {
      buildList()
      rootEl.hidden = false
      lastGibberishMs = 0
      escapeHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          close()
        }
      }
      document.addEventListener('keydown', escapeHandler)
      btnClose.focus()
    },
    hide(): void {
      close()
    },
    isOpen(): boolean {
      return !rootEl.hidden
    },
    refresh,
  }
}
