import { useEffect, useRef } from 'react';
import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  LineBasicMaterial,
  LineLoop,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';
import { DEG, lonLatToVector } from '../globe/geo';

interface MiniGlobeProps {
  longitude: number;
  latitude: number;
  range: number;
  heading: number;
  label: string;
}

const SIZE = 132;

/** A small north-up overview globe showing where the main camera is looking. */
export function MiniGlobe({ longitude, latitude, range, heading, label }: MiniGlobeProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{ render: (lon: number, lat: number, range: number, heading: number) => void } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(SIZE, SIZE);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(26, 1, 0.1, 100);
    camera.position.set(0, 0, 4.6);
    const globe = new Group();
    scene.add(globe);

    const texture = new TextureLoader().load('/textures/earth-day-small.jpg', () => draw());
    texture.colorSpace = SRGBColorSpace;
    const earth = new Mesh(new SphereGeometry(1, 64, 32), new MeshBasicMaterial({ map: texture, color: new Color(0.92, 0.95, 1) }));
    earth.rotation.y = -Math.PI / 2;
    globe.add(earth);

    const halo = new Mesh(new SphereGeometry(1.12, 48, 24), new ShaderMaterial({
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vN; void main(){ float r = pow(1.0 - abs(vN.z), 3.0); gl_FragColor = vec4(vec3(0.3,0.75,1.0) * r * 1.4, r); }',
      side: BackSide,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    }));
    scene.add(halo);

    const footprintMaterial = new LineBasicMaterial({ color: new Color(1, 0.82, 0.3), transparent: true, opacity: 0.95 });
    const footprint = new LineLoop(new BufferGeometry(), footprintMaterial);
    globe.add(footprint);
    const marker = new Mesh(new SphereGeometry(0.035, 12, 8), new MeshBasicMaterial({ color: new Color(1, 0.86, 0.35) }));
    globe.add(marker);

    let current = { lon: longitude, lat: latitude, range, heading };
    const draw = () => {
      const { lon, lat } = current;
      // Rotate the Earth so the viewed point faces the camera with north up.
      globe.rotation.set(0, 0, 0);
      globe.rotateX(lat * DEG);
      globe.rotateY(-lon * DEG);
      const center = lonLatToVector(lon, lat, 0).normalize();
      marker.position.copy(center).multiplyScalar(1.01);
      const angular = Math.min(Math.PI / 2.1, Math.max(0.012, Math.atan(current.range / 6371) * 0.62));
      const east = new Vector3(Math.cos(lon * DEG), 0, -Math.sin(lon * DEG));
      const north = new Vector3().crossVectors(center, east).normalize();
      const points: Vector3[] = [];
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const direction = east.clone().multiplyScalar(Math.cos(a)).addScaledVector(north, Math.sin(a));
        points.push(center.clone().multiplyScalar(Math.cos(angular)).addScaledVector(direction, Math.sin(angular)).multiplyScalar(1.012));
      }
      footprint.geometry.dispose();
      footprint.geometry = new BufferGeometry().setFromPoints(points);
      renderer.render(scene, camera);
    };
    stateRef.current = {
      render: (lon, lat, nextRange, nextHeading) => {
        current = { lon, lat, range: nextRange, heading: nextHeading };
        draw();
      },
    };
    draw();
    return () => {
      stateRef.current = null;
      texture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    stateRef.current?.render(longitude, latitude, range, heading);
  }, [longitude, latitude, range, heading]);

  return (
    <div className="mini-globe" title={label} aria-label={label} role="img">
      <div ref={hostRef} className="mini-globe-canvas" />
      <span className="mini-globe-coords">
        {Math.abs(latitude).toFixed(1)}°{latitude >= 0 ? 'N' : 'S'} · {Math.abs(longitude).toFixed(1)}°{longitude >= 0 ? 'E' : 'W'}
      </span>
    </div>
  );
}
