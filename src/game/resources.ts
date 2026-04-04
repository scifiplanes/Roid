/**
 * Resource tree: twelve root commodities (mined / spent on structures) refine into science-themed children.
 * Children enter tallies only via refinery voxels processing global root stock, not from direct mining.
 */

export type RootResourceId =
  | 'regolithMass'
  | 'silicates'
  | 'metals'
  | 'volatiles'
  | 'sulfides'
  | 'oxides'
  | 'carbonaceous'
  | 'hydrates'
  | 'ices'
  | 'refractories'
  | 'phosphates'
  | 'halides'

/**
 * High-level origin for mined materials and refined products.
 * Currently tracks whether matter ultimately came from asteroid rock or wreck debris.
 */
export type ResourceSource = 'asteroid' | 'wreck'

export type ResourceId =
  | RootResourceId
  | 'impactBrecciaFines'
  | 'micrometeoriteSpalls'
  | 'maficSilicates'
  | 'feldspathicSilicates'
  | 'ironNickelMetal'
  | 'siderophileTrace'
  | 'lightGasSpecies'
  | 'volatileOrganics'
  | 'pyrrhotiteFraction'
  | 'troiliteVeins'
  | 'spinelOxides'
  | 'magnetiteWeathering'
  | 'refractoryOrganics'
  | 'macromolecularCarbon'
  | 'hydratedMinerals'
  | 'phyllosilicateClays'
  | 'surfaceIces'
  | 'cryogenicIces'
  | 'calciumAluminates'
  | 'titaniumCondensates'
  | 'apatiteGrains'
  | 'phosphateSalts'
  | 'haliteVeins'
  | 'fluorideSalts'

export interface ResourceDef {
  id: ResourceId
  parent: ResourceId | null
  displayName: string
  hudAbbrev: string
  blurb: string
  sortOrder: number
  /** Roots only: plausible bulk density range (g/cm³), for composite display. */
  densityRangeGcm3?: readonly [number, number]
  /** Roots only: 0 = scan-resistant (opaque in depth overlay), 1 = highly penetrable. */
  depthScanSusceptibility?: number
}

export const ROOT_RESOURCE_IDS: readonly RootResourceId[] = [
  'regolithMass',
  'silicates',
  'metals',
  'volatiles',
  'sulfides',
  'oxides',
  'carbonaceous',
  'hydrates',
  'ices',
  'refractories',
  'phosphates',
  'halides',
] as const

const U12 = 1 / 12

export function defaultUniformRootComposition(): Record<RootResourceId, number> {
  const o = {} as Record<RootResourceId, number>
  for (const r of ROOT_RESOURCE_IDS) o[r] = U12
  return o
}

/**
 * Origin-tagged tallies: per-origin clones of the global resource tallies map.
 * This is intentionally separate from the primary tallies so existing HUD / costs remain unchanged.
 */
export type ResourceTalliesBySource = Record<ResourceSource, Record<ResourceId, number>>

export function createEmptyResourceTalliesBySource(
  makeBaseTallies: () => Record<ResourceId, number>,
): ResourceTalliesBySource {
  return {
    asteroid: makeBaseTallies(),
    wreck: makeBaseTallies(),
  }
}

