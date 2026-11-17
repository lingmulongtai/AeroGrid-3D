import { describe, expect, it } from 'vitest';
import { fetchFintrafficShips, fetchPublicCameras } from './fintraffic';
const now = Date.UTC(2026, 9, 13, 6);
describe('public maritime observations', () => {
  it('filters AIS using epoch milliseconds instead of AIS seconds-of-minute', async () => {
    const feature = (id: number, time: number) => ({ geometry: { coordinates: [25, 60] }, properties: { mmsi: id, timestamp: 44, timestampExternal: time, sog: 4, heading: 90 } });
    const ships = await fetchFintrafficShips(async () => Response.json({ features: [feature(230123456, now - 1000), feature(230654321, now - 6 * 60_000)] }), now);
    expect(ships).toHaveLength(1); expect(ships[0].receivedAt).toBe(new Date(now - 1000).toISOString());
  });
});

// A malformed provider row must not hide the other live observations.
describe('malformed Fintraffic records', () => {
  const ship = { geometry: { coordinates: [25, 60] }, properties: { mmsi: 230123456, timestampExternal: now, sog: 4, heading: 90 } };
  it('keeps valid ships when adjacent rows have malformed coordinates or properties', async () => {
    const ships = await fetchFintrafficShips(async () => Response.json({ features: [null, {}, { geometry: { coordinates: {} } }, { ...ship, geometry: { coordinates: [181, 60] } }, ship] }), now);
    expect(ships).toHaveLength(1);
    expect(ships[0].id).toBe('230123456');
  });
  it('rejects missing vessel identities and normalizes invalid motion values', async () => {
    const ships = await fetchFintrafficShips(async () => Response.json({ features: [
      { ...ship, properties: { ...ship.properties, mmsi: undefined } },
      { ...ship, properties: { ...ship.properties, heading: -1, cog: 120, sog: -2 } },
    ] }), now);
    expect(ships).toHaveLength(1);
    expect(ships[0]).toMatchObject({ heading: 120, speedKnots: 0 });
  });
});


describe('public camera input validation', () => {
  const camera = { geometry: { coordinates: [25, 60] }, properties: { id: 'C12345', name: 'Road camera', presets: [{ id: 'C1234501' }] } };
  it('retains valid cameras alongside malformed rows and preset lists', async () => {
    const cameras = await fetchPublicCameras(async () => Response.json({ features: [
      null, { ...camera, geometry: { coordinates: {} } },
      { ...camera, properties: { ...camera.properties, presets: {} } },
      { ...camera, properties: { ...camera.properties, presets: [null, { id: 'invalid' }] } },
      { ...camera, geometry: { coordinates: [25, -91] } },
      { ...camera, properties: { ...camera.properties, presets: [null, ...camera.properties.presets] } },
    ] }));
    expect(cameras).toHaveLength(1);
    expect(cameras[0]).toMatchObject({ id: 'C12345', imageUrl: 'https://weathercam.digitraffic.fi/C1234501.jpg' });
  });
  it('reports malformed top-level payloads as provider errors', async () => {
    await expect(fetchFintrafficShips(async () => Response.json(null), now)).rejects.toThrow('invalid vessel data');
    await expect(fetchPublicCameras(async () => Response.json(null))).rejects.toThrow('invalid camera data');
  });
});
