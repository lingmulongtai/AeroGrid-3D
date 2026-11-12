import { expect, it } from 'vitest';
import { spacecraftModels } from '../../shared/spacecraftModels';
import { satelliteModels } from './satelliteModels';

it('bundles a model for every uniquely registered spacecraft', () => {
  const ids = spacecraftModels.flatMap((model) => model.noradIds);
  expect(new Set(ids).size).toBe(ids.length);
  for (const { slug, noradIds } of spacecraftModels) {
    for (const id of noradIds) {
      expect(satelliteModels.get(`norad-${id}`)?.url).toMatch(new RegExp(`/${slug}(?:-[\\w-]+)?\\.glb$`));
    }
  }
  expect(satelliteModels.get('iss')).toBe(satelliteModels.get('norad-25544'));
});
