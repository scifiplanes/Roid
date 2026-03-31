import type { DiscoveryOffer } from '../game/discoveryGen'
import type { VoxelPos } from '../scene/asteroid/generateAsteroidVoxels'
import type { VoxelScreenProjectResult } from '../scene/voxelScreenProjection'
import { segmentFirstBorderHitTowardRect } from '../scene/voxelScreenProjection'

const LORE_STORAGE_KEY = 'roid:discoveriesLog'
const MAX_LORE_ENTRIES = 80

export interface DiscoveryModalApi {
  show: (offer: DiscoveryOffer) => void
  hide: () => void
  isOpen: () => boolean
  syncAnchor: () => void
}

function appendLoreToStorage(line: string): void {
  try {
    const raw = localStorage.getItem(LORE_STORAGE_KEY)
    const prev: string[] = raw ? (JSON.parse(raw) as string[]) : []
    const next = [line, ...prev].slice(0, MAX_LORE_ENTRIES)
    localStorage.setItem(LORE_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

/**
 * Anchored modal: panel near the discovery voxel, connector line from voxel to panel edge.
 */
export function createDiscoveryModal(
  container: HTMLElement,
  options: {
    onOk: (offer: DiscoveryOffer) => void
    projectFoundAt: (pos: VoxelPos) => VoxelScreenProjectResult
  },
): DiscoveryModalApi {
  const root = document.createElement('div')
  root.className = 'discovery-modal-root discovery-modal-root--anchored'
  root.hidden = true
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', 'Discovery')

  const scrim = document.createElement('div')
  scrim.className = 'discovery-modal-scrim'

  const connectorSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  connectorSvg.classList.add('discovery-modal-connector-svg')
  connectorSvg.setAttribute('aria-hidden', 'true')

  const connectorLine = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  connectorLine.classList.add('discovery-modal-connector-line')
  connectorSvg.appendChild(connectorLine)

  const panel = document.createElement('div')
  panel.className = 'discovery-modal-panel'

  const title = document.createElement('div')
  title.className = 'discovery-modal-title'

  const body = document.createElement('div')
  body.className = 'discovery-modal-body'

  const buttons = document.createElement('div')
  buttons.className = 'discovery-modal-buttons'

  const btnOk = document.createElement('button')
  btnOk.type = 'button'
  btnOk.className = 'discovery-modal-btn discovery-modal-btn-ok'
  btnOk.textContent = 'OK'

  buttons.append(btnOk)

  panel.append(title, body, buttons)
  root.append(scrim, connectorSvg, panel)
  container.appendChild(root)

  let current: DiscoveryOffer | null = null

  function close(): void {
    current = null
    root.hidden = true
    connectorLine.setAttribute('opacity', '0')
  }

  function confirmOk(): void {
    if (!current) return
    const o = current
    if (o.loreLogLine) appendLoreToStorage(o.loreLogLine)
    options.onOk(o)
    close()
  }

  btnOk.addEventListener('click', confirmOk)

  scrim.addEventListener('click', confirmOk)

  function syncAnchor(): void {
    if (!current) return
    const { clientX: vx, clientY: vy, onScreen } = options.projectFoundAt(current.foundAt)

    const w = window.innerWidth
    const h = window.innerHeight
    connectorSvg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    connectorSvg.setAttribute('width', String(w))
    connectorSvg.setAttribute('height', String(h))

    panel.style.position = 'fixed'
    panel.style.margin = '0'
    const pw = Math.max(panel.offsetWidth, 280)
    const ph = Math.max(panel.offsetHeight, 100)

    let left: number
    let top: number
    if (onScreen) {
      left = vx + 28
      top = vy - ph / 2
      const margin = 12
      left = Math.min(Math.max(margin, left), w - pw - margin)
      top = Math.min(Math.max(margin, top), h - ph - margin)
    } else {
      left = w - pw - 16
      top = 80
    }

    panel.style.left = `${left}px`
    panel.style.top = `${top}px`

    if (onScreen) {
      const pr = panel.getBoundingClientRect()
      const cx = pr.left + pr.width / 2
      const cy = pr.top + pr.height / 2
      const end = segmentFirstBorderHitTowardRect(vx, vy, cx, cy, pr)
      connectorLine.setAttribute('x1', String(vx))
      connectorLine.setAttribute('y1', String(vy))
      connectorLine.setAttribute('x2', String(end.x))
      connectorLine.setAttribute('y2', String(end.y))
      connectorLine.setAttribute('opacity', '1')
    } else {
      connectorLine.setAttribute('opacity', '0')
    }
  }

  return {
    show(offer: DiscoveryOffer): void {
      current = offer
      title.textContent = offer.titleLine
      body.replaceChildren()
      if (offer.asciiArtLines.length > 0) {
        const pre = document.createElement('pre')
        pre.className = 'discovery-modal-ascii'
        pre.textContent = offer.asciiArtLines.join('\n')
        body.appendChild(pre)
      }
      for (const line of offer.bodyLines) {
        const p = document.createElement('p')
        p.className = 'discovery-modal-p'
        p.textContent = line
        body.appendChild(p)
      }
      if (offer.resourceSummaryLine) {
        const p = document.createElement('p')
        p.className = 'discovery-modal-p discovery-modal-p--resources'
        p.textContent = `Resources: ${offer.resourceSummaryLine}`
        body.appendChild(p)
      }
      root.hidden = false
      requestAnimationFrame(() => {
        syncAnchor()
        btnOk.focus()
      })
    },
    hide(): void {
      close()
    },
    isOpen(): boolean {
      return !root.hidden
    },
    syncAnchor,
  }
}
