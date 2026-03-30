import {
  BoxGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshStandardMaterial,
} from 'three'

const ATTR = 'scanOverlayUnlit'

/**
 * Per-instance flag: when 1, fragment shader uses flat diffuse (instance color) — unlit overlay read.
 */
export function addScanOverlayUnlitAttribute(geometry: BoxGeometry, maxInstances: number): InstancedBufferAttribute {
  const arr = new Float32Array(maxInstances)
  arr.fill(0)
  const attr = new InstancedBufferAttribute(arr, 1)
  attr.setUsage(DynamicDrawUsage)
  geometry.setAttribute(ATTR, attr)
  return attr
}

/**
 * Chains after {@link patchMeshStandardMaterialDepthOverlayAlphaMul}. For flagged instances, replaces
 * lit output with unlit `diffuseColor` and full opacity after depth alpha multiply.
 */
export function patchMeshStandardMaterialScanOverlayUnlit(material: MeshStandardMaterial): void {
  const prev = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    prev?.(shader, renderer)
    let vs = shader.vertexShader
    let fs = shader.fragmentShader

    if (vs.includes('attribute float depthOverlayAlphaMul') && !vs.includes('scanOverlayUnlit')) {
      vs = vs.replace(
        'attribute float depthOverlayAlphaMul;',
        'attribute float depthOverlayAlphaMul;\nattribute float scanOverlayUnlit;',
      )
      if (vs.includes('varying float vDepthOverlayAlphaMul;')) {
        vs = vs.replace(
          'varying float vDepthOverlayAlphaMul;',
          'varying float vDepthOverlayAlphaMul;\nvarying float vScanOverlayUnlit;',
        )
      }
      vs = vs.replace(
        'vDepthOverlayAlphaMul = depthOverlayAlphaMul;',
        'vDepthOverlayAlphaMul = depthOverlayAlphaMul;\nvScanOverlayUnlit = scanOverlayUnlit;',
      )
    }

    if (!fs.includes('vScanOverlayUnlit')) {
      if (fs.includes('varying float vDepthOverlayAlphaMul;')) {
        fs = fs.replace(
          'varying float vDepthOverlayAlphaMul;',
          'varying float vDepthOverlayAlphaMul;\nvarying float vScanOverlayUnlit;',
        )
      }
    }

    fs = fs.replace(
      'gl_FragColor.a *= vDepthOverlayAlphaMul;',
      `gl_FragColor.a *= vDepthOverlayAlphaMul;
if (vScanOverlayUnlit > 0.5) {
  gl_FragColor.rgb = diffuseColor.rgb;
  gl_FragColor.a = 1.0;
}`,
    )

    shader.vertexShader = vs
    shader.fragmentShader = fs
  }
}

export function setScanOverlayUnlitAt(mesh: InstancedMesh, instanceIndex: number, factor: number): void {
  const attr = mesh.geometry.getAttribute(ATTR) as InstancedBufferAttribute | undefined
  if (!attr) return
  const arr = attr.array as Float32Array
  arr[instanceIndex] = factor
}

export function flagScanOverlayUnlitNeedsUpdate(mesh: InstancedMesh): void {
  const attr = mesh.geometry.getAttribute(ATTR) as InstancedBufferAttribute | undefined
  if (attr) attr.needsUpdate = true
}
