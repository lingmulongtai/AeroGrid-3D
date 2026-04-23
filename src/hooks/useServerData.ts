/**
 * Unified data hook: connects to the AeroGrid backend via WebSocket and
 * distributes flight + weather data.  Falls back gracefully if the server
 * is unavailable — the browser still polls OpenSky and RainViewer directly,
 * exactly as the original hooks did.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Flight, FlightStats } from './useFlightData';
import { useFlightData } from './useFlightData';
import { useWeatherData } from './useWeatherData';

const HISTORY_LENGTH = 10;
const MAX_FLIGHTS    = 3_000;
// After this long with no WS message, trigger HTTP fallback
const WS_TIMEOUT_MS  = 8_000;

// ── helpers ──────────────────────────────────────────────────────────────

function getWsUrl(): string {
  // import.meta.env is injected by Vite at build time
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_SERVER_WS_URL;
  if (env) return env;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // With the Vite proxy configured, /ws on the same host gets forwarded to
  // the Node server — no CORS, no port juggling in dev or prod.
  return `${proto}//${window.location.host}/ws`;
}

// ── types re-exported for convenience ────────────────────────────────────

export type { Flight, FlightStats };

interface ServerFlightsMsg {
  type: 'flights';
  data: Flight[] | null;
  rateLimited: boolean;
  simulated: boolean;
  timestamp: number;
}

interface ServerWeatherMsg {
  type: 'weather';
  data: { radarTileUrl: string };
  timestamp: number;
}

type ServerMsg = ServerFlightsMsg | ServerWeatherMsg | { type: 'pong' };

// ── main hook ─────────────────────────────────────────────────────────────

export interface ServerDataResult {
  flights:     Flight[];
  flightStats: FlightStats;
  radarTileUrl: string | null;
  wsConnected: boolean;
}

export function useServerData(
  flightsEnabled: boolean,
  weatherEnabled: boolean,
  showOnGround: boolean,
): ServerDataResult {
  // ── WebSocket state ──────────────────────────────────────────────────────
  const [wsConnected, setWsConnected] = useState(false);
  // True when WS has never delivered data and timeout elapsed → use fallback
  const [useFallback, setUseFallback] = useState(false);

  // ── Primary: WS-driven state ─────────────────────────────────────────────
  const [wsFlights,     setWsFlights]     = useState<Flight[]>([]);
  const [wsFlightStats, setWsFlightStats] = useState<FlightStats>({
    total: 0, airborne: 0, avgAltitude: 0, avgSpeed: 0, isLive: false, isRateLimited: false,
  });
  const [wsRadarUrl, setWsRadarUrl] = useState<string | null>(null);

  // ── Fallback: HTTP polling hooks (idle when WS works) ───────────────────
  const { flights: fbFlights, stats: fbStats } = useFlightData(
    useFallback && flightsEnabled, showOnGround,
  );
  const { radarTileUrl: fbRadar } = useWeatherData(useFallback && weatherEnabled);

  // ── Refs for stable closures ─────────────────────────────────────────────
  const historyRef        = useRef<Map<string, [number, number, number][]>>(new Map());
  const showOnGroundRef   = useRef(showOnGround);
  const flightsEnabledRef = useRef(flightsEnabled);
  const weatherEnabledRef = useRef(weatherEnabled);

  useEffect(() => { showOnGroundRef.current   = showOnGround;   }, [showOnGround]);
  useEffect(() => { flightsEnabledRef.current = flightsEnabled; }, [flightsEnabled]);
  useEffect(() => { weatherEnabledRef.current = weatherEnabled; }, [weatherEnabled]);

  // ── Handle incoming flight payload ───────────────────────────────────────
  const processFlights = useCallback((msg: ServerFlightsMsg) => {
    if (!flightsEnabledRef.current) return;

    if (!msg.data || msg.data.length === 0) {
      if (msg.rateLimited) {
        setWsFlightStats((s) => ({ ...s, isRateLimited: true, isLive: false }));
      }
      return;
    }

    const history = historyRef.current;
    const mapped: Flight[] = msg.data.map((f): Flight => {
      // Rebuild client-side position history on top of server-delivered data
      const prev    = history.get(f.id) ?? f.positionHistory ?? [];
      const entry: [number, number, number] = [f.longitude, f.latitude, f.altitude];
      const updated = [...prev, entry].slice(-HISTORY_LENGTH);
      history.set(f.id, updated);
      return { ...f, positionHistory: updated };
    });

    const filtered = (showOnGroundRef.current
      ? mapped
      : mapped.filter((f) => !f.onGround && f.altitude > 0)
    ).slice(0, MAX_FLIGHTS);

    setWsFlights(filtered);

    const airborne = filtered.filter((f) => !f.onGround && f.altitude > 0);
    setWsFlightStats({
      total:        filtered.length,
      airborne:     airborne.length,
      avgAltitude:  airborne.length ? airborne.reduce((a, b) => a + b.altitude, 0) / airborne.length : 0,
      avgSpeed:     airborne.length ? airborne.reduce((a, b) => a + b.velocity, 0) / airborne.length : 0,
      isLive:       !msg.simulated,
      isRateLimited: msg.rateLimited,
    });
  }, []);

  // ── WebSocket lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    let destroyed = false;
    let reconnectTimer: number;
    let fallbackTimer: number;
    let hasReceivedData = false;

    // If no data arrives within WS_TIMEOUT_MS, switch to direct polling
    fallbackTimer = window.setTimeout(() => {
      if (!hasReceivedData) setUseFallback(true);
    }, WS_TIMEOUT_MS);

    const connect = () => {
      if (destroyed) return;

      let ws: WebSocket;
      try {
        ws = new WebSocket(getWsUrl());
      } catch {
        setUseFallback(true);
        return;
      }

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as ServerMsg;

          if (msg.type === 'flights') {
            hasReceivedData = true;
            setUseFallback(false);
            clearTimeout(fallbackTimer);
            processFlights(msg as ServerFlightsMsg);
          } else if (msg.type === 'weather') {
            const url = (msg as ServerWeatherMsg).data?.radarTileUrl;
            if (url && weatherEnabledRef.current) setWsRadarUrl(url);
          }
        } catch {}
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!destroyed) {
          reconnectTimer = window.setTimeout(connect, 3_000);
          // If we lose WS, re-arm fallback timer
          fallbackTimer = window.setTimeout(() => {
            if (!hasReceivedData) setUseFallback(true);
          }, WS_TIMEOUT_MS);
        }
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      clearTimeout(fallbackTimer);
    };
  }, [processFlights]);

  // ── Clear WS state when layers are disabled ───────────────────────────────
  useEffect(() => {
    if (!flightsEnabled) {
      setWsFlights([]);
      setWsFlightStats({ total: 0, airborne: 0, avgAltitude: 0, avgSpeed: 0, isLive: false, isRateLimited: false });
    }
  }, [flightsEnabled]);

  useEffect(() => {
    if (!weatherEnabled) setWsRadarUrl(null);
  }, [weatherEnabled]);

  // ── Return WS data or fallback ────────────────────────────────────────────
  return {
    flights:      useFallback ? fbFlights     : wsFlights,
    flightStats:  useFallback ? fbStats       : wsFlightStats,
    radarTileUrl: useFallback ? fbRadar       : wsRadarUrl,
    wsConnected:  !useFallback && wsConnected,
  };
}
