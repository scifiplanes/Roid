import type { DiscoveryOffer } from '../game/discoveryGen'

const LORE_STORAGE_KEY = 'roid:discoveriesLog'
const MAX_LORE_ENTRIES = 80

export interface DiscoveryModalApi {
  show: (offer: DiscoveryOffer) => void
  hide: () => void
  isOpen: () => boolean
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
 * Full-screen modal (Norton Commander style); single OK dismisses and applies the offer.
 */
export function createDiscoveryModal(container: HTMLElement, options: {
  onOk: (offer: DiscoveryOffer) => void
}): DiscoveryModalApi {
  const root = document.createElement('div')
  root.className = 'discovery-modal-root'
  root.hidden = true
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', 'Discovery')

  const scrim = document.createElement('div')
  scrim.className = 'discovery-modal-scrim'

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
  root.append(scrim, panel)
  container.appendChild(root)

  let current: DiscoveryOffer | null = null

  function close(): void {
    current = null
    root.hidden = true
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
      root.hidden = false
      btnOk.focus()
    },
    hide(): void {
      close()
    },
    isOpen(): boolean {
      return !root.hidden
    },
  }
}
