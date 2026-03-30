import { BoxGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, MeshStandardMaterial } from 'three'

const ATTR_NAME = 'scanEmissiveSuppress'

/**
 * Per-instance multiplier for material emissive (1 = normal, 0 = no glow). Used so surface-scan tints
 * can read as opaque over structure emissive without affecting untinted neighbors.
 */
export function addScanEmissiveSuppressAttribute(geometry: BoxGeometry, maxInstances: number): InstancedBufferAttribute {
  const arr = new Float32Array(maxInstances)
  arr.fill(1)
  const attr = new InstancedBufferAttribute(arr, 1)
  attr.setUsage(DynamicDrawUsage)
  geometry.setAttribute(ATTR_NAME, attr)
  return attr
}

export function patchMeshStandardMaterialScanEmissiveSuppress(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <color_pars_vertex>',
      `#include <color_pars_vertex>
attribute float ${ATTR_NAME};
varying float vScanEmissiveSuppress;`,
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `vScanEmissiveSuppress = ${ATTR_NAME};
#include <begin_vertex>`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_pars_fragment>',
      `#include <emissivemap_pars_fragment>
varying float vScanEmissiveSuppress;`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
totalEmissiveRadiance *= vScanEmissiveSuppress;`,
    )
  }
}

export function setScanEmissiveSuppressAt(mesh: InstancedMesh, instanceIndex: number, factor: number): void {
  const attr = mesh.geometry.getAttribute(ATTR_NAME) as InstancedBufferAttribute | undefined
  if (!attr) return
  const arr = attr.array as Float32Array
  arr[instanceIndex] = factor
}

export function flagScanEmissiveSuppressNeedsUpdate(mesh: InstancedMesh): void {
  const attr = mesh.geometry.getAttribute(ATTR_NAME) as InstancedBufferAttribute | undefined
  if (attr) attr.needsUpdate = true
}