export const RESOURCE_DEFS: Record<ResourceId, ResourceDef> = {
  regolithMass: {
    id: 'regolithMass',
    parent: null,
    displayName: 'Regolith',
    hudAbbrev: 'Reg',
    blurb: 'Unconsolidated fines from micrometeorite bombardment and thermal cycling.',
    sortOrder: 0,
    densityRangeGcm3: [1.2, 2.0],
    depthScanSusceptibility: 0.92,
  },
  impactBrecciaFines: {
    id: 'impactBrecciaFines',
    parent: 'regolithMass',
    displayName: 'Impact breccia fines',
    hudAbbrev: 'Br',
    blurb: 'Shocked matrix and clasts from cratering comminution.',
    sortOrder: 1,
  },
  micrometeoriteSpalls: {
    id: 'micrometeoriteSpalls',
    parent: 'regolithMass',
    displayName: 'Micrometeorite spalls',
    hudAbbrev: 'μ',
    blurb: 'Melt splashes and spall from hypervelocity grain impacts.',
    sortOrder: 2,
  },
  silicates: {
    id: 'silicates',
    parent: null,
    displayName: 'Silicates',
    hudAbbrev: 'Sil',
    blurb: 'Olivine- and pyroxene-dominated rock, analogous to ordinary chondrite silicates.',
    sortOrder: 10,
    densityRangeGcm3: [2.6, 3.4],
    depthScanSusceptibility: 0.65,
  },
  maficSilicates: {
    id: 'maficSilicates',
    parent: 'silicates',
    displayName: 'Mafic silicates',
    hudAbbrev: 'Maf',
    blurb: 'Mg-rich olivine and pyroxene as in differentiated mantle residues.',
    sortOrder: 11,
  },
  feldspathicSilicates: {
    id: 'feldspathicSilicates',
    parent: 'silicates',
    displayName: 'Feldspathic silicates',
    hudAbbrev: 'Fel',
    blurb: 'Plagioclase-rich fraction from early crustal crystallization.',
    sortOrder: 12,
  },
  metals: {
    id: 'metals',
    parent: null,
    displayName: 'Metals',
    hudAbbrev: 'Fe',
    blurb: 'Iron–nickel metal and siderophile-rich material from a differentiated interior.',
    sortOrder: 20,
    densityRangeGcm3: [7.0, 8.0],
    depthScanSusceptibility: 0.18,
  },
  ironNickelMetal: {
    id: 'ironNickelMetal',
    parent: 'metals',
    displayName: 'Fe–Ni metal',
    hudAbbrev: 'NiFe',
    blurb: 'Kamacite/taenite alloy analogous to ordinary chondrite metal.',
    sortOrder: 21,
  },
  siderophileTrace: {
    id: 'siderophileTrace',
    parent: 'metals',
    displayName: 'Siderophile trace',
    hudAbbrev: 'Sid',
    blurb: 'Highly siderophile trace budget carried by metal melts.',
    sortOrder: 22,
  },
  volatiles: {
    id: 'volatiles',
    parent: null,
    displayName: 'Volatiles',
    hudAbbrev: 'Vol',
    blurb: 'Light gases and small-molecule organics in voids and grain boundaries.',
    sortOrder: 30,
    densityRangeGcm3: [0.8, 1.8],
    depthScanSusceptibility: 0.88,
  },
  lightGasSpecies: {
    id: 'lightGasSpecies',
    parent: 'volatiles',
    displayName: 'Light gas species',
    hudAbbrev: 'Gas',
    blurb: 'Noble gases and light volatiles released under heating.',
    sortOrder: 31,
  },
  volatileOrganics: {
    id: 'volatileOrganics',
    parent: 'volatiles',
    displayName: 'Volatile organics',
    hudAbbrev: 'Vorg',
    blurb: 'Small volatile organic compounds and radicals.',
    sortOrder: 32,
  },
  sulfides: {
    id: 'sulfides',
    parent: null,
    displayName: 'Sulfides',
    hudAbbrev: 'Sul',
    blurb: 'Fe-sulfide matrix and accessory sulfides (troilite family).',
    sortOrder: 40,
    densityRangeGcm3: [4.0, 5.2],
    depthScanSusceptibility: 0.42,
  },
  pyrrhotiteFraction: {
    id: 'pyrrhotiteFraction',
    parent: 'sulfides',
    displayName: 'Pyrrhotite fraction',
    hudAbbrev: 'Pyr',
    blurb: 'Non-stoichiometric iron sulfide from slow cooling.',
    sortOrder: 41,
  },
  troiliteVeins: {
    id: 'troiliteVeins',
    parent: 'sulfides',
    displayName: 'Troilite veins',
    hudAbbrev: 'Tr',
    blurb: 'Stoichiometric FeS in shock veins and metal contacts.',
    sortOrder: 42,
  },
  oxides: {
    id: 'oxides',
    parent: null,
    displayName: 'Oxides',
    hudAbbrev: 'Ox',
    blurb: 'Spinel, magnetite, and ferric weathering products.',
    sortOrder: 50,
    densityRangeGcm3: [4.5, 5.8],
    depthScanSusceptibility: 0.35,
  },
  spinelOxides: {
    id: 'spinelOxides',
    parent: 'oxides',
    displayName: 'Spinel oxides',
    hudAbbrev: 'Sp',
    blurb: 'Mg-Al spinels and chromite analogs.',
    sortOrder: 51,
  },
  magnetiteWeathering: {
    id: 'magnetiteWeathering',
    parent: 'oxides',
    displayName: 'Magnetite weathering',
    hudAbbrev: 'Mag',
    blurb: 'Magnetite and ferric coatings from surface processing.',
    sortOrder: 52,
  },
  carbonaceous: {
    id: 'carbonaceous',
    parent: null,
    displayName: 'Carbonaceous',
    hudAbbrev: 'Car',
    blurb: 'Refractory organic solids and macromolecular carbon.',
    sortOrder: 60,
    densityRangeGcm3: [1.4, 2.2],
    depthScanSusceptibility: 0.78,
  },
  refractoryOrganics: {
    id: 'refractoryOrganics',
    parent: 'carbonaceous',
    displayName: 'Refractory organics',
    hudAbbrev: 'Org',
    blurb: 'Refractory C–N–H macromolecules surviving mild heating.',
    sortOrder: 61,
  },
  macromolecularCarbon: {
    id: 'macromolecularCarbon',
    parent: 'carbonaceous',
    displayName: 'Macromolecular carbon',
    hudAbbrev: 'MMC',
    blurb: 'Kerogen-like and amorphous carbon networks.',
    sortOrder: 62,
  },
  hydrates: {
    id: 'hydrates',
    parent: null,
    displayName: 'Hydrates',
    hudAbbrev: 'Hyd',
    blurb: 'OH-bearing silicates and bound water in minerals.',
    sortOrder: 70,
    densityRangeGcm3: [2.0, 2.8],
    depthScanSusceptibility: 0.72,
  },
  hydratedMinerals: {
    id: 'hydratedMinerals',
    parent: 'hydrates',
    displayName: 'Hydrated minerals',
    hudAbbrev: 'OH',
    blurb: 'OH-bearing silicates and salts from low-temperature alteration.',
    sortOrder: 71,
  },
  phyllosilicateClays: {
    id: 'phyllosilicateClays',
    parent: 'hydrates',
    displayName: 'Phyllosilicate clays',
    hudAbbrev: 'Phy',
    blurb: 'Sheet silicates from aqueous alteration.',
    sortOrder: 72,
  },
  ices: {
    id: 'ices',
    parent: null,
    displayName: 'Ices',
    hudAbbrev: 'Ice',
    blurb: 'Cold-trapped volatiles and weakly bound surface ice.',
    sortOrder: 80,
    densityRangeGcm3: [0.9, 1.2],
    depthScanSusceptibility: 0.95,
  },
  surfaceIces: {
    id: 'surfaceIces',
    parent: 'ices',
    displayName: 'Surface ices',
    hudAbbrev: 'SfI',
    blurb: 'Seasonal and adsorbed surface ice.',
    sortOrder: 81,
  },
  cryogenicIces: {
    id: 'cryogenicIces',
    parent: 'ices',
    displayName: 'Cryogenic ices',
    hudAbbrev: 'CrI',
    blurb: 'CO₂, NH₃, and H₂O ice in permanent cold traps.',
    sortOrder: 82,
  },
  refractories: {
    id: 'refractories',
    parent: null,
    displayName: 'Refractories',
    hudAbbrev: 'Ref',
    blurb: 'High-temperature condensates (Al-Ca-Ti bearing).',
    sortOrder: 90,
    densityRangeGcm3: [3.5, 4.5],
    depthScanSusceptibility: 0.22,
  },
  calciumAluminates: {
    id: 'calciumAluminates',
    parent: 'refractories',
    displayName: 'Calcium aluminates',
    hudAbbrev: 'CA',
    blurb: 'Ca-Al-rich inclusions and refractory silicates.',
    sortOrder: 91,
  },
  titaniumCondensates: {
    id: 'titaniumCondensates',
    parent: 'refractories',
    displayName: 'Titanium condensates',
    hudAbbrev: 'Ti',
    blurb: 'Ti-rich oxides and nitrides from early condensation.',
    sortOrder: 92,
  },
  phosphates: {
    id: 'phosphates',
    parent: null,
    displayName: 'Phosphates',
    hudAbbrev: 'Pho',
    blurb: 'Apatite and phosphate salts.',
    sortOrder: 100,
    densityRangeGcm3: [2.8, 3.4],
    depthScanSusceptibility: 0.48,
  },
  apatiteGrains: {
    id: 'apatiteGrains',
    parent: 'phosphates',
    displayName: 'Apatite grains',
    hudAbbrev: 'Ap',
    blurb: 'Calcium phosphate accessory grains.',
    sortOrder: 101,
  },
  phosphateSalts: {
    id: 'phosphateSalts',
    parent: 'phosphates',
    displayName: 'Phosphate salts',
    hudAbbrev: 'Ps',
    blurb: 'Evaporitic and alteration phosphate phases.',
    sortOrder: 102,
  },
  halides: {
    id: 'halides',
    parent: null,
    displayName: 'Halides',
    hudAbbrev: 'Hal',
    blurb: 'Chloride and fluoride evaporites and veins.',
    sortOrder: 110,
    densityRangeGcm3: [2.1, 3.0],
    depthScanSusceptibility: 0.55,
  },
  haliteVeins: {
    id: 'haliteVeins',
    parent: 'halides',
    displayName: 'Halite veins',
    hudAbbrev: 'NaCl',
    blurb: 'Rock salt in fractures and vugs.',
    sortOrder: 111,
  },
  fluorideSalts: {
    id: 'fluorideSalts',
    parent: 'halides',
    displayName: 'Fluoride salts',
    hudAbbrev: 'Fl',
    blurb: 'Fluorite and related halide phases.',
    sortOrder: 112,
  },
}

