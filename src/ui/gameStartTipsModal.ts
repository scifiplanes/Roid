/** Plain string, or full sentence with `highlight` substring wrapped for emphasis. */
const TIP_LINES: Array<string | { text: string; highlight: string }> = [
  'Use Hoover to collect debris.',
  'Build first few tools to unlock more.',
  'Build Hubs to get resources from Replicators.',
  'Missing resource for Reactor is usually deeper.',
  'Build Computronium to gradually unlock more tools.',
  'Try the digging laser.',
  'Mining laser creates Processed Matter. There are multiple ways to collect Processed Matter.',
  'Cheat in debug menu if stuck',
  'You can regenerate the asteroid in the menu.',
  { text: 'There is a sandbox option in the menu', highlight: 'sandbox' },
]

function appendTipListItem(list: HTMLUListElement, entry: string | { text: string; highlight: string }): void {
  const li = document.createElement('li')
  if (typeof entry === 'string') {
    li.textContent = entry
  } else {
    const { text, highlight } = entry
    const i = text.indexOf(highlight)
    if (i < 0) {
      li.textContent = text
    } else {
      const em = document.createElement('span')
      em.className = 'discovery-modal-tips-em'
      em.textContent = highlight
      li.append(document.createTextNode(text.slice(0, i)), em, document.createTextNode(text.slice(i + highlight.length)))
    }
  }
  list.appendChild(li)
}

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
    appendTipListItem(list, line)
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
