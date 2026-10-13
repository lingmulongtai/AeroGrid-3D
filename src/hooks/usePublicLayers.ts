import { useEffect, useState } from 'react';
import type { AppMode, DataSnapshot, RadiusCoverage } from '../../shared/contracts';
import type { CloudProfile, OrbitalElements, PublicCamera, ShipRecord } from '../../shared/live';
import type { LayerVisibility } from '../types/layers';
import { connectionHeaders } from '../data/connections';

function empty<T>(source: string): DataSnapshot<T> {
  const now = new Date().toISOString();
  return { mode: 'live-beta', source, status: 'unavailable', generatedAt: now, expiresAt: now, coverage: { kind: 'global' }, items: [] };
}
function useLayer<T>(mode: AppMode | null, enabled: boolean, url: string, source: string, refreshToken: number, intervalMs: number) {
  const [snapshot, setSnapshot] = useState<DataSnapshot<T>>(() => empty(source));
  useEffect(() => {
    if (mode !== 'live-beta' || !enabled) { setSnapshot(empty(source)); return; }
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(url, { signal: controller.signal, headers: connectionHeaders() });
        if (!response.ok) throw new Error(response.status === 401 ? 'Connection expired; reconnect in settings' : `HTTP ${response.status}`);
        const value = await response.json() as DataSnapshot<T>;
        if (value.mode !== 'live-beta' || value.source === 'demo' || !Array.isArray(value.items)) throw new Error('Invalid live data');
        if (!controller.signal.aborted) setSnapshot(value);
      } catch (error) {
        if (!controller.signal.aborted) setSnapshot({ ...empty<T>(source), message: (error as Error).message });
      }
    };
    void load();
    const interval = window.setInterval(() => { void load(); }, intervalMs);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [mode, enabled, url, source, refreshToken, intervalMs]);
  return snapshot;
}
export function usePublicLayers(mode: AppMode | null, coverage: RadiusCoverage, layers: LayerVisibility, refreshToken: number) {
  const params = new URLSearchParams({ lat: String(coverage.center.latitude), lon: String(coverage.center.longitude), radius_nm: String(coverage.radiusNm) });
  const orbits = useLayer<OrbitalElements>(mode, layers.satellites, '/api/v1/satellites', 'celestrak', refreshToken, 10 * 60_000);
  const clouds = useLayer<CloudProfile>(mode, layers.weather, `/api/v1/clouds?${params}`, 'open-meteo-gfs', refreshToken, 5 * 60_000);
  const ships = useLayer<ShipRecord>(mode, layers.ships, `/api/v1/ships?${params}`, 'fintraffic', refreshToken, 30_000);
  const cameras = useLayer<PublicCamera>(mode, layers.cameras, '/api/v1/cameras', 'fintraffic', refreshToken, 60 * 60_000);
  return { orbits, clouds, ships, cameras };
}
