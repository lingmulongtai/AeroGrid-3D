import { DoubleSide, MeshStandardMaterial, type IUniform } from 'three';

/**
 * Standard PBR material whose vertex paint is blended towards the instance
 * colour by a per-vertex livery mask, plus a small self-illumination term so
 * data objects stay legible on the night side of the planet.
 */
export function createLiveryMaterial(options: { metalness: number; roughness: number; emissive: number }) {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    metalness: options.metalness,
    roughness: options.roughness,
    side: DoubleSide,
    flatShading: true,
  });
  const emissive: IUniform<number> = { value: options.emissive };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.emissiveBoost = emissive;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float liveryMask;
varying float vLiveryMask;
varying vec3 vLivery;
varying vec3 vBasePaint;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
vBasePaint = color;
#ifdef USE_INSTANCING_COLOR
vLivery = instanceColor;
#else
vLivery = vec3(1.0);
#endif
vLiveryMask = liveryMask;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float emissiveBoost;
varying float vLiveryMask;
varying vec3 vLivery;
varying vec3 vBasePaint;`)
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= mix(vBasePaint, vLivery, vLiveryMask);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * emissiveBoost * (0.35 + 0.65 * vLiveryMask);`);
  };
  material.customProgramCacheKey = () => 'livery';
  return { material, emissive };
}
