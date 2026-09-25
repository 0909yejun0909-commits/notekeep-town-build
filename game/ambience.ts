import Phaser from 'phaser';
import type { Daylight } from '@/game/daylight';
import { TILE, type WorldGrid } from '@/game/worldGrid';

// Purely visual life around the camera: butterflies by day, fireflies by night, drifting
// cloud shadows, falling leaves and wind swirls. Random is fine here — none of it touches
// walkability, so study-session guests don't need to agree on it.

const BUTTERFLIES = 10;
const FIREFLIES = 18;

type Flier = { sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image; hx: number; hy: number; t: number; ax: number; ay: number; fx: number; fy: number; drift: number };

function ensureFireflyTexture(scene: Phaser.Scene) {
  if (scene.textures.exists('firefly')) return;
  const tex = scene.textures.createCanvas('firefly', 5, 5)!;
  const ctx = tex.getContext();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(0, 1, 5, 3);
  ctx.fillRect(1, 0, 3, 5);
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.fillRect(1, 1, 3, 3);
  tex.refresh();
}

export function attachAmbience(scene: Phaser.Scene, g: WorldGrid, daylight: Daylight) {
  ensureFireflyTexture(scene);
  const cam = scene.cameras.main;
  const view = () => cam.worldView;
  const worldPxW = g.w * TILE;
  const worldPxH = g.h * TILE;

  const place = (f: Flier) => {
    const v = view();
    f.hx = v.x + Math.random() * v.width;
    f.hy = v.y + Math.random() * v.height;
    f.t = Math.random() * 10000;
  };
  const makeFlier = (sprite: Flier['sprite'], ax: number, ay: number): Flier => {
    const f: Flier = { sprite, hx: 0, hy: 0, t: 0, ax, ay, fx: 0.0006 + Math.random() * 0.0008, fy: 0.001 + Math.random() * 0.0012, drift: (Math.random() - 0.5) * 0.012 };
    place(f);
    return f;
  };

  const butterflies = Array.from({ length: BUTTERFLIES }, (_, i) =>
    makeFlier(scene.add.sprite(0, 0, 'butterfly').setDepth(60000).play({ key: `butterfly-${i % 8}`, startFrame: i % 2 }), 26, 14),
  );
  const fireflies = Array.from({ length: FIREFLIES }, () =>
    makeFlier(
      scene.add.image(0, 0, 'firefly').setTint(0xfff27a).setBlendMode(Phaser.BlendModes.ADD).setDepth(100002).setAlpha(0),
      34,
      22,
    ),
  );

  const clouds = [0, 1, 2, 3].map((frame) =>
    scene.add
      .image(Math.random() * worldPxW, Math.random() * worldPxH, 'clouds', frame)
      .setScale(3)
      .setDepth(90000),
  );

  const leafZone = new Phaser.Geom.Rectangle(0, 0, 1, 1);
  const leaves = scene.add
    .particles(0, 0, 'leaf-oak', {
      lifespan: 9000,
      speedX: { min: -14, max: 4 },
      speedY: { min: 9, max: 20 },
      frequency: 1300,
      alpha: { start: 1, end: 0, ease: 'Quad.easeIn' },
      emitZone: { type: 'random', source: leafZone, quantity: 1 } as Phaser.Types.GameObjects.Particles.EmitZoneData,
    })
    .setDepth(70000);

  const wind = scene.time.addEvent({
    delay: 3200,
    loop: true,
    callback: () => {
      const v = view();
      const s = scene.add
        .sprite(v.x + Math.random() * v.width, v.y + Math.random() * v.height, 'wind')
        .setDepth(70001)
        .setAlpha(0.8)
        .play('wind-swirl');
      scene.tweens.add({ targets: s, x: s.x + 40, duration: 1000 });
      s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
    },
  });

  const onUpdate = (_time: number, dt: number) => {
    const v = view();
    const glow = daylight.glow();
    leafZone.setTo(v.x - 20, v.y - 30, v.width + 40, v.height * 0.7);

    const fly = (f: Flier, wobble: number) => {
      f.t += dt;
      f.hx += f.drift * dt;
      const x = f.hx + Math.sin(f.t * f.fx) * f.ax;
      const y = f.hy + Math.sin(f.t * f.fy) * f.ay + Math.sin(f.t * f.fx * 2.7) * wobble;
      f.sprite.setPosition(Math.round(x), Math.round(y));
      if (x < v.x - 80 || x > v.right + 80 || y < v.y - 80 || y > v.bottom + 80) place(f);
      if (f.sprite instanceof Phaser.GameObjects.Sprite) f.sprite.setFlipX(Math.cos(f.t * f.fx) * f.ax < 0);
    };
    for (const f of butterflies) {
      fly(f, 4);
      f.sprite.setAlpha(1 - glow);
    }
    for (const f of fireflies) {
      fly(f, 6);
      f.sprite.setAlpha(glow * (0.45 + 0.55 * Math.max(0, Math.sin(f.t * 0.004))));
    }
    for (const c of clouds) {
      c.x += dt * 0.007;
      c.y += dt * 0.0025;
      if (c.x > worldPxW + 120) c.x = -120;
      if (c.y > worldPxH + 120) c.y = -120;
      c.setAlpha(0.55 * (1 - glow));
    }
    leaves.setAlpha(1 - glow * 0.7);
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    wind.remove();
  });
}
