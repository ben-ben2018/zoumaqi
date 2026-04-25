import Phaser from 'phaser';

import { BOARD_CANVAS_HEIGHT, BOARD_CANVAS_WIDTH, CURRENT_TILE_SIZE, TILE_SIZE } from './boardData';
import { PlayerTeam, type PlayerData, type TileData } from '../../types';

export const BOARD_SCENE_KEY = 'BoardScene';

export type BoardRenderSnapshot = {
  tiles: TileData[];
  players: PlayerData[];
  currentPlayerId: string;
};

type TokenDisplay = {
  root: Phaser.GameObjects.Container;
  halo: Phaser.GameObjects.Arc;
  body: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  core: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  logicalPosition: number;
};

function comparePlayers(left: PlayerData, right: PlayerData): number {
  return Number(left.id) - Number(right.id);
}

function getTokenOffset(playerIndex: number) {
  return {
    x: ((playerIndex % 2) - 0.5) * 10,
    y: Math.floor(playerIndex / 2) * 10 - 5
  };
}

function getTileFillColor(label: string): number {
  if (label === '终') {
    return 0x6b4c34;
  }
  if (label === '商') {
    return 0xb88c4f;
  }
  if (label === '奇') {
    return 0x6f8770;
  }
  if (label === '首') {
    return 0x8a5844;
  }
  return 0xf5ecdc;
}

function getTileTextColor(label: string): string {
  return label === '终' ? '#f5ebdc' : '#433323';
}

function getTokenColor(team: PlayerTeam): number {
  return team === PlayerTeam.RED ? 0x8d4b3c : 0x506f7b;
}

export class BoardScene extends Phaser.Scene {
  private backgroundLayer?: Phaser.GameObjects.Graphics;
  private trackLayer?: Phaser.GameObjects.Graphics;
  private tileLayer?: Phaser.GameObjects.Graphics;
  private highlightLayer?: Phaser.GameObjects.Graphics;
  private labelLayer?: Phaser.GameObjects.Container;
  private tokenLayer?: Phaser.GameObjects.Container;
  private tokenDisplays = new Map<string, TokenDisplay>();
  private lastTileSignature = '';
  private pendingSnapshot: BoardRenderSnapshot | null = null;

  constructor() {
    super(BOARD_SCENE_KEY);
  }

  create() {
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor('#f1e8d8');

    this.backgroundLayer = this.add.graphics();
    this.trackLayer = this.add.graphics();
    this.highlightLayer = this.add.graphics();
    this.tileLayer = this.add.graphics();
    this.labelLayer = this.add.container(0, 0);
    this.tokenLayer = this.add.container(0, 0);

    this.drawBackdrop();

    if (this.pendingSnapshot) {
      this.renderSnapshot(this.pendingSnapshot);
    }
  }

  syncState(snapshot: BoardRenderSnapshot) {
    this.pendingSnapshot = snapshot;

    if (!this.tileLayer || !this.trackLayer || !this.highlightLayer || !this.labelLayer || !this.tokenLayer) {
      return;
    }

    this.renderSnapshot(snapshot);
  }

  private renderSnapshot(snapshot: BoardRenderSnapshot) {
    const orderedPlayers = [...snapshot.players].sort(comparePlayers);
    const activePlayer = orderedPlayers.find((player) => player.id === snapshot.currentPlayerId) ?? null;
    const activeTileIndex = activePlayer?.position ?? null;
    const tileSignature = snapshot.tiles.map((tile) => `${tile.index}:${tile.label}:${tile.x}:${tile.y}`).join('|');

    if (tileSignature !== this.lastTileSignature) {
      this.drawBackdrop();
      this.drawTrack(snapshot.tiles);
      this.rebuildTileLabels(snapshot.tiles);
      this.lastTileSignature = tileSignature;
    }

    this.drawTiles(snapshot.tiles, activeTileIndex);
    this.syncTokens(snapshot.tiles, orderedPlayers, snapshot.currentPlayerId);
  }

