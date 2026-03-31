import type { SeedId } from './seedDefs'

export interface SeedColor {
  r: number
  g: number
  b: number
}

// Hand-tuned, high-contrast sRGB-ish colors for each SeedId.
// Values are in 0–1, matching three.js Color usage elsewhere.
const SEED_COLORS: Record<SeedId, SeedColor> = {
  basicSeed: { r: 0.95, g: 0.85, b: 0.25 }, // warm yellow
  efficientSeed: { r: 0.25, g: 0.9, b: 0.65 }, // aqua green
  longlifeSeed: { r: 0.45, g: 0.7, b: 0.95 }, // sky blue
  burstSeed: { r: 0.98, g: 0.4, b: 0.3 }, // bright orange-red
  schedulerSeed: { r: 0.75, g: 0.5, b: 0.95 }, // violet
  macroSeed: { r: 0.35, g: 0.95, b: 0.45 }, // lime-ish
  expertSeed: { r: 0.95, g: 0.6, b: 0.95 }, // magenta-pink
}

export function getSeedColor(id: SeedId): SeedColor {
  return SEED_COLORS[id] ?? SEED_COLORS.basicSeed
}

