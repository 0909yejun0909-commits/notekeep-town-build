import { openMessage, sealMessage } from './crypto.ts';
import { parseAppMessage, type AppMessage } from './protocol.ts';

// One encrypted connection to a relay room. Guests quietly retry a dropped
// connection a few times; a host's room cannot outlive its socket, so hosts don't.

export type EndReason =
  | 'host-left'
  | 'room-not-found'
  | 'room-full'
  | 'too-large'
  | 'connection-lost'
  | 'relay-unreachable';

export class RoomError extends Error {
  reason: EndReason;
  constructor(reason: EndReason) {
    super(reason);
    this.reason = reason;
  }
}

export type RoomEvent =
  | { kind: 'peer-joined'; peerId: string }
  | { kind: 'peer-left'; peerId: string }
  | { kind: 'message'; from: string; msg: AppMessage }
  | { kind: 'undecryptable'; from: string }
  | { kind: 'reconnected'; selfId: string }
  | { kind: 'closed'; reason: EndReason };

type Welcome = { peerId: string; roomId: string; hostId: string };

const MAX_FRAME = 8 * 1024 * 1024 - 1024;
const RECONNECT_DELAYS = [1000, 2000, 4000];

function reasonFor(code: number): EndReason {
  if (code === 4001) return 'host-left';
  if (code === 4003) return 'room-full';
  if (code === 4004) return 'room-not-found';
  if (code === 1009) return 'too-large';
  return 'connection-lost';
}

function connect(relayUrl: string, room: string): Promise<{ ws: WebSocket; welcome: Welcome }> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      const url = new URL(relayUrl);
      url.searchParams.set('room', room);
      ws = new WebSocket(url);
    } catch {
      reject(new RoomError('relay-unreachable'));
      return;
    }
    let opened = false;
    ws.onopen = () => {
      opened = true;
    };
    ws.onmessage = (ev) => {
      let msg: { type?: string } & Partial<Welcome>;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type !== 'welcome') return;
      ws.onmessage = null;
      ws.onclose = null;
      resolve({ ws, welcome: msg as Welcome });
    };
    ws.onclose = (ev) => reject(new RoomError(opened ? reasonFor(ev.code) : 'relay-unreachable'));
  });
}

export class Room {
  selfId: string;
  readonly roomId: string;
  readonly hostId: string;
  readonly isHost: boolean;
  private relayUrl: string;
  private key: CryptoKey;
  private ws!: WebSocket;
  private listeners = new Set<(e: RoomEvent) => void>();
  private outbox: Promise<unknown> = Promise.resolve();
  private inbox: Promise<unknown> = Promise.resolve();
  private closing = false;

  static async create(relayUrl: string, key: CryptoKey): Promise<Room> {
    const { ws, welcome } = await connect(relayUrl, 'new');
    return new Room(relayUrl, key, ws, welcome, true);
  }

  static async join(relayUrl: string, roomId: string, key: CryptoKey): Promise<Room> {
    const { ws, welcome } = await connect(relayUrl, roomId);
    return new Room(relayUrl, key, ws, welcome, false);
  }

  private constructor(relayUrl: string, key: CryptoKey, ws: WebSocket, welcome: Welcome, isHost: boolean) {
    this.relayUrl = relayUrl;
    this.key = key;
    this.selfId = welcome.peerId;
    this.roomId = welcome.roomId;
    this.hostId = welcome.hostId;
    this.isHost = isHost;
    this.attach(ws);
  }

  on(listener: (e: RoomEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  send(to: 'all' | 'host' | string, msg: AppMessage): Promise<void> {
    const result = this.outbox.then(async () => {
      const frame = JSON.stringify({ to, data: await sealMessage(this.key, JSON.stringify(msg)) });
      if (frame.length > MAX_FRAME) throw new RoomError('too-large');
      if (this.ws.readyState === WebSocket.OPEN) this.ws.send(frame);
    });
    this.outbox = result.catch(() => {});
    return result;
  }

  close() {
    this.closing = true;
    this.ws.close(1000);
  }

  // Every event goes through one promise chain so decryption never reorders them.
  private emit(event: RoomEvent | (() => Promise<RoomEvent | null>)) {
    this.inbox = this.inbox.then(async () => {
      const e = typeof event === 'function' ? await event() : event;
      if (e) this.listeners.forEach((l) => l(e));
    });
  }

  private attach(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (ev) => {
      let msg: { type?: string; peerId?: string; from?: string; data?: unknown };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === 'peer-joined' && msg.peerId) this.emit({ kind: 'peer-joined', peerId: msg.peerId });
      else if (msg.type === 'peer-left' && msg.peerId) this.emit({ kind: 'peer-left', peerId: msg.peerId });
      else if (msg.type === 'msg' && msg.from && typeof msg.data === 'string') {
        const from = msg.from;
        const data = msg.data;
        this.emit(async () => {
          let plain: string;
          try {
            plain = await openMessage(this.key, data);
          } catch {
            return { kind: 'undecryptable', from };
          }
          const parsed = parseAppMessage(plain);
          return parsed ? { kind: 'message', from, msg: parsed } : null;
        });
      }
    };
    ws.onclose = (ev) => {
      void this.dropped(ev.code);
    };
  }

  private async dropped(code: number) {
    if (this.closing) return;
    const reason = reasonFor(code);
    if (!this.isHost && reason === 'connection-lost') {
      for (const delay of RECONNECT_DELAYS) {
        await new Promise((r) => setTimeout(r, delay));
        if (this.closing) return;
        try {
          const { ws, welcome } = await connect(this.relayUrl, this.roomId);
          this.selfId = welcome.peerId;
          this.attach(ws);
          this.emit({ kind: 'reconnected', selfId: this.selfId });
          return;
        } catch (err) {
          const r = err instanceof RoomError ? err.reason : 'connection-lost';
          if (r === 'room-not-found') return this.finish('host-left');
          if (r !== 'connection-lost' && r !== 'relay-unreachable') return this.finish(r);
        }
      }
    }
    this.finish(reason);
  }

  private finish(reason: EndReason) {
    this.closing = true;
    this.emit({ kind: 'closed', reason });
  }
}
