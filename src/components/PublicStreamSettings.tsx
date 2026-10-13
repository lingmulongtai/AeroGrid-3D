import { useState } from 'react';
import { clearPublicStreams, savePublicStream } from '../data/publicStreams';
import type { Translator } from '../i18n';
export function PublicStreamSettings({ onChange, t }: { onChange: () => void; t: Translator }) {
  const [url, setUrl] = useState(''), [name, setName] = useState('');
  const [latitude, setLatitude] = useState(''), [longitude, setLongitude] = useState('');
  const [message, setMessage] = useState('');
  return <section className="panel-group data-settings"><h2>{t('data.youtube')}</h2>
    <p className="settings-hint">{t('data.youtubeBody')}</p>
    <form onSubmit={(event) => {
      event.preventDefault();
      try { savePublicStream(url, name, Number(latitude), Number(longitude)); onChange(); setUrl(''); setMessage(t('data.streamAdded')); }
      catch { setMessage(t('data.streamInvalid')); }
    }}>
      <label className="settings-row"><span>YouTube URL</span><input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} /></label>
      <label className="settings-row"><span>{t('data.name')}</span><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
      <label className="settings-row"><span>{t('satellite.latitude')}</span><input type="number" required min={-90} max={90} step="any" value={latitude} onChange={(e) => setLatitude(e.target.value)} /></label>
      <label className="settings-row"><span>{t('satellite.longitude')}</span><input type="number" required min={-180} max={180} step="any" value={longitude} onChange={(e) => setLongitude(e.target.value)} /></label>
      <div className="data-actions"><button type="submit">{t('data.addStream')}</button><button type="button" onClick={() => { clearPublicStreams(); onChange(); setMessage(''); }}>{t('data.clearStreams')}</button></div>
      {message && <p role="status" className="settings-hint">{message}</p>}
    </form>
  </section>;
}
