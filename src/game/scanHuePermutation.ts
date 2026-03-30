import { RESOURCE_DEFS, REFINED_MATERIAL_IDS_FOR_SCAN, type ResourceId } from './resources'

/** Circular distance on N equally spaced slots (integer positions 0..N-1). */
function circSlotDist(a: number, b: number, n: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, n - d)
}

function nextLexicographicPermutation(a: number[]): boolean {
  let i = a.length - 2
  while (i >= 0 && a[i]! >= a[i + 1]!) i--
  if (i < 0) return false
  let j = a.length - 1
  while (a[j]! <= a[i]!) j--
  ;[a[i], a[j]] = [a[j]!, a[i]!]
  for (let l = i + 1, r = a.length - 1; l < r; l++, r--) {
    ;[a[l], a[r]] = [a[r]!, a[l]!]
  }
  return true
}

/**
 * All unordered sibling pairs among `REFINED_MATERIAL_IDS_FOR_SCAN` (same `parent` in tech tree).
 */
function siblingPairsForScanMaterials(): readonly [number, number][] {
  const ids = REFINED_MATERIAL_IDS_FOR_SCAN
  const indexById = new Map<ResourceId, number>()
  for (let i = 0; i < ids.length; i++) indexById.set(ids[i]!, i)

  const byParent = new Map<ResourceId, number[]>()
  for (const id of ids) {
    const p = RESOURCE_DEFS[id].parent
    if (p === null) continue
    let g = byParent.get(p)
    if (!g) {
      g = []
      byParent.set(p, g)
    }
    g.push(indexById.get(id)!)
  }

  const pairs: [number, number][] = []
  for (const group of byParent.values()) {
    if (group.length < 2) continue
    for (let a = 0; a < group.length; a++) {
      for (let b = a + 1; b < group.length; b++) {
        const i = group[a]!
        const j = group[b]!
        pairs.push(i < j ? [i, j] : [j, i])
      }
    }
  }
  return pairs
}

function scorePermutation(slotForMaterial: readonly number[], pairs: readonly [number, number][], n: number): number {
  let minD = n
  for (const [i, j] of pairs) {
    const d = circSlotDist(slotForMaterial[i]!, slotForMaterial[j]!, n)
    if (d < minD) minD = d
  }
  return minD
}

function lexLess(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i]! < b[i]!
  }
  return false
}

/** Brute force is tractable only for small N; larger trees use coprime slot spreading. */
const MAX_BRUTE_FORCE_PERMUTATION = 10

function gcd(a: number, b: number): number {
  let x = a
  let y = b
  while (y !== 0) {
    const t = x % y
    x = y
    y = t
  }
  return Math.abs(x)
}

/** For large N: try multiplicative generators coprime to n; maximize min sibling circular separation. */
function computeSpreadPermutation(n: number, pairs: readonly [number, number][]): number[] {
  let best = Array.from({ length: n }, (_, i) => i)
  let bestScore = scorePermutation(best, pairs, n)
  const candidates = [7, 11, 13, 17, 19, 23, 29, 31, 37, 41]
  for (const step of candidates) {
    if (gcd(step, n) !== 1) continue
    const cand = Array.from({ length: n }, (_, i) => (i * step) % n)
    const s = scorePermutation(cand, pairs, n)
    if (s > bestScore || (s === bestScore && lexLess(cand, best))) {
      bestScore = s
      best = cand
    }
  }
  return best
}

/**
 * Permutation π where π[i] = hue slot (0..N-1) for refined material index i in
 * `REFINED_MATERIAL_IDS_FOR_SCAN`, chosen to maximize the minimum circular slot
 * distance between tech-tree siblings. Tie-break: lexicographically smallest π.
 */
function computeBestSlotPermutation(): number[] {
  const n = REFINED_MATERIAL_IDS_FOR_SCAN.length
  const pairs = siblingPairsForScanMaterials()
  if (n === 0) return []
  if (n === 1) return [0]
  if (n > MAX_BRUTE_FORCE_PERMUTATION) {
    return computeSpreadPermutation(n, pairs)
  }

  let bestScore = -1
  let best: number[] | null = null

  const a = Array.from({ length: n }, (_, i) => i)
  while (true) {
    const s = scorePermutation(a, pairs, n)
    if (s > bestScore) {
      bestScore = s
      best = [...a]
    } else if (s === bestScore && best !== null && lexLess(a, best)) {
      best = [...a]
    }
    if (!nextLexicographicPermutation(a)) break
  }

  return best ?? [0]
}

const _slotForMaterialIndex: number[] = computeBestSlotPermutation()

const _slotById = (() => {
  const m = new Map<ResourceId, number>()
  const ids = REFINED_MATERIAL_IDS_FOR_SCAN
  for (let i = 0; i < ids.length; i++) {
    m.set(ids[i]!, _slotForMaterialIndex[i]!)
  }
  return m
})()

/** Hue slot 0..N-1 on the full circle for scan / legend anchors. */
export function refinedScanHueSlotForId(id: ResourceId): number {
  return _slotById.get(id) ?? 0
}

/** N refined materials in scan pipeline (denominator for hue = (slot+0.5)/N). */
export function refinedScanHueSlotCount(): number {
  return REFINED_MATERIAL_IDS_FOR_SCAN.length
}
