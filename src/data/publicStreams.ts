import type { PublicCamera } from '../../shared/live';
const KEY = 'aerogrid.publicStreams';
export function youtubeId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com', 'www.youtube.com'].includes(url.hostname) ? url.searchParams.get('v') ?? url.pathname.match(/^\/(?:live|embed)\/([^/]+)/)?.[1] : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
export function publicStreams(): PublicCamera[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item) => item.source === 'youtube' && youtubeId(item.pageUrl) === item.videoId && Number.isFinite(item.latitude) && Math.abs(item.latitude) <= 90 && Number.isFinite(item.longitude) && Math.abs(item.longitude) <= 180).slice(0, 20) : [];
  } catch { return []; }
}
export function savePublicStream(url: string, name: string, latitude: number, longitude: number) {
  const id = youtubeId(url);
  if (!id || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new Error('Invalid public YouTube URL or coordinates');
  const stream: PublicCamera = { id: `youtube-${id}`, videoId: id, name: name.slice(0, 80) || 'Public YouTube stream', latitude, longitude, source: 'youtube', imageUrl: '', pageUrl: `https://www.youtube.com/watch?v=${id}` };
  localStorage.setItem(KEY, JSON.stringify([...publicStreams().filter((item) => item.id !== stream.id), stream].slice(-20)));
}
export function clearPublicStreams() { localStorage.removeItem(KEY); }
