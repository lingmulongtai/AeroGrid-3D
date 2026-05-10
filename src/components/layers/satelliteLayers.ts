import { PathLayer, TextLayer } from '@deck.gl/layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import type { SatelliteInfo, SatelliteGroup } from '../../hooks/useSatelliteData';
import { SATELLITE_COLORS, SATELLITE_RADII } from '../../hooks/useSatelliteData';
import { createSatelliteGeometry } from './modelGeometries';

const SATELLITE_GEOMETRY = createSatelliteGeometry();

export function createSatelliteLayers({
  satellites,
  activeGroups,
  showLabels,
  showTrails,
  trailsById,
  onSatelliteClick,
}: {
  satellites: SatelliteInfo[];
  activeGroups: Set<SatelliteGroup>;
  showLabels: boolean;
  showTrails: boolean;
  trailsById: Map<string, [number, number, number][]>;
  onSatelliteClick: (s: SatelliteInfo) => void;
}) {
  const layers: any[] = [];
  const groups: SatelliteGroup[] = ['stations', 'starlink', 'weather', 'gps', 'active'];

  for (const group of groups) {
    if (group !== 'stations' && !activeGroups.has(group)) continue;
    const groupSats = satellites.filter((s) => s.group === group);
    if (groupSats.length === 0) continue;

    layers.push(
      new SimpleMeshLayer<SatelliteInfo>({
        id: `satellite-models-${group}`,
        data: groupSats,
        mesh: SATELLITE_GEOMETRY,
        getPosition: (d) => [d.longitude, d.latitude, d.altitude],
        getColor: SATELLITE_COLORS[group],
        getOrientation: (d) => [0, ((d.longitude + d.latitude) * 3) % 360, d.group === 'stations' ? 12 : 0],
        getScale: (d) => {
          const base = Math.max(600, SATELLITE_RADII[d.group] / 18);
          return [base, base, base];
        },
        material: {
          ambient: 0.5,
          diffuse: 0.55,
          shininess: 42,
          specularColor: [160, 190, 255],
        },
        pickable: true,
        onClick: ({ object }: any) => object && onSatelliteClick(object),
      }),
    );
  }

  if (showTrails) {
    const trails = satellites
      .map((s) => ({ sat: s, path: trailsById.get(s.id) ?? [] }))
      .filter((x) => x.path.length > 1);

    layers.push(
      new PathLayer<{ sat: SatelliteInfo; path: [number, number, number][] }>({
        id: 'satellite-trails',
        data: trails,
        getPath: (d) => d.path,
        getColor: (d) => {
          const c = SATELLITE_COLORS[d.sat.group];
          return [c[0], c[1], c[2], 120];
        },
        getWidth: 2,
        widthUnits: 'pixels',
      }),
    );
  }

  if (showLabels) {
    layers.push(
      new TextLayer<SatelliteInfo>({
        id: 'satellite-labels',
        data: satellites.filter((s) => s.isISS),
        getPosition: (d) => [d.longitude, d.latitude, d.altitude],
        getText: (d) => (d.name.toUpperCase().includes('ISS') ? 'ISS' : d.name),
        getSize: 12,
        getColor: [120, 255, 180, 230],
        billboard: true,
        getPixelOffset: [0, -16],
      }),
    );
  }

  return layers;
}
