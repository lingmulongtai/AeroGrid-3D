import { useState } from 'react';
import { connectSources, disconnectSources, readConnection } from '../data/connections';
import type { FlightSource } from '../../shared/live';
import type { Translator } from '../i18n';

export function DataSettings({ onChange, t }: { onChange: () => void; t: Translator }) {
  const initial = readConnection();
  const [flightSource, setFlightSource] = useState<FlightSource>(initial?.flightSource ?? 'adsb.lol');
  const [shipSource, setShipSource] = useState<'fintraffic' | 'aisstream'>(initial?.shipSource ?? 'fintraffic');
  const [rapidApiKey, setRapidApiKey] = useState('');
  const [aisStreamKey, setAisStreamKey] = useState('');
  const [message, setMessage] = useState(initial ? t('data.connected', { value: new Date(initial.expiresAt).toLocaleTimeString() }) : '');
  const [busy, setBusy] = useState(false);
  return <section className="panel-group data-settings">
    <h2>{t('data.title')}</h2>
    <form onSubmit={async (event) => {
      event.preventDefault(); setBusy(true);
      try {
        if (!window.isSecureContext) throw new Error(t('data.https'));
        const session = await connectSources({ flightSource, shipSource, ...(rapidApiKey ? { rapidApiKey } : {}), ...(aisStreamKey ? { aisStreamKey } : {}) });
        setRapidApiKey(''); setAisStreamKey('');
        setMessage(t('data.connected', { value: new Date(session.expiresAt).toLocaleTimeString() })); onChange();
      } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
    }}>
      <label className="settings-row"><span>{t('controls.flights')}</span><select value={flightSource} onChange={(e) => setFlightSource(e.target.value as FlightSource)}>
        <option value="adsb.lol">adsb.lol — {t('data.free')}</option>
        <option value="airplanes.live">Airplanes.live — {t('data.legacy')}</option>
        <option value="adsbexchange">ADS-B Exchange / RapidAPI — {t('data.paid')}</option>
      </select></label>
      {flightSource === 'adsbexchange' && <label className="settings-row"><span>RapidAPI key</span><input type="password" autoComplete="off" required value={rapidApiKey} onChange={(e) => setRapidApiKey(e.target.value)} /></label>}
      {flightSource === 'adsbexchange' && <p className="settings-hint"><a href="https://rapidapi.com/adsbx/api/adsbexchange-com1/pricing" target="_blank" rel="noreferrer">{t('data.pricing')}</a> · {t('data.paidBody')}</p>}
      <label className="settings-row"><span>{t('data.ships')}</span><select value={shipSource} onChange={(e) => setShipSource(e.target.value as 'fintraffic' | 'aisstream')}>
        <option value="fintraffic">Fintraffic — {t('data.finland')}</option>
        <option value="aisstream">AISStream — {t('data.freeKey')}</option>
      </select></label>
      {shipSource === 'aisstream' && <>
        <label className="settings-row"><span>AISStream key</span><input type="password" autoComplete="off" required value={aisStreamKey} onChange={(e) => setAisStreamKey(e.target.value)} /></label>
        <p className="settings-hint"><a href="https://aisstream.io/" target="_blank" rel="noreferrer">{t('data.getKey')}</a> · {t('data.aisBody')}</p>
      </>}
      <p className="settings-hint">{t('data.keyPrivacy')}</p>
      <div className="data-actions"><button type="submit" disabled={busy}>{t('data.connect')}</button><button type="button" disabled={busy} onClick={async () => { await disconnectSources(); setMessage(''); onChange(); }}>{t('data.disconnect')}</button></div>
      {message && <p role="status" className="settings-hint">{message}</p>}
    </form>
  </section>;
}
