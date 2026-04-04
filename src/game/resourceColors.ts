import { RESOURCE_DEFS, type ResourceDef, type ResourceId } from './resources'
import type { VoxelCell } from './voxelState'
import { getKindDef } from './voxelKinds'

export interface ResourceRgb {
  r: number
  g: number
  b: number
}

/**
 * Hand-tuned palette for primary resources used as Seed recipes.
 * These are intended to be visually distinct when mapped onto replicator voxels.
 */
const RESOURCE_COLORS: Partial<Record<ResourceId, ResourceRgb>> = {
  regolithMass: { r: 1.0, g: 0.42, b: 0.58 }, // pink
  silicates: { r: 0.06, g: 0.14, b: 0.58 }, // dark blue
  metals: { r: 1.0, g: 0.46, b: 0.04 }, // orange
  volatiles: { r: 0.1, g: 0.38, b: 1.0 }, // deep bright blue
  sulfides: { r: 1.0, g: 0.56, b: 0.06 }, // orange (amber vs metals)
  oxides: { r: 0.96, g: 0.1, b: 0.14 }, // red
  carbonaceous: { r: 0.0, g: 0.78, b: 0.66 }, // saturated teal
  hydrates: { r: 0.0, g: 0.72, b: 0.86 }, // saturated teal → aqua
  ices: { r: 0.97, g: 0.98, b: 1.0 }, // white (cool ice)
  refractories: { r: 0.82, g: 0.06, b: 0.18 }, // red (crimson vs oxides)
  phosphates: { r: 1.0, g: 0.28, b: 0.62 }, // pink (magenta-rose vs regolith)
  halides: { r: 0.58, g: 0.12, b: 0.98 }, // violet
}

/** Walk `parent` links until we hit a root that has an entry in `RESOURCE_COLORS`. */
function resourceRgbViaAncestorPalette(id: ResourceId): ResourceRgb | undefined {
  const seen = new Set<ResourceId>()
  let current: ResourceId | null = id
  while (current !== null && !seen.has(current)) {
    seen.add(current)
    const direct = RESOURCE_COLORS[current]
    if (direct) return direct
    const def: ResourceDef | undefined = RESOURCE_DEFS[current]
    current = def?.parent ?? null
  }
  return undefined
}

function hue2rgb(p: number, q: number, t: number): number {
  let u = t
  if (u < 0) u += 1
  if (u > 1) u -= 1
  if (u < 1 / 6) return p + (q - p) * 6 * u
  if (u < 1 / 2) return q
  if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6
  return p
}

/** Stable saturated RGB for unknown ids (distinct from neutral replicator tint). */
function hashResourceIdToRgb(id: ResourceId): ResourceRgb {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const hue = ((h >>> 0) % 360) / 360
  const s = 0.68 + (((h >>> 8) & 0xff) / 255) * 0.28
  const l = 0.44 + (((h >>> 16) & 0xff) / 255) * 0.2
  if (s <= 1e-6) return { r: l, g: l, b: l }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return {
    r: hue2rgb(p, q, hue + 1 / 3),
    g: hue2rgb(p, q, hue),
    b: hue2rgb(p, q, hue - 1 / 3),
  }
}

export function getResourceColor(id: ResourceId): ResourceRgb {
  return resourceRgbViaAncestorPalette(id) ?? hashResourceIdToRgb(id)
}

function mixRgb(a: ResourceRgb, b: ResourceRgb, t: number): ResourceRgb {
  const u = Math.min(1, Math.max(0, t))
  const v = 1 - u
  return {
    r: a.r * v + b.r * u,
    g: a.g * v + b.g * u,
    b: a.b * v + b.b * u,
  }
}

function scaleRgb(c: ResourceRgb, s: number): ResourceRgb {
  return { r: c.r * s, g: c.g * s, b: c.b * s }
}

/** Cool overlay used to indicate paused replicator programs (reads clearly on saturated bases). */
const PAUSE_TINT: ResourceRgb = { r: 0.42, g: 0.78, b: 1.0 }
/** Warm overlay used to indicate dying / about-to-expire seeds. */
const DYING_TINT: ResourceRgb = { r: 1, g: 0.45, b: 0.12 }

