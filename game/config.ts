import Phaser from 'phaser';
import BootScene from '@/game/scenes/BootScene';
import TitleScene from '@/game/scenes/TitleScene';
import OverworldScene from '@/game/scenes/OverworldScene';
import InteriorScene from '@/game/scenes/InteriorScene';
import { bus } from '@/game/bus';
import { attachSoundEvents } from '@/game/audio/events';

// About this many CSS px per game pixel.
const ZOOM = 3;

// The canvas fills the window, and every game pixel is a whole number of *device* pixels, so
// pixel art and pixel fonts stay crisp. (A flat 3 CSS px is 3.75 or 4.5 device px under 125% or
// 150% display scaling, which draws some pixels a column wider than others.) A scene can need
// a minimum view in game px, registry 'minView' (a house room, to fit whole): the pixel size
// then drops a step at a time until it fits.
function viewSize(minView?: [number, number] | null) {
  const dpr = window.devicePixelRatio || 1;
  const devW = window.innerWidth * dpr;
  const devH = window.innerHeight * dpr;
  let k = Math.max(1, Math.round(ZOOM * dpr));
  if (minView) while (k > 1 && (devW / k < minView[0] || devH / k < minView[1])) k--;
  return {
    width: Math.max(16 * 10, Math.floor(devW / k)),
    height: Math.max(16 * 8, Math.floor(devH / k)),
    zoom: k / dpr,
  };
}

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  const { width, height, zoom } = viewSize();
  return {
    type: Phaser.AUTO,
    parent,
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    width,
    height,
    zoom,
    fps: { forceSetTimeOut: true },
    // Sound is our own Web Audio (game/audio/); Phaser's would only open a second, idle context.
    audio: { noAudio: true },
    // By default Phaser also takes clicks from the whole page, so clicking a React panel over
    // the game (the biome picker, the coin purse, a menu) also clicked whatever house or shelf
    // was under it. Only clicks that reach the canvas count.
    input: { windowEvents: false },
    scene: [BootScene, TitleScene, OverworldScene, InteriorScene],
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    callbacks: {
      postBoot: (game) => {
        // Only when something changed: resize() always emits RESIZE, and scenes rebuild on it.
        const onResize = () => {
          const s = viewSize(game.registry.get('minView'));
          const scale = game.scale;
          if (s.width === scale.width && s.height === scale.height && Math.abs(s.zoom - scale.zoom) < 1e-9) return;
          scale.zoom = s.zoom;
          scale.resize(s.width, s.height);
        };
        // SceneManager.start() does not stop the caller the way Scene.scene.start() does,
        // so stop the scene we are leaving or both keep updating and rendering.
        const onEnter = ({ houseId }: { houseId: string }) => {
          game.scene.stop('OverworldScene');
          game.scene.start('InteriorScene', { houseId });
        };
        const onExit = () => {
          game.scene.stop('InteriorScene');
          game.scene.start('OverworldScene');
        };
        // Leaving a fast-travelled house should put the player outside *that* house, not the
        // one they walked into last — so set returnTile from the door map Overworld publishes.
        const onFastTravel = ({ houseId, roomId, noteId }: { houseId: string; roomId?: string; noteId?: string }) => {
          const doors = game.registry.get('houseDoors') as Map<string, { gx: number; gy: number }> | undefined;
          const door = doors?.get(houseId);
          if (door) game.registry.set('returnTile', { gx: door.gx, gy: door.gy + 1 });
          game.scene.stop('OverworldScene');
          game.scene.stop('InteriorScene');
          game.scene.start('InteriorScene', { houseId, roomId, noteId });
        };
        window.addEventListener('resize', onResize);
        // Set once up front: the registry only has a per-key event for changing a key, not for
        // creating it, so without this the first room entered would never get its fit.
        game.registry.set('minView', null);
        game.registry.events.on('changedata-minView', onResize);
        bus.on('enter-house', onEnter);
        bus.on('exit-house', onExit);
        bus.on('fast-travel', onFastTravel);
        const detachSounds = attachSoundEvents();
        game.events.once(Phaser.Core.Events.DESTROY, () => {
          window.removeEventListener('resize', onResize);
          game.registry.events.off('changedata-minView', onResize);
          bus.off('enter-house', onEnter);
          bus.off('exit-house', onExit);
          bus.off('fast-travel', onFastTravel);
          detachSounds();
        });
      },
    },
  };
}
