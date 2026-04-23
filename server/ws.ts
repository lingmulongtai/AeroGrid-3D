import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'http';

let wss: WebSocketServer | null = null;

// Cache last messages so new clients get data immediately on connect
let lastFlightMsg: string | null = null;
let lastWeatherMsg: string | null = null;

export function initWss(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    // Send cached data immediately so the UI doesn't wait for next fetch cycle
    if (lastFlightMsg) ws.send(lastFlightMsg);
    if (lastWeatherMsg) ws.send(lastWeatherMsg);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch {}
    });

    ws.on('error', () => ws.terminate());
  });

  return wss;
}

export function broadcast(payload: object, channel: 'flights' | 'weather'): void {
  const serialized = JSON.stringify(payload);

  if (channel === 'flights') lastFlightMsg = serialized;
  if (channel === 'weather') lastWeatherMsg = serialized;

  if (!wss) return;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  });
}

export function getClientCount(): number {
  return wss?.clients.size ?? 0;
}
