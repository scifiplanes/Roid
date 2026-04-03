import { DEBUG_FILTER_STORAGE_KEY } from './debugPreset'
import {
  getDeployId,
  LAST_APPLIED_DEPLOY_ID_STORAGE_KEY,
} from './deployId'
import {
  buildAsteroidMusicDebugFromBundledSnapshot,
  writeAsteroidMusicDebugToLocalStorage,
} from './asteroidMusicPersist'
import { buildGameBalanceFromBundledSnapshot, LOCAL_STORAGE_KEY } from './gameBalance'
import { createDefaultPickThudDebug } from './pickThudDebug'
import { PICK_THUD_DEBUG_STORAGE_KEY } from './pickThudPersist'
import { writeSettingsClientBundleToLocalStorage } from './settingsClientPersist'

/**
 * Writes bundled snapshots into `localStorage` and records `deployId`.
 * Used when the production build’s deploy fingerprint changes.
 */
export function applyBundledProjectDefaultsToLocalStorage(args: {
  deployId: string
  balanceSnapshot: unknown
  musicSnapshot: unknown
  settingsClientSnapshot: unknown
}): void {
  const { deployId, balanceSnapshot, musicSnapshot, settingsClientSnapshot } = args
  try {
    const balance = buildGameBalanceFromBundledSnapshot(balanceSnapshot)
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(balance))
    const music = buildAsteroidMusicDebugFromBundledSnapshot(musicSnapshot)
    writeAsteroidMusicDebugToLocalStorage(music)
    writeSettingsClientBundleToLocalStorage(settingsClientSnapshot, 'overwrite')
    localStorage.setItem(PICK_THUD_DEBUG_STORAGE_KEY, JSON.stringify(createDefaultPickThudDebug()))
    localStorage.removeItem(DEBUG_FILTER_STORAGE_KEY)
    localStorage.setItem(LAST_APPLIED_DEPLOY_ID_STORAGE_KEY, deployId)
  } catch {
    /* quota / private mode */
  }
}

/** If not dev and deploy id changed, reset debug/project default keys from bundled JSON. */
export function maybeApplyBundledProjectDefaultsOnProductionStartup(
  balanceSnapshot: unknown,
  musicSnapshot: unknown,
  settingsClientSnapshot: unknown,
): void {
  if (import.meta.env.DEV) return
  const deployId = getDeployId()
  if (deployId === '') return
  try {
    if (localStorage.getItem(LAST_APPLIED_DEPLOY_ID_STORAGE_KEY) === deployId) return
    applyBundledProjectDefaultsToLocalStorage({
      deployId,
      balanceSnapshot,
      musicSnapshot,
      settingsClientSnapshot,
    })
  } catch {
    /* ignore */
  }
}
