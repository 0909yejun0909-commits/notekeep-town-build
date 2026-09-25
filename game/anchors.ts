// Phaser-free on purpose, like bus.ts: React imports this during server rendering, and
// Phaser can't load there. The running scene registers where its avatars' heads are.

export type AvatarAnchor = { id: string; x: number; y: number };

let source: (() => AvatarAnchor[]) | null = null;

export function setAnchorSource(next: (() => AvatarAnchor[]) | null) {
  source = next;
}

export function getAnchorSource(): (() => AvatarAnchor[]) | null {
  return source;
}

// Viewport points just above every avatar's head in the running scene, for the
// React name-tag overlay (text stays crisp there instead of being pixel-scaled).
export function avatarAnchors(): AvatarAnchor[] {
  return source ? source() : [];
}
