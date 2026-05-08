import { useEffect, useMemo, useRef, useState } from 'react';
import {
  POWER_LINES,
  POWER_PLANTS,
  SUBSEA_CABLES,
  SUBSTATIONS,
  type PowerLine,
  type PowerPlant,
  type PowerPlantKind,
  type SubseaCable,
  type Substation,
} from '../data/demo/infra';
import type { GlobeViewState } from '../components/camera/useAdvancedGlobeCamera';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const MIN_OSM_ZOOM = 3.1;

type InfrastructurePayload = {
  powerLines: PowerLine[];
  subseaCables: SubseaCable[];
  powerPlants: PowerPlant[];
  substations: Substation[];
};

export type InfrastructureDataResult = InfrastructurePayload & {
  isLoading: boolean;
  lastUpdatedAt: number | null;
  sourceLabel: string;
};

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
};

type Bounds = {
  south: number;
  west: number;
  north: number;
  east: number;
  key: string;
  queryable: boolean;
};

const EMPTY_OSM: InfrastructurePayload = {
  powerLines: [],
  subseaCables: [],
  powerPlants: [],
  substations: [],
};

export function useInfrastructureData(enabled: boolean, viewState: GlobeViewState): InfrastructureDataResult {
  const [osmData, setOsmData] = useState<InfrastructurePayload>(EMPTY_OSM);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const cacheRef = useRef<Map<string, InfrastructurePayload>>(new Map());

  const bounds = useMemo(() => getQueryableBounds(viewState), [viewState.latitude, viewState.longitude, viewState.zoom]);

  useEffect(() => {
    if (!enabled || !bounds.queryable || viewState.zoom < MIN_OSM_ZOOM) {
      setIsLoading(false);
      return;
    }

    const cached = cacheRef.current.get(bounds.key);
    if (cached) {
      setOsmData(cached);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const payload = await fetchOverpassInfrastructure(bounds, controller.signal);
        cacheRef.current.set(bounds.key, payload);
        setOsmData(payload);
        setLastUpdatedAt(Date.now());
      } catch {
        setOsmData((prev) => prev);
      } finally {
        setIsLoading(false);
      }
    }, 650);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [bounds, enabled, viewState.zoom]);

  return useMemo(() => {
    const hasOsm = osmData.powerLines.length > 0
      || osmData.subseaCables.length > 0
      || osmData.powerPlants.length > 0
      || osmData.substations.length > 0;

    return {
      powerLines: mergeById(POWER_LINES, osmData.powerLines),
      subseaCables: mergeById(SUBSEA_CABLES, osmData.subseaCables),
      powerPlants: mergeById(POWER_PLANTS, osmData.powerPlants),
      substations: mergeById(SUBSTATIONS, osmData.substations),
      isLoading,
      lastUpdatedAt,
      sourceLabel: hasOsm ? 'OpenStreetMap + curated fallback' : 'Curated fallback',
    };
  }, [isLoading, lastUpdatedAt, osmData]);
}

function getQueryableBounds(viewState: GlobeViewState): Bounds {
  const scale = Math.max(1, Math.pow(2, viewState.zoom));
  const pitchBoost = 1 + Math.max(0, viewState.pitch ?? 0) / 85;
  const lonSpan = Math.min(58, (360 / scale) * 1.25 * pitchBoost);
  const latSpan = Math.min(38, (170 / scale) * 0.95 * pitchBoost);
  const south = clampLat(viewState.latitude - latSpan / 2);
  const north = clampLat(viewState.latitude + latSpan / 2);
  const westRaw = viewState.longitude - lonSpan / 2;
  const eastRaw = viewState.longitude + lonSpan / 2;

  if (westRaw < -180 || eastRaw > 180 || north <= south) {
    return { south, west: -180, north, east: 180, key: 'wrapped', queryable: false };
  }

  const west = clampLon(westRaw);
  const east = clampLon(eastRaw);
  const rounded = [south, west, north, east].map((n) => (Math.round(n * 2) / 2).toFixed(1));

  return {
    south,
    west,
    north,
    east,
    key: rounded.join(','),
    queryable: east > west && (east - west) * (north - south) <= 1400,
  };
}

async function fetchOverpassInfrastructure(bounds: Bounds, signal: AbortSignal): Promise<InfrastructurePayload> {
  const query = `
[out:json][timeout:12][bbox:${bounds.south.toFixed(5)},${bounds.west.toFixed(5)},${bounds.north.toFixed(5)},${bounds.east.toFixed(5)}];
(
  way["power"~"^(line|cable)$"];
  way["power"="plant"];
  relation["power"="plant"];
  node["power"~"^(plant|generator|substation)$"];
  way["power"="substation"];
  relation["power"="substation"];
);
out tags center geom;
`;

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ data: query }),
    signal,
  });

  if (!res.ok) throw new Error(`Overpass ${res.status}`);

  const json = await res.json() as { elements?: OverpassElement[] };
  return parseOverpassElements((json.elements ?? []).slice(0, 1600));
}

