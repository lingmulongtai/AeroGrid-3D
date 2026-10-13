import {
  AmbientLight,
  BackSide,
  CustomBlending,
  DirectionalLight,
  HalfFloatType,
  Mesh,
  NeutralToneMapping,
  OneFactor,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SrcAlphaFactor,
  SRGBColorSpace,
  Timer,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { FlightRecord } from '../../shared/contracts';
import type { CloudProfile } from '../../shared/live';
import { SATELLITE_COLORS, satelliteState, type SatelliteRecord } from '../data/satellites';
import type { Airport } from '../data/airports';
import type { QualitySettings } from '../types/quality';
import type { LayerVisibility } from '../types/layers';
import { computeCelestialState, siderealAngle, type CelestialState } from './astro';
import { GlobeControls, type CameraSnapshot, type FollowTarget } from './controls';
import { Earth, type MapStyle } from './earth';
import { EARTH_RADIUS_KM, lonLatToVector, vectorToLonLat } from './geo';
import { AircraftLayer, type ColorMode } from './layers/aircraft';
import { AirportLayer } from './layers/airports';
import { SatelliteLayer } from './layers/satellites';
import { SpaceLayer } from './layers/space';
import { WeatherLayer } from './layers/weather';
import { LabelOverlay, projectVisible, type Highlight, type LabelRequest } from './overlay';
import { ATMOSPHERE_FRAGMENT, ATMOSPHERE_VERTEX } from './shaders';

export type PickResult =
  | { kind: 'aircraft'; id: string }
  | { kind: 'satellite'; id: string }
  | { kind: 'airport'; airport: Airport };

export interface HoverInfo {
  x: number;
  y: number;
  title: string;
  subtitle: string;
}

export interface EngineCallbacks {
  onCamera: (snapshot: CameraSnapshot) => void;
  onCameraSettled: (snapshot: CameraSnapshot) => void;
  onPick: (result: PickResult | null) => void;
  onHover: (info: HoverInfo | null) => void;
  onTrackingInterrupted: () => void;
}

export interface Selection {
  kind: 'aircraft' | 'satellite' | 'airport';
  id: string;
}

export interface EngineStats {
  fps: number;
  tiles: number;
  aircraft: number;
  satellites: number;
  airports: number;
  weatherParticles: number;
}

export class GlobeEngine {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly controls: GlobeControls;
  private scene = new Scene();
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private earth: Earth;
  private atmosphere: Mesh;
  private atmosphereMaterial: ShaderMaterial;
  private space: SpaceLayer;
  private aircraft = new AircraftLayer();
  private satellites = new SatelliteLayer();
  private weather: WeatherLayer;
  private airports: AirportLayer;
  private overlay: LabelOverlay;
  private sunLight = new DirectionalLight(0xfff4e6, 3.2);
  private ambient = new AmbientLight(0x9fb4d8, 0.32);
  private celestial: CelestialState;
  private lastCelestial = 0;
  private timer = new Timer();
  private frameTime = Date.now();
  private frame = 0;
  private animation = 0;
  private resizeObserver: ResizeObserver;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private origin = new Vector3();
  private selection: Selection | null = null;
  private hoverPoint: { x: number; y: number } | null = null;
  private hoverDirty = false;
  private lastHover: { x: number; y: number } | null = null;
  private lastEmit = 0;
  private settledTimer = 0;
  private wasInteracting = false;
  private fpsFrames = 0;
  private fpsStart = performance.now();
  private airportLabels = true;
  private showLabels = false;
  private satelliteRecords: SatelliteRecord[] = [];
  stats: EngineStats = { fps: 0, tiles: 0, aircraft: 0, satellites: 0, airports: 0, weatherParticles: 0 };

  constructor(
    private container: HTMLElement,
    private quality: QualitySettings,
    private offline: boolean,
    private callbacks: EngineCallbacks,
  ) {
    this.renderer = new WebGLRenderer({
      antialias: false,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = 'globe-canvas';
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D globe');
    this.renderer.domElement.setAttribute('role', 'img');
    container.appendChild(this.renderer.domElement);
    this.overlay = new LabelOverlay(container);

    this.camera = new PerspectiveCamera(38, 1, 0.0008, 4_000_000);
    this.controls = new GlobeControls(this.camera, this.renderer.domElement);
    this.controls.onClick = (x, y) => this.handleClick(x, y);
    this.controls.onHover = (x, y) => {
      this.hoverPoint = x === null || y === null ? null : { x, y };
      this.hoverDirty = true;
    };
    this.controls.onUserNavigate = (kind) => {
      if (kind === 'pan' && !this.controls.following) this.callbacks.onTrackingInterrupted();
    };

    this.celestial = computeCelestialState(new Date());
    this.earth = new Earth(this.renderer, this.earthQuality(), offline, () => undefined);
    this.scene.add(this.earth.group);

    this.atmosphereMaterial = new ShaderMaterial({
      vertexShader: ATMOSPHERE_VERTEX,
      fragmentShader: ATMOSPHERE_FRAGMENT,
      uniforms: {
        sunDirection: this.earth.uniforms.sunDirection,
        planetRadius: { value: EARTH_RADIUS_KM },
        atmosphereRadius: { value: EARTH_RADIUS_KM + 100 },
        sunIntensity: { value: 20 },
        strength: { value: 1 },
        groundHaze: { value: 0.3 },
        primarySteps: { value: quality.atmosphereSteps },
        lightSteps: { value: Math.max(4, Math.round(quality.atmosphereSteps / 2.5)) },
      },
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: SrcAlphaFactor,
    });
    this.atmosphere = new Mesh(new SphereGeometry((EARTH_RADIUS_KM + 100) * 1.012, 160, 80), this.atmosphereMaterial);
    this.atmosphere.renderOrder = -1;
    this.atmosphere.frustumCulled = false;
    this.scene.add(this.atmosphere);

    this.space = new SpaceLayer(1);
    this.scene.add(this.space.group);
    this.airports = new AirportLayer(1);
    this.scene.add(this.airports.points);
    this.scene.add(this.aircraft.group, this.satellites.group);
    this.weather = new WeatherLayer(this.earth.uniforms.sunDirection as { value: Vector3 });
    this.scene.add(this.weather.group);
    this.scene.add(this.sunLight, this.sunLight.target, this.ambient);

    this.applyQuality(quality, true);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.animation = requestAnimationFrame(this.tick);
  }

  private earthQuality() {
    return {
      detail: this.quality.tileDetail,
      maxTiles: this.quality.maxTiles,
      anisotropy: Math.min(this.quality.anisotropy, this.renderer.capabilities.getMaxAnisotropy()),
      concurrency: this.quality.tileConcurrency,
    };
  }

  applyQuality(quality: QualitySettings, initial = false) {
    const previous = this.quality;
    this.quality = quality;
    this.earth.setQuality(this.earthQuality());
    this.atmosphereMaterial.uniforms.primarySteps.value = quality.atmosphereSteps;
    this.atmosphereMaterial.uniforms.lightSteps.value = Math.max(4, Math.round(quality.atmosphereSteps / 2.5));
    this.weather.setBudget(quality.weatherParticles);
    if (initial || previous.msaa !== quality.msaa || previous.maxPixelRatio !== quality.maxPixelRatio) {
      this.buildComposer();
      this.resize();
    }
    if (this.bloomPass) this.bloomPass.enabled = quality.bloom;
  }

  private buildComposer() {
    this.composer?.dispose();
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: this.quality.msaa });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0.28, 0.4, 1.15);
    this.bloomPass.enabled = this.quality.bloom;
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  private resize() {
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio);
    if (this.quality.preset === 'ultra') this.pixelRatio = Math.min(this.quality.maxPixelRatio, Math.max(this.pixelRatio, 1.5));
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.domElement.style.width = `${this.width}px`;
    this.renderer.domElement.style.height = `${this.height}px`;
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.overlay.resize(this.width, this.height, window.devicePixelRatio || 1);
    this.space.setPixelRatio(this.pixelRatio);
    this.airports.setPixelRatio(this.pixelRatio);
  }

  // ------------------------------------------------------------- public API

  setMapStyle(style: MapStyle) {
    this.earth.setStyle(style);
    this.weather.setNightStyle(style === 'night');
  }

  setRealisticLighting(enabled: boolean) {
    this.earth.setRealisticLighting(enabled);
  }

  setLayers(layers: LayerVisibility) {
    this.aircraft.visible = layers.flights;
    this.aircraft.showTrails = layers.flightTrails;
    this.satellites.visible = layers.satellites;
    this.satellites.showTrails = layers.satelliteTrails;
    this.weather.visible = layers.weather;
    this.airports.visible = layers.airports;
    this.airportLabels = layers.airports;
    this.showLabels = layers.labels;
  }

  setFlights(flights: FlightRecord[], snapshotMs: number, colorMode: ColorMode) {
    this.aircraft.setFlights(flights, snapshotMs, colorMode);
  }

  setSatellites(records: SatelliteRecord[]) {
    this.satelliteRecords = records;
    this.satellites.setConstellation(records);
  }
  setCloudProfiles(profiles: CloudProfile[], opacity: number) {
    this.weather.setOpacity(opacity); this.weather.useProfiles(profiles);
  }
  setRadarPrecipitation(url: string | null, center: { latitude: number; longitude: number }, radiusKm: number, onError: () => void) {
    this.weather.useRadarRain(url, center, radiusKm, onError);
  }

  setColorMode(colorMode: ColorMode) {
    this.aircraft.recolor(colorMode);
  }

  setWeather(config: { mode: 'demo' } | { mode: 'radar'; url: string; center: { latitude: number; longitude: number }; radiusKm: number; onError: () => void } | { mode: 'off' }, opacity: number) {
    this.weather.setOpacity(opacity);
    if (config.mode === 'demo') this.weather.useDemo();
    else if (config.mode === 'radar') this.weather.useRadar(config.url, config.center, config.radiusKm, config.onError);
    else this.weather.clear();
  }

  setSelection(selection: Selection | null) {
    this.selection = selection;
    this.aircraft.selectedId = selection?.kind === 'aircraft' ? selection.id : null;
    this.satellites.selectedId = selection?.kind === 'satellite' ? selection.id : null;
  }

  get satelliteList() {
    return this.satelliteRecords;
  }

  track(target: Selection | null) {
    if (!target) {
      this.controls.setFollow(null);
      return;
    }
    if (target.kind === 'aircraft') {
      const getter = (): FollowTarget | null => {
        const display = this.aircraft.positionAt(target.id, this.frameTime);
        return display ? { longitude: display.longitude, latitude: display.latitude, altitude: display.altitudeKm, heading: display.heading } : null;
      };
      const flight = this.flightLookup?.(target.id);
      const range = flight?.category === 'heavy' ? 0.42 : flight?.category === 'light' || flight?.category === 'rotorcraft' ? 0.09 : 0.3;
      this.controls.setFollow(getter, { range, tilt: 68, chase: true });
    } else if (target.kind === 'satellite') {
      const getter = (): FollowTarget | null => {
        const position = this.satellites.positionAt(target.id, this.frameTime, siderealAngle(new Date(this.frameTime)));
        if (!position) return null;
        const { longitude, latitude, altitudeKm } = vectorToLonLat(position);
        return { longitude, latitude, altitude: altitudeKm };
      };
      const record = this.satelliteRecords.find((satellite) => satellite.id === target.id);
      this.controls.setFollow(getter, { range: record?.model === 'station' ? 0.6 : 0.12, tilt: 58, chase: false });
    }
  }

  flyTo(longitude: number, latitude: number, range: number, tilt = 35) {
    this.controls.flyTo({ longitude, latitude, range, tilt });
  }

  zoom(inward: boolean) {
    this.controls.zoomBy(inward ? 0.5 : 2);
    this.emitSettledSoon();
  }

  resetView() {
    this.controls.setFollow(null);
    this.controls.flyTo({ longitude: 139.76, latitude: 35.68, range: 18_000, heading: 0, tilt: 0, duration: 1.8 });
  }

  resetNorth() {
    this.controls.resetNorth();
  }

  aircraftDisplay(id: string) {
    return this.aircraft.getDisplay(id);
  }

  satelliteDetails(id: string) {
    const record = this.satelliteRecords.find((satellite) => satellite.id === id);
    if (!record) return null;
    return { record, state: satelliteState(record, Date.now()) };
  }

  // ---------------------------------------------------------------- picking

  private pickAt(clientX: number, clientY: number, radius = 16): PickResult | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best: { result: PickResult; score: number } | null = null;
    const consider = (positions: Float32Array, ids: string[], kind: 'aircraft' | 'satellite', weight: number) => {
      const point = new Vector3();
      for (let i = 0; i < ids.length; i++) {
        point.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        const screen = projectVisible(point, this.camera, this.width, this.height);
        if (!screen) continue;
        const distance = Math.hypot(screen.x - x, screen.y - y) * weight;
        if (distance < radius && (!best || distance < best.score)) best = { result: { kind, id: ids[i] }, score: distance };
      }
    };
    if (this.aircraft.visible) consider(this.aircraft.pickPositions, this.aircraft.pickIds, 'aircraft', 0.85);
    if (this.satellites.visible) consider(this.satellites.pickPositions, this.satellites.pickIds, 'satellite', 1);
    if (this.airports.visible) {
      const altitude = this.camera.position.length() - EARTH_RADIUS_KM;
      this.airports.airports.forEach((airport, index) => {
        if (airport.tier === 2 && altitude > 2_200) return;
        const screen = projectVisible(this.airports.positions[index], this.camera, this.width, this.height);
        if (!screen) return;
        const distance = Math.hypot(screen.x - x, screen.y - y) * 1.25;
        if (distance < radius && (!best || distance < best.score)) best = { result: { kind: 'airport', airport }, score: distance };
      });
    }
    return (best as { result: PickResult } | null)?.result ?? null;
  }

  private handleClick(clientX: number, clientY: number) {
    this.callbacks.onPick(this.pickAt(clientX, clientY));
  }

  private describe(result: PickResult): { title: string; subtitle: string } {
    if (result.kind === 'aircraft') {
      const track = this.aircraft.getDisplay(result.id);
      const flight = this.flightLookup?.(result.id);
      return {
        title: flight?.callsign ?? result.id,
        subtitle: track ? `${Math.round(track.altitudeKm * 3280.84).toLocaleString()} ft · ${Math.round((flight?.velocity ?? 0) * 1.94384)} kt` : '',
      };
    }
    if (result.kind === 'satellite') {
      const details = this.satelliteDetails(result.id);
      return {
        title: details?.record.name ?? result.id,
        subtitle: details ? `${Math.round(details.state.altitudeKm).toLocaleString()} km · ${details.state.speedKmS.toFixed(2)} km/s` : '',
      };
    }
    return { title: `${result.airport.iata} · ${result.airport.city}`, subtitle: result.airport.name };
  }

  flightLookup: ((id: string) => FlightRecord | undefined) | null = null;

  // ------------------------------------------------------------------ frame

  private emitSettledSoon() {
    window.clearTimeout(this.settledTimer);
    this.settledTimer = window.setTimeout(() => this.callbacks.onCameraSettled(this.controls.snapshot()), 250);
  }

  private tick = (timestamp?: number) => {
    this.animation = requestAnimationFrame(this.tick);
    this.timer.update(timestamp);
    const delta = this.timer.getDelta();
    const now = Date.now();
    this.frameTime = now;
    this.frame++;

    const moved = this.controls.update(delta);
    const interacting = this.controls.isInteracting;
    if (moved && performance.now() - this.lastEmit > 90) {
      this.lastEmit = performance.now();
      this.callbacks.onCamera(this.controls.snapshot());
    }
    if (this.wasInteracting && !interacting) this.emitSettledSoon();
    this.wasInteracting = interacting;

    if (now - this.lastCelestial > 1000) {
      this.lastCelestial = now;
      this.celestial = computeCelestialState(new Date(now));
      this.earth.setSunDirection(this.celestial.sunDirection);
      this.sunLight.position.copy(this.celestial.sunDirection).multiplyScalar(100_000);
    }

    const camera = this.camera;
    const rig = this.controls.rig;
    this.origin.copy(rig.target).multiplyScalar(EARTH_RADIUS_KM + rig.targetAltitude);
    const altitude = camera.position.length() - EARTH_RADIUS_KM;
    const cssPixelsPerRadian = this.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const devicePixelsPerRadian = cssPixelsPerRadian * this.pixelRatio;

    this.earth.update(camera, this.frame, this.height * this.pixelRatio);
    const sidereal = siderealAngle(new Date(now));
    this.aircraft.update(now, camera, this.origin, cssPixelsPerRadian);
    this.satellites.update(now, sidereal, camera, this.origin, cssPixelsPerRadian);
    this.weather.update(performance.now() / 1000, devicePixelsPerRadian, camera, this.renderer.getDrawingBufferSize(new Vector2()));
    this.airports.update(camera.position);

    const up = camera.position.clone().normalize();
    const daylight = Math.max(0, Math.min(1, (up.dot(this.celestial.sunDirection) + 0.1) / 0.2));
    const insideAtmosphere = 1 - Math.max(0, Math.min(1, (altitude - 15) / 70));
    this.space.update(this.celestial, camera, daylight * insideAtmosphere);
    const nightBoost = 0.3 + 0.35 * (1 - daylight);
    this.aircraft.setNightVisibility(nightBoost);
    this.satellites.setNightVisibility(nightBoost + 0.15);

    this.composer.render(delta);
    this.drawOverlay(now);
    this.updateStats();
  };

  private drawOverlay(now: number) {
    const labels: LabelRequest[] = [];
    const highlights: Highlight[] = [];
    const camera = this.camera;
    const altitude = camera.position.length() - EARTH_RADIUS_KM;
    const centerX = this.width / 2;
    const centerY = this.height / 2;

    if (this.airportLabels && this.airports.visible && altitude < 4_500) {
      this.airports.airports.forEach((airport, index) => {
        if (airport.tier === 2 && altitude > 650) return;
        const screen = projectVisible(this.airports.positions[index], camera, this.width, this.height);
        if (!screen) return;
        const centrality = 1 - Math.min(1, Math.hypot(screen.x - centerX, screen.y - centerY) / Math.max(centerX, centerY));
        labels.push({
          text: altitude < 160 ? `${airport.iata} ${airport.city}` : airport.iata,
          x: screen.x,
          y: screen.y,
          priority: (airport.tier === 1 ? 2 : 1) + centrality,
          color: airport.tier === 1 ? '#9df0ff' : '#a9bad0',
          kind: 'airport',
        });
      });
    }

    if (this.showLabels && this.satellites.visible) {
      const ids = this.satellites.pickIds;
      const positions = this.satellites.pickPositions;
      const point = new Vector3();
      for (let i = 0; i < ids.length; i++) {
        const record = this.satelliteRecords[i];
        if (!record) continue;
        const isStation = record.category === 'station';
        if (record.category === 'starlink') continue;
        point.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        const screen = projectVisible(point, camera, this.width, this.height);
        if (!screen) continue;
        labels.push({
          text: record.name,
          x: screen.x,
          y: screen.y,
          priority: isStation ? 5 : 1.5,
          color: SATELLITE_COLORS[record.category],
          kind: isStation ? 'station' : 'satellite',
        });
      }
    }

    if (this.showLabels && this.aircraft.visible && altitude < 2_500 && this.flightLookup) {
      const ids = this.aircraft.pickIds;
      const positions = this.aircraft.pickPositions;
      const point = new Vector3();
      const candidates: LabelRequest[] = [];
      for (let i = 0; i < ids.length; i++) {
        point.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        const screen = projectVisible(point, camera, this.width, this.height);
        if (!screen) continue;
        const flight = this.flightLookup(ids[i]);
        if (!flight) continue;
        candidates.push({
          text: flight.callsign,
          x: screen.x,
          y: screen.y,
          priority: 3 - Math.hypot(screen.x - centerX, screen.y - centerY) / 2000,
          color: '#ffffff',
          kind: 'aircraft',
        });
      }
      candidates.sort((a, b) => b.priority - a.priority);
      labels.push(...candidates.slice(0, 140));
    }

    if (this.selection) {
      const point = this.selectionPosition(this.selection);
      if (point) {
        const screen = projectVisible(point, camera, this.width, this.height, 40);
        if (screen) {
          const description = this.selection.kind === 'airport'
            ? this.describe({ kind: 'airport', airport: this.airports.airports.find((airport) => airport.iata === this.selection!.id)! })
            : this.describe({ kind: this.selection.kind, id: this.selection.id } as PickResult);
          highlights.push({
            x: screen.x,
            y: screen.y,
            title: description.title,
            subtitle: description.subtitle,
            color: this.selection.kind === 'satellite' ? '#7dffc0' : this.selection.kind === 'airport' ? '#7de9ff' : '#ffd166',
            pulse: true,
          });
        }
      }
    }

    let hover: { x: number; y: number } | null = null;
    if (this.hoverDirty || this.frame % 10 === 0) {
      this.hoverDirty = false;
      const result = this.hoverPoint ? this.pickAt(this.hoverPoint.x, this.hoverPoint.y, 12) : null;
      if (result) {
        const point = result.kind === 'airport'
          ? lonLatToVector(result.airport.longitude, result.airport.latitude, 0.03)
          : this.selectionPosition({ kind: result.kind, id: result.id });
        const screen = point ? projectVisible(point, camera, this.width, this.height) : null;
        if (screen) {
          hover = { x: screen.x, y: screen.y };
          const { title, subtitle } = this.describe(result);
          this.callbacks.onHover({ x: screen.x, y: screen.y, title, subtitle });
        }
      } else if (this.lastHover) {
        this.callbacks.onHover(null);
      }
      this.lastHover = hover;
      this.renderer.domElement.style.cursor = hover ? 'pointer' : '';
    } else {
      hover = this.lastHover;
    }

    this.overlay.draw(labels, highlights, hover, now / 1000);
  }

  private selectionPosition(selection: Selection): Vector3 | null {
    if (selection.kind === 'aircraft') {
      const display = this.aircraft.getDisplay(selection.id);
      return display ? lonLatToVector(display.longitude, display.latitude, display.altitudeKm) : null;
    }
    if (selection.kind === 'satellite') return this.satellites.getWorldPosition(selection.id);
    const airport = this.airports.airports.find((candidate) => candidate.iata === selection.id);
    return airport ? lonLatToVector(airport.longitude, airport.latitude, 0.03) : null;
  }

  private updateStats() {
    this.fpsFrames++;
    const elapsed = performance.now() - this.fpsStart;
    if (elapsed < 1000) return;
    this.stats = {
      fps: Math.round((this.fpsFrames * 1000) / elapsed),
      tiles: this.earth.tileCount,
      aircraft: this.aircraft.visible ? this.aircraft.count : 0,
      satellites: this.satellites.count,
      airports: this.airports.count,
      weatherParticles: this.weather.particleCount,
    };
    this.fpsFrames = 0;
    this.fpsStart = performance.now();
  }

  snapshot() {
    return this.controls.snapshot();
  }

  debug() {
    return {
      tiles: this.earth.debugTiles(),
      camera: this.camera.position.toArray(),
      origin: this.origin.toArray(),
      stats: this.stats,
    };
  }

  dispose() {
    cancelAnimationFrame(this.animation);
    window.clearTimeout(this.settledTimer);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.earth.dispose();
    this.aircraft.dispose();
    this.satellites.dispose();
    this.weather.dispose();
    this.airports.dispose();
    this.space.dispose();
    this.atmosphere.geometry.dispose();
    this.atmosphereMaterial.dispose();
    this.overlay.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export type { CameraSnapshot, MapStyle, ColorMode };