  private drawBackdrop() {
    if (!this.backgroundLayer) {
      return;
    }

    this.backgroundLayer.clear();
    this.backgroundLayer.fillGradientStyle(0xfaf4e8, 0xfaf4e8, 0xd9c9ab, 0xeadfc7, 1);
    this.backgroundLayer.fillRect(0, 0, BOARD_CANVAS_WIDTH, BOARD_CANVAS_HEIGHT);

    this.backgroundLayer.lineStyle(1, 0x745838, 0.05);
    for (let x = -BOARD_CANVAS_HEIGHT; x < BOARD_CANVAS_WIDTH + BOARD_CANVAS_HEIGHT; x += 40) {
      this.backgroundLayer.beginPath();
      this.backgroundLayer.moveTo(x, 0);
      this.backgroundLayer.lineTo(x + BOARD_CANVAS_HEIGHT, BOARD_CANVAS_HEIGHT);
      this.backgroundLayer.strokePath();
    }
  }

  private drawTrack(tiles: TileData[]) {
    if (!this.trackLayer) {
      return;
    }

    this.trackLayer.clear();
    this.trackLayer.lineStyle(10, 0x694e2e, 0.18);
    this.trackLayer.beginPath();

    tiles.forEach((tile, index) => {
      if (index === 0) {
        this.trackLayer?.moveTo(tile.x, tile.y);
      } else {
        this.trackLayer?.lineTo(tile.x, tile.y);
      }
    });

    this.trackLayer.strokePath();
  }

  private rebuildTileLabels(tiles: TileData[]) {
    if (!this.labelLayer) {
      return;
    }

    this.labelLayer.removeAll(true);

    tiles.forEach((tile) => {
      const text = this.add.text(tile.x, tile.y, tile.label, {
        color: getTileTextColor(tile.label),
        fontFamily: 'FZCJLJT, Noto Serif SC, Songti SC, serif',
        fontSize: '10px'
      });
      text.setOrigin(0.5);
      this.labelLayer?.add(text);
    });
  }

  private drawTiles(tiles: TileData[], activeTileIndex: number | null) {
    if (!this.tileLayer || !this.highlightLayer) {
      return;
    }

    const highlightLayer = this.highlightLayer;
    const tileLayer = this.tileLayer;

    highlightLayer.clear();
    tileLayer.clear();

    tiles.forEach((tile) => {
      const isActiveTile = tile.index === activeTileIndex;
      const tileSize = tile.label === '终' ? CURRENT_TILE_SIZE : isActiveTile ? CURRENT_TILE_SIZE : TILE_SIZE;
      const tileHalfSize = tileSize / 2;

      if (isActiveTile) {
        highlightLayer.fillStyle(0xf8e4b9, 0.42);
        highlightLayer.fillRoundedRect(tile.x - tileHalfSize - 4, tile.y - tileHalfSize - 4, tileSize + 8, tileSize + 8, 4);
      }

      tileLayer.fillStyle(getTileFillColor(tile.label), 1);
      tileLayer.fillRect(tile.x - tileHalfSize, tile.y - tileHalfSize, tileSize, tileSize);
      tileLayer.lineStyle(2, isActiveTile ? 0x714d29 : 0x44331e, isActiveTile ? 0.4 : 0.26);
      tileLayer.strokeRect(tile.x - tileHalfSize, tile.y - tileHalfSize, tileSize, tileSize);
    });
  }

  private syncTokens(tiles: TileData[], players: PlayerData[], currentPlayerId: string) {
    if (!this.tokenLayer) {
      return;
    }

    const liveIds = new Set<string>();

    players.forEach((player, index) => {
      const tile = tiles[player.position];
      if (!tile) {
        return;
      }

      liveIds.add(player.id);
      const offset = getTokenOffset(index);
      const targetX = tile.x + offset.x;
      const targetY = tile.y + offset.y;
      const display = this.tokenDisplays.get(player.id) ?? this.createToken(player, targetX, targetY);

      display.root.setDepth(200 + index);
      display.halo.setVisible(player.id === currentPlayerId);
      display.core.setFillStyle(getTokenColor(player.team), 1);
      display.label.setText(player.name.replace('P', ''));

      if (display.logicalPosition === player.position) {
        if (Math.abs(display.root.x - targetX) > 0.1 || Math.abs(display.root.y - targetY) > 0.1) {
          display.root.setPosition(targetX, targetY);
        }
      } else {
        this.animateTokenAlongTiles(display, tiles, display.logicalPosition, player.position, index);
      }

      display.logicalPosition = player.position;
    });

    Array.from(this.tokenDisplays.entries()).forEach(([tokenId, display]) => {
      if (liveIds.has(tokenId)) {
        return;
      }

      this.tweens.killTweensOf(display.root);
      display.root.destroy(true);
      this.tokenDisplays.delete(tokenId);
    });
  }