/** DFS pre-order: roots first, then children under each root. */
export const RESOURCE_IDS_ORDERED: ResourceId[] = (
  Object.values(RESOURCE_DEFS) as ResourceDef[]
)
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((d) => d.id)

export function isRootResource(id: ResourceId): id is RootResourceId {
  return RESOURCE_DEFS[id].parent === null
}

export function childrenOf(parent: ResourceId): ResourceId[] {
  const out: ResourceId[] = []
  for (const id of RESOURCE_IDS_ORDERED) {
    if (RESOURCE_DEFS[id].parent === parent) out.push(id)
  }
  return out
}

/** Integer child grants per one unit of parent refined (one refinement hop). */
export function refinementYieldForParent(
  parent: RootResourceId,
): Partial<Record<ResourceId, number>> {
  switch (parent) {
    case 'regolithMass':
      return { impactBrecciaFines: 1, micrometeoriteSpalls: 1 }
    case 'silicates':
      return { maficSilicates: 1, feldspathicSilicates: 1 }
    case 'metals':
      return { ironNickelMetal: 1, siderophileTrace: 1 }
    case 'volatiles':
      return { lightGasSpecies: 1, volatileOrganics: 1 }
    case 'sulfides':
      return { pyrrhotiteFraction: 1, troiliteVeins: 1 }
    case 'oxides':
      return { spinelOxides: 1, magnetiteWeathering: 1 }
    case 'carbonaceous':
      return { refractoryOrganics: 1, macromolecularCarbon: 1 }
    case 'hydrates':
      return { hydratedMinerals: 1, phyllosilicateClays: 1 }
    case 'ices':
      return { surfaceIces: 1, cryogenicIces: 1 }
    case 'refractories':
      return { calciumAluminates: 1, titaniumCondensates: 1 }
    case 'phosphates':
      return { apatiteGrains: 1, phosphateSalts: 1 }
    case 'halides':
      return { haliteVeins: 1, fluorideSalts: 1 }
    default:
      return {}
  }
}

