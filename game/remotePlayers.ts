import Phaser from 'phaser';
import { tileToWorld, type Direction } from '@/game/gridMovement';
import { dressPlayer } from '@/game/playerSprite';
import type { Presence, SceneId } from '@/lib/multiplayer/protocol';
import { currentPresences, getSession, onPresence } from '@/lib/multiplayer/session';

const STEP_MS = 150; // matches GridMovement's own tween
const HEAD = 32; // world px from a sprite's feet to just above its head

type Avatar = { sprite: Phaser.GameObjects.Sprite; undress: () => void; gx: number; gy: number; facing: Direction };
export type AvatarAnchor = { id: string; x: number; y: number };

let anchors: (() => AvatarAnchor[]) | null = null;

// Viewport points just above every avatar's head in the running scene, for the
// React name-tag overlay (text stays crisp there instead of being pixel-scaled).
export function avatarAnchors(): AvatarAnchor[] {
  return anchors ? anchors() : [];
}

function animate(sprite: Phaser.GameObjects.Sprite, kind: 'idle' | 'walk', facing: Direction) {
  sprite.setFlipX(facing === 'left');
  sprite.play(`${kind}-${facing === 'left' ? 'right' : facing}`, true);
}

export function attachRemotePlayers(scene: Phaser.Scene, sceneId: SceneId, local: Phaser.GameObjects.Sprite) {
  const avatars = new Map<string, Avatar>();
  const depthByY = sceneId === 'overworld';

  const place = (peerId: string, p: Presence | null) => {
    const avatar = avatars.get(peerId);
    if (!p || p.scene !== sceneId) {
      if (!avatar) return;
      scene.tweens.killTweensOf(avatar.sprite);
      avatar.undress();
      avatar.sprite.destroy();
      avatars.delete(peerId);
      return;
    }

    const target = tileToWorld(p.gx, p.gy);
    if (!avatar) {
      const sprite = scene.add.sprite(target.x, target.y, 'player').setOrigin(0.5, 0.64);
      sprite.setDepth(depthByY ? sprite.y : 10);
      avatars.set(peerId, { sprite, undress: dressPlayer(scene, sprite), gx: p.gx, gy: p.gy, facing: p.facing });
      animate(sprite, 'idle', p.facing);
      return;
    }

    const steps = Math.abs(p.gx - avatar.gx) + Math.abs(p.gy - avatar.gy);
    avatar.facing = p.facing;
    if (steps === 0) {
      animate(avatar.sprite, 'idle', p.facing);
      return;
    }
    const from = tileToWorld(avatar.gx, avatar.gy);
    avatar.gx = p.gx;
    avatar.gy = p.gy;
    scene.tweens.killTweensOf(avatar.sprite);
    if (steps > 1) {
      avatar.sprite.setPosition(target.x, target.y);
      animate(avatar.sprite, 'idle', p.facing);
      return;
    }
    avatar.sprite.setPosition(from.x, from.y);
    animate(avatar.sprite, 'walk', p.facing);
    scene.tweens.add({
      targets: avatar.sprite,
      x: target.x,
      y: target.y,
      duration: STEP_MS,
      onComplete: () => animate(avatar.sprite, 'idle', avatar.facing),
    });
  };

  for (const [peerId, p] of currentPresences()) place(peerId, p);
  const off = onPresence(place);

  const sortDepth = () => {
    for (const a of avatars.values()) a.sprite.setDepth(depthByY ? a.sprite.y : 10);
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, sortDepth);

  const mine = () => {
    const cam = scene.cameras.main;
    const rect = scene.game.canvas.getBoundingClientRect();
    const scale = rect.width / scene.scale.width;
    const at = (id: string, s: Phaser.GameObjects.Sprite): AvatarAnchor => ({
      id,
      x: rect.left + (s.x - cam.worldView.x) * scale,
      y: rect.top + (s.y - HEAD - cam.worldView.y) * scale,
    });
    const out: AvatarAnchor[] = [];
    const selfId = getSession().selfId;
    if (selfId) out.push(at(selfId, local));
    for (const [peerId, a] of avatars) out.push(at(peerId, a.sprite));
    return out;
  };
  anchors = mine;

  // The scene destroys the sprites and their clothes itself on shutdown.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    off();
    scene.events.off(Phaser.Scenes.Events.UPDATE, sortDepth);
    avatars.clear();
    if (anchors === mine) anchors = null;
  });
}
