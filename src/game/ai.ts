import type { PlayerID } from 'boardgame.io';

import {
  CardType,
  MapEventType,
  PlayerStatus,
  Sect,
  type CardUsageArgs,
  type GameState,
  type PlayerData
} from '../types';
import {
  getAttackRangeBonus,
  getEnemyIds,
  getHandLimit,
  getTeammateId,
  hasAllCardsInHand,
  hasCardInHand
} from './helpers';

const GOOD_OMEN_CARD_IDS = ['jixiang_haozao', 'jixiang_haoyun'] as const;
const SWIFT_CARD_IDS = ['ji_zhuiyue', 'ji_zhuying', 'ji_feiyan'] as const;

type SectArchetype = 'speed' | 'control' | 'aggressive' | 'balanced';

export interface AiCardPlay {
  cardId: string;
  targetPlayerId?: PlayerID;
  usageArgs?: CardUsageArgs;
}

export interface AiSkillPlay {
  targetPlayerId?: PlayerID;
}

function getSectArchetype(sect: Sect): SectArchetype {
  switch (sect) {
    case Sect.GUYUN:
    case Sect.KUANGLAN:
      return 'speed';
    case Sect.QINGXI:
    case Sect.ZUIHUAYIN:
    case Sect.MOSHANDAO:
    case Sect.JIULIUMEN:
      return 'control';
    case Sect.SANGENGTIAN:
      return 'aggressive';
    default:
      return 'balanced';
  }
}

function getRelativeDistance(source: PlayerData, target: PlayerData): number {
  return target.position - source.position;
}

function isWithinDirectionalWindow(
  source: PlayerData,
  target: PlayerData,
  maxAheadDistance: number,
  maxBehindDistance: number
): boolean {
  const distance = getRelativeDistance(source, target);
  return (distance >= 0 && distance <= maxAheadDistance) || (distance < 0 && Math.abs(distance) <= maxBehindDistance);
}

function hasTeamDebuff(player: PlayerData): boolean {
  return Object.keys(player.debuffs).length > 0 || player.status !== PlayerStatus.NORMAL;
}

function countCardsById(player: PlayerData, cardId: string): number {
  return player.handCards.filter((card) => card.id === cardId).length;
}

function getFurthestEnemyId(G: GameState, playerId: PlayerID): PlayerID | null {
  const [furthestEnemy] = getEnemyIds(G, playerId)
    .map((enemyId) => G.players[enemyId])
    .sort((left, right) => right.position - left.position);

  return furthestEnemy?.id ?? null;
}

function getOwnTeamLeaderPosition(G: GameState, playerId: PlayerID): number {
  const team = G.players[playerId].team;
  return Math.max(...Object.values(G.players).filter((candidate) => candidate.team === team).map((candidate) => candidate.position));
}

function canAttackWithLingxuFromPosition(G: GameState, playerId: PlayerID, position: number): PlayerID | null {
  const player = G.players[playerId];
  if (!hasCardInHand(player, 'lingxu_yizhi')) {
    return null;
  }

  const attackRange = 2 + getAttackRangeBonus(player);
  const [target] = getEnemyIds(G, playerId)
    .map((enemyId) => G.players[enemyId])
    .filter((enemy) => Math.abs(enemy.position - position) <= attackRange)
    .sort((left, right) => right.position - left.position);

  return target?.id ?? null;
}

function canAttackWithSangengtianSkillFromPosition(G: GameState, playerId: PlayerID, position: number): PlayerID | null {
  const player = G.players[playerId];
  if (player.sect !== Sect.SANGENGTIAN || player.activeSkillCooldown > 0 || player.hasUsedSkillThisTurn) {
    return null;
  }

  const attackRange = 6 + getAttackRangeBonus(player);
  const [target] = getEnemyIds(G, playerId)
    .map((enemyId) => G.players[enemyId])
    .filter((enemy) => Math.abs(enemy.position - position) <= attackRange)
    .sort((left, right) => right.position - left.position);

  return target?.id ?? null;
}

function canOddAttackFromPosition(G: GameState, playerId: PlayerID, position: number): boolean {
  return Boolean(canAttackWithLingxuFromPosition(G, playerId, position) || canAttackWithSangengtianSkillFromPosition(G, playerId, position));
}

