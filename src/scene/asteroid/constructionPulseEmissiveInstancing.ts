import {
  BoxGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshStandardMaterial,
  Vector3,
} from 'three'

const ATTR = 'constructionPulseEmissive'

/** RGB scale for `totalEmissiveRadiance += uConstructionPulseColor * instanceStrength` (eating-rock teal family). */
const uConstructionPulseColorValue = new Vector3(0.11, 0.95, 0.88)

/**
 * Per-instance strength (0 = off) for replicator→structure construction glow on the solid layer.
 */
export function addConstructionPulseEmissiveAttribute(
  geometry: BoxGeometry,
  maxInstances: number,
): InstancedBufferAttribute {
  const arr = new Float32Array(maxInstances)
  arr.fill(0)
  const attr = new InstancedBufferAttribute(arr, 1)
  attr.setUsage(DynamicDrawUsage)
  geometry.setAttribute(ATTR, attr)
  return attr
}

/**
 * Chains after {@link patchMeshStandardMaterialScanOverlayUnlit}. Adds per-instance emissive on top of
 * standard emissive (solid base is black; attribute drives additive glow).
 */
export function patchMeshStandardMaterialConstructionPulseEmissive(material: MeshStandardMaterial): void {
  const prev = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer)
    shader.uniforms.uConstructionPulseColor = { value: uConstructionPulseColorValue }

    let vs = shader.vertexShader
    let fs = shader.fragmentShader

    if (vs.includes('attribute float scanOverlayUnlit;') && !vs.includes('constructionPulseEmissive')) {
      vs = vs
        .replace(
          'attribute float scanOverlayUnlit;',
          'attribute float scanOverlayUnlit;\nattribute float constructionPulseEmissive;',
        )
        .replace(
          'varying float vScanOverlayUnlit;',
          'varying float vScanOverlayUnlit;\nvarying float vConstructionPulseEmissive;',
        )
        .replace(
          'vScanOverlayUnlit = scanOverlayUnlit;',
          'vScanOverlayUnlit = scanOverlayUnlit;\nvConstructionPulseEmissive = constructionPulseEmissive;',
        )
    }

    if (fs.includes('varying float vScanOverlayUnlit;') && !fs.includes('uConstructionPulseColor')) {
      fs = fs.replace(
        'varying float vScanOverlayUnlit;',
        'varying float vScanOverlayUnlit;\nvarying float vConstructionPulseEmissive;\nuniform vec3 uConstructionPulseColor;',
      )
    }

    if (!fs.includes('totalEmissiveRadiance += uConstructionPulseColor * vConstructionPulseEmissive')) {
      fs = fs.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += uConstructionPulseColor * vConstructionPulseEmissive;`,
      )
    }

    shader.vertexShader = vs
    shader.fragmentShader = fs
  }
}

export function setConstructionPulseEmissiveAt(mesh: InstancedMesh, instanceIndex: number, strength: number): void {
  const attr = mesh.geometry.getAttribute(ATTR) as InstancedBufferAttribute | undefined
  if (!attr) return
  const arr = attr.array as Float32Array
  arr[instanceIndex] = strength
}

export function flagConstructionPulseEmissiveNeedsUpdate(mesh: InstancedMesh): void {
  const attr = mesh.geometry.getAttribute(ATTR) as InstancedBufferAttribute | undefined
  if (attr) attr.needsUpdate = true
}