function parseOverpassElements(elements: OverpassElement[]): InfrastructurePayload {
  const payload: InfrastructurePayload = {
    powerLines: [],
    subseaCables: [],
    powerPlants: [],
    substations: [],
  };

  for (const el of elements) {
    const tags = el.tags ?? {};
    const power = tags.power;

    if (power === 'line') {
      const path = toPath(el);
      if (path.length > 1) {
        payload.powerLines.push({
          id: `osm-line-${el.type}-${el.id}`,
          name: tags.name || tags.ref || `${formatVoltage(tags.voltage)} line`,
          path,
          voltageKv: parseVoltageKv(tags.voltage),
          operator: tags.operator,
          infrastructureType: 'power-line',
          source: 'osm',
        });
      }
      continue;
    }

    if (power === 'cable') {
      const path = toPath(el);
      if (path.length > 1 && isSubseaCable(tags)) {
        payload.subseaCables.push({
          id: `osm-cable-${el.type}-${el.id}`,
          name: tags.name || tags.ref || `${formatVoltage(tags.voltage)} cable`,
          path,
          voltageKv: parseVoltageKv(tags.voltage),
          operator: tags.operator,
          infrastructureType: 'subsea-cable',
          source: 'osm',
        });
      }
      continue;
    }

    if (power === 'plant' || power === 'generator') {
      const center = getCenter(el);
      if (center) {
        payload.powerPlants.push({
          id: `osm-plant-${el.type}-${el.id}`,
          name: tags.name || tags.operator || `${toPlantKind(tags)} plant`,
          kind: toPlantKind(tags),
          latitude: center[1],
          longitude: center[0],
          capacityMw: parseCapacityMw(tags['plant:output:electricity'] || tags['generator:output:electricity']),
          operator: tags.operator,
          infrastructureType: 'power-plant',
          source: 'osm',
        });
      }
      continue;
    }

    if (power === 'substation') {
      const center = getCenter(el);
      if (center) {
        payload.substations.push({
          id: `osm-substation-${el.type}-${el.id}`,
          name: tags.name || tags.ref || 'Substation',
          latitude: center[1],
          longitude: center[0],
          voltageKv: parseVoltageKv(tags.voltage),
          operator: tags.operator,
          infrastructureType: 'substation',
          source: 'osm',
        });
      }
    }
  }

  return payload;
}

function toPath(el: OverpassElement): [number, number, number][] {
  return (el.geometry ?? [])
    .filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat))
    .map((p) => [p.lon, p.lat, 0] as [number, number, number]);
}

function getCenter(el: OverpassElement): [number, number] | null {
  if (Number.isFinite(el.lon) && Number.isFinite(el.lat)) return [el.lon as number, el.lat as number];
  if (el.center && Number.isFinite(el.center.lon) && Number.isFinite(el.center.lat)) {
    return [el.center.lon, el.center.lat];
  }

  const path = toPath(el);
  if (!path.length) return null;

  const sum = path.reduce(
    (acc, [lon, lat]) => [acc[0] + lon, acc[1] + lat],
    [0, 0],
  );
  return [sum[0] / path.length, sum[1] / path.length];
}

function isSubseaCable(tags: Record<string, string>): boolean {
  const joined = [
    tags.location,
    tags.name,
    tags.description,
    tags['cable:usage'],
    tags.substance,
  ].filter(Boolean).join(' ').toLowerCase();

  return /underwater|undersea|submarine|subsea|offshore|sea|marine|water/.test(joined);
}

function parseVoltageKv(value?: string): number | undefined {
  if (!value) return undefined;

  const values = value
    .split(/[;,]/)
    .map((part) => Number.parseFloat(part.replace(/[^\d.]/g, '')))
    .filter(Number.isFinite);

  if (!values.length) return undefined;
  const max = Math.max(...values);
  if (max <= 0) return undefined;
  return max > 2000 ? Math.round(max / 1000) : Math.round(max);
}

function formatVoltage(value?: string): string {
  const kv = parseVoltageKv(value);
  return kv ? `${kv} kV` : 'Power';
}

function parseCapacityMw(value?: string): number {
  if (!value) return 60;

  const n = Number.parseFloat(value.replace(/,/g, ''));
  if (!Number.isFinite(n)) return 60;

  const lower = value.toLowerCase();
  if (lower.includes('gw')) return n * 1000;
  if (lower.includes('kw')) return n / 1000;
  return n;
}

function toPlantKind(tags: Record<string, string>): PowerPlantKind {
  const raw = `${tags['generator:source'] ?? ''} ${tags['plant:source'] ?? ''} ${tags['generator:method'] ?? ''}`.toLowerCase();
  if (/nuclear/.test(raw)) return 'nuclear';
  if (/hydro|water|tidal|wave/.test(raw)) return 'hydro';
  if (/solar/.test(raw)) return 'solar';
  if (/wind/.test(raw)) return 'wind';
  if (/battery|storage/.test(raw)) return 'battery';
  if (/gas|coal|oil|diesel|thermal|biomass|waste/.test(raw)) return 'thermal';
  return 'unknown';
}

function mergeById<T extends { id: string }>(fallback: T[], live: T[]): T[] {
  if (!live.length) return fallback;
  const ids = new Set(live.map((item) => item.id));
  return [...live, ...fallback.filter((item) => !ids.has(item.id))];
}

function clampLat(value: number): number {
  return Math.max(-84.5, Math.min(84.5, value));
}

function clampLon(value: number): number {
  return Math.max(-180, Math.min(180, value));
}
