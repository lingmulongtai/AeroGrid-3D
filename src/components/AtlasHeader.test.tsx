import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtlasHeader } from './AtlasHeader';
import { translate, type Locale } from '../i18n';
import type { DataSnapshot, FlightRecord } from '../../shared/contracts';
const snapshot: DataSnapshot<FlightRecord> = { mode: 'live-beta', source: 'adsb.lol', status: 'unavailable', generatedAt: '2026-10-15T00:00:00Z', expiresAt: '2026-10-15T00:01:00Z', coverage: { kind: 'global' }, items: [] };
afterEach(cleanup);
describe('aircraft auto-refresh status', () => {
  it.each(['en', 'ja'] as Locale[])('announces the pause and provides an accessible resume button in %s', (locale) => {
    const resume = vi.fn();
    render(<AtlasHeader mode="live-beta" snapshot={snapshot} count={0} loading={false} locale={locale} t={(key, values) => translate(locale, key, values)} autoRefreshPaused onResume={resume} />);
    expect(screen.getByRole('status')).toHaveTextContent(translate(locale, 'status.autoRefreshPaused'));
    fireEvent.click(screen.getByRole('button', { name: translate(locale, 'status.resume') }));
    expect(resume).toHaveBeenCalledTimes(1);
  });
  it('does not show the live pause in Demo', () => {
    render(<AtlasHeader mode="demo" snapshot={snapshot} count={0} loading={false} locale="en" t={(key, values) => translate('en', key, values)} autoRefreshPaused onResume={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
  });
});
