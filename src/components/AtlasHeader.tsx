import { LoaderCircle, Radio } from 'lucide-react';
import type { AppMode, DataSnapshot, FlightRecord, SourceStatus } from '../../shared/contracts';
import type { Locale, MessageKey, Translator } from '../i18n';

interface AtlasHeaderProps {
  mode: AppMode;
  snapshot: DataSnapshot<FlightRecord>;
  count: number;
  loading: boolean;
  locale: Locale;
  t: Translator;
  autoRefreshPaused: boolean;
  onResume: () => void;
}

const STATUS_KEYS: Record<SourceStatus, MessageKey> = {
  available: 'status.available',
  stale: 'status.stale',
  'rate-limited': 'status.rate-limited',
  unavailable: 'status.unavailable',
};

/** Data-freshness status pill pinned to the top-right corner. */
export function AtlasHeader({ mode, snapshot, count, loading, locale, t, autoRefreshPaused, onResume }: AtlasHeaderProps) {
  const updated = new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC',
  }).format(new Date(snapshot.generatedAt));
  const budgetWaiting = mode === 'live-beta' && snapshot.reason === 'budget-paced';

  return (
    <header className="source-status" data-status={budgetWaiting ? 'rate-limited' : snapshot.status}>
      <div className="source-status-summary">
        <span className="mode-badge">{mode === 'demo' ? t('mode.demo') : t('mode.live')}</span>
        <span className="status-indicator" aria-hidden="true" />
        <span className="status-label">{mode === 'demo' ? t('mode.demo') : budgetWaiting ? t('status.budget-paced') : t(STATUS_KEYS[snapshot.status])}</span>
        <span className="status-divider" />
        <span className="status-count"><Radio aria-hidden="true" /> {count.toLocaleString(locale)} </span>
        <span className="status-time">{t('status.updated', { value: `${updated} UTC` })}</span>
        {loading && <LoaderCircle className="status-spinner" aria-label={t('status.loading')} />}
      </div>
      {mode === 'live-beta' && autoRefreshPaused && (
        <span className="auto-refresh-pause" role="status">
          <span>{t('status.autoRefreshPaused')}</span>
          <button type="button" onClick={onResume}>{t('status.resume')}</button>
        </span>
      )}
    </header>
  );
}
