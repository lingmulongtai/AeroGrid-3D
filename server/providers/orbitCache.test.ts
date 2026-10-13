import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ metadata: vi.fn(), download: vi.fn(), save: vi.fn(), file: vi.fn() }));
vi.mock('@google-cloud/storage', () => ({ Storage: class { bucket() { return { file: mocks.file }; } } }));
import { CacheConflict, orbitCacheStore } from './orbitCache';

describe('Cloud Storage orbital cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.file.mockReturnValue({ getMetadata: mocks.metadata, download: mocks.download, save: mocks.save });
  });
  it('reads a specific generation and guards both initial and replacement writes', async () => {
    const store = orbitCacheStore('gs://aerogrid-cache/orbits.json');
    mocks.metadata.mockResolvedValue([{ generation: '123' }]);
    mocks.download.mockResolvedValue([Buffer.from('{"fetchedAt":1}')]);
    expect(await store.read()).toEqual({ contents: '{"fetchedAt":1}', version: '123' });
    expect(mocks.file).toHaveBeenCalledWith('orbits.json', { generation: '123' });
    await store.write('{}');
    expect(mocks.save).toHaveBeenLastCalledWith('{}', expect.objectContaining({ preconditionOpts: { ifGenerationMatch: 0 } }));
    await store.write('{}', '123');
    expect(mocks.save).toHaveBeenLastCalledWith('{}', expect.objectContaining({ preconditionOpts: { ifGenerationMatch: '123' } }));
  });
  it('distinguishes a missing cache from missing permission or a concurrent writer', async () => {
    const store = orbitCacheStore('gs://aerogrid-cache/orbits.json');
    mocks.metadata.mockRejectedValueOnce({ code: 404 }).mockRejectedValueOnce({ code: 403 });
    expect(await store.read()).toBeNull();
    await expect(store.read()).rejects.toMatchObject({ code: 403 });
    mocks.save.mockRejectedValue({ code: 412 });
    await expect(store.write('{}', '123')).rejects.toBeInstanceOf(CacheConflict);
  });
});
