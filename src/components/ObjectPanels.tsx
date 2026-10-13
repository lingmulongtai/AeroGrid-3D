import { Crosshair, MapPin, Orbit, Satellite, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import type { Airport } from '../data/airports';
import { satelliteState, type SatelliteRecord } from '../data/satellites';
import type { Locale, MessageKey, Translator } from '../i18n';
import type { PublicCamera, ShipRecord } from '../../shared/live';

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd>{detail && <small>{detail}</small>}</div>;
}

function Shell({ label, icon, kicker, title, subtitle, onClose, children, t }: {
  label: string; icon: ReactNode; kicker: string; title: string; subtitle: string; onClose: () => void; children: ReactNode; t: Translator;
}) {
  return (
    <motion.aside
      className="flight-panel"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      aria-label={label}
    >
      <div className="flight-panel-heading">
        <span className="flight-symbol">{icon}</span>
        <div><small>{kicker}</small><h2>{title}</h2><p>{subtitle}</p></div>
        <button type="button" onClick={onClose} aria-label={t('controls.close')}><X /></button>
      </div>
      {children}
    </motion.aside>
  );
}

export function ShipPanel({ ship, onClose, t }: { ship: ShipRecord; onClose: () => void; t: Translator }) {
  return <Shell label={ship.name} icon={<MapPin />} kicker={t('data.ships')} title={ship.name} subtitle={ship.source} onClose={onClose} t={t}>
    <dl className="flight-metrics">
      <Metric label="MMSI" value={ship.id} />
      <Metric label={t('flight.speed')} value={`${ship.speedKnots.toFixed(1)} kt`} />
      <Metric label={t('flight.heading')} value={`${ship.heading.toFixed(0)}°`} />
      <Metric label={t('airport.position')} value={`${ship.latitude.toFixed(4)}°, ${ship.longitude.toFixed(4)}°`} />
      <Metric label={t('flight.lastSeen')} value={`${ship.receivedAt.replace('T', ' ')} UTC`} />
    </dl>
  </Shell>;
}
export function CameraPanel({ camera, onClose, t }: { camera: PublicCamera; onClose: () => void; t: Translator }) {
  const [failed, setFailed] = useState(false);
  return <Shell label={camera.name} icon={<MapPin />} kicker={t('data.cameras')} title={camera.name} subtitle={camera.source === 'youtube' ? t('data.youtube') : t('data.stills')} onClose={onClose} t={t}>
    {camera.videoId ? <iframe className="public-camera-video" src={`https://www.youtube-nocookie.com/embed/${camera.videoId}`} title={camera.name} allow="encrypted-media; picture-in-picture" allowFullScreen />
      : failed ? <p role="status">{t('data.imageFailed')}</p> : <img className="public-camera-image" src={`${camera.imageUrl}?t=${Math.floor(Date.now() / 600_000)}`} alt={camera.name} onError={() => setFailed(true)} />}
    <div className="flight-panel-actions"><a href={camera.pageUrl} target="_blank" rel="noreferrer">{t('data.openSource')}</a></div>
  </Shell>;
}

export function SatellitePanel({ satellite, tracked, locale, onClose, onToggleTrack, t }: {
  satellite: SatelliteRecord; tracked: boolean; locale: Locale; onClose: () => void; onToggleTrack: () => void; t: Translator;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const state = satelliteState(satellite, now);
  const number = new Intl.NumberFormat(locale === 'ja' ? 'ja-JP' : 'en-US', { maximumFractionDigits: 1 });
  const period = satellite.periodMinutes >= 120 ? `${number.format(satellite.periodMinutes / 60)} h` : `${number.format(satellite.periodMinutes)} min`;
  return (
    <Shell
      label={satellite.name}
      icon={<Satellite />}
      kicker={t(`satellite.category.${satellite.category}` as MessageKey)}
      title={satellite.name}
      subtitle={satellite.elements ? t('satellite.prediction', { value: `${satellite.elements.EPOCH.replace('T', ' ')} UTC` }) : t('satellite.simulated')}
      onClose={onClose}
      t={t}
    >
      <dl className="flight-metrics">
        <Metric label={t('flight.altitude')} value={`${number.format(state.altitudeKm)} km`} />
        <Metric label={t('flight.speed')} value={`${number.format(state.speedKmS)} km/s`} detail={`${number.format(state.speedKmS * 3600)} km/h`} />
        <Metric label={t('satellite.inclination')} value={`${number.format(satellite.inclination)}°`} />
        <Metric label={t('satellite.period')} value={period} />
        <Metric label={t('satellite.latitude')} value={`${state.latitude.toFixed(2)}°`} />
        <Metric label={t('satellite.longitude')} value={`${state.longitude.toFixed(2)}°`} />
      </dl>
      <div className="flight-panel-actions">
        <button type="button" className="track-button" aria-pressed={tracked} onClick={onToggleTrack}><Crosshair />{tracked ? t('flight.stopTracking') : t('satellite.track')}</button>
        <button type="button" onClick={onClose}><Orbit />{t('flight.dismiss')}</button>
      </div>
    </Shell>
  );
}

export function AirportPanel({ airport, onClose, onFocus, t }: {
  airport: Airport; onClose: () => void; onFocus: () => void; t: Translator;
}) {
  return (
    <Shell
      label={airport.name}
      icon={<MapPin />}
      kicker={airport.tier === 1 ? t('airport.major') : t('airport.regional')}
      title={`${airport.iata} · ${airport.city}`}
      subtitle={airport.name}
      onClose={onClose}
      t={t}
    >
      <dl className="flight-metrics">
        <Metric label="IATA" value={airport.iata} />
        <Metric label="ICAO" value={airport.icao} />
        <Metric label={t('airport.country')} value={airport.country} />
        <Metric label={t('airport.position')} value={`${airport.latitude.toFixed(3)}°, ${airport.longitude.toFixed(3)}°`} />
      </dl>
      <div className="flight-panel-actions">
        <button type="button" className="track-button" onClick={onFocus}><Crosshair />{t('airport.focus')}</button>
        <button type="button" onClick={onClose}>{t('flight.dismiss')}</button>
      </div>
    </Shell>
  );
}