/**
 * Child resources appearing in any root refinement recipe, in global `sortOrder` order.
 * Single source for scanner hue anchors and refined-material preview text.
 */
export const REFINED_MATERIAL_IDS_FOR_SCAN: readonly ResourceId[] = (() => {
  const seen = new Set<ResourceId>()
  for (const r of ROOT_RESOURCE_IDS) {
    const part = refinementYieldForParent(r)
    for (const [id, v] of Object.entries(part)) {
      if (v !== undefined && v > 0) seen.add(id as ResourceId)
    }
  }
  return RESOURCE_IDS_ORDERED.filter((id) => seen.has(id))
})()

/**
 * Weighted blend of per-root refinement recipes using normalized root fractions (processed matter).
 * Returns integer child counts via largest remainder on the blended exact values.
 */
export function blendedRefinementFromRootComposition(
  comp: Record<RootResourceId, number>,
): Partial<Record<ResourceId, number>> {
  const exact = new Map<ResourceId, number>()
  for (const r of ROOT_RESOURCE_IDS) {
    const w = comp[r] ?? 0
    if (w <= 0) continue
    const part = refinementYieldForParent(r)
    for (const id of RESOURCE_IDS_ORDERED) {
      const v = part[id as ResourceId]
      if (v === undefined || v <= 0) continue
      exact.set(id, (exact.get(id) ?? 0) + w * v)
    }
  }
  if (exact.size === 0) return {}

  let totalTarget = 0
  for (const v of exact.values()) totalTarget += v
  const targetInt = Math.max(1, Math.round(totalTarget))

  type Row = { id: ResourceId; floor: number; frac: number }
  const rows: Row[] = []
  for (const [id, v] of exact) {
    const fl = Math.floor(v)
    rows.push({ id, floor: fl, frac: v - fl })
  }
  let allocated = 0
  for (const row of rows) allocated += row.floor
  const rem = targetInt - allocated
  rows.sort((a, b) => b.frac - a.frac)
  const out: Partial<Record<ResourceId, number>> = {}
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const n = row.floor + (i < rem ? 1 : 0)
    if (n > 0) out[row.id] = n
  }
  return out
}

