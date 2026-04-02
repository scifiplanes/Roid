import type { ResourceId } from './resources'
import { RESOURCE_IDS_ORDERED } from './resources'
import type { SeedId } from './seedDefs'
import { SEED_DEFS } from './seedDefs'

export type SeedSlotKind = 'recipe' | 'pause' | 'die'

export interface SeedRecipeSlot {
  kind: SeedSlotKind
  /** Recipe resource id for `recipe` slots; ignored for `pause`/`die`. */
  resourceId?: ResourceId
  /** Duration in seconds this slot should run before advancing. */
  durationSec: number
}

export interface SeedSelection {
  seedTypeId: SeedId
  /**
   * Total chosen lifetime for this Seed stack instance (seconds of active operation),
   * derived from the sum of `slots[].durationSec` and clamped per seed type.
   */
  lifetimeSec: number
  /** Ordered program for this Seed instance. */
  slots: SeedRecipeSlot[]
  /**
   * Back-compat shim mirroring all `recipe` kind slots in order.
   * Kept so older code and saves that expect a flat recipe stack still work.
   */
  recipeStack: ResourceId[]
  /**
   * Optional strain identity for replicators placed with this selection.
   * When derived from a preset, this should match the preset id so all
   * voxels from that preset share a strain.
   */
  strainId?: string
}

export interface SeedPreset {
  id: string
  name: string
  selection: SeedSelection
  /** When true, this preset is built-in and may be treated specially in UI. */
  builtin?: boolean
  /** Optional tag for grouping/system presets (e.g. 'relic'). */
  tag?: string
}

interface SeedInventoryState {
  presets: SeedPreset[]
  /** Currently selected preset id in the UI, or null when using an ad-hoc configuration. */
  selectedPresetId: string | null
  /** Last active seed configuration used for planting. */
  activeSelection: SeedSelection
}

interface SeedInventoryPersistedV1 {
  version: 1
  presets: SeedPreset[]
  selectedPresetId: string | null
  activeSelection: SeedSelection
}

type SeedInventoryPersisted = SeedInventoryPersistedV1

const STORAGE_KEY = 'roid:seedInventory'

let state: SeedInventoryState = loadInitialState()

function loadInitialState(): SeedInventoryState {
  const fallbackSelection: SeedSelection =
    sanitizeState({
      presets: [],
      selectedPresetId: null,
      activeSelection: {
        seedTypeId: 'basicSeed',
        lifetimeSec: SEED_DEFS['basicSeed'].lifetimeSec,
        slots: [],
        recipeStack: [],
      },
    })!.activeSelection

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        presets: [],
        selectedPresetId: null,
        activeSelection: fallbackSelection,
      }
    }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return {
        presets: [],
        selectedPresetId: null,
        activeSelection: fallbackSelection,
      }
    }
    const p = parsed as Partial<SeedInventoryPersisted>
    if (p.version !== 1 || !Array.isArray(p.presets) || !p.activeSelection) {
      return {
        presets: [],
        selectedPresetId: null,
        activeSelection: fallbackSelection,
      }
    }
    const sanitized = sanitizeState({
      presets: p.presets,
      selectedPresetId: p.selectedPresetId ?? null,
      activeSelection: p.activeSelection,
    })
    if (!sanitized) {
      return {
        presets: [],
        selectedPresetId: null,
        activeSelection: fallbackSelection,
      }
    }
    return sanitized
  } catch {
    return {
      presets: [],
      selectedPresetId: null,
      activeSelection: fallbackSelection,
    }
  }
}

