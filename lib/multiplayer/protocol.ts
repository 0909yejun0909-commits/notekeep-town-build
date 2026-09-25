import type { Direction } from '@/game/gridMovement';
import type { InteriorLayout, WorldModel } from '@/lib/types';

// Everything peers say to each other, inside the encryption. Every inbound message goes
// through parseAppMessage, because other players' clients are not ours.

export type ShareMode = 'notes' | 'town';
export type SceneId = 'overworld' | `house:${string}`;

export type Presence = {
  name: string;
  scene: SceneId | null; // null while still on the title screen
  gx: number;
  gy: number;
  facing: Direction;
};

export type WorldPayload = {
  world: WorldModel;
  layouts: Record<string, InteriorLayout>;
  share: ShareMode;
};

export type NoteRequest = { reqId: string; path: string; kind: 'text' | 'binary' };

export type NoteResponse =
  | { t: 'note-res'; reqId: string; ok: true; text?: string; b64?: string; mime?: string }
  | { t: 'note-res'; reqId: string; ok: false; error: string };

export type AppMessage =
  | { t: 'hello' }
  | ({ t: 'world' } & WorldPayload)
  | ({ t: 'presence' } & Presence)
  | { t: 'chat'; text: string }
  | ({ t: 'note-req' } & NoteRequest)
  | NoteResponse;

export const MAX_CHAT = 500;
export const MAX_NAME = 24;
const FACINGS = ['down', 'right', 'up', 'left'];

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || 'Guest';
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

export function parseAppMessage(raw: string): AppMessage | null {
  let m: Record<string, any>;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;

  switch (m.t) {
    case 'hello':
      return { t: 'hello' };
    case 'world':
      if (!m.world || !Array.isArray(m.world.regions) || !m.layouts || typeof m.layouts !== 'object') return null;
      return { t: 'world', world: m.world, layouts: m.layouts, share: m.share === 'town' ? 'town' : 'notes' };
    case 'presence': {
      const sceneOk = m.scene === null || m.scene === 'overworld' || (typeof m.scene === 'string' && m.scene.startsWith('house:'));
      if (typeof m.name !== 'string' || !sceneOk || !Number.isInteger(m.gx) || !Number.isInteger(m.gy) || !FACINGS.includes(m.facing)) {
        return null;
      }
      return { t: 'presence', name: cleanName(m.name), scene: m.scene, gx: m.gx, gy: m.gy, facing: m.facing };
    }
    case 'chat': {
      const text = typeof m.text === 'string' ? m.text.trim().slice(0, MAX_CHAT) : '';
      return text ? { t: 'chat', text } : null;
    }
    case 'note-req':
      if (typeof m.reqId !== 'string' || typeof m.path !== 'string' || (m.kind !== 'text' && m.kind !== 'binary')) return null;
      return { t: 'note-req', reqId: m.reqId, path: m.path, kind: m.kind };
    case 'note-res':
      if (typeof m.reqId !== 'string') return null;
      if (m.ok === true) return { t: 'note-res', reqId: m.reqId, ok: true, text: str(m.text), b64: str(m.b64), mime: str(m.mime) };
      return { t: 'note-res', reqId: m.reqId, ok: false, error: str(m.error) ?? 'Request failed.' };
    default:
      return null;
  }
}
