import Phaser from 'phaser';
import BootScene from '@/game/scenes/BootScene';
import TitleScene from '@/game/scenes/TitleScene';
import OverworldScene from '@/game/scenes/OverworldScene';
import InteriorScene from '@/game/scenes/InteriorScene';
import { bus } from '@/game/bus';

const ZOOM = 3;

// The canvas fills the window at an integer zoom: game size = window / ZOOM, so
// there is never a letterbox and never a fractional scale.
function viewSize() {
  return {
    width: Math.max(16 * 10, Math.floor(window.innerWidth / ZOOM)),
    height: Math.max(16 * 8, Math.floor(window.innerHeight / ZOOM)),
  };
}

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  const { width, height } = viewSize();
  return {
    type: Phaser.AUTO,
    parent,
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    width,
    height,
    zoom: ZOOM,
    fps: { forceSetTimeOut: true },
    scene: [BootScene, TitleScene, OverworldScene, InteriorScene],
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    callbacks: {
      postBoot: (game) => {
        const onResize = () => {
          const s = viewSize();
          game.scale.resize(s.width, s.height);
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
        const onFastTravel = ({ houseId, noteId }: { houseId: string; noteId?: string }) => {
          const doors = game.registry.get('houseDoors') as Map<string, { gx: number; gy: number }> | undefined;
          const door = doors?.get(houseId);
          if (door) game.registry.set('returnTile', { gx: door.gx, gy: door.gy + 1 });
          game.scene.stop('OverworldScene');
          game.scene.stop('InteriorScene');
          game.scene.start('InteriorScene', { houseId, noteId });
        };
        window.addEventListener('resize', onResize);
        bus.on('enter-house', onEnter);
        bus.on('exit-house', onExit);
        bus.on('fast-travel', onFastTravel);
        game.events.once(Phaser.Core.Events.DESTROY, () => {
          window.removeEventListener('resize', onResize);
          bus.off('enter-house', onEnter);
          bus.off('exit-house', onExit);
          bus.off('fast-travel', onFastTravel);
        });
      },
    },
  };
}