function getPositiveBuffTargetId(G: GameState, playerId: PlayerID): PlayerID {
  const player = G.players[playerId];
  const teammateId = getTeammateId(G, playerId);
  const teammate = teammateId ? G.players[teammateId] : null;
  const archetype = getSectArchetype(player.sect);

  if (archetype === 'speed' || !teammate) {
    return playerId;
  }

  return teammate.id;
}

function getRecoveryTargetId(G: GameState, playerId: PlayerID): PlayerID {
  const player = G.players[playerId];
  const teammateId = getTeammateId(G, playerId);
  const teammate = teammateId ? G.players[teammateId] : null;
  const archetype = getSectArchetype(player.sect);

  if (hasTeamDebuff(player)) {
    return playerId;
  }

  if (teammate && hasTeamDebuff(teammate)) {
    return teammate.id;
  }

  if (archetype === 'control' && teammate) {
    return teammate.id;
  }

  return playerId;
}

function getCleanseTargetId(G: GameState, playerId: PlayerID): PlayerID | null {
  const player = G.players[playerId];
  if (hasTeamDebuff(player)) {
    return playerId;
  }

  const teammateId = getTeammateId(G, playerId);
  if (!teammateId) {
    return null;
  }

  return hasTeamDebuff(G.players[teammateId]) ? teammateId : null;
}

function getAvailableAffordableCardIds(G: GameState, playerId: PlayerID): Set<string> {
  const player = G.players[playerId];
  return new Set(G.currentShop.filter((card) => card.price <= player.gold).map((card) => card.id));
}

function violatesJubaopenThreshold(player: PlayerData, cardId: string, price: number): boolean {
  if (cardId === 'jubaopen' || !hasCardInHand(player, 'jubaopen')) {
    return false;
  }

  const remainingGold = player.gold - price;
  return (player.gold >= 90 && remainingGold < 90) || (player.gold >= 50 && remainingGold < 50);
}

function pickShopCard(
  G: GameState,
  playerId: PlayerID,
  cardId: string,
  options?: {
    skipPassiveDuplicate?: boolean;
  }
): string | null {
  const player = G.players[playerId];
  const card = G.currentShop.find((candidate) => candidate.id === cardId && candidate.price <= player.gold);
  if (!card) {
    return null;
  }

  if (options?.skipPassiveDuplicate && card.isPassive && hasCardInHand(player, card.id)) {
    return null;
  }

  if (violatesJubaopenThreshold(player, card.id, card.price)) {
    return null;
  }

  return card.id;
}

function findBestLingyunAttackStep(G: GameState, playerId: PlayerID): number | null {
  const currentPosition = G.players[playerId].position;
  for (let step = 6; step >= 3; step -= 1) {
    const targetPosition = Math.min(currentPosition + step, G.board.totalTiles - 1);
    if (canOddAttackFromPosition(G, playerId, targetPosition)) {
      return step;
    }
  }

  return null;
}

function findBestLingyunMysteryStep(G: GameState, playerId: PlayerID): number | null {
  const currentPosition = G.players[playerId].position;
  for (let step = 6; step >= 3; step -= 1) {
    const targetPosition = Math.min(currentPosition + step, G.board.totalTiles - 1);
    if (G.board.tiles[targetPosition]?.eventType === MapEventType.MYSTERY) {
      return step;
    }
  }

  return null;
}

function findBestLingyunFallbackStep(G: GameState, playerId: PlayerID): number | null {
  const currentPosition = G.players[playerId].position;
  for (let step = 6; step >= 3; step -= 1) {
    const targetPosition = Math.min(currentPosition + step, G.board.totalTiles - 1);
    const tile = G.board.tiles[targetPosition];
    if (targetPosition === G.board.totalTiles - 1 || tile?.eventType !== MapEventType.BOSS) {
      return step;
    }
  }

  return null;
}