  private createToken(player: PlayerData, x: number, y: number): TokenDisplay {
    const halo = this.add.circle(0, 0, 12, 0xefd296, 0.28);
    halo.setVisible(false);

    const shadow = this.add.ellipse(0, 5, 16, 9, 0x34291d, 0.18);
    const core = this.add.circle(0, 0, 5.5, getTokenColor(player.team), 1);
    core.setStrokeStyle(1.2, 0xf9f2e8, 0.8);

    const label = this.add.text(0, 1, player.name.replace('P', ''), {
      color: '#f7f0e4',
      fontFamily: 'FZCJLJT, Noto Serif SC, Songti SC, serif',
      fontSize: '8px'
    });
    label.setOrigin(0.5);

    const body = this.add.container(0, 0, [core, label]);
    const root = this.add.container(x, y, [halo, shadow, body]);
    this.tokenLayer?.add(root);

    const display = {
      root,
      halo,
      body,
      shadow,
      core,
      label,
      logicalPosition: player.position
    };

    this.tokenDisplays.set(player.id, display);
    return display;
  }

  private animateTokenAlongTiles(
    display: TokenDisplay,
    tiles: TileData[],
    fromIndex: number,
    toIndex: number,
    playerIndex: number
  ) {
    const safeFromIndex = Phaser.Math.Clamp(fromIndex, 0, tiles.length - 1);
    const safeToIndex = Phaser.Math.Clamp(toIndex, 0, tiles.length - 1);
    if (safeToIndex <= safeFromIndex) {
      const offset = getTokenOffset(playerIndex);
      const tile = tiles[safeToIndex];
      if (!tile) {
        return;
      }
      display.root.setPosition(tile.x + offset.x, tile.y + offset.y);
      display.body.setY(0);
      display.shadow.setScale(1, 1);
      return;
    }

    this.tweens.killTweensOf(display.root);
    this.tweens.killTweensOf(display.body);
    this.tweens.killTweensOf(display.shadow);

    const offset = getTokenOffset(playerIndex);
    const steps: Array<{
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      duration: number;
      hopHeight: number;
    }> = [];

    for (let index = safeFromIndex + 1; index <= safeToIndex; index += 1) {
      const fromTile = tiles[index - 1];
      const nextTile = tiles[index];
      if (!fromTile || !nextTile) {
        continue;
      }

      const fromX = fromTile.x + offset.x;
      const fromY = fromTile.y + offset.y;
      const toX = nextTile.x + offset.x;
      const toY = nextTile.y + offset.y;
      const distance = Phaser.Math.Distance.Between(fromX, fromY, toX, toY);
      const hopHeight = Phaser.Math.Clamp(7 + (safeToIndex - safeFromIndex) * 0.35, 7, 12);
      const duration = Phaser.Math.Clamp(110 + distance * 1.15, 140, 220);

      steps.push({
        fromX,
        fromY,
        toX,
        toY,
        duration,
        hopHeight
      });
    }

    const runStep = (stepIndex: number) => {
      const step = steps[stepIndex];
      if (!step) {
        display.body.setY(0);
        display.shadow.setScale(1, 1);
        return;
      }

      const progressState = {
        progress: 0
      };

      this.tweens.add({
        targets: progressState,
        progress: 1,
        duration: step.duration,
        ease: 'Sine.easeInOut',
        onStart: () => {
          display.root.setPosition(step.fromX, step.fromY);
        },
        onUpdate: () => {
          const value = progressState.progress;
          display.root.x = Phaser.Math.Linear(step.fromX, step.toX, value);
          display.root.y = Phaser.Math.Linear(step.fromY, step.toY, value);
          display.body.y = -Math.sin(value * Math.PI) * step.hopHeight;
          const shadowScale = 1 - Math.sin(value * Math.PI) * 0.18;
          display.shadow.setScale(shadowScale, shadowScale);
        },
        onComplete: () => {
          runStep(stepIndex + 1);
        }
      });
    };

    runStep(0);
  }
}