function sanitizeState(
  input: Pick<SeedInventoryPersisted, 'presets' | 'selectedPresetId' | 'activeSelection'>,
): SeedInventoryState | null {
  const validSeedIds = new Set<SeedId>(Object.keys(SEED_DEFS) as SeedId[])
  const validResourceIds = new Set<ResourceId>(RESOURCE_IDS_ORDERED)

  const relicPresets: SeedPreset[] = [
    {
      id: 'relic:locuspore',
      name: 'Locuspore',
      tag: 'relic',
      builtin: true,
      selection: {
        seedTypeId: 'burstSeed',
        // Fast, relatively short-lived strain.
        lifetimeSec: 60,
        slots: [
          { kind: 'recipe', resourceId: 'regolithMass', durationSec: 20 },
          { kind: 'recipe', resourceId: 'silicates', durationSec: 20 },
          { kind: 'recipe', resourceId: 'metals', durationSec: 20 },
        ],
        recipeStack: ['regolithMass', 'silicates', 'metals'],
        strainId: 'Locuspore',
      },
    },
    {
      id: 'relic:oxweed',
      name: 'Oxweed',
      tag: 'relic',
      builtin: true,
      selection: {
        seedTypeId: 'longlifeSeed',
        // Slow, long-running and efficient strain.
        lifetimeSec: 420,
        slots: [
          { kind: 'recipe', resourceId: 'regolithMass', durationSec: 120 },
          { kind: 'recipe', resourceId: 'silicates', durationSec: 120 },
          { kind: 'recipe', resourceId: 'metals', durationSec: 180 },
        ],
        recipeStack: ['regolithMass', 'silicates', 'metals'],
        strainId: 'Oxweed',
      },
    },
    {
      id: 'relic:reaperseed',
      name: 'Reaperseed',
      tag: 'relic',
      builtin: true,
      selection: {
        seedTypeId: 'efficientSeed',
        // Fast and efficient strain with a shorter but intense run.
        lifetimeSec: 180,
        slots: [
          { kind: 'recipe', resourceId: 'regolithMass', durationSec: 45 },
          { kind: 'recipe', resourceId: 'silicates', durationSec: 45 },
          { kind: 'recipe', resourceId: 'metals', durationSec: 90 },
        ],
        recipeStack: ['regolithMass', 'silicates', 'metals'],
        strainId: 'Reaperseed',
      },
    },
  ]

  function sanitizeSelection(sel: SeedSelection): SeedSelection | null {
    if (!validSeedIds.has(sel.seedTypeId)) return null
    const def = SEED_DEFS[sel.seedTypeId]
    const maxStacks = def.maxRecipeStacks

    const legacyTotalLifetime =
      typeof sel.lifetimeSec === 'number' && Number.isFinite(sel.lifetimeSec) && sel.lifetimeSec > 0
        ? sel.lifetimeSec
        : def.lifetimeSec

    // Derive slots from legacy recipeStack when slots are missing.
    const rawSlots: SeedRecipeSlot[] =
      Array.isArray((sel as any).slots) && (sel as any).slots.length > 0
        ? (sel as any).slots
        : ((sel.recipeStack ?? []) as ResourceId[]).map((id, _idx, arr) => {
            const perSlot = legacyTotalLifetime / Math.max(1, arr.length)
            return {
              kind: 'recipe' as const,
              resourceId: id,
              durationSec: perSlot,
            }
          })

    const nextSlots: SeedRecipeSlot[] = []
    const nextRecipeStack: ResourceId[] = []

    for (const raw of rawSlots) {
      if (!raw || typeof raw !== 'object') continue
      const kind: SeedSlotKind = raw.kind === 'pause' || raw.kind === 'die' ? raw.kind : 'recipe'
      let resourceId: ResourceId | undefined
      if (kind === 'recipe') {
        const candidate = raw.resourceId as ResourceId | undefined
        if (candidate && validResourceIds.has(candidate)) {
          resourceId = candidate
        }
      }
      // Fallback resource for recipe slots if missing/invalid.
      if (kind === 'recipe' && !resourceId) {
        const fallback = def.defaultRecipeStack[nextSlots.length]
        if (fallback && validResourceIds.has(fallback)) {
          resourceId = fallback
        } else if (RESOURCE_IDS_ORDERED[0]) {
          resourceId = RESOURCE_IDS_ORDERED[0]!
        } else {
          continue
        }
      }

      const rawDuration =
        typeof raw.durationSec === 'number' && Number.isFinite(raw.durationSec)
          ? raw.durationSec
          : def.lifetimeSec / Math.max(1, def.maxRecipeStacks)
      const durationSec = Math.max(0.1, rawDuration)

      if (nextSlots.length >= maxStacks) break

      const slot: SeedRecipeSlot =
        kind === 'recipe'
          ? { kind, resourceId: resourceId!, durationSec }
          : { kind, durationSec }

      nextSlots.push(slot)
      if (kind === 'recipe' && resourceId) {
        nextRecipeStack.push(resourceId)
      }
    }

    // Ensure at least one valid slot.
    if (nextSlots.length === 0) {
      const fallback = def.defaultRecipeStack[0]
      const resourceId =
        (fallback && validResourceIds.has(fallback) && fallback) || RESOURCE_IDS_ORDERED[0]
      if (!resourceId) return null
      nextSlots.push({
        kind: 'recipe',
        resourceId,
        durationSec: def.lifetimeSec,
      })
      nextRecipeStack.push(resourceId)
    }

    const totalLifetimeRaw = nextSlots.reduce((sum, s) => sum + Math.max(0, s.durationSec), 0)
    const totalLifetime =
      totalLifetimeRaw > 0 ? totalLifetimeRaw : def.lifetimeSec || def.minLifetimeSec
    const clampedLifetime = Math.min(def.maxLifetimeSec, Math.max(def.minLifetimeSec, totalLifetime))

    return {
      seedTypeId: def.id,
      lifetimeSec: clampedLifetime,
      slots: nextSlots,
      recipeStack: nextRecipeStack.slice(0, maxStacks),
      strainId: sel.strainId,
    }
  }

  const presets: SeedPreset[] = []
  const seenIds = new Set<string>()
  for (const raw of input.presets) {
    if (!raw || typeof raw !== 'object') continue
    const id = (raw as SeedPreset).id
    const name = (raw as SeedPreset).name
    const sel = (raw as SeedPreset).selection
    if (typeof id !== 'string' || !id) continue
    if (typeof name !== 'string' || !name.trim()) continue
    if (!sel || typeof sel !== 'object') continue
    if (seenIds.has(id)) continue
    const sanitizedSel = sanitizeSelection(sel)
    if (!sanitizedSel) continue
    const existingBuiltin = (raw as SeedPreset).builtin === true
    const tag = (raw as SeedPreset).tag
    presets.push({
      id,
      name: name.trim().slice(0, 80),
      selection: sanitizedSel,
      builtin: existingBuiltin,
      tag,
    })
    seenIds.add(id)
  }

  // Ensure built-in Relic presets are present exactly once.
  for (const relic of relicPresets) {
    if (seenIds.has(relic.id)) continue
    const sanitizedRelicSel = sanitizeSelection(relic.selection)
    if (!sanitizedRelicSel) continue
    presets.push({
      id: relic.id,
      name: relic.name,
      selection: sanitizedRelicSel,
      builtin: true,
      tag: relic.tag,
    })
    seenIds.add(relic.id)
  }

  const activeSelectionSanitized =
    sanitizeSelection(input.activeSelection) ??
    sanitizeSelection({
      seedTypeId: 'basicSeed',
      lifetimeSec: SEED_DEFS['basicSeed'].lifetimeSec,
      slots: [],
      recipeStack: [],
    })

  if (!activeSelectionSanitized) return null

  const selectedPresetId =
    input.selectedPresetId && presets.some((p) => p.id === input.selectedPresetId)
      ? input.selectedPresetId
      : null

  return {
    presets,
    selectedPresetId,
    activeSelection: activeSelectionSanitized,
  }
}