export function chooseAiShopCardId(G: GameState, playerId: PlayerID): string | null {
  const player = G.players[playerId];
  if (player.handCards.length >= getHandLimit(player)) {
    return null;
  }

  const availableCardIds = getAvailableAffordableCardIds(G, playerId);
  if (availableCardIds.size === 0) {
    return null;
  }

  const archetype = getSectArchetype(player.sect);
  const teammateId = getTeammateId(G, playerId);
  const teammate = teammateId ? G.players[teammateId] : null;
  const furthestEnemyId = getFurthestEnemyId(G, playerId);
  const furthestEnemy = furthestEnemyId ? G.players[furthestEnemyId] : null;

  const enemyHasImmediateOddAttackThreat = getEnemyIds(G, playerId).some((enemyId) => {
    const enemy = G.players[enemyId];
    return enemy.handCards.some((card) => card.type === CardType.ATTACK) && isWithinDirectionalWindow(player, enemy, 3, 15);
  });

  const sangengtianThreat = getEnemyIds(G, playerId).some((enemyId) => {
    const enemy = G.players[enemyId];
    return enemy.sect === Sect.SANGENGTIAN && enemy.activeSkillCooldown <= 0 && isWithinDirectionalWindow(player, enemy, 5, 15);
  });

  if ((enemyHasImmediateOddAttackThreat || sangengtianThreat) && availableCardIds.has('wuxiang_jinshen')) {
    return pickShopCard(G, playerId, 'wuxiang_jinshen', { skipPassiveDuplicate: true });
  }

  const hasNearbyEnemyForLingxu = getEnemyIds(G, playerId).some((enemyId) =>
    isWithinDirectionalWindow(player, G.players[enemyId], 15, 6)
  );
  if (hasNearbyEnemyForLingxu && availableCardIds.has('lingxu_yizhi')) {
    return pickShopCard(G, playerId, 'lingxu_yizhi');
  }

  if (archetype === 'speed' && availableCardIds.has('lingyun_ta')) {
    return pickShopCard(G, playerId, 'lingyun_ta');
  }

  if (archetype === 'control' && availableCardIds.has('yinyang_mizongbu')) {
    return pickShopCard(G, playerId, 'yinyang_mizongbu');
  }

  if (
    archetype === 'control' &&
    furthestEnemy &&
    furthestEnemy.position - getOwnTeamLeaderPosition(G, playerId) > 10 &&
    availableCardIds.has('jinyu_shou')
  ) {
    return pickShopCard(G, playerId, 'jinyu_shou');
  }

  if (
    archetype === 'control' &&
    teammate &&
    hasTeamDebuff(teammate) &&
    availableCardIds.has('qingfeng_jiyue')
  ) {
    return pickShopCard(G, playerId, 'qingfeng_jiyue');
  }

  if (archetype === 'aggressive') {
    if (!hasCardInHand(player, 'sata_liuxing') && availableCardIds.has('sata_liuxing')) {
      return pickShopCard(G, playerId, 'sata_liuxing', { skipPassiveDuplicate: true });
    }

    if (hasCardInHand(player, 'sata_liuxing') && availableCardIds.has('qianlimu')) {
      return pickShopCard(G, playerId, 'qianlimu', { skipPassiveDuplicate: true });
    }
  }

  if (player.gold > 45 && availableCardIds.has('jubaopen')) {
    return pickShopCard(G, playerId, 'jubaopen', { skipPassiveDuplicate: true });
  }

  const hasGoodOmen = hasCardInHand(player, GOOD_OMEN_CARD_IDS[0]);
  const hasGoodLuck = hasCardInHand(player, GOOD_OMEN_CARD_IDS[1]);
  if (hasGoodOmen && !hasGoodLuck && availableCardIds.has(GOOD_OMEN_CARD_IDS[1])) {
    return pickShopCard(G, playerId, GOOD_OMEN_CARD_IDS[1], { skipPassiveDuplicate: true });
  }
  if (hasGoodLuck && !hasGoodOmen && availableCardIds.has(GOOD_OMEN_CARD_IDS[0])) {
    return pickShopCard(G, playerId, GOOD_OMEN_CARD_IDS[0], { skipPassiveDuplicate: true });
  }

  if (availableCardIds.has('liangshang_junzi')) {
    return pickShopCard(G, playerId, 'liangshang_junzi');
  }

  return null;
}

