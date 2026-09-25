import Phaser from 'phaser';
import type { WorldGrid } from '@/game/worldGrid';

// Lighting follows the player's local clock: a MULTIPLY tint over the whole view, and warm
// ADD glows at lamps and doors that fade in as the light goes. `?time=night` (or dawn, day,
// golden, dusk) pins a phase for demos; the N key cycles phases, then back to the clock.

export type Phase = 'dawn' | 'day' | 'golden' | 'dusk' | 'night';
const PHASES: Phase[] = ['day', 'golden', 'dusk', 'night', 'dawn'];
const PHASE_HOUR: Record<Phase, number> = { dawn: 6.3, day: 12, golden: 17.6, dusk: 19.6, night: 23 };

// [hour, tint, glow 0..1]
const KEYS: [number, number, number][] = [
  [0, 0x5866a6, 1],
  [4.8, 0x5866a6, 1],
  [6.3, 0xf0b4b4, 0.15],
  [7.6, 0xffffff, 0],
  [16.2, 0xfff4e6, 0],
  [17.6, 0xffc88e, 0.08],
  [19.6, 0xa98ad0, 0.65],
  [21, 0x5866a6, 1],
  [24, 0x5866a6, 1],
];

const TINT_DEPTH = 100000;
const GLOW_DEPTH = 100001;

function lerpColor(a: number, b: number, t: number) {
  const ch = (s: number) => {
    const x = (a >> s) & 0xff;
    const y = (b >> s) & 0xff;
    return Math.round(x + (y - x) * t) << s;
  };
  return ch(16) | ch(8) | ch(0);
}

export function lightAt(hour: number): { tint: number; glow: number } {
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [h0, c0, g0] = KEYS[i];
    const [h1, c1, g1] = KEYS[i + 1];
    if (hour >= h0 && hour <= h1) {
      const t = h1 === h0 ? 0 : (hour - h0) / (h1 - h0);
      return { tint: lerpColor(c0, c1, t), glow: g0 + (g1 - g0) * t };
    }
  }
  return { tint: 0xffffff, glow: 0 };
}

function clockHour() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

function previewFromUrl(): Phase | null {
  const p = new URLSearchParams(window.location.search).get('time');
  return p && p in PHASE_HOUR ? (p as Phase) : null;
}

function ensureGlowTexture(scene: Phaser.Scene) {
  if (scene.textures.exists('glow')) return;
  const size = 64;
  const tex = scene.textures.createCanvas('glow', size, size)!;
  const ctx = tex.getContext();
  // Stepped rings instead of a smooth gradient, so the light reads as pixel art.
  const rings: [number, number][] = [[32, 0.05], [26, 0.1], [20, 0.18], [14, 0.3], [9, 0.5], [5, 0.8]];
  for (const [r, a] of rings) {
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.fill();
  }
  tex.refresh();
}

export type Daylight = { glow: () => number };

export function attachDaylight(scene: Phaser.Scene, g: WorldGrid): Daylight {
  ensureGlowTexture(scene);
  const cam = scene.cameras.main;

  const tint = scene.add
    .rectangle(0, 0, cam.width, cam.height, 0xffffff)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(TINT_DEPTH)
    .setBlendMode(Phaser.BlendModes.MULTIPLY);
  const onResize = () => tint.setSize(cam.width, cam.height);
  scene.scale.on(Phaser.Scale.Events.RESIZE, onResize);

  const glows = g.lights.map((l) =>
    scene.add
      .image(l.x, l.y, 'glow')
      .setScale(l.scale)
      .setTint(0xffa850)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(GLOW_DEPTH)
      .setAlpha(0),
  );

  if (scene.renderer.type === Phaser.WEBGL) {
    cam.postFX.addColorMatrix().saturate(0.18);
    cam.postFX.addVignette(0.5, 0.5, 0.92, 0.22);
  }

  let pinned: Phase | null = previewFromUrl();
  let current = { tint: 0xffffff, glow: 0 };
  const apply = () => {
    current = lightAt(pinned ? PHASE_HOUR[pinned] : clockHour());
    tint.setFillStyle(current.tint);
    for (const s of glows) s.setAlpha(current.glow * 0.85);
  };
  apply();

  const timer = scene.time.addEvent({ delay: 30000, loop: true, callback: apply });
  let flickerT = 0;
  const onUpdate = (_t: number, dt: number) => {
    if (current.glow <= 0) return;
    flickerT += dt;
    glows.forEach((s, i) => s.setAlpha(current.glow * (0.8 + 0.06 * Math.sin(flickerT / 180 + i * 1.7))));
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

  const onKey = () => {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return;
    const i = pinned ? PHASES.indexOf(pinned) : -1;
    pinned = i + 1 < PHASES.length ? PHASES[i + 1] : null;
    apply();
  };
  scene.input.keyboard?.on('keydown-N', onKey);

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off(Phaser.Scale.Events.RESIZE, onResize);
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.input.keyboard?.off('keydown-N', onKey);
    timer.remove();
    if (scene.renderer.type === Phaser.WEBGL) cam.postFX.clear();
  });

  return { glow: () => current.glow };
}
