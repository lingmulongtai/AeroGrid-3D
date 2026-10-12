import * as Astronomy from 'astronomy-engine';
import { Matrix4, Vector3 } from 'three';

const AU_KM = 149_597_870.7;

export interface CelestialState {
  /** Rotates J2000 equatorial (EQJ) vectors into the Earth-fixed world frame. */
  celestialToWorld: Matrix4;
  /** Unit vector from the Earth's centre towards the Sun (world frame). */
  sunDirection: Vector3;
  /** Geocentric Moon position in km (world frame). */
  moonPosition: Vector3;
  /** Greenwich apparent sidereal angle in radians. */
  siderealAngle: number;
}

// Earth-fixed (ECEF: X=0°E, Y=90°E, Z=north) -> world (x=Y, y=Z, z=X).
function ecefToWorld(x: number, y: number, z: number, target: Vector3): Vector3 {
  return target.set(y, z, x);
}

export function siderealAngle(date: Date): number {
  return (Astronomy.SiderealTime(Astronomy.MakeTime(date)) / 24) * Math.PI * 2;
}

export function computeCelestialState(date: Date): CelestialState {
  const time = Astronomy.MakeTime(date);
  const precession = Astronomy.Rotation_EQJ_EQD(time);
  const theta = (Astronomy.SiderealTime(time) / 24) * Math.PI * 2;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const toWorld = (vector: Astronomy.Vector, target: Vector3) => {
    const ofDate = Astronomy.RotateVector(precession, vector);
    return ecefToWorld(
      cos * ofDate.x + sin * ofDate.y,
      -sin * ofDate.x + cos * ofDate.y,
      ofDate.z,
      target,
    );
  };

  const basis = [new Vector3(), new Vector3(), new Vector3()];
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(([x, y, z], index) => {
    toWorld(new Astronomy.Vector(x, y, z, time), basis[index]);
  });
  const celestialToWorld = new Matrix4().makeBasis(basis[0], basis[1], basis[2]);

  const sun = Astronomy.GeoVector(Astronomy.Body.Sun, time, true);
  const sunDirection = toWorld(sun, new Vector3()).normalize();
  const moon = Astronomy.GeoMoon(time);
  const moonPosition = toWorld(moon, new Vector3()).multiplyScalar(AU_KM);

  return { celestialToWorld, sunDirection, moonPosition, siderealAngle: theta };
}

/** J2000 right ascension / declination (degrees) to a unit vector in the EQJ frame. */
export function raDecToVector(raDeg: number, decDeg: number, target = new Vector3()): Vector3 {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  return target.set(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
}

/** B-V colour index to an approximate stellar RGB colour. */
export function colorIndexToRgb(bv: number): [number, number, number] {
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  const k = t / 100;
  let r: number;
  let g: number;
  let b: number;
  if (k <= 66) {
    r = 255;
    g = 99.47 * Math.log(k) - 161.12;
    b = k <= 19 ? 0 : 138.52 * Math.log(k - 10) - 305.04;
  } else {
    r = 329.7 * (k - 60) ** -0.1332;
    g = 288.12 * (k - 60) ** -0.0755;
    b = 255;
  }
  const clamp = (value: number) => Math.max(0, Math.min(255, value)) / 255;
  return [clamp(r), clamp(g), clamp(b)];
}