/**
 * Returns the base display color for a replicator voxel, derived primarily from its
 * active or last-run recipe resource, with subtle variants for paused/idle/dying states.
 *
 * This intentionally does not apply pulsation, infection overlays, scan overlays, or
 * per-instance brightness jitter; callers (scene layer) should layer those on top.
 */
function activeReplicatorRecipeId(cell: VoxelCell): ResourceId | undefined {
  if (cell.replicatorRecipeResourceId) return cell.replicatorRecipeResourceId
  const seed = cell.seedRuntime
  if (!seed) return undefined
  if (Array.isArray(seed.slots) && seed.slots.length > 0) {
    const rawIdx =
      typeof seed.currentSlotIndex === 'number' && Number.isFinite(seed.currentSlotIndex)
        ? seed.currentSlotIndex
        : 0
    const idx = Math.min(seed.slots.length - 1, Math.max(0, rawIdx))
    const slot = seed.slots[idx]
    if (slot && slot.kind === 'recipe' && slot.resourceId) {
      return slot.resourceId
    }
  }
  if (Array.isArray(seed.activeRecipes) && seed.activeRecipes.length > 0) {
    return seed.activeRecipes[0]
  }
  return undefined
}

export function getReplicatorDisplayColor(cell: VoxelCell): ResourceRgb {
  const repDef = getKindDef('replicator')
  const neutral: ResourceRgb = {
    r: repDef.colorTint.r,
    g: repDef.colorTint.g,
    b: repDef.colorTint.b,
  }

  if (cell.kind !== 'replicator') return neutral

  const recipeId = activeReplicatorRecipeId(cell)
  const baseFromRecipe: ResourceRgb | null = recipeId ? getResourceColor(recipeId) : null
  let base: ResourceRgb = baseFromRecipe ?? neutral

  const seed = cell.seedRuntime
  if (!seed) {
    // No live seed runtime: dimmed tint — use last-known recipe color when present (`replicatorRecipeResourceId`),
    // not only the neutral kind tint (previously we always returned neutral here and dropped recipe display).
    return scaleRgb(base, 0.9)
  }

  const lifetimeTotal = seed.lifetimeTotalSec
  const lifetimeRemaining = seed.lifetimeRemainingSec
  const fracRemaining =
    lifetimeTotal > 0 ? Math.min(1, Math.max(0, lifetimeRemaining / lifetimeTotal)) : 1

  let slotKind: 'recipe' | 'pause' | 'die' | null = null
  if (Array.isArray(seed.slots) && seed.slots.length > 0) {
    const rawIdx =
      typeof seed.currentSlotIndex === 'number' && Number.isFinite(seed.currentSlotIndex)
        ? seed.currentSlotIndex
        : 0
    const idx = Math.min(seed.slots.length - 1, Math.max(0, rawIdx))
    const slot = seed.slots[idx]
    if (slot && (slot.kind === 'recipe' || slot.kind === 'pause' || slot.kind === 'die')) {
      slotKind = slot.kind
    }
  }

  // Lifetime exhausted: dull mix toward last recipe (or neutral).
  if (lifetimeRemaining <= 0) {
    const mix = baseFromRecipe ? mixRgb(neutral, baseFromRecipe, 0.4) : neutral
    return scaleRgb(mix, 0.85)
  }

  // No recognized slot kind (e.g. empty `slots` but `activeRecipes` still set): while the
  // seed is running, use the same vivid recipe tint as a structured program — otherwise dim neutral.
  if (slotKind === null) {
    if (baseFromRecipe) {
      return base
    }
    return scaleRgb(neutral, 0.9)
  }

  // Paused: cool, slightly dimmed variant of the recipe color.
  if (slotKind === 'pause') {
    const cool = mixRgb(base, PAUSE_TINT, 0.55)
    return scaleRgb(cool, 0.9)
  }

  // Dying / about to expire: warm, attention-grabbing variant.
  const dyingBySlot = slotKind === 'die'
  const DYING_FRACTION_THRESHOLD = 0.18
  const dyingByLifetime = fracRemaining <= DYING_FRACTION_THRESHOLD
  if (dyingBySlot || dyingByLifetime) {
    const warm = mixRgb(base, DYING_TINT, dyingBySlot ? 0.7 : 0.5)
    return scaleRgb(warm, dyingBySlot ? 1.25 : 1.12)
  }

  // Active recipe: vivid resource color (palette is already bright; avoid clipping past 1).
  return base
}
