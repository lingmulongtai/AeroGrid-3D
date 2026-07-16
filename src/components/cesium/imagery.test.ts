import {describe, expect, it} from 'vitest';
import {IMAGERY_SOURCES, mapStyleForView} from './imagery';

describe('label-free globe imagery', () => {
  it('uses a complete packaged geographic base beneath every style', () => {
    expect(IMAGERY_SOURCES.localEarth.url).toContain('NaturalEarthII');
    expect(IMAGERY_SOURCES.localEarth.url).toMatch(/\/$/);
    expect(IMAGERY_SOURCES.satellite.url).toContain('World_Imagery');
  });

  it('does not request roads, boundaries, or place-label tiles', () => {
    const urls = JSON.stringify(IMAGERY_SOURCES).toLowerCase();
    expect(urls).not.toContain('only_labels');
    expect(urls).not.toContain('boundaries_and_places');
    expect(urls).not.toContain('openstreetmap.org');
  });

  it('falls back to the complete geographic base around both poles', () => {
    expect(mapStyleForView('satellite', 35, 2_000_000)).toBe('satellite');
    expect(mapStyleForView('satellite', 68, 2_000_000)).toBe('opengrid');
    expect(mapStyleForView('dark', -90, 2_000_000)).toBe('opengrid');
    expect(mapStyleForView('satellite', 0, 8_000_000)).toBe('satellite-global');
  });
});
