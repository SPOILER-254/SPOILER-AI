import { type Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifySessionToken } from './crypto.ts';
import { db } from './db.ts';

interface AuthedSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

const userSockets = new Map<string, Set<AuthedSocket>>();

export function setupWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: AuthedSocket, req) => {
    const url = new URL(req.url || '/ws', 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const payload = verifySessionToken(token);
    if (!payload) {
      ws.close(4001, 'Invalid or expired token');
      return;
    }

    const sessionRow = db
      .prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?')
      .get(payload.sid, payload.uid);
    if (!sessionRow) {
      ws.close(4001, 'Session revoked');
      return;
    }

    ws.userId = payload.uid;
    ws.isAlive = true;

    if (!userSockets.has(payload.uid)) {
      userSockets.set(payload.uid, new Set());
    }
    userSockets.get(payload.uid)!.add(ws);

    ws.send(JSON.stringify({ type: 'ws:connected', userId: payload.uid, timestamp: new Date().toISOString() }));

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      if (ws.userId) {
        const set = userSockets.get(ws.userId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) userSockets.delete(ws.userId);
        }
      }
    });
  });

  const interval = setInterval(() => {
    wss.clients.forEach((client) => {
      const sock = client as AuthedSocket;
      if (sock.isAlive === false) {
        sock.terminate();
        return;
      }
      sock.isAlive = false;
      sock.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));
  return wss;
}

export function broadcastToUser(userId: string, event: { type: string; payload: unknown }) {
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) return;
  const serialized = JSON.stringify({ ...event, timestamp: new Date().toISOString() });
  for (const sock of sockets) {
    if (sock.readyState === WebSocket.OPEN) {
      sock.send(serialized);
    }
  }
}
