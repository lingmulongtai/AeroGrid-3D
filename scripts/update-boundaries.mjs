// Rebuild the bundled, public-domain Natural Earth 1:50m linework.
import { writeFile } from 'node:fs/promises';

const revision = 'ca96624a56bd078437bca8184e78163e5039ad19';
const layers = {
  coastlines: 'ne_50m_coastline',
  borders: 'ne_50m_admin_0_boundary_lines_land',
};
const data = {};
for (const [key, name] of Object.entries(layers)) {
  const url = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${revision}/geojson/${name}.geojson`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const collection = await response.json();
  data[key] = collection.features.flatMap(({ geometry }) => {
    if (geometry.type === 'LineString') return [geometry.coordinates];
    if (geometry.type === 'MultiLineString') return geometry.coordinates;
    throw new Error(`Unexpected geometry: ${geometry.type}`);
  }).map((line) => line.map(([lon, lat]) => [Number(lon.toFixed(4)), Number(lat.toFixed(4))]));
}
await writeFile(new URL('../public/data/earth-boundaries.json', import.meta.url), JSON.stringify(data));
console.log(Object.fromEntries(Object.entries(data).map(([key, lines]) => [key, lines.reduce((sum, line) => sum + line.length, 0)])));
