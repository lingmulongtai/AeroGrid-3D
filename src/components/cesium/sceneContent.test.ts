import {describe, expect, it} from 'vitest';
import {aircraftLodForHeight} from './sceneContent';
import {createAircraftMeshParts, createSatelliteMeshData} from '../layers/modelGeometries';

describe('Cesium 3D scene content', () => {
  it('promotes nearby aircraft from overview markers into detailed models', () => {
    expect(aircraftLodForHeight(15_500_000)).toBe('points');
    expect(aircraftLodForHeight(7_000_000)).toBe('billboards');
    expect(aircraftLodForHeight(900_000)).toBe('models');
  });

  it('uses multi-part aircraft meshes and a real 3D satellite silhouette', () => {
    const aircraft = createAircraftMeshParts();
    const satellite = createSatelliteMeshData();

    expect(Object.keys(aircraft)).toEqual([
      'airframe', 'engines', 'glazing', 'portLight', 'starboardLight',
    ]);
    expect(aircraft.airframe.vertices.length).toBeGreaterThan(1_200);
    expect(aircraft.engines.vertices.length).toBeGreaterThan(450);
    expect(satellite.vertices.length).toBeGreaterThan(100);
    expect(satellite.normals).toHaveLength(satellite.vertices.length);
  });
});