/** Integer root units credited to tallies when a Hub consumes one processed-matter unit (mass budget 12). */
const HUB_PM_ROOT_MASS_UNITS = 12

/**
 * Credits root resources to global tallies from normalized PM composition (largest remainder).
 * When `outCredited` is provided, it is populated with the integer units added per root.
 */
export function addRootTalliesFromPmComposition(
  tallies: Record<ResourceId, number>,
  comp: Record<RootResourceId, number>,
  outCredited?: Partial<Record<RootResourceId, number>>,
): void {
  let sumW = 0
  for (const r of ROOT_RESOURCE_IDS) sumW += comp[r] ?? 0
  const c = sumW <= 0 ? defaultUniformRootComposition() : comp
  let s = 0
  for (const r of ROOT_RESOURCE_IDS) s += c[r] ?? 0
  if (s <= 0) return

  type Row = { id: RootResourceId; floor: number; frac: number }
  const rows: Row[] = []
  for (const r of ROOT_RESOURCE_IDS) {
    const exact = ((c[r] ?? 0) / s) * HUB_PM_ROOT_MASS_UNITS
    const fl = Math.floor(exact)
    rows.push({ id: r, floor: fl, frac: exact - fl })
  }
  let allocated = 0
  for (const row of rows) allocated += row.floor
  let rem = HUB_PM_ROOT_MASS_UNITS - allocated
  rows.sort((a, b) => b.frac - a.frac)
  for (let i = 0; i < rows.length && rem > 0; i++) {
    rows[i]!.floor++
    rem--
  }
  for (const row of rows) {
    if (row.floor > 0) {
      tallies[row.id] = (tallies[row.id] ?? 0) + row.floor
      if (outCredited) {
        outCredited[row.id] = (outCredited[row.id] ?? 0) + row.floor
      }
    }
  }
}

/**
 * Credits all remaining processed-matter units using the same per-unit root split as Hub (`addRootTalliesFromPmComposition`).
 * Aggregates per-root credits into `outCreditedTotal` when provided (e.g. origin-tagged tallies).
 */
export function creditAllProcessedMatterUnitsToTallies(
  tallies: Record<ResourceId, number>,
  units: number,
  comp: Record<RootResourceId, number>,
  outCreditedTotal?: Partial<Record<RootResourceId, number>>,
): void {
  const n = Math.max(0, Math.floor(units))
  for (let u = 0; u < n; u++) {
    const tickCredit: Partial<Record<RootResourceId, number>> = {}
    addRootTalliesFromPmComposition(tallies, comp, tickCredit)
    if (outCreditedTotal) {
      for (const r of ROOT_RESOURCE_IDS) {
        const v = tickCredit[r]
        if (v === undefined || v <= 0) continue
        outCreditedTotal[r] = (outCreditedTotal[r] ?? 0) + v
      }
    }
  }
}

