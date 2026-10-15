import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ metadata: vi.fn(), download: vi.fn(), save: vi.fn(), file: vi.fn() }));
vi.mock('@google-cloud/storage', () => ({ Storage: class { bucket() { return { file: mocks.file }; } } }));
import { BudgetConflict, cloudFlightBudgetStore } from './flightBudgetStore';

describe('aircraft Cloud Storage ledger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.file.mockReturnValue({ getMetadata: mocks.metadata, download: mocks.download, save: mocks.save });
  });
  it('reads the exact generation and conditionally replaces it without a second metadata request', async () => {
    mocks.metadata.mockResolvedValue([{ generation: '123' }]);
    mocks.download.mockResolvedValue([Buffer.from('{}')]);
    const store = cloudFlightBudgetStore('gs://private/aircraft/adsb.lol.json');
    expect(await store.read()).toEqual({ contents: '{}', generation: '123' });
    expect(mocks.file).toHaveBeenCalledWith('aircraft/adsb.lol.json', { generation: '123' });
    await store.compareAndSwap('{"count":1}', '123');
    expect(mocks.save).toHaveBeenCalledWith('{"count":1}', expect.objectContaining({ preconditionOpts: { ifGenerationMatch: '123' }, metadata: { cacheControl: 'no-store' } }));
    expect(mocks.metadata).toHaveBeenCalledTimes(1);
  });
  it('uses create-only generation zero for a missing object', async () => {
    mocks.metadata.mockRejectedValue({ code: 404 });
    const store = cloudFlightBudgetStore('gs://private/budget.json');
    expect(await store.read()).toBeNull();
    await store.compareAndSwap('{}');
    expect(mocks.save).toHaveBeenCalledWith('{}', expect.objectContaining({ preconditionOpts: { ifGenerationMatch: 0 } }));
  });
  it('distinguishes definitive conflicts from uncertain writes and access failures', async () => {
    const store = cloudFlightBudgetStore('gs://private/budget.json');
    mocks.save.mockRejectedValueOnce({ code: 412 }).mockRejectedValueOnce(new Error('timeout'));
    await expect(store.compareAndSwap('{}', '1')).rejects.toBeInstanceOf(BudgetConflict);
    await expect(store.compareAndSwap('{}', '1')).rejects.toThrow('timeout');
    expect(mocks.save).toHaveBeenCalledTimes(2);
    mocks.metadata.mockRejectedValue({ code: 403 });
    await expect(store.read()).rejects.toEqual({ code: 403 });
  });
  it('retries a generation replaced during download rather than treating the ledger as missing', async () => {
    mocks.metadata.mockResolvedValue([{ generation: '123' }]);
    mocks.download.mockRejectedValue({ code: 404 });
    await expect(cloudFlightBudgetStore('gs://private/budget.json').read()).rejects.toBeInstanceOf(BudgetConflict);
  });
  it.each(['file:///tmp/budget.json', 'gs://private/', 'gs://private/budget?alt=media'])('rejects unsafe location %s', (location) => {
    expect(() => cloudFlightBudgetStore(location)).toThrow();
  });
});
