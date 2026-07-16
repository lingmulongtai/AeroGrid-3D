import {describe, expect, it} from 'vitest';
import {IMAGERY_SOURCES} from './imagery';

describe('label-free globe imagery', () => {
  it('uses a global geographic relief source beneath every style', () => {
    expect(IMAGERY_SOURCES.globalRelief.url).toContain('/epsg4326/');
    expect(IMAGERY_SOURCES.globalRelief.layer).toBe('BlueMarble_ShadedRelief_Bathymetry');
  });

  it('does not request roads, boundaries, or place-label tiles', () => {
    const urls = JSON.stringify(IMAGERY_SOURCES).toLowerCase();
    expect(urls).not.toContain('only_labels');
    expect(urls).not.toContain('boundaries_and_places');
    expect(urls).not.toContain('openstreetmap.org');
  });
});