function persist(): void {
  const payload: SeedInventoryPersisted = {
    version: 1,
    presets: state.presets,
    selectedPresetId: state.selectedPresetId,
    activeSelection: state.activeSelection,
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function getSeedPresets(): SeedPreset[] {
  return state.presets.slice()
}

export function getSeedPresetById(id: string): SeedPreset | undefined {
  return state.presets.find((p) => p.id === id)
}

export function getSelectedSeedPresetId(): string | null {
  return state.selectedPresetId
}

export function setSelectedSeedPresetId(id: string | null): void {
  state.selectedPresetId = id
  persist()
}

export function getActiveSeedSelection(): SeedSelection {
  return {
    seedTypeId: state.activeSelection.seedTypeId,
    lifetimeSec: state.activeSelection.lifetimeSec,
    slots: state.activeSelection.slots.map((s) => ({ ...s })),
    recipeStack: state.activeSelection.recipeStack.slice(),
    strainId: state.activeSelection.strainId,
  }
}

export function setActiveSeedSelection(sel: SeedSelection): void {
  const sanitized = sanitizeState({
    presets: state.presets,
    selectedPresetId: state.selectedPresetId,
    activeSelection: sel,
  })
  if (!sanitized) return
  state = sanitized
  persist()
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function upsertSeedPreset(
  id: string | null,
  name: string,
  selection: SeedSelection,
): string {
  const trimmed = name.trim()
  const label = trimmed || 'Seed preset'
  const existingIdx = id ? state.presets.findIndex((p) => p.id === id) : -1
  const sel: SeedSelection = {
    seedTypeId: selection.seedTypeId,
    lifetimeSec: selection.lifetimeSec,
    slots: selection.slots.map((s) => ({ ...s })),
    recipeStack: selection.recipeStack.slice(),
  }
  const sanitizedSel =
    sanitizeState({
      presets: state.presets,
      selectedPresetId: state.selectedPresetId,
      activeSelection: sel,
    })?.activeSelection ?? sel

  if (existingIdx >= 0) {
    state.presets[existingIdx] = {
      id: state.presets[existingIdx]!.id,
      name: label.slice(0, 80),
      selection: sanitizedSel,
    }
    persist()
    return state.presets[existingIdx]!.id
  }

  const newId = randomId()
  state.presets.push({
    id: newId,
    name: label.slice(0, 80),
    selection: sanitizedSel,
  })
  persist()
  return newId
}

export function deleteSeedPreset(id: string): void {
  // Guard against deleting built-in relic/system presets.
  if (id.startsWith('relic:')) {
    return
  }
  const next = state.presets.filter((p) => p.id !== id)
  if (next.length === state.presets.length) return
  state.presets = next
  if (state.selectedPresetId === id) {
    state.selectedPresetId = null
  }
  persist()
}