export function createEmptyResourceTallies(): Record<ResourceId, number> {
  const out = {} as Record<ResourceId, number>
  for (const id of RESOURCE_IDS_ORDERED) {
    out[id] = 0
  }
  return out
}

/**
 * Matter HUD and tooltips: hide sub-cent noise; snap near-integers; otherwise truncate to 2 decimal places.
 */
export function formatResourceAmountForHud(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const neg = n < 0
  const a = Math.abs(n)
  if (a < 0.01) return '0'
  const r = Math.round(a)
  const body =
    Math.abs(a - r) < 0.01 ? String(r) : String(Math.trunc(a * 100) / 100)
  return neg ? `-${body}` : body
}

export function addResourceYields(
  tallies: Record<ResourceId, number>,
  yields: Partial<Record<ResourceId, number>>,
): void {
  for (const id of RESOURCE_IDS_ORDERED) {
    const v = yields[id]
    if (v !== undefined && v > 0) tallies[id] += v
  }
}

export function formatResourceHudLine(tallies: Record<ResourceId, number>): string {
  const parts: string[] = []
  for (const id of ROOT_RESOURCE_IDS) {
    const n = tallies[id]
    if (n > 0) {
      const s = formatResourceAmountForHud(n)
      if (s !== '0') parts.push(`${RESOURCE_DEFS[id].hudAbbrev} ${s}`)
    }
  }
  return parts.join(' · ')
}

/** Non-root resources with count &gt; 0, compact line for HUD second row. */
export function formatRefinedResourceHudLine(tallies: Record<ResourceId, number>): string {
  const parts: string[] = []
  for (const id of RESOURCE_IDS_ORDERED) {
    if (isRootResource(id)) continue
    const n = tallies[id]
    if (n > 0) {
      const s = formatResourceAmountForHud(n)
      if (s !== '0') parts.push(`${RESOURCE_DEFS[id].hudAbbrev} ${s}`)
    }
  }
  return parts.join(' · ')
}

/** Same order as `formatResourceHudLine`; for DOM coloring in the matter HUD. */
export function matterHudRootEntries(
  tallies: Record<ResourceId, number>,
): readonly { id: RootResourceId; n: number }[] {
  const out: { id: RootResourceId; n: number }[] = []
  for (const id of ROOT_RESOURCE_IDS) {
    const n = tallies[id]
    if (n !== undefined && n > 0 && formatResourceAmountForHud(n) !== '0') out.push({ id, n })
  }
  return out
}

/** Same order as `formatRefinedResourceHudLine`. */
export function matterHudRefinedEntries(
  tallies: Record<ResourceId, number>,
): readonly { id: ResourceId; n: number }[] {
  const out: { id: ResourceId; n: number }[] = []
  for (const id of RESOURCE_IDS_ORDERED) {
    if (isRootResource(id)) continue
    const n = tallies[id]
    if (n !== undefined && n > 0 && formatResourceAmountForHud(n) !== '0') out.push({ id, n })
  }
  return out
}

export function formatResourceCost(cost: Partial<Record<ResourceId, number>>): string {
  const parts: string[] = []
  for (const id of RESOURCE_IDS_ORDERED) {
    const v = cost[id]
    if (v !== undefined && v > 0) parts.push(`${RESOURCE_DEFS[id].hudAbbrev} ${v}`)
  }
  return parts.join(' · ')
}

/** Inventory vs requirement per commodity (`have/need`), same order as `formatResourceCost`. */
export function formatResourceCostWithTallies(
  tallies: Record<ResourceId, number>,
  cost: Partial<Record<ResourceId, number>>,
): string {
  const parts: string[] = []
  for (const id of RESOURCE_IDS_ORDERED) {
    const need = cost[id]
    if (need !== undefined && need > 0) {
      const have = formatResourceAmountForHud(tallies[id] ?? 0)
      parts.push(`${RESOURCE_DEFS[id].hudAbbrev} ${have}/${need}`)
    }
  }
  return parts.join(' · ')
}

export function formatEnergyHudLine(current: number, cap: number): string {
  return `En ${Math.floor(current)}/${Math.floor(cap)}`
}
