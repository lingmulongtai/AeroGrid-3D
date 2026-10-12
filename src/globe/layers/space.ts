import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three';
import { colorIndexToRgb, raDecToVector, type CelestialState } from '../astro';
import { MILKY_WAY_FRAGMENT, MILKY_WAY_VERTEX, STAR_FRAGMENT, STAR_VERTEX } from '../shaders';

const SKY_RADIUS = 1_000_000;
const SUN_DISTANCE = 1_600_000;
const SUN_RADIUS_KM = 696_340 * (SUN_DISTANCE / 149_597_870.7);
const MOON_RADIUS_KM = 1_737.4;

function glowTexture(stops: Array<[number, string]>) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export class SpaceLayer {
  readonly group = new Group();
  /** Celestial-frame group that follows the camera so the sky stays at infinity. */
  private sky = new Group();
  private starMaterial: ShaderMaterial;
  private milkyWayMaterial: ShaderMaterial;
  private sun: Group;
  private moon: Mesh;
  private moonHalo: Sprite;

  constructor(pixelRatio: number) {
    this.sky.matrixAutoUpdate = false;
    this.group.add(this.sky);

    this.starMaterial = new ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      uniforms: { pixelRatio: { value: pixelRatio }, visibility: { value: 1 } },
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    const stars = new Points(new BufferGeometry(), this.starMaterial);
    stars.frustumCulled = false;
    stars.renderOrder = -100;
    this.sky.add(stars);
    void fetch('/data/stars.json')
      .then((response) => (response.ok ? response.json() as Promise<number[]> : []))
      .then((flat) => {
        const count = flat.length / 4;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const v = new Vector3();
        for (let i = 0; i < count; i++) {
          const [ra, dec, mag, ci] = flat.slice(i * 4, i * 4 + 4);
          raDecToVector(ra, dec, v).multiplyScalar(SKY_RADIUS);
          positions.set([v.x, v.y, v.z], i * 3);
          const flux = 10 ** (-0.4 * (mag - 0.5));
          const brightness = Math.min(3, 0.32 + Math.sqrt(flux) * 1.4);
          const [r, g, b] = colorIndexToRgb(ci);
          colors.set([r * brightness, g * brightness, b * brightness], i * 3);
          sizes[i] = Math.min(8, 1.9 + Math.sqrt(flux) * 3.6);
        }
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new BufferAttribute(positions, 3));
        geometry.setAttribute('starColor', new BufferAttribute(colors, 3));
        geometry.setAttribute('size', new BufferAttribute(sizes, 1));
        stars.geometry.dispose();
        stars.geometry = geometry;
      })
      .catch(() => undefined);

    this.milkyWayMaterial = new ShaderMaterial({
      vertexShader: MILKY_WAY_VERTEX,
      fragmentShader: MILKY_WAY_FRAGMENT,
      uniforms: {
        galacticPole: { value: raDecToVector(192.85948, 27.12825) },
        galacticCenter: { value: raDecToVector(266.405, -28.93617) },
        visibility: { value: 1 },
      },
      side: BackSide,
      depthWrite: false,
      blending: AdditiveBlending,
      transparent: true,
    });
    const milkyWay = new Mesh(new SphereGeometry(SKY_RADIUS * 1.02, 64, 32), this.milkyWayMaterial);
    milkyWay.frustumCulled = false;
    milkyWay.renderOrder = -101;
    this.sky.add(milkyWay);

    this.sun = new Group();
    const disc = new Sprite(new SpriteMaterial({
      map: glowTexture([[0, 'rgba(255,255,255,1)'], [0.42, 'rgba(255,250,235,1)'], [0.5, 'rgba(255,240,210,0.0)'], [1, 'rgba(255,220,180,0)']]),
      color: new Color(18, 16.5, 14),
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    disc.scale.setScalar(SUN_RADIUS_KM * 2 / 0.5);
    const corona = new Sprite(new SpriteMaterial({
      map: glowTexture([[0, 'rgba(255,240,215,0.9)'], [0.08, 'rgba(255,214,160,0.45)'], [0.3, 'rgba(255,170,90,0.08)'], [1, 'rgba(255,140,60,0)']]),
      color: new Color(2.2, 2, 1.8),
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    corona.scale.setScalar(SUN_RADIUS_KM * 26);
    this.sun.add(corona, disc);
    this.sun.renderOrder = -50;
    disc.renderOrder = -49;
    corona.renderOrder = -50;
    this.group.add(this.sun);

    const moonTexture = new TextureLoader().load('/textures/moon.jpg');
    moonTexture.colorSpace = SRGBColorSpace;
    this.moon = new Mesh(
      new SphereGeometry(MOON_RADIUS_KM, 96, 48),
      new MeshStandardMaterial({ map: moonTexture, roughness: 0.96, metalness: 0, emissive: new Color(0.012, 0.012, 0.014) }),
    );
    this.moon.name = 'moon';
    this.group.add(this.moon);
    this.moonHalo = new Sprite(new SpriteMaterial({
      map: glowTexture([[0, 'rgba(220,226,240,0.35)'], [0.25, 'rgba(200,210,230,0.08)'], [1, 'rgba(200,210,230,0)']]),
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }));
    this.moonHalo.scale.setScalar(MOON_RADIUS_KM * 9);
    this.group.add(this.moonHalo);
  }

  setPixelRatio(pixelRatio: number) {
    this.starMaterial.uniforms.pixelRatio.value = pixelRatio;
  }

  update(state: CelestialState, camera: PerspectiveCamera, sunVisibleFromCamera: number) {
    this.sky.matrix.copy(state.celestialToWorld).setPosition(camera.position);
    this.sky.matrixWorldNeedsUpdate = true;
    this.sun.position.copy(camera.position).addScaledVector(state.sunDirection, SUN_DISTANCE);
    this.moon.position.copy(state.moonPosition);
    this.moon.lookAt(0, 0, 0);
    this.moon.rotateY(-Math.PI / 2);
    this.moonHalo.position.copy(state.moonPosition);
    const phase = state.sunDirection.dot(state.moonPosition.clone().normalize());
    (this.moonHalo.material as SpriteMaterial).opacity = 0.25 + 0.75 * (0.5 - phase * 0.5);
    // Daylight inside the atmosphere washes out faint stars.
    const visibility = 1 - sunVisibleFromCamera * 0.92;
    this.starMaterial.uniforms.visibility.value = visibility;
    this.milkyWayMaterial.uniforms.visibility.value = visibility;
  }

  dispose() {
    this.group.traverse((object) => {
      const mesh = object as Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as { dispose?: () => void; map?: { dispose: () => void } } | undefined;
      material?.map?.dispose();
      material?.dispose?.();
    });
  }
}
