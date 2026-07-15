import { ArrowDown, ArrowUp, Crosshair, Minus, Navigation, Plane, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import type { FlightRecord } from '../../shared/contracts';
import type { Locale, Translator } from '../i18n';
import { formatAltitude, formatHeading } from '../utils/flightUtils';

interface FlightInfoPanelProps {
  flight: FlightRecord;
  tracked: boolean;
  locale: Locale;
  onClose: () => void;
  onToggleTrack: () => void;
  t: Translator;
}

export function FlightInfoPanel({ flight, tracked, locale, onClose, onToggleTrack, t }: FlightInfoPanelProps) {
  const verticalRateFpm = Math.round(flight.verticalRate * 196.85);
  const VerticalIcon = verticalRateFpm > 100 ? ArrowUp : verticalRateFpm < -100 ? ArrowDown : Minus;
  const number = new Intl.NumberFormat(locale === 'ja' ? 'ja-JP' : 'en-US');

  return (
    <motion.aside
      className="flight-panel"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      aria-label={flight.callsign}
    >
      <div className="flight-panel-heading">
        <span className="flight-symbol"><Plane /></span>
        <div><small>{flight.aircraftType ?? t('flight.unknown')}</small><h2>{flight.callsign}</h2><p>{flight.registration ?? flight.id.toUpperCase()}</p></div>
        <button type="button" onClick={onClose} aria-label={t('controls.close')}><X /></button>
      </div>

      <dl className="flight-metrics">
        <Metric label={t('flight.altitude')} value={formatAltitude(flight.altitude)} detail={`${number.format(Math.round(flight.altitude * 3.28084))} ft`} />
        <Metric label={t('flight.speed')} value={`${number.format(Math.round(flight.velocity * 1.94384))} kt`} detail={`${number.format(Math.round(flight.velocity * 3.6))} km/h`} />
        <Metric label={t('flight.heading')} value={formatHeading(flight.heading)} icon={<Navigation style={{ transform: `rotate(${flight.heading}deg)` }} />} />
        <Metric label={t('flight.verticalRate')} value={`${verticalRateFpm > 0 ? '+' : ''}${number.format(verticalRateFpm)} ft/min`} icon={<VerticalIcon />} />
        <Metric label={t('flight.lastSeen')} value={t('flight.secondsAgo', { value: flight.lastSeenSeconds.toFixed(1) })} />
        <Metric label={t('flight.registration')} value={flight.registration ?? t('flight.unknown')} />
      </dl>

      <div className="flight-panel-actions">
        <button type="button" className="track-button" aria-pressed={tracked} onClick={onToggleTrack}><Crosshair />{tracked ? t('flight.stopTracking') : t('flight.track')}</button>
        <button type="button" onClick={onClose}>{t('flight.dismiss')}</button>
      </div>
    </motion.aside>
  );
}

function Metric({ label, value, detail, icon }: { label: string; value: string; detail?: string; icon?: ReactNode }) {
  return (
    <div><dt>{label}</dt><dd>{icon}{value}</dd>{detail && <small>{detail}</small>}</div>
  );
}
