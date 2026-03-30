import {
  BoxGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshStandardMaterial,
} from 'three'

const ATTR = 'depthOverlayAlphaMul'

/**
 * Per-instance multiplier on fragment alpha for depth overlay rock. Default 1; warm lodes use
 * `1 / depthOverlayRockOpacity` so material opacity × mul reaches 1.
 */
export function addDepthOverlayAlphaMulAttribute(
  geometry: BoxGeometry,
  maxInstances: number,
): InstancedBufferAttribute {
  const arr = new Float32Array(maxInstances)
  arr.fill(1)
  const attr = new InstancedBufferAttribute(arr, 1)
  attr.setUsage(DynamicDrawUsage)
  geometry.setAttribute(ATTR, attr)
  return attr
}

/**
 * Chains onto any existing `onBeforeCompile` (e.g. scan emissive suppress on eating rock).
 * Multiplies `gl_FragColor.a` by the per-instance attribute so warm lodes can read fully opaque.
 */
export function patchMeshStandardMaterialDepthOverlayAlphaMul(material: MeshStandardMaterial): void {
  const prev = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer)
    let vs = shader.vertexShader
    let fs = shader.fragmentShader

    if (vs.includes('scanEmissiveSuppress')) {
      vs = vs
        .replace(
          'attribute float scanEmissiveSuppress;',
          'attribute float scanEmissiveSuppress;\nattribute float depthOverlayAlphaMul;',
        )
        .replace(
          'varying float vScanEmissiveSuppress;',
          'varying float vScanEmissiveSuppress;\nvarying float vDepthOverlayAlphaMul;',
        )
        .replace(
          'vScanEmissiveSuppress = scanEmissiveSuppress;',
          'vScanEmissiveSuppress = scanEmissiveSuppress;\nvDepthOverlayAlphaMul = depthOverlayAlphaMul;',
        )
    } else {
      vs = vs
        .replace(
          '#include <color_pars_vertex>',
          `#include <color_pars_vertex>
attribute float depthOverlayAlphaMul;
varying float vDepthOverlayAlphaMul;`,
        )
        .replace(
          '#include <begin_vertex>',
          `vDepthOverlayAlphaMul = depthOverlayAlphaMul;
#include <begin_vertex>`,
        )
    }

    if (fs.includes('vScanEmissiveSuppress')) {
      fs = fs.replace(
        'varying float vScanEmissiveSuppress;',
        'varying float vScanEmissiveSuppress;\nvarying float vDepthOverlayAlphaMul;',
      )
    } else {
      fs = fs.replace(
        '#include <emissivemap_pars_fragment>',
        `#include <emissivemap_pars_fragment>
varying float vDepthOverlayAlphaMul;`,
      )
    }

    fs = fs.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
gl_FragColor.a *= vDepthOverlayAlphaMul;`,
    )

    shader.vertexShader = vs
    shader.fragmentShader = fs
  }
}

export function setDepthOverlayAlphaMulAt(mesh: InstancedMesh, instanceIndex: number, mul: number): void {
  const attr = mesh.geometry.getAttribute(ATTR) as InstancedBufferAttribute | undefined
  if (!attr) return
  const arr = attr.array as Float32Array
  arr[instanceIndex] = mul
}

export function flagDepthOverlayAlphaMulNeedsUpdate(mesh: InstancedMesh): void {
  const attr = mesh.geometry.getAttribute(ATTR) as InstancedBufferAttribute | undefined
  if (attr) attr.needsUpdate = true
}
