let sandboxModeEnabled = false

export function getSandboxModeEnabled(): boolean {
  return sandboxModeEnabled
}

export function setSandboxModeEnabled(on: boolean): void {
  sandboxModeEnabled = on
}

export type SandboxModeListener = (enabled: boolean) => void

const listeners = new Set<SandboxModeListener>()

export function subscribeSandboxMode(listener: SandboxModeListener): () => void {
  listeners.add(listener)
  listener(sandboxModeEnabled)
  return () => {
    listeners.delete(listener)
  }
}

export function notifySandboxModeListeners(): void {
  for (const fn of listeners) {
    fn(sandboxModeEnabled)
  }
}

