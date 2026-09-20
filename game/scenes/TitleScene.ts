import Phaser from 'phaser';

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    // TODO: Track D fills in what this shows
  }

  update() {
    if (this.game.registry.get('world')) {
      this.scene.start('OverworldScene');
    }
  }
}
