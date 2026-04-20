import type { PlayerID } from 'boardgame.io';

import { MapEventType, type BoardData, type GameState, type TileData } from '../../types';
import { drawRandomCards } from '../cards/cardData';
import { appendLog, grantCardsToPlayer, setTimedEffect, takeRandomCard } from '../helpers';

export const TOTAL_TILES = 50;
export const SHOP_TILE_INDICES = [3, 10, 20, 30, 40];
export const MYSTERY_TILE_INDICES = [6, 13, 23, 33, 43];
export const BOSS_TILE_INDICES = [15, 25, 35, 45];

const BOARD_COLUMNS = 10;
const TILE_GAP = 92;
const OFFSET_X = 72;
const OFFSET_Y = 64;

export function getTileCoordinates(index: number): { x: number; y: number } {
  const row = Math.floor(index / BOARD_COLUMNS);
  const rawColumn = index % BOARD_COLUMNS;
  const column = row % 2 === 0 ? rawColumn : BOARD_COLUMNS - 1 - rawColumn;

  return {
    x: OFFSET_X + column * TILE_GAP,
    y: OFFSET_Y + (4 - row) * TILE_GAP
  };
}

export function createBoardData(): BoardData {
  const tiles: TileData[] = Array.from({ length: TOTAL_TILES }, (_, index) => {
    let eventType = MapEventType.EMPTY;
    let label = `${index + 1}`;

    if (SHOP_TILE_INDICES.includes(index)) {
      eventType = MapEventType.SHOP;
      label = '商';
    } else if (MYSTERY_TILE_INDICES.includes(index)) {
      eventType = MapEventType.MYSTERY;
      label = '奇';
    } else if (BOSS_TILE_INDICES.includes(index)) {
      eventType = MapEventType.BOSS;
      label = '首';
    } else if (index === TOTAL_TILES - 1) {
      label = '终';
    }

    const { x, y } = getTileCoordinates(index);

    return {
      index,
      eventType,
      label,
      x,
      y,
      eventData: null
    };
  });

  return {
    totalTiles: TOTAL_TILES,
    tiles
  };
}

export function generateShopCards(count = 3) {
  // TODO: 按地图、回合和刷新权重接入正式商店卡池逻辑。
  return drawRandomCards(count, 'shop');
}

function queueNextRollModifier(
  G: GameState,
  playerId: PlayerID,
  key: 'mystery_roll_bonus' | 'boss_roll_penalty',
  delta: number
): void {
  const player = G.players[playerId];
  const container = delta >= 0 ? player.buffs : player.debuffs;
  const current = container[key];
  const nextModifiers = current ? [...(((current.value as { modifiers?: number[] }).modifiers ?? [])), delta] : [delta];

  setTimedEffect(container, key, 2, {
    modifiers: nextModifiers
  });
}

export function applyMysteryEvent(G: GameState, playerId: PlayerID): void {
  const player = G.players[playerId];
  const roll = Math.floor(Math.random() * 4);

  if (roll === 0) {
    queueNextRollModifier(G, playerId, 'mystery_roll_bonus', 3);
    appendLog(G, `${player.name} 触发奇遇，获得正面增益：下一回合投骰点数 +3。`);
    return;
  }

  if (roll === 1) {
    queueNextRollModifier(G, playerId, 'mystery_roll_bonus', 4);
    appendLog(G, `${player.name} 触发奇遇，获得正面增益：下一回合投骰点数 +4。`);
    return;
  }

  if (roll === 2) {
    const accepted = grantCardsToPlayer(G, playerId, drawRandomCards(1, 'reward'), '地图奇遇');
    appendLog(G, `${player.name} 触发奇遇，随机获得了 ${accepted[0].name}。`);
    return;
  }

  player.gold += 20;
  appendLog(G, `${player.name} 触发奇遇，获得 20 棋珍。`);
}

export function applyBossEvent(G: GameState, playerId: PlayerID): void {
  const player = G.players[playerId];
  const roll = Math.floor(Math.random() * 4);

  if (roll === 0) {
    queueNextRollModifier(G, playerId, 'boss_roll_penalty', -3);
    appendLog(G, `${player.name} 踏入首领格，受到负面效果：下一回合投骰点数 -3。`);
    return;
  }

  if (roll === 1) {
    queueNextRollModifier(G, playerId, 'boss_roll_penalty', -4);
    appendLog(G, `${player.name} 踏入首领格，受到负面效果：下一回合投骰点数 -4。`);
    return;
  }

  if (roll === 2) {
    const lostCard = takeRandomCard(player);
    appendLog(
      G,
      lostCard ? `${player.name} 踏入首领格，随机失去了 ${lostCard.name}。` : `${player.name} 踏入首领格，但当前没有手牌可失去。`
    );
    return;
  }

  const tribute = Math.min(player.gold, 20);
  player.gold -= tribute;
  appendLog(G, `${player.name} 踏入首领格，失去了 ${tribute} 棋珍。`);
}
