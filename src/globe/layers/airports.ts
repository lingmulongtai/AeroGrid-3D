import { BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from 'three';
import { loadRegionalAirports, MAJOR_AIRPORTS, type Airport } from '../../data/airports';
import { EARTH_RADIUS_KM, lonLatToVector } from '../geo';

const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float tier;
uniform float pixelRatio;
uniform float cameraAltitude;
varying float vTier;
varying float vAlpha;
varying float vZoomed;
void main() {
  vTier = tier;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float regional = 1.0 - smoothstep(900.0, 2200.0, cameraAltitude);
  float major = 1.0 - smoothstep(16000.0, 40000.0, cameraAltitude) * 0.55;
  vAlpha = tier > 1.5 ? regional : major;
  float zoomed = 1.0 - smoothstep(60.0, 6000.0, cameraAltitude);
  vZoomed = zoomed;
  gl_PointSize = (tier > 1.5 ? 6.0 + 4.0 * zoomed : 3.5 + 9.0 * zoomed) * pixelRatio * (vAlpha > 0.0 ? 1.0 : 0.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying float vTier;
varying float vAlpha;
varying float vZoomed;
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0 || vAlpha <= 0.0) discard;
  float ring = smoothstep(0.58, 0.7, r) * (1.0 - smoothstep(0.84, 1.0, r));
  float core = 1.0 - smoothstep(0.3, 0.46, r);
  float shape = mix(1.0 - smoothstep(0.55, 1.0, r), max(ring, core), smoothstep(0.15, 0.5, vZoomed));
  vec3 color = vTier > 1.5 ? vec3(0.62, 0.78, 0.95) : vec3(0.35, 0.95, 1.25);
  float alpha = shape * vAlpha * mix(0.7, 1.0, vZoomed);
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

export class AirportLayer {
  readonly points: Points;
  private material: ShaderMaterial;
  airports: Airport[] = [...MAJOR_AIRPORTS];
  positions: Vector3[] = [];
  visible = true;

  constructor(pixelRatio: number) {
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { pixelRatio: { value: pixelRatio }, cameraAltitude: { value: 20_000 } },
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
    });
    this.points = new Points(new BufferGeometry(), this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.rebuild();
    void loadRegionalAirports().then((regional) => {
      const known = new Set(this.airports.map((airport) => airport.iata));
      this.airports = [...this.airports, ...regional.filter((airport) => !known.has(airport.iata))];
      this.rebuild();
    });
  }

  private rebuild() {
    this.positions = this.airports.map((airport) => lonLatToVector(airport.longitude, airport.latitude, 0.03));
    const positions = new Float32Array(this.airports.length * 3);
    const tiers = new Float32Array(this.airports.length);
    this.positions.forEach((position, index) => {
      positions.set([position.x, position.y, position.z], index * 3);
      tiers[index] = this.airports[index].tier;
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('tier', new BufferAttribute(tiers, 1));
    this.points.geometry.dispose();
    this.points.geometry = geometry;
  }

  get count() {
    return this.visible ? this.airports.length : 0;
  }

  setPixelRatio(pixelRatio: number) {
    this.material.uniforms.pixelRatio.value = pixelRatio;
  }

  update(cameraPosition: Vector3) {
    this.points.visible = this.visible;
    this.material.uniforms.cameraAltitude.value = cameraPosition.length() - EARTH_RADIUS_KM;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
