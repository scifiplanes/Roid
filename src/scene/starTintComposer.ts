import {
  type PerspectiveCamera,
  type Scene,
  Vector3,
  type WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

import type { LocalStarTintDebug } from '../game/localStarTintDebug'
import { localStarTintMultiplierFromSeed } from '../game/localStarTint'

const StarTintShader = {
  name: 'StarTintShader',
  uniforms: {
    tDiffuse: { value: null },
    tintMul: { value: new Vector3(1, 1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 tintMul;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(texel.rgb * tintMul, texel.a);
    }
  `,
}

export interface StarTintComposerHandle {
  composer: EffectComposer
  setTintFromSeed(seed: number): void
  setSize(width: number, height: number): void
  setPixelRatio(pixelRatio: number): void
}

export function createStarTintComposer(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  getLocalStarTintDebug: () => LocalStarTintDebug,
): StarTintComposerHandle {
  const composer = new EffectComposer(renderer)
  const renderPass = new RenderPass(scene, camera)
  const tintPass = new ShaderPass(StarTintShader)
  const outputPass = new OutputPass()

  composer.addPass(renderPass)
  composer.addPass(tintPass)
  composer.addPass(outputPass)

  const tintMulUniform = tintPass.uniforms.tintMul as { value: Vector3 }

  return {
    composer,
    setTintFromSeed(seed: number) {
      const m = localStarTintMultiplierFromSeed(seed, getLocalStarTintDebug())
      tintMulUniform.value.set(m.r, m.g, m.b)
    },
    setSize(width: number, height: number) {
      composer.setSize(width, height)
    },
    setPixelRatio(pixelRatio: number) {
      composer.setPixelRatio(pixelRatio)
    },
  }
}
