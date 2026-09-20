import Phaser from 'phaser';
import BootScene from '@/game/scenes/BootScene';
import TitleScene from '@/game/scenes/TitleScene';
import OverworldScene from '@/game/scenes/OverworldScene';
import InteriorScene from '@/game/scenes/InteriorScene';
import { bus } from '@/game/bus';

const ZOOM = 3;

// The canvas fills the window at an integer zoom: game size = window / ZOOM.
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
        const onEnter = ({ houseId }: { houseId: string }) => {
          game.scene.start('InteriorScene', { houseId });
        };
        const onExit = () => {
          game.scene.start('OverworldScene');
        };
        window.addEventListener('resize', onResize);
        bus.on('enter-house', onEnter);
        bus.on('exit-house', onExit);
        game.events.once(Phaser.Core.Events.DESTROY, () => {
          window.removeEventListener('resize', onResize);
          bus.off('enter-house', onEnter);
          bus.off('exit-house', onExit);
        });
      },
    },
  };
}
