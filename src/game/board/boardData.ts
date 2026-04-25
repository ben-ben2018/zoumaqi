import type { PlayerID } from 'boardgame.io';

import { MapEventType, type BoardData, type GameState, type TileData } from '../../types';
import { drawDistinctRandomCards, drawRandomCards, findCardById } from '../cards/cardData';
import { appendLog, grantCardsToPlayer, setTimedEffect, takeRandomCard } from '../helpers';

export const TOTAL_TILES = 100;
export const SHOP_TILE_INDICES = [5, 13, 25, 38, 51, 61, 71, 81, 90];
export const MYSTERY_TILE_INDICES = [3, 7, 10, 15, 18, 23, 27, 30, 34, 43, 47, 54, 59, 64, 68, 73, 78, 84, 88, 93];
export const BOSS_TILE_INDICES = [11, 20, 28, 33, 55, 63, 77, 94];

export const BOARD_COLUMNS = 20;
export const BOARD_ROWS = TOTAL_TILES / BOARD_COLUMNS;
export const BOARD_RENDER_SCALE = 2;
export const TILE_GAP = 34 * BOARD_RENDER_SCALE;
export const TILE_SIZE = 18 * BOARD_RENDER_SCALE;
export const CURRENT_TILE_SIZE = 22 * BOARD_RENDER_SCALE;
export const OFFSET_X = 32 * BOARD_RENDER_SCALE;
export const OFFSET_Y = 32 * BOARD_RENDER_SCALE;
export const BOARD_CANVAS_WIDTH = OFFSET_X * 2 + (BOARD_COLUMNS - 1) * TILE_GAP + CURRENT_TILE_SIZE;
export const BOARD_CANVAS_HEIGHT = OFFSET_Y * 2 + (BOARD_ROWS - 1) * TILE_GAP + CURRENT_TILE_SIZE;

export function getTileCoordinates(index: number): { x: number; y: number } {
  const row = Math.floor(index / BOARD_COLUMNS);
  const rawColumn = index % BOARD_COLUMNS;
  const column = row % 2 === 0 ? rawColumn : BOARD_COLUMNS - 1 - rawColumn;

  return {
    x: OFFSET_X + column * TILE_GAP,
    y: OFFSET_Y + (BOARD_ROWS - 1 - row) * TILE_GAP
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

const FIRST_SHOP_CARD_IDS = [
  'qingfeng_jiyue',
  'wuxiang_jinshen',
  'lingyun_ta',
  'yinyang_mizongbu',
  'lingxu_yizhi',
  'shengcai_youdao'
] as const;

const SECOND_SHOP_CARD_IDS = [...FIRST_SHOP_CARD_IDS, 'ji_zhuiyue'] as const;

function buildFixedShopCards(cardIds: readonly string[]) {
  return cardIds
    .map((cardId) => findCardById(cardId))
    .filter((card): card is NonNullable<typeof card> => card !== undefined);
}

export function generateShopCards(shopTileIndex: number) {
  const shopOrder = SHOP_TILE_INDICES.indexOf(shopTileIndex);

  if (shopOrder === 0) {
    return buildFixedShopCards(FIRST_SHOP_CARD_IDS);
  }

  if (shopOrder === 1) {
    return buildFixedShopCards(SECOND_SHOP_CARD_IDS);
  }

  if (shopOrder >= 2 && shopOrder <= 4) {
    return drawDistinctRandomCards(10, 'shop');
  }

  if (shopOrder >= 5) {
    return drawDistinctRandomCards(15, 'shop');
  }

  return drawDistinctRandomCards(10, 'shop');
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