export function chooseAiMoveSteps(G: GameState, playerId: PlayerID, maxSteps: number): number {
  const currentPosition = G.players[playerId].position;
  for (let step = maxSteps; step >= 1; step -= 1) {
    if (canOddAttackFromPosition(G, playerId, currentPosition + step)) {
      return step;
    }
  }

  return Math.max(0, maxSteps);
}

export function chooseAiCardPlay(G: GameState, playerId: PlayerID): AiCardPlay | null {
  const player = G.players[playerId];
  const teammateId = getTeammateId(G, playerId);
  const teammate = teammateId ? G.players[teammateId] : null;
  const archetype = getSectArchetype(player.sect);
  const furthestEnemyId = getFurthestEnemyId(G, playerId);
  const attackTargetId = canAttackWithLingxuFromPosition(G, playerId, player.position);

  if (hasCardInHand(player, 'qingfeng_jiyue')) {
    const targetId = getCleanseTargetId(G, playerId);
    if (targetId) {
      return {
        cardId: 'qingfeng_jiyue',
        targetPlayerId: targetId
      };
    }
  }

  if (hasCardInHand(player, 'miaoshou_huichun')) {
    return {
      cardId: 'miaoshou_huichun',
      targetPlayerId: getRecoveryTargetId(G, playerId)
    };
  }

  if (hasCardInHand(player, 'shengcai_youdao') && !player.buffs.shengcai) {
    return {
      cardId: 'shengcai_youdao'
    };
  }

  if (hasCardInHand(player, 'yinyang_mizongbu')) {
    return {
      cardId: 'yinyang_mizongbu',
      targetPlayerId: getPositiveBuffTargetId(G, playerId)
    };
  }

  if (attackTargetId) {
    return {
      cardId: 'lingxu_yizhi',
      targetPlayerId: attackTargetId
    };
  }

  if (hasCardInHand(player, 'lingyun_ta')) {
    const preferredStep =
      findBestLingyunAttackStep(G, playerId) ??
      findBestLingyunMysteryStep(G, playerId) ??
      findBestLingyunFallbackStep(G, playerId);

    if (preferredStep) {
      return {
        cardId: 'lingyun_ta',
        usageArgs: {
          selectedSteps: preferredStep
        }
      };
    }
  }

  if (furthestEnemyId && hasCardInHand(player, 'jinyu_shou')) {
    return {
      cardId: 'jinyu_shou',
      targetPlayerId: furthestEnemyId
    };
  }

  if (furthestEnemyId && hasCardInHand(player, 'shexing_nayue')) {
    return {
      cardId: 'shexing_nayue',
      targetPlayerId: furthestEnemyId
    };
  }

  if (furthestEnemyId && hasCardInHand(player, 'daodao_budaodao')) {
    return {
      cardId: 'daodao_budaodao',
      targetPlayerId: furthestEnemyId
    };
  }

  if (furthestEnemyId && hasCardInHand(player, 'liangshang_junzi')) {
    return {
      cardId: 'liangshang_junzi',
      targetPlayerId: furthestEnemyId
    };
  }

  if (
    hasCardInHand(player, 'pofu_chenzhou') &&
    player.gold >= 20 &&
    player.handCards.length <= getHandLimit(player) - 1 &&
    getEnemyIds(G, playerId).some((enemyId) => isWithinDirectionalWindow(player, G.players[enemyId], 15, 6))
  ) {
    return {
      cardId: 'pofu_chenzhou'
    };
  }

  if (hasCardInHand(player, 'yizhi_qianjin')) {
    const canReachFinish = player.position + Math.min(Math.floor(player.gold / 5), 20) >= G.board.totalTiles - 1;
    if (canReachFinish || player.gold >= 25) {
      return {
        cardId: 'yizhi_qianjin'
      };
    }
  }

  if (
    hasCardInHand(player, 'youqian_renxing') &&
    teammate &&
    teammate.position > player.position &&
    player.gold >= 40
  ) {
    return {
      cardId: 'youqian_renxing',
      targetPlayerId: teammate.id
    };
  }

  if (
    hasCardInHand(player, 'paiyou_jienan') &&
    teammate &&
    player.handCards.length > 1 &&
    teammate.handCards.length < getHandLimit(teammate)
  ) {
    return {
      cardId: 'paiyou_jienan',
      targetPlayerId: teammate.id
    };
  }

  if (archetype === 'control' && teammate && hasCardInHand(player, 'yinyang_mizongbu')) {
    return {
      cardId: 'yinyang_mizongbu',
      targetPlayerId: teammate.id
    };
  }

  return null;
}

