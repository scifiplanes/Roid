import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyBundledProjectDefaultsToLocalStorage } from './applyBundledDefaultsOnNewDeploy'
import { LAST_APPLIED_DEPLOY_ID_STORAGE_KEY } from './deployId'
import { DEBUG_FILTER_STORAGE_KEY } from './debugPreset'
import balanceSnapshot from './gameBalance.persisted.json' with { type: 'json' }
import { LOCAL_STORAGE_KEY } from './gameBalance'
import musicSnapshot from './asteroidMusicDebug.persisted.json' with { type: 'json' }
import { ASTEROID_MUSIC_LOCAL_STORAGE_KEY } from './asteroidMusicPersist'
import { PICK_THUD_DEBUG_STORAGE_KEY } from './pickThudPersist'
import { SUN_LIGHT_ANGLES_STORAGE_KEY } from './settingsClientPersist'
import settingsClientSnapshot from './settingsClient.persisted.json' with { type: 'json' }

describe('applyBundledProjectDefaultsToLocalStorage', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
      clear: () => {
        store.clear()
      },
      get length() {
        return store.size
      },
      key: (i: number) => [...store.keys()][i] ?? null,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('writes balance, music, settings keys, pick thud, deploy marker from bundled snapshots', () => {
    applyBundledProjectDefaultsToLocalStorage({
      deployId: 'test-deploy-1',
      balanceSnapshot,
      musicSnapshot,
      settingsClientSnapshot,
    })

    expect(store.get(LAST_APPLIED_DEPLOY_ID_STORAGE_KEY)).toBe('test-deploy-1')

    const balRaw = store.get(LOCAL_STORAGE_KEY)
    expect(balRaw).toBeTruthy()
    const bal = JSON.parse(balRaw!) as { durabilityMult?: number }
    expect(typeof bal.durabilityMult).toBe('number')

    const musicRaw = store.get(ASTEROID_MUSIC_LOCAL_STORAGE_KEY)
    expect(musicRaw).toBeTruthy()
    const music = JSON.parse(musicRaw!) as { voices?: unknown[] }
    expect(Array.isArray(music.voices)).toBe(true)

    expect(store.get(SUN_LIGHT_ANGLES_STORAGE_KEY)).toBeTruthy()
    expect(store.get(PICK_THUD_DEBUG_STORAGE_KEY)).toBeTruthy()
  })

  it('overwrites stale balance with bundled snapshot', () => {
    store.set(LOCAL_STORAGE_KEY, JSON.stringify({ durabilityMult: 99, replicatorFeedSpeedMult: 99 }))
    applyBundledProjectDefaultsToLocalStorage({
      deployId: 'test-deploy-2',
      balanceSnapshot,
      musicSnapshot,
      settingsClientSnapshot,
    })
    const bal = JSON.parse(store.get(LOCAL_STORAGE_KEY)!) as { durabilityMult: number }
    expect(bal.durabilityMult).toBe(balanceSnapshot.durabilityMult)
  })

  it('removes debug filter query key', () => {
    store.set(DEBUG_FILTER_STORAGE_KEY, 'old-filter')
    applyBundledProjectDefaultsToLocalStorage({
      deployId: 'test-deploy-3',
      balanceSnapshot,
      musicSnapshot,
      settingsClientSnapshot,
    })
    expect(store.has(DEBUG_FILTER_STORAGE_KEY)).toBe(false)
  })
})
