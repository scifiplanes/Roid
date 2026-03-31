import type { SeedDef, SeedId } from '../game/seedDefs'
import { SEED_DEFS, getSeedDef } from '../game/seedDefs'
import { RESOURCE_DEFS, type ResourceId } from '../game/resources'
import {
  getAvailableSeedRecipesForSeed,
  type SeedRecipeAvailabilityState,
} from '../game/seedRecipes'
import type { SeedRecipeSlot, SeedSlotKind } from '../game/seedInventory'
import { getSeedColor } from '../game/seedColors'

export interface SeedAssemblySelection {
  seedTypeId: SeedId
  /** Total lifetime derived from the sum of `slots[].durationSec`, clamped per seed type. */
  lifetimeSec: number
  slots: SeedRecipeSlot[]
  /** Back-compat mirror of recipe slots. */
  recipeStack: ResourceId[]
}

export interface SeedPresetListItem {
  id: string
  name: string
  selection: SeedAssemblySelection
}

export interface SeedAssemblyModalApi {
  show: () => void
  hide: () => void
  isOpen: () => boolean
  getCurrentSelection: () => SeedAssemblySelection
}

export function createSeedAssemblyModal(
  container: HTMLElement,
  options: {
    getUnlockedSeedIds: () => SeedId[]
    getInitialSelection: () => SeedAssemblySelection
    onConfirm: (sel: SeedAssemblySelection) => void
    /** Current computronium unlock state for gating Seed recipes. */
    getSeedRecipeAvailabilityState: () => SeedRecipeAvailabilityState
    /** Optional seed preset inventory to show alongside the editor. */
    getPresets?: () => SeedPresetListItem[]
    getSelectedPresetId?: () => string | null
    onSelectPreset?: (id: string | null) => void
    onDeletePreset?: (id: string) => void
    onSavePreset?: (args: {
      id: string | null
      name: string
      selection: SeedAssemblySelection
    }) => void
  },
): SeedAssemblyModalApi {
  const root = document.createElement('div')
  root.className = 'discovery-modal-root seed-assembly-modal-root'
  root.hidden = true
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', 'Seed assembly')

  const scrim = document.createElement('div')
  scrim.className = 'discovery-modal-scrim'

  const panel = document.createElement('div')
  panel.className = 'discovery-modal-panel seed-assembly-modal-panel'

  const title = document.createElement('div')
  title.className = 'discovery-modal-title'
  title.textContent = 'Seed assembly'

  const body = document.createElement('div')
  body.className = 'discovery-modal-body seed-assembly-modal-body'

  const presetsCol = document.createElement('div')
  presetsCol.className = 'seed-assembly-presets'

  const presetsHeader = document.createElement('div')
  presetsHeader.className = 'seed-assembly-presets-header'

  const presetsTitle = document.createElement('span')
  presetsTitle.className = 'seed-assembly-presets-title'
  presetsTitle.textContent = 'Seed presets'

  const btnNewPreset = document.createElement('button')
  btnNewPreset.type = 'button'
  btnNewPreset.className = 'seed-assembly-presets-new-btn'
  btnNewPreset.textContent = 'New'

  presetsHeader.append(presetsTitle, btnNewPreset)

  const presetsList = document.createElement('div')
  presetsList.className = 'seed-assembly-presets-list'
  presetsList.setAttribute('role', 'group')
  presetsList.setAttribute('aria-label', 'Saved seeds')

  const presetsForm = document.createElement('div')
  presetsForm.className = 'seed-assembly-presets-form'

  const nameLabel = document.createElement('label')
  nameLabel.className = 'seed-assembly-presets-name-label'
  nameLabel.textContent = 'Name'
  const nameInput = document.createElement('input')
  nameInput.type = 'text'
  nameInput.className = 'seed-assembly-presets-name-input'
  nameInput.maxLength = 80
  nameLabel.appendChild(nameInput)

  const presetsButtonsRow = document.createElement('div')
  presetsButtonsRow.className = 'seed-assembly-presets-buttons'

  const btnSavePreset = document.createElement('button')
  btnSavePreset.type = 'button'
  btnSavePreset.className = 'discovery-modal-btn discovery-modal-btn-ok seed-assembly-presets-save-btn'
  btnSavePreset.textContent = 'Save'

  const btnDeletePreset = document.createElement('button')
  btnDeletePreset.type = 'button'
  btnDeletePreset.className = 'discovery-modal-btn discovery-modal-btn-danger seed-assembly-presets-delete-btn'
  btnDeletePreset.textContent = 'Delete'

  presetsButtonsRow.append(btnSavePreset, btnDeletePreset)
  presetsForm.append(nameLabel, presetsButtonsRow)

  presetsCol.append(presetsHeader, presetsList, presetsForm)

  const seedsList = document.createElement('div')
  seedsList.className = 'seed-assembly-seed-list'
  seedsList.setAttribute('role', 'group')
  seedsList.setAttribute('aria-label', 'Seed type')

  const detail = document.createElement('div')
  detail.className = 'seed-assembly-detail'

  const meta = document.createElement('div')
  meta.className = 'seed-assembly-meta'

  const lifetimeRow = document.createElement('div')
  lifetimeRow.className = 'seed-assembly-meta-row'
  const lifetimeLabel = document.createElement('span')
  lifetimeLabel.className = 'seed-assembly-meta-label'
  lifetimeLabel.textContent = 'Lifetime'
  const lifetimeValue = document.createElement('span')
  lifetimeValue.className = 'seed-assembly-meta-value'
  lifetimeRow.append(lifetimeLabel, lifetimeValue)

  const stacksRow = document.createElement('div')
  stacksRow.className = 'seed-assembly-meta-row'
  const stacksLabel = document.createElement('span')
  stacksLabel.className = 'seed-assembly-meta-label'
  stacksLabel.textContent = 'Recipe stack slots'
  const stacksValue = document.createElement('span')
  stacksValue.className = 'seed-assembly-meta-value'
  stacksRow.append(stacksLabel, stacksValue)

  const editorPresetControls = document.createElement('div')
  editorPresetControls.className = 'seed-assembly-meta-row seed-assembly-meta-row--preset-controls'

  const editorPresetNameLabel = document.createElement('label')
  editorPresetNameLabel.className = 'seed-assembly-meta-label seed-assembly-meta-label--preset-name'
  editorPresetNameLabel.textContent = 'Preset name'

  const editorPresetNameInput = document.createElement('input')
  editorPresetNameInput.type = 'text'
  editorPresetNameInput.className = 'seed-assembly-meta-input seed-assembly-meta-input--preset-name'
  editorPresetNameInput.maxLength = 80
  editorPresetNameLabel.appendChild(editorPresetNameInput)

  const editorPresetButtons = document.createElement('div')
  editorPresetButtons.className = 'seed-assembly-meta-preset-buttons'

  const btnSavePresetInline = document.createElement('button')
  btnSavePresetInline.type = 'button'
  btnSavePresetInline.className =
    'discovery-modal-btn discovery-modal-btn-ok seed-assembly-presets-save-btn seed-assembly-presets-save-btn-inline'
  btnSavePresetInline.textContent = 'Save preset'

  const btnDeletePresetInline = document.createElement('button')
  btnDeletePresetInline.type = 'button'
  btnDeletePresetInline.className =
    'discovery-modal-btn discovery-modal-btn-danger seed-assembly-presets-delete-btn seed-assembly-presets-delete-btn-inline'
  btnDeletePresetInline.textContent = 'Delete preset'
  btnDeletePresetInline.disabled = true

  editorPresetButtons.append(btnSavePresetInline, btnDeletePresetInline)
  editorPresetControls.append(editorPresetNameLabel, editorPresetButtons)

  meta.append(lifetimeRow, stacksRow, editorPresetControls)

  const stacksConfig = document.createElement('div')
  stacksConfig.className = 'seed-assembly-stacks'

  detail.append(meta, stacksConfig)
  body.append(presetsCol, seedsList, detail)

  // Inline delete confirmation modal (within the Seed Assembly root).
  const delRoot = document.createElement('div')
  delRoot.className = 'discovery-modal-root seed-assembly-delete-modal'
  delRoot.hidden = true
  delRoot.setAttribute('role', 'presentation')

  const delScrim = document.createElement('div')
  delScrim.className = 'discovery-modal-scrim'

  const delPanel = document.createElement('div')
  delPanel.className = 'discovery-modal-panel'
  delPanel.setAttribute('role', 'dialog')
  delPanel.setAttribute('aria-modal', 'true')
  delPanel.setAttribute('aria-labelledby', 'seed-assembly-delete-modal-title')

  const delTitle = document.createElement('div')
  delTitle.id = 'seed-assembly-delete-modal-title'
  delTitle.className = 'discovery-modal-title'
  delTitle.textContent = 'Delete Seed preset'

  const delBody = document.createElement('div')
  delBody.className = 'discovery-modal-body'
  const delP = document.createElement('p')
  delP.className = 'discovery-modal-p'
  delP.textContent =
    'Delete this Seed preset? This cannot be undone and will remove it from your inventory.'
  delBody.append(delP)

  const delButtons = document.createElement('div')
  delButtons.className = 'discovery-modal-buttons'
  const delCancel = document.createElement('button')
  delCancel.type = 'button'
  delCancel.className = 'discovery-modal-btn discovery-modal-btn-ok'
  delCancel.textContent = 'Cancel'
  const delConfirm = document.createElement('button')
  delConfirm.type = 'button'
  delConfirm.className = 'discovery-modal-btn discovery-modal-btn-danger'
  delConfirm.textContent = 'Delete preset'
  delButtons.append(delCancel, delConfirm)

  delPanel.append(delTitle, delBody, delButtons)
  delRoot.append(delScrim, delPanel)
  root.appendChild(delRoot)

  const buttons = document.createElement('div')
  buttons.className = 'discovery-modal-buttons'

  const btnCancel = document.createElement('button')
  btnCancel.type = 'button'
  btnCancel.className = 'discovery-modal-btn discovery-modal-btn-ok'
  btnCancel.textContent = 'Cancel'

  const btnOk = document.createElement('button')
  btnOk.type = 'button'
  btnOk.className = 'discovery-modal-btn discovery-modal-btn-ok'
  btnOk.textContent = 'Confirm'

  buttons.append(btnCancel, btnOk)
  panel.append(title, body, buttons)
  root.append(scrim, panel)
  container.appendChild(root)

  let current: SeedAssemblySelection = options.getInitialSelection()
  let selectedSeedDef: SeedDef = getSeedDef(current.seedTypeId)
  let currentPresetId: string | null = options.getSelectedPresetId?.() ?? null
  /** When false (and presets exist), the right-hand editor is hidden/disabled until a preset is picked or New is clicked. */
  let editorActive = false

  function iconForSeed(id: SeedId): string {
    if (id === 'efficientSeed') return '⧉'
    if (id === 'longlifeSeed') return '∞'
    return '◼'
  }

  function cssColorForSeed(id: SeedId): string {
    const c = getSeedColor(id)
    const r = Math.round(Math.min(1, Math.max(0, c.r)) * 255)
    const g = Math.round(Math.min(1, Math.max(0, c.g)) * 255)
    const b = Math.round(Math.min(1, Math.max(0, c.b)) * 255)
    return `rgb(${r}, ${g}, ${b})`
  }

  function syncEditorVisibility(): void {
    const show = editorActive
    // When editing, hide the inventory column so the editor visually overtakes it.
    presetsCol.hidden = show
    seedsList.hidden = !show
    detail.hidden = !show
    btnOk.disabled = !show
    presetsForm.hidden = !show
  }

  function syncPresetNameInput(): void {
    if (!currentPresetId) {
      if (!nameInput.value.trim()) {
        const def = selectedSeedDef
        nameInput.value = def.displayName
      }
      editorPresetNameInput.value = nameInput.value
      return
    }
    const presets = options.getPresets?.() ?? []
    const p = presets.find((x) => x.id === currentPresetId)
    if (p) {
      nameInput.value = p.name
    } else if (!nameInput.value.trim()) {
      nameInput.value = selectedSeedDef.displayName
    }
    editorPresetNameInput.value = nameInput.value
  }

  function buildPresetsUi(): void {
    presetsList.replaceChildren()
    const presets = options.getPresets?.() ?? []
    const selectedId = options.getSelectedPresetId?.() ?? currentPresetId
    currentPresetId = selectedId ?? null

    for (const preset of presets) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'seed-assembly-presets-tile'
      const iconSpan = document.createElement('span')
      iconSpan.className = 'seed-assembly-presets-icon'
      iconSpan.textContent = iconForSeed(preset.selection.seedTypeId)
      iconSpan.style.color = cssColorForSeed(preset.selection.seedTypeId)
      const labelSpan = document.createElement('span')
      labelSpan.className = 'seed-assembly-presets-name'
      labelSpan.textContent = preset.name
      btn.append(iconSpan, labelSpan)
      const isSelected = preset.id === currentPresetId
      btn.classList.toggle('seed-assembly-presets-tile--active', isSelected)
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false')
      presetsList.appendChild(btn)

      btn.addEventListener('click', () => {
        editorActive = true
        currentPresetId = preset.id
        current = {
          seedTypeId: preset.selection.seedTypeId,
          lifetimeSec: preset.selection.lifetimeSec,
          slots: preset.selection.slots.map((s) => ({ ...s })),
          recipeStack: preset.selection.recipeStack.slice(),
        }
        selectedSeedDef = getSeedDef(current.seedTypeId)
        syncMetaFromSelection()
        buildSeedList()
        buildStacksUi()
        syncPresetNameInput()
        // Selecting a preset activates both delete affordances.
        btnDeletePreset.disabled = false
        btnDeletePresetInline.disabled = false
        options.onSelectPreset?.(currentPresetId)
        // Update visual pressed state
        for (const child of Array.from(presetsList.children)) {
          if (child instanceof HTMLButtonElement) {
            const pressed = child === btn
            child.classList.toggle('seed-assembly-presets-tile--active', pressed)
            child.setAttribute('aria-pressed', pressed ? 'true' : 'false')
          }
        }
        syncEditorVisibility()
      })
    }

    const hasPreset = !!currentPresetId
    btnDeletePreset.disabled = !hasPreset
    btnDeletePresetInline.disabled = !hasPreset
    syncPresetNameInput()
    syncEditorVisibility()
  }

  function buildStacksUi(): void {
    stacksConfig.replaceChildren()
    const def = selectedSeedDef
    const header = document.createElement('div')
    header.className = 'seed-assembly-stacks-header'
    header.textContent = 'Recipe stack'
    stacksConfig.appendChild(header)

    const table = document.createElement('div')
    table.className = 'seed-assembly-stacks-table'

    const availability = options.getSeedRecipeAvailabilityState()
    const unlockedResources: ResourceId[] = getAvailableSeedRecipesForSeed(def.id, availability)

    // Ensure slots array matches maxRecipeStacks and backfill from defaults/unlocked.
    const maxStacks = def.maxRecipeStacks
    const slots: SeedRecipeSlot[] = Array.isArray(current.slots) ? current.slots.slice() : []

    while (slots.length < maxStacks) {
      const fallback = def.defaultRecipeStack[slots.length]
      const fallbackValid =
        fallback !== undefined && unlockedResources.includes(fallback as ResourceId)
      const resourceId =
        (fallbackValid && (fallback as ResourceId)) || (unlockedResources[0] as ResourceId | undefined)
      if (!resourceId) break
      slots.push({
        kind: 'recipe',
        resourceId,
        durationSec: def.lifetimeSec / Math.max(1, maxStacks),
      })
    }

    current.slots = slots.slice(0, maxStacks)
    current.recipeStack = current.slots
      .filter((s) => s.kind === 'recipe' && s.resourceId)
      .map((s) => s.resourceId as ResourceId)

    function recomputeLifetimeFromSlots(): void {
      const defLocal = selectedSeedDef
      const total = current.slots.reduce(
        (sum, s) => sum + Math.max(0, s.durationSec ?? 0),
        0,
      )
      const clamped = Math.min(
        defLocal.maxLifetimeSec,
        Math.max(defLocal.minLifetimeSec, total || defLocal.lifetimeSec),
      )
      current.lifetimeSec = clamped
      lifetimeValue.textContent = `${clamped.toFixed(0)} s (min ${defLocal.minLifetimeSec.toFixed(
        0,
      )}, max ${defLocal.maxLifetimeSec.toFixed(0)})`
    }

    function buildRow(i: number): void {
      const row = document.createElement('div')
      row.className = 'seed-assembly-stack-row'

      const idxLabel = document.createElement('span')
      idxLabel.className = 'seed-assembly-stack-index'
      idxLabel.textContent = String(i + 1)

      const kindSelect = document.createElement('select')
      kindSelect.className = 'seed-assembly-stack-kind-select'
      kindSelect.setAttribute('aria-label', `Slot ${i + 1} action`)

      const kinds: { value: SeedSlotKind; label: string }[] = [
        { value: 'recipe', label: 'Recipe' },
        { value: 'pause', label: 'Pause' },
        { value: 'die', label: 'Die' },
      ]

      const slot = current.slots[i]

      for (const k of kinds) {
        const opt = document.createElement('option')
        opt.value = k.value
        opt.textContent = k.label
        if (slot.kind === k.value) opt.selected = true
        kindSelect.appendChild(opt)
      }

      const recipeSelect = document.createElement('select')
      recipeSelect.className = 'seed-assembly-stack-select'
      recipeSelect.setAttribute('aria-label', `Recipe slot ${i + 1}`)

      for (const id of unlockedResources) {
        const opt = document.createElement('option')
        opt.value = id
        opt.textContent = RESOURCE_DEFS[id].displayName
        if (slot.kind === 'recipe' && slot.resourceId === id) opt.selected = true
        recipeSelect.appendChild(opt)
      }

      const durationInput = document.createElement('input')
      durationInput.type = 'range'
      durationInput.min = String(def.minLifetimeSec / Math.max(1, maxStacks))
      durationInput.max = String(def.maxLifetimeSec / Math.max(1, maxStacks))
      durationInput.step = '1'
      const initialDuration =
        typeof slot.durationSec === 'number' && Number.isFinite(slot.durationSec)
          ? slot.durationSec
          : def.lifetimeSec / Math.max(1, maxStacks)
      durationInput.value = initialDuration.toFixed(0)

      const durationLabel = document.createElement('span')
      durationLabel.className = 'seed-assembly-stack-duration-label'
      durationLabel.textContent = `${Number(durationInput.value).toFixed(0)} s`

      function syncRecipeVisibility(): void {
        const k = kindSelect.value as SeedSlotKind
        recipeSelect.disabled = k !== 'recipe'
        recipeSelect.hidden = k !== 'recipe'
      }

      kindSelect.addEventListener('change', () => {
        const k = kindSelect.value as SeedSlotKind
        current.slots[i].kind = k
        if (k !== 'recipe') {
          delete current.slots[i].resourceId
        } else if (!current.slots[i].resourceId && unlockedResources[0]) {
          current.slots[i].resourceId = unlockedResources[0]!
        }
        current.recipeStack = current.slots
          .filter((s) => s.kind === 'recipe' && s.resourceId)
          .map((s) => s.resourceId as ResourceId)
        syncRecipeVisibility()
        recomputeLifetimeFromSlots()
      })

      recipeSelect.addEventListener('change', () => {
        const next = recipeSelect.value as ResourceId
        current.slots[i].resourceId = next
        current.recipeStack = current.slots
          .filter((s) => s.kind === 'recipe' && s.resourceId)
          .map((s) => s.resourceId as ResourceId)
      })

      durationInput.addEventListener('input', () => {
        const v = Number(durationInput.value)
        current.slots[i].durationSec = v
        durationLabel.textContent = `${v.toFixed(0)} s`
        recomputeLifetimeFromSlots()
      })

      syncRecipeVisibility()

      row.append(idxLabel, kindSelect, recipeSelect, durationInput, durationLabel)
      table.appendChild(row)
    }

    for (let i = 0; i < current.slots.length; i++) {
      buildRow(i)
    }

    stacksConfig.appendChild(table)
  }

  function buildSeedList(): void {
    seedsList.replaceChildren()
    const unlocked = options.getUnlockedSeedIds()

    // Ensure current selection is unlocked; otherwise fall back to first unlocked seed.
    if (!unlocked.includes(current.seedTypeId)) {
      const fallback = unlocked[0]
      if (fallback) {
        current.seedTypeId = fallback
        current.recipeStack = SEED_DEFS[fallback].defaultRecipeStack.slice()
        selectedSeedDef = getSeedDef(current.seedTypeId)
        syncMetaFromSelection()
      }
    }

    const label = document.createElement('label')
    label.className = 'seed-assembly-seed-select-label'
    label.textContent = 'Seed type'

    const select = document.createElement('select')
    select.className = 'seed-assembly-seed-select'
    select.setAttribute('aria-label', 'Seed type')

    for (const id of Object.keys(SEED_DEFS) as SeedId[]) {
      const def = SEED_DEFS[id]
      const isUnlocked = unlocked.includes(id)
      const opt = document.createElement('option')
      opt.value = id
      opt.textContent = def.displayName
      opt.disabled = !isUnlocked
      if (id === current.seedTypeId && isUnlocked) opt.selected = true
      select.appendChild(opt)
    }

    select.addEventListener('change', () => {
      const nextId = select.value as SeedId
      if (!unlocked.includes(nextId)) return
      const def = SEED_DEFS[nextId]
      selectedSeedDef = def
      currentPresetId = null
      current = {
        seedTypeId: def.id,
        lifetimeSec: def.lifetimeSec,
        slots: def.defaultRecipeStack.map((id) => ({
          kind: 'recipe' as const,
          resourceId: id,
          durationSec: def.lifetimeSec / Math.max(1, def.maxRecipeStacks),
        })),
        recipeStack: def.defaultRecipeStack.slice(),
      }
      syncMetaFromSelection()
      buildStacksUi()
      syncPresetNameInput()
      options.onSelectPreset?.(null)
    })

    label.appendChild(select)

    const swatch = document.createElement('span')
    swatch.className = 'seed-assembly-seed-color-swatch'
    swatch.style.backgroundColor = cssColorForSeed(current.seedTypeId)
    label.appendChild(swatch)

    seedsList.appendChild(label)
  }

  function syncMetaFromSelection(): void {
    selectedSeedDef = getSeedDef(current.seedTypeId)
    const def = selectedSeedDef
    const min = def.minLifetimeSec
    const max = def.maxLifetimeSec
    const total =
      Array.isArray(current.slots) && current.slots.length > 0
        ? current.slots.reduce((sum, s) => sum + Math.max(0, s.durationSec ?? 0), 0)
        : current.lifetimeSec
    const raw =
      typeof total === 'number' && Number.isFinite(total) && total > 0 ? total : def.lifetimeSec
    const clamped = Math.min(max, Math.max(min, raw))
    current.lifetimeSec = clamped
    lifetimeValue.textContent = `${clamped.toFixed(0)} s (min ${min.toFixed(0)}, max ${max.toFixed(0)})`
    stacksValue.textContent = String(selectedSeedDef.maxRecipeStacks)
  }

  btnSavePreset.addEventListener('click', () => {
    if (!options.onSavePreset) return
    const name = nameInput.value.trim() || selectedSeedDef.displayName
    options.onSavePreset({
      id: currentPresetId,
      name,
      selection: {
        seedTypeId: current.seedTypeId,
        lifetimeSec: current.lifetimeSec,
        slots: current.slots.map((s) => ({ ...s })),
        recipeStack: current.recipeStack.slice(),
      },
    })
    // After saving, return to inventory so the new/updated preset is visible.
    editorActive = false
    buildPresetsUi()
  })

  // Keep inline preset name field in sync with the hidden left-column input.
  editorPresetNameInput.addEventListener('input', () => {
    nameInput.value = editorPresetNameInput.value
  })

  // Inline Save/Delete buttons forward to the existing handlers.
  btnSavePresetInline.addEventListener('click', () => {
    btnSavePreset.click()
  })

  function deleteCurrentPresetWithoutPrompt(): void {
    if (!options.onDeletePreset || !currentPresetId) return
    const id = currentPresetId
    currentPresetId = null
    options.onDeletePreset(id)
    options.onSelectPreset?.(null)
    // After delete, return to inventory view.
    editorActive = false
    buildPresetsUi()
  }

  function closeDeleteModal(): void {
    delRoot.hidden = true
  }

  function openDeleteModal(): void {
    if (!currentPresetId || !options.onDeletePreset) return
    delRoot.hidden = false
    delConfirm.focus()
  }

  delScrim.addEventListener('click', closeDeleteModal)
  delCancel.addEventListener('click', closeDeleteModal)
  delConfirm.addEventListener('click', () => {
    deleteCurrentPresetWithoutPrompt()
    closeDeleteModal()
  })

  btnDeletePreset.addEventListener('click', openDeleteModal)
  btnDeletePresetInline.addEventListener('click', openDeleteModal)

  btnNewPreset.addEventListener('click', () => {
    currentPresetId = null
    const initial = options.getInitialSelection()
    current = {
      seedTypeId: initial.seedTypeId,
      lifetimeSec: initial.lifetimeSec,
      slots: initial.slots.map((s) => ({ ...s })),
      recipeStack: initial.recipeStack.slice(),
    }
    syncMetaFromSelection()
    nameInput.value = selectedSeedDef.displayName
    editorActive = true
    buildSeedList()
    buildStacksUi()
    syncPresetNameInput()
    options.onSelectPreset?.(null)
    syncEditorVisibility()
  })

  function close(): void {
    root.hidden = true
  }

  scrim.addEventListener('click', close)
  btnCancel.addEventListener('click', close)
  btnOk.addEventListener('click', () => {
    options.onConfirm(current)
    close()
  })

  return {
    show(): void {
      current = options.getInitialSelection()
      currentPresetId = options.getSelectedPresetId?.() ?? currentPresetId
      syncMetaFromSelection()
      // Start in inventory-only view; editor becomes visible after selecting a preset or clicking New.
      editorActive = false
      buildPresetsUi()
      // Editor area is populated lazily when activated.
      root.hidden = false
      btnOk.focus()
    },
    hide(): void {
      close()
    },
    isOpen(): boolean {
      return !root.hidden
    },
    getCurrentSelection(): SeedAssemblySelection {
      return current
    },
  }
}

