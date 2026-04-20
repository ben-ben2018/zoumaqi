import Phaser from 'phaser';

import { CURRENT_TILE_SIZE, TILE_SIZE, getTileCoordinates, TOTAL_TILES } from './boardData';
import type { PlayerData, TileData } from '../../types';

export class BoardScene extends Phaser.Scene {
  private tileLayer?: Phaser.GameObjects.Graphics;
  private tokenLayer?: Phaser.GameObjects.Graphics;

  constructor() {
    super('BoardScene');
  }

  create() {
    this.cameras.main.setBackgroundColor('#f1e8d8');
    this.tileLayer = this.add.graphics();
    this.tokenLayer = this.add.graphics();
    this.drawTrack();
  }

  drawTrack() {
    if (!this.tileLayer) {
      return;
    }

    this.tileLayer.clear();
    this.tileLayer.lineStyle(8, 0xcab58c, 1);

    for (let index = 0; index < TOTAL_TILES; index += 1) {
      const point = getTileCoordinates(index);
      if (index === 0) {
        this.tileLayer.moveTo(point.x, point.y);
      } else {
        this.tileLayer.lineTo(point.x, point.y);
      }
    }
    this.tileLayer.strokePath();

    for (let index = 0; index < TOTAL_TILES; index += 1) {
      const point = getTileCoordinates(index);
      const tileSize = index === TOTAL_TILES - 1 ? CURRENT_TILE_SIZE : TILE_SIZE;
      this.tileLayer.fillStyle(index === TOTAL_TILES - 1 ? 0x6f4e39 : 0xf7f0e2, 1);
      this.tileLayer.fillRect(point.x - tileSize / 2, point.y - tileSize / 2, tileSize, tileSize);
      this.tileLayer.lineStyle(2, 0x44331e, 0.26);
      this.tileLayer.strokeRect(point.x - tileSize / 2, point.y - tileSize / 2, tileSize, tileSize);
      this.add.text(point.x, point.y, String(index + 1), {
        color: index === TOTAL_TILES - 1 ? '#f5ead7' : '#3d2f22',
        fontFamily: 'KaiTi, serif',
        fontSize: '10px'
      }).setOrigin(0.5);
    }
  }

  syncState(tiles: TileData[], players: PlayerData[]) {
    if (!this.tokenLayer) {
      return;
    }

    this.tokenLayer.clear();
    players.forEach((player, index) => {
      const tile = tiles[player.position];
      const offsetX = ((index % 2) - 0.5) * 10;
      const offsetY = Math.floor(index / 2) * 10 - 5;
      this.tokenLayer?.fillStyle(player.team === 0 ? 0x8d4b3c : 0x506f7b, 1);
      this.tokenLayer?.fillCircle(tile.x + offsetX, tile.y + offsetY, 5);
    });
  }

  animateToken(playerIndex: number, fromIndex: number, toIndex: number) {
    const from = getTileCoordinates(fromIndex);
    const to = getTileCoordinates(toIndex);

    const token = this.add.circle(from.x, from.y, 10, playerIndex % 2 === 0 ? 0x8d4b3c : 0x506f7b);
    this.tweens.add({
      targets: token,
      x: to.x,
      y: to.y,
      ease: 'Cubic.easeInOut',
      duration: 520
    });
  }
}
