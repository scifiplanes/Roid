/** Settings → whether new discoveries open the modal immediately vs queue as HUD icons. */
export const DISCOVERY_AUTO_RESOLVE_STORAGE_KEY = 'roid:discoveryAutoResolve'

const DEFAULT_AUTO_RESOLVE = false

export function loadDiscoveryAutoResolve(): boolean {
  try {
    const raw = localStorage.getItem(DISCOVERY_AUTO_RESOLVE_STORAGE_KEY)
    if (raw === null) return DEFAULT_AUTO_RESOLVE
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
    const parsed = JSON.parse(raw) as unknown
    if (parsed === true) return true
    if (parsed === false) return false
  } catch {
    /* ignore */
  }
  return DEFAULT_AUTO_RESOLVE
}

export function saveDiscoveryAutoResolve(value: boolean): void {
  try {
    localStorage.setItem(DISCOVERY_AUTO_RESOLVE_STORAGE_KEY, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}
