import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';

// A dumb pipe for Notekeep Town study sessions. Rooms live in memory, frames are
// forwarded unread (clients encrypt end to end), and a room dies with its host.

export const CLOSE_ROOM_CLOSED = 4001;
export const CLOSE_ROOM_FULL = 4003;
export const CLOSE_ROOM_NOT_FOUND = 4004;
export const CLOSE_TOO_MANY = 4029;

export type RelayOptions = {
  port?: number;
  maxPeers?: number;
  maxPayload?: number;
  rateMax?: number;
  heartbeatMs?: number;
  maxPerIp?: number;
  // Behind a proxy every socket comes from the proxy; name the header that carries the real client.
  ipHeader?: string;
};

type Peer = { id: string; ws: WebSocket; alive: boolean; windowStart: number; sent: number };
type Room = { id: string; host: Peer; peers: Map<string, Peer> };

function send(peer: Peer, msg: object) {
  if (peer.ws.readyState === peer.ws.OPEN) peer.ws.send(JSON.stringify(msg));
}

export async function createRelay(opts: RelayOptions = {}) {
  const maxPeers = opts.maxPeers ?? 16;
  const rateMax = opts.rateMax ?? 60;
  const maxPerIp = opts.maxPerIp ?? 20;
  const ipHeader = opts.ipHeader?.toLowerCase();
  const rooms = new Map<string, Room>();
  const perIp = new Map<string, number>();
  const wss = new WebSocketServer({ port: opts.port ?? 8787, maxPayload: opts.maxPayload ?? 8 * 1024 * 1024 });

  wss.on('connection', (ws, req) => {
    ws.on('error', () => {});
    const forwarded = ipHeader ? req.headers[ipHeader] : undefined;
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded) || req.socket.remoteAddress || '?';
    const held = perIp.get(ip) ?? 0;
    if (held >= maxPerIp) {
      ws.send(JSON.stringify({ type: 'error', code: 'too-many-connections' }));
      ws.close(CLOSE_TOO_MANY);
      return;
    }
    perIp.set(ip, held + 1);
    ws.on('close', () => {
      const left = (perIp.get(ip) ?? 1) - 1;
      if (left > 0) perIp.set(ip, left);
      else perIp.delete(ip);
    });

    const wanted = new URL(req.url ?? '/', 'http://relay').searchParams.get('room');
    const peer: Peer = { id: randomBytes(8).toString('base64url'), ws, alive: true, windowStart: Date.now(), sent: 0 };
    ws.on('pong', () => {
      peer.alive = true;
    });

    let room: Room;
    if (wanted === 'new') {
      room = { id: randomBytes(16).toString('base64url'), host: peer, peers: new Map([[peer.id, peer]]) };
      rooms.set(room.id, room);
    } else {
      const existing = wanted ? rooms.get(wanted) : undefined;
      if (!existing) {
        send(peer, { type: 'error', code: 'room-not-found' });
        ws.close(CLOSE_ROOM_NOT_FOUND);
        return;
      }
      if (existing.peers.size >= maxPeers) {
        send(peer, { type: 'error', code: 'room-full' });
        ws.close(CLOSE_ROOM_FULL);
        return;
      }
      room = existing;
      for (const other of room.peers.values()) send(other, { type: 'peer-joined', peerId: peer.id });
      room.peers.set(peer.id, peer);
    }

    send(peer, {
      type: 'welcome',
      peerId: peer.id,
      roomId: room.id,
      hostId: room.host.id,
      peers: [...room.peers.keys()].filter((id) => id !== peer.id),
    });

    ws.on('message', (raw: RawData, isBinary: boolean) => {
      if (isBinary) return;
      const now = Date.now();
      if (now - peer.windowStart >= 1000) {
        peer.windowStart = now;
        peer.sent = 0;
      }
      peer.sent += 1;
      if (peer.sent > rateMax) {
        if (peer.sent === rateMax + 1) send(peer, { type: 'error', code: 'rate-limited' });
        return;
      }

      let msg: { to?: unknown; data?: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (typeof msg.to !== 'string' || typeof msg.data !== 'string') return;
      const out = { type: 'msg', from: peer.id, data: msg.data };
      if (msg.to === 'all') {
        for (const other of room.peers.values()) if (other !== peer) send(other, out);
      } else {
        const target = msg.to === 'host' ? room.host : room.peers.get(msg.to);
        if (target && target !== peer) send(target, out);
      }
    });

    ws.on('close', () => {
      if (!room.peers.delete(peer.id)) return;
      if (room.host === peer) {
        rooms.delete(room.id);
        const rest = [...room.peers.values()];
        room.peers.clear();
        for (const other of rest) {
          send(other, { type: 'room-closed' });
          other.ws.close(CLOSE_ROOM_CLOSED);
        }
      } else {
        for (const other of room.peers.values()) send(other, { type: 'peer-left', peerId: peer.id });
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const room of rooms.values()) {
      for (const peer of room.peers.values()) {
        if (!peer.alive) {
          peer.ws.terminate();
          continue;
        }
        peer.alive = false;
        peer.ws.ping();
      }
    }
  }, opts.heartbeatMs ?? 30_000);

  await once(wss, 'listening');
  return {
    port: (wss.address() as AddressInfo).port,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(heartbeat);
        for (const ws of wss.clients) ws.terminate();
        wss.close(() => resolve());
      }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { port } = await createRelay({
    port: Number(process.env.PORT) || 8787,
    ipHeader: process.env.CLIENT_IP_HEADER || undefined,
  });
  console.log(`Notekeep Town relay listening on ws://localhost:${port}`);
}
