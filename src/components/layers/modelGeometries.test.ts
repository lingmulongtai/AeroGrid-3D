import { describe, expect, it } from 'vitest';
import { createAircraftGeometries } from './modelGeometries';

describe('aircraft geometries', () => {
  it('builds a detailed multi-part aircraft instead of a flat silhouette', () => {
    const geometry = createAircraftGeometries();

    expect(geometry.airframe.getVertexCount()).toBeGreaterThan(400);
    expect(geometry.engines.getVertexCount()).toBeGreaterThan(150);
    expect(geometry.glazing.getVertexCount()).toBeGreaterThan(50);
    expect(geometry.portLight.getVertexCount()).toBe(24);
    expect(geometry.starboardLight.getVertexCount()).toBe(24);
  });

  it('provides one finite normal per generated vertex', () => {
    const geometry = createAircraftGeometries();

    for (const part of Object.values(geometry)) {
      const positions = part.getAttributes().POSITION.value;
      const normals = part.getAttributes().NORMAL.value;
      expect(normals.length).toBe(positions.length);
      expect(Array.from(normals).every(Number.isFinite)).toBe(true);
    }
  });
});
