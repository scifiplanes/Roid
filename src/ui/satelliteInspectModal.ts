export type SatelliteInspectKind =
  | 'orbital'
  | 'excavating'
  | 'scanner'
  | 'drossCollector'
  | 'cargoDrone'

export interface SatelliteInspectShowPayload {
  kind: SatelliteInspectKind
  /** 1-based marker index among visible dots of this type. */
  markerIndex: number
  markerTotal: number
  orbitRadius: number
  countForType: number
  gameplayLine: string
}

export interface SatelliteInspectModalApi {
  show: (payload: SatelliteInspectShowPayload) => void
  hide: () => void
  isOpen: () => boolean
}

const TITLE: Record<SatelliteInspectKind, string> = {
  orbital: 'Mining laser satellite',
  excavating: 'Dig laser satellite',
  scanner: 'Scanner satellite',
  drossCollector: 'Sweeper collector satellite',
  cargoDrone: 'Cargo drone satellite',
}

function kindLabel(kind: SatelliteInspectKind): string {
  return TITLE[kind]
}

/**
 * Inspect readout for an orbit marker + decommission (with confirmation step).
 */
export function createSatelliteInspectModal(
  container: HTMLElement,
  options: { onDecommission: (kind: SatelliteInspectKind) => void },
): SatelliteInspectModalApi {
  const root = document.createElement('div')
  root.className = 'satellite-inspect-modal-root discovery-modal-root'
  root.hidden = true
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', 'Satellite')

  const scrim = document.createElement('div')
  scrim.className = 'discovery-modal-scrim'

  const panelInfo = document.createElement('div')
  panelInfo.className = 'discovery-modal-panel satellite-inspect-modal-panel'

  const titleInfo = document.createElement('div')
  titleInfo.className = 'discovery-modal-title'

  const bodyInfo = document.createElement('div')
  bodyInfo.className = 'discovery-modal-body'

  const buttonsInfo = document.createElement('div')
  buttonsInfo.className = 'discovery-modal-buttons'

  const btnDecom = document.createElement('button')
  btnDecom.type = 'button'
  btnDecom.className = 'discovery-modal-btn discovery-modal-btn-danger'
  btnDecom.textContent = 'Decommission'

  const btnClose = document.createElement('button')
  btnClose.type = 'button'
  btnClose.className = 'discovery-modal-btn discovery-modal-btn-ok'
  btnClose.textContent = 'Close'

  buttonsInfo.append(btnDecom, btnClose)
  panelInfo.append(titleInfo, bodyInfo, buttonsInfo)

  const panelConfirm = document.createElement('div')
  panelConfirm.className = 'discovery-modal-panel satellite-inspect-modal-panel'
  panelConfirm.hidden = true

  const titleConfirm = document.createElement('div')
  titleConfirm.className = 'discovery-modal-title'
  titleConfirm.textContent = 'Confirm decommission'

  const bodyConfirm = document.createElement('div')
  bodyConfirm.className = 'discovery-modal-body'

  const buttonsConfirm = document.createElement('div')
  buttonsConfirm.className = 'discovery-modal-buttons'

  const btnCancel = document.createElement('button')
  btnCancel.type = 'button'
  btnCancel.className = 'discovery-modal-btn discovery-modal-btn-ok'
  btnCancel.textContent = 'Cancel'

  const btnConfirmDecom = document.createElement('button')
  btnConfirmDecom.type = 'button'
  btnConfirmDecom.className = 'discovery-modal-btn discovery-modal-btn-danger'
  btnConfirmDecom.textContent = 'Decommission'

  buttonsConfirm.append(btnCancel, btnConfirmDecom)

  panelConfirm.append(titleConfirm, bodyConfirm, buttonsConfirm)

  const stack = document.createElement('div')
  stack.className = 'satellite-inspect-modal-stack'
  stack.append(panelInfo, panelConfirm)

  root.append(scrim, stack)
  container.appendChild(root)

  let currentKind: SatelliteInspectKind | null = null
  let lastPayload: SatelliteInspectShowPayload | null = null
  let confirmMode = false

  function closeAll(): void {
    currentKind = null
    lastPayload = null
    confirmMode = false
    panelInfo.hidden = false
    panelConfirm.hidden = true
    root.hidden = true
  }

  function showInfo(): void {
    confirmMode = false
    panelInfo.hidden = false
    panelConfirm.hidden = true
  }

  function showConfirm(): void {
    confirmMode = true
    panelInfo.hidden = true
    panelConfirm.hidden = false
    btnConfirmDecom.focus()
  }

  function openScrim(): void {
    if (confirmMode) {
      showInfo()
    } else {
      closeAll()
    }
  }

  scrim.addEventListener('click', openScrim)

  btnClose.addEventListener('click', closeAll)

  btnDecom.addEventListener('click', () => {
    if (!currentKind) return
    const k = currentKind
    const p = document.createElement('p')
    p.className = 'discovery-modal-p'
    p.textContent = `Remove one ${kindLabel(k)}? You have ${getCountForCurrent()} deployed. This cannot be undone.`
    bodyConfirm.replaceChildren(p)
    showConfirm()
  })

  function getCountForCurrent(): number {
    if (!currentKind) return 0
    return lastPayload?.countForType ?? 0
  }

  btnCancel.addEventListener('click', showInfo)

  btnConfirmDecom.addEventListener('click', () => {
    if (!currentKind) return
    const k = currentKind
    options.onDecommission(k)
    closeAll()
  })

  return {
    show(payload: SatelliteInspectShowPayload): void {
      lastPayload = payload
      currentKind = payload.kind
      showInfo()
      titleInfo.textContent = TITLE[payload.kind]
      bodyInfo.replaceChildren()
      const lines = [
        `Deployed (this type): ${payload.countForType}`,
        `Orbit marker: ${payload.markerIndex} of ${payload.markerTotal} (visual)`,
        `Orbit radius: ${payload.orbitRadius.toFixed(2)}`,
        payload.gameplayLine,
        'Decommission removes one satellite of this type from your fleet (not a specific tracked craft).',
      ]
      for (const line of lines) {
        const p = document.createElement('p')
        p.className = 'discovery-modal-p'
        p.textContent = line
        bodyInfo.appendChild(p)
      }
      root.hidden = false
      btnClose.focus()
    },
    hide(): void {
      closeAll()
    },
    isOpen(): boolean {
      return !root.hidden
    },
  }
}
