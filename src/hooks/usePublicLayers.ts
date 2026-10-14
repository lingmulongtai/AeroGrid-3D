import { useEffect, useRef, useState } from 'react';
import type { AppMode, DataSnapshot, RadiusCoverage } from '../../shared/contracts';
import type { CloudProfile, OrbitalElements, PublicCamera, ShipRecord } from '../../shared/live';
import type { LayerVisibility } from '../types/layers';
import { connectionHeaders, readConnection } from '../data/connections';
import { areaIntersectsBounds, FINTRAFFIC_CAMERA_BOUNDS, FINTRAFFIC_SHIP_BOUNDS } from '../../shared/geography';
import { useLivePolling } from './useLivePolling';

function empty<T>(source: string): DataSnapshot<T> {
  const now = new Date().toISOString();
  return { mode: 'live-beta', source, status: 'unavailable', generatedAt: now, expiresAt: now, coverage: { kind: 'global' }, items: [] };
}
function useLayer<T>(mode: AppMode | null, enabled: boolean, url: string, source: string, refreshToken: number, intervalMs: number, catalog = false, outside = false, coverage?: RadiusCoverage) {
  const [snapshot, setSnapshot] = useState<DataSnapshot<T>>(() => empty(source));
  const current = useRef({ snapshot, url });
  const validator = useRef<{ url: string; etag: string | null }>({ url, etag: null });
  const publish = (value: DataSnapshot<T>) => { current.current = { snapshot: value, url }; setSnapshot(value); };
  useEffect(() => {
    if (mode !== 'live-beta' || !enabled || outside) {
      validator.current = { url, etag: null };
      publish(outside && mode === 'live-beta' ? { ...empty<T>(source), status: 'available', reason: 'outside-coverage', coverage: coverage!, message: 'Outside Fintraffic coverage' } : empty(source));
    }
  }, [mode, enabled, outside, source, url, coverage?.center.latitude, coverage?.center.longitude, coverage?.radiusNm]);
  const load = async (signal: AbortSignal) => {
      try {
        const response = await fetch(url, { signal, headers: catalog ? {} : connectionHeaders() });
        if (response.status === 304) return;
        if (!response.ok) throw new Error(response.status === 401 ? 'Connection expired; reconnect in settings' : `HTTP ${response.status}`);
        const value = await response.json() as DataSnapshot<T>;
        if (value.mode !== 'live-beta' || value.source === 'demo' || !Array.isArray(value.items)) throw new Error('Invalid live data');
        if (!signal.aborted) {
          const etag = response.headers.get('ETag');
          const sameScope = current.current.url === url;
          const sameETag = etag !== null && validator.current.url === url && etag === validator.current.etag;
          validator.current = { url, etag };
          const previous = current.current.snapshot;
          const sameMetadata = previous.status === value.status && previous.source === value.source
            && previous.expiresAt === value.expiresAt && previous.message === value.message;
          const sameGeneration = previous.generatedAt === value.generatedAt && previous.items.length === value.items.length;
          if (catalog && sameScope && sameMetadata && (sameETag || sameGeneration)) return;
          // Metadata can change (e.g. a stale warning) without rebuilding meshes.
          publish(catalog && sameScope && (sameETag || sameGeneration) ? { ...value, items: previous.items } : value);
        }
      } catch (error) {
        if (!signal.aborted) {
          validator.current = { url, etag: null };
          publish({ ...empty<T>(source), message: (error as Error).message });
        }
      }
  };
  useLivePolling(load, mode === 'live-beta' && enabled && !outside, intervalMs, `${url}:${refreshToken}`);
  return snapshot;
}
export function usePublicLayers(mode: AppMode | null, coverage: RadiusCoverage, layers: LayerVisibility, refreshToken: number, maxSatellites: number) {
  const params = new URLSearchParams({ lat: String(coverage.center.latitude), lon: String(coverage.center.longitude), radius_nm: String(coverage.radiusNm) });
  const query = { latitude: coverage.center.latitude, longitude: coverage.center.longitude, radiusNm: coverage.radiusNm };
  const shipSource = readConnection()?.shipSource === 'aisstream' ? 'aisstream' : 'fintraffic';
  const shipsOutside = shipSource === 'fintraffic' && !areaIntersectsBounds(query, FINTRAFFIC_SHIP_BOUNDS);
  const camerasOutside = !areaIntersectsBounds(query, FINTRAFFIC_CAMERA_BOUNDS);
  const orbits = useLayer<OrbitalElements>(mode, layers.satellites, `/api/v1/satellites?limit=${maxSatellites}`, 'celestrak', 0, 10 * 60_000, true);
  const clouds = useLayer<CloudProfile>(mode, layers.weather, `/api/v1/clouds?${params}`, 'open-meteo-gfs', refreshToken, 5 * 60_000);
  const ships = useLayer<ShipRecord>(mode, layers.ships, `/api/v1/ships?${params}`, shipSource, refreshToken, 60_000, false, shipsOutside, coverage);
  const cameras = useLayer<PublicCamera>(mode, layers.cameras, `/api/v1/cameras?${params}`, 'fintraffic', 0, 60 * 60_000, true, camerasOutside, coverage);
  return { orbits, clouds, ships, cameras };
}
