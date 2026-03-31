const TIP_LINES: string[] = [
  'Build first few tools to unlock more.',
  'Build Hubs to get resources from Replicators.',
  'Missing resource for Reactor is usually deeper.',
  'Build Clean Up to get rid of Dross (Debris and Fog).',
  'Build Computronium to gradually unlock more tools.',
  'Try the digging laser.',
  'Cheat in debug menu if stuck',
]

export interface GameStartTipsModalApi {
  show: () => void
  hide: () => void
}

/**
 * Full-screen modal; same chrome as discovery modal. OK / scrim dismiss and call onDismiss.
 */
export function createGameStartTipsModal(
  container: HTMLElement,
  options: { onDismiss: () => void },
): GameStartTipsModalApi {
  const root = document.createElement('div')
  root.className = 'discovery-modal-root'
  root.hidden = true
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', 'Tips')

  const scrim = document.createElement('div')
  scrim.className = 'discovery-modal-scrim'

  const panel = document.createElement('div')
  panel.className = 'discovery-modal-panel'

  const title = document.createElement('div')
  title.className = 'discovery-modal-title'
  title.textContent = 'Tips'

  const body = document.createElement('div')
  body.className = 'discovery-modal-body'
  const list = document.createElement('ul')
  list.className = 'discovery-modal-tips-list'
  for (const line of TIP_LINES) {
    const li = document.createElement('li')
    li.textContent = line
    list.appendChild(li)
  }
  body.appendChild(list)

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

  function close(): void {
    root.hidden = true
    options.onDismiss()
  }

  btnOk.addEventListener('click', close)
  scrim.addEventListener('click', close)

  return {
    show(): void {
      root.hidden = false
      btnOk.focus()
    },
    hide(): void {
      root.hidden = true
    },
  }
}
