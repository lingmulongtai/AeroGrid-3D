import { BufferAttribute, BufferGeometry, Color, Group, LineSegments, ShaderMaterial, Vector3, type IUniform } from 'three';
import { DEG, EARTH_RADIUS_KM, lonLatToVector } from '../geo';

type GeographicLine = [number, number][];
interface BoundaryData { coastlines: GeographicLine[]; borders: GeographicLine[] }

// Short spherical segments stay above the surface even across the date line.
export function geographicLineGeometry(lines: GeographicLine[]) {
  const positions: number[] = [];
  const start = new Vector3(), end = new Vector3(), point = new Vector3();
  const radius = EARTH_RADIUS_KM + 0.02;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      lonLatToVector(...line[i - 1], 0, start).normalize();
      lonLatToVector(...line[i], 0, end).normalize();
      const segments = Math.max(1, Math.ceil(start.angleTo(end) / (0.15 * DEG)));
      for (let j = 0; j < segments; j++) {
        for (const fraction of [j / segments, (j + 1) / segments]) {
          point.copy(start).lerp(end, fraction).normalize().multiplyScalar(radius);
          positions.push(point.x, point.y, point.z);
        }
      }
    }
  }
  return new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
}

const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWorldPos;
void main() {
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;
const FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 sunDirection;
uniform float lighting;
uniform float distanceFade;
uniform vec3 color;
uniform float strength;
varying vec3 vWorldPos;
void main() {
  #include <logdepthbuf_fragment>
  float day = smoothstep(-0.12, 0.22, dot(normalize(vWorldPos), sunDirection));
  float opacity = mix(0.06, 0.65, (1.0 - day) * lighting) * distanceFade * strength;
  gl_FragColor = vec4(color, opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class GeographicOutlines {
  readonly group = new Group();
  private controller = new AbortController();
  private distanceFade = { value: 1 };
  private disposed = false;

  constructor(sunDirection: IUniform<Vector3>, lighting: IUniform<number>) {
    this.group.name = 'earth-geographic-outlines';
    void fetch('/data/earth-boundaries.json', { signal: this.controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Geographic outlines unavailable'); return response.json() as Promise<BoundaryData>; })
      .then((data) => {
        if (this.disposed) return;
        for (const [name, lines, strength] of [['coastlines', data.coastlines, 1], ['national-boundaries', data.borders, 0.7]] as const) {
          const material = new ShaderMaterial({
            vertexShader: VERTEX, fragmentShader: FRAGMENT,
            uniforms: { sunDirection, lighting, distanceFade: this.distanceFade, color: { value: new Color('#8ab9ce') }, strength: { value: strength } },
            transparent: true, depthTest: true, depthWrite: false,
          });
          const segments = new LineSegments(geographicLineGeometry(lines), material);
          segments.name = name;
          segments.renderOrder = -2;
          this.group.add(segments);
        }
      }).catch(() => { /* Imagery remains usable if the optional local asset fails. */ });
  }

  update(cameraAltitudeKm: number) {
    // This generalized map is useful at globe scale; fade it before city detail.
    this.distanceFade.value = Math.max(0, Math.min(1, (cameraAltitudeKm - 100) / 300));
  }

  dispose() {
    this.disposed = true;
    this.controller.abort();
    for (const child of this.group.children as LineSegments<BufferGeometry, ShaderMaterial>[]) {
      child.geometry.dispose(); child.material.dispose();
    }
    this.group.clear();
  }
}
