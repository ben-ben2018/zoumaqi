import Phaser from 'phaser';

import { BOARD_CANVAS_HEIGHT, BOARD_CANVAS_WIDTH, BOARD_RENDER_SCALE, CURRENT_TILE_SIZE, TILE_SIZE } from './boardData';
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
    x: ((playerIndex % 2) - 0.5) * 10 * BOARD_RENDER_SCALE,
    y: Math.floor(playerIndex / 2) * 10 * BOARD_RENDER_SCALE - 5 * BOARD_RENDER_SCALE
  };
}

const BACKDROP_STRIPE_GAP = 40 * BOARD_RENDER_SCALE;
const TRACK_LINE_WIDTH = 10 * BOARD_RENDER_SCALE;
const TILE_BORDER_WIDTH = 2 * BOARD_RENDER_SCALE;
const ACTIVE_TILE_HIGHLIGHT_PADDING = 4 * BOARD_RENDER_SCALE;
const TILE_LABEL_FONT_SIZE = `${10 * BOARD_RENDER_SCALE}px`;
const TOKEN_HALO_RADIUS = 12 * BOARD_RENDER_SCALE;
const TOKEN_SHADOW_WIDTH = 16 * BOARD_RENDER_SCALE;
const TOKEN_SHADOW_HEIGHT = 9 * BOARD_RENDER_SCALE;
const TOKEN_CORE_RADIUS = 5.5 * BOARD_RENDER_SCALE;
const TOKEN_CORE_STROKE_WIDTH = 1.2 * BOARD_RENDER_SCALE;
const TOKEN_LABEL_FONT_SIZE = `${8 * BOARD_RENDER_SCALE}px`;

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
  private viewportWidth = BOARD_CANVAS_WIDTH;
  private viewportHeight = BOARD_CANVAS_HEIGHT;
  private textResolution = 1;

  constructor() {
    super(BOARD_SCENE_KEY);
  }

  create() {
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor('#f1e8d8');
    this.applyViewportLayout();

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

  layoutViewport(width: number, height: number, textResolution = 1) {
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));
    const didResolutionChange = Math.abs(this.textResolution - textResolution) > 0.01;

    this.viewportWidth = nextWidth;
    this.viewportHeight = nextHeight;
    this.textResolution = Math.max(1, textResolution);
    this.applyViewportLayout();

    if (didResolutionChange) {
      this.lastTileSignature = '';
      this.tokenDisplays.forEach((display) => {
        display.label.setResolution(this.textResolution);
      });
    }

    if (this.pendingSnapshot && this.tileLayer && this.trackLayer && this.highlightLayer && this.labelLayer && this.tokenLayer) {
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

  private applyViewportLayout() {
    const camera = this.cameras?.main;
    if (!camera) {
      return;
    }

    const zoom = Math.min(this.viewportWidth / BOARD_CANVAS_WIDTH, this.viewportHeight / BOARD_CANVAS_HEIGHT);

    camera.setViewport(0, 0, this.viewportWidth, this.viewportHeight);
    camera.setZoom(Math.max(zoom, 0.1));
    camera.centerOn(BOARD_CANVAS_WIDTH / 2, BOARD_CANVAS_HEIGHT / 2);
    camera.setBounds(0, 0, BOARD_CANVAS_WIDTH, BOARD_CANVAS_HEIGHT);
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

    this.backgroundLayer.lineStyle(BOARD_RENDER_SCALE, 0x745838, 0.05);
    for (let x = -BOARD_CANVAS_HEIGHT; x < BOARD_CANVAS_WIDTH + BOARD_CANVAS_HEIGHT; x += BACKDROP_STRIPE_GAP) {
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
    this.trackLayer.lineStyle(TRACK_LINE_WIDTH, 0x694e2e, 0.18);
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
        fontSize: TILE_LABEL_FONT_SIZE
      });
      text.setResolution(this.textResolution);
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
        highlightLayer.fillRoundedRect(
          tile.x - tileHalfSize - ACTIVE_TILE_HIGHLIGHT_PADDING,
          tile.y - tileHalfSize - ACTIVE_TILE_HIGHLIGHT_PADDING,
          tileSize + ACTIVE_TILE_HIGHLIGHT_PADDING * 2,
          tileSize + ACTIVE_TILE_HIGHLIGHT_PADDING * 2,
          ACTIVE_TILE_HIGHLIGHT_PADDING
        );
      }

      tileLayer.fillStyle(getTileFillColor(tile.label), 1);
      tileLayer.fillRect(tile.x - tileHalfSize, tile.y - tileHalfSize, tileSize, tileSize);
      tileLayer.lineStyle(TILE_BORDER_WIDTH, isActiveTile ? 0x714d29 : 0x44331e, isActiveTile ? 0.4 : 0.26);
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
    const halo = this.add.circle(0, 0, TOKEN_HALO_RADIUS, 0xefd296, 0.28);
    halo.setVisible(false);

    const shadow = this.add.ellipse(0, 5 * BOARD_RENDER_SCALE, TOKEN_SHADOW_WIDTH, TOKEN_SHADOW_HEIGHT, 0x34291d, 0.18);
    const core = this.add.circle(0, 0, TOKEN_CORE_RADIUS, getTokenColor(player.team), 1);
    core.setStrokeStyle(TOKEN_CORE_STROKE_WIDTH, 0xf9f2e8, 0.8);

    const label = this.add.text(0, BOARD_RENDER_SCALE, player.name.replace('P', ''), {
      color: '#f7f0e4',
      fontFamily: 'FZCJLJT, Noto Serif SC, Songti SC, serif',
      fontSize: TOKEN_LABEL_FONT_SIZE
    });
    label.setResolution(this.textResolution);
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
