import { schedulePersistSettingsClient } from '../game/settingsClientPersist'

export interface PauseButtonOptions {
  initialPaused?: boolean
  onTogglePause: (paused: boolean) => void
}

export interface PauseButtonApi {
  element: HTMLElement
  setPaused: (paused: boolean) => void
}

export function createPauseButton(_container: HTMLElement, options: PauseButtonOptions): PauseButtonApi {
  const root = document.createElement('div')
  root.className = 'pause-menu'

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'pause-toggle'

  let paused = Boolean(options.initialPaused)

  function syncUi(): void {
    btn.setAttribute('aria-pressed', String(paused))
    btn.title = paused ? 'Resume simulation' : 'Pause simulation'
    btn.setAttribute('aria-label', paused ? 'Resume simulation' : 'Pause simulation')
    btn.innerHTML = paused
      ? '<span class=\"pause-icon resume-icon\" aria-hidden=\"true\">▶</span>'
      : '<span class=\"pause-icon\" aria-hidden=\"true\">⏸</span>'
  }

  function setPaused(next: boolean): void {
    if (paused === next) return
    paused = next
    syncUi()
    options.onTogglePause(paused)
    schedulePersistSettingsClient()
  }

  btn.addEventListener('click', () => {
    setPaused(!paused)
  })

  root.appendChild(btn)
  syncUi()

  return { element: root, setPaused }
}

