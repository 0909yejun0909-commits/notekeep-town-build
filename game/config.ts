import Phaser from 'phaser';
import BootScene from '@/game/scenes/BootScene';
import TitleScene from '@/game/scenes/TitleScene';
import OverworldScene from '@/game/scenes/OverworldScene';
import InteriorScene from '@/game/scenes/InteriorScene';
import { bus } from '@/game/bus';

const GAME_W = 16 * 20;
const GAME_H = 16 * 15;

// Largest integer zoom whose 20x15-tile view still fits the window. Never fractional.
export function fitZoom(): number {
  if (typeof window === 'undefined') return 3;
  return Math.max(1, Math.floor(Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H)));
}

export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    width: GAME_W,
    height: GAME_H,
    zoom: fitZoom(),
    scene: [BootScene, TitleScene, OverworldScene, InteriorScene],
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    callbacks: {
      postBoot: (game) => {
        window.addEventListener('resize', () => game.scale.setZoom(fitZoom()));
        // SceneManager.start() does not stop the caller the way Scene.scene.start() does,
        // so stop the scene we are leaving or both keep updating and rendering.
        bus.on('enter-house', ({ houseId }) => {
          game.scene.stop('OverworldScene');
          game.scene.start('InteriorScene', { houseId });
        });
        bus.on('exit-house', () => {
          game.scene.stop('InteriorScene');
          game.scene.start('OverworldScene');
        });
      },
    },
  };
}
