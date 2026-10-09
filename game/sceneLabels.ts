// Phaser-free on purpose, like anchors.ts. Text drawn into the game's small pixel buffer and
// then scaled up loses its letter shapes, so the running scene publishes its labels here and
// the React overlay (components/SceneLabels.tsx) draws them as page text, sharp on any screen.

export type SceneLabel = {
  id: string;
  text: string; // cut from the end with ".." until the label fits maxWidth
  suffix?: string; // never cut
  x: number; // viewport CSS px
  y: number;
  ox: number; // which point of the label sits at x,y: 0 left/top .. 1 right/bottom
  oy: number;
  px: number; // CSS px per game pixel, so labels keep the game's proportions
  maxWidth?: number; // CSS px
  color?: string;
  bare?: boolean; // no wooden box behind it
  action?: { text: string; color: string; onClick: () => void; tour?: string }; // a button at its right end
  tour?: string; // data-tour name, for the tutorial to point at
};

let source: (() => SceneLabel[]) | null = null;

export function setLabelSource(next: (() => SceneLabel[]) | null) {
  source = next;
}

export function getLabelSource(): (() => SceneLabel[]) | null {
  return source;
}

export function sceneLabels(): SceneLabel[] {
  return source ? source() : [];
}
