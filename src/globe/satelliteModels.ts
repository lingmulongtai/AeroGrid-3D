import { Mesh, MeshStandardMaterial, Texture, type Group } from 'three';
import { spacecraftModels } from '../../shared/spacecraftModels';

const modelUrls = import.meta.glob<string>('./assets/*.glb', { query: '?url', import: 'default', eager: true });
export const satelliteModels = new Map<string, { url: string; spanMeters?: number }>();
for (const { slug, noradIds, spanMeters } of spacecraftModels) {
  const url = modelUrls[`./assets/${slug}.glb`];
  if (!url) continue;
  const model = { url, spanMeters };
  for (const id of noradIds) satelliteModels.set(`norad-${id}`, model);
  if (slug === 'iss') satelliteModels.set('iss', model);
}

export async function loadSatelliteModel(url: string): Promise<Group> {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { scene } = await new GLTFLoader().loadAsync(url);
  scene.traverse((object) => {
    if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
    const material = object.material;
    material.emissive.copy(material.color);
    material.emissiveMap = material.map;
    material.emissiveIntensity = 0.22;
  });
  return scene;
}

export function disposeSatelliteModel(scene: Group) {
  const geometries = new Set<Mesh['geometry']>();
  const materials = new Set<MeshStandardMaterial>();
  const textures = new Set<Texture>();
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    if (object.material instanceof MeshStandardMaterial) materials.add(object.material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) textures.add(value);
    }
    material.dispose();
  }
  const bitmaps = new Set<ImageBitmap>();
  for (const texture of textures) {
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) bitmaps.add(texture.image);
    texture.dispose();
  }
  for (const bitmap of bitmaps) bitmap.close();
}