export function chooseAiSkillPlay(G: GameState, playerId: PlayerID): AiSkillPlay | null {
  const player = G.players[playerId];
  if (player.activeSkillCooldown > 0 || player.hasUsedSkillThisTurn) {
    return null;
  }

  const furthestEnemyId = getFurthestEnemyId(G, playerId);
  const furthestEnemy = furthestEnemyId ? G.players[furthestEnemyId] : null;

  switch (player.sect) {
    case Sect.TIANQUAN:
      return player.gold >= 15 ? {} : null;
    case Sect.GUYUN:
      if (player.position + 6 >= G.board.totalTiles - 1) {
        return {};
      }
      return furthestEnemy && furthestEnemy.position - player.position > 12 ? {} : null;
    case Sect.SANGENGTIAN: {
      const targetId = canAttackWithSangengtianSkillFromPosition(G, playerId, player.position);
      return targetId ? { targetPlayerId: targetId } : null;
    }
    case Sect.LIYUAN:
    case Sect.ZUIHUAYIN:
    case Sect.JIULIUMEN:
      return furthestEnemyId ? { targetPlayerId: furthestEnemyId } : null;
    default:
      return {};
  }
}

export function chooseAiDiscardCardId(G: GameState, playerId: PlayerID): string | null {
  const player = G.players[playerId];
  const teammateId = getTeammateId(G, playerId);
  const teammate = teammateId ? G.players[teammateId] : null;

  const hasNearbyThreat = getEnemyIds(G, playerId).some((enemyId) =>
    isWithinDirectionalWindow(player, G.players[enemyId], 3, 15)
  );
  if (!hasNearbyThreat) {
    if (hasCardInHand(player, 'lingxu_yizhi')) {
      return 'lingxu_yizhi';
    }
    if (hasCardInHand(player, 'wuxiang_jinshen')) {
      return 'wuxiang_jinshen';
    }
  }

  if (!hasTeamDebuff(player) && (!teammate || !hasTeamDebuff(teammate)) && hasCardInHand(player, 'qingfeng_jiyue')) {
    return 'qingfeng_jiyue';
  }

  if (player.gold < 40 && hasCardInHand(player, 'jubaopen')) {
    return 'jubaopen';
  }

  if (countCardsById(player, GOOD_OMEN_CARD_IDS[0]) > 1) {
    return GOOD_OMEN_CARD_IDS[0];
  }
  if (countCardsById(player, GOOD_OMEN_CARD_IDS[1]) > 1) {
    return GOOD_OMEN_CARD_IDS[1];
  }

  const hasGoodOmen = hasCardInHand(player, GOOD_OMEN_CARD_IDS[0]);
  const hasGoodLuck = hasCardInHand(player, GOOD_OMEN_CARD_IDS[1]);
  if (hasGoodOmen !== hasGoodLuck) {
    return hasGoodOmen ? GOOD_OMEN_CARD_IDS[0] : GOOD_OMEN_CARD_IDS[1];
  }

  for (const swiftCardId of SWIFT_CARD_IDS) {
    if (countCardsById(player, swiftCardId) > 1) {
      return swiftCardId;
    }
  }

  if (!hasAllCardsInHand(player, [...SWIFT_CARD_IDS])) {
    const singleSwift = player.handCards.find((card) => SWIFT_CARD_IDS.includes(card.id as (typeof SWIFT_CARD_IDS)[number]));
    if (singleSwift) {
      return singleSwift.id;
    }
  }

  const passiveFallback = player.handCards.find((card) => card.isPassive);
  return passiveFallback?.id ?? player.handCards[player.handCards.length - 1]?.id ?? null;
}
