import type { PlayerID } from 'boardgame.io';

import type { GameActionRequest, MatchSnapshot } from '../../multiplayer/protocol';
import { CardType, Sect, SkillTarget, TurnStage, type CardData, type GameState, type PlayerData } from '../../types';
import { getAbsoluteDistance, getAttackRangeBonus, getHandLimit, getSectLabel } from '../../game/helpers';

interface PromptBundle {
  system: string;
  user: string;
  allowedActions: GameActionRequest[];
}

const CARD_TYPE_LABELS: Record<CardType, string> = {
  [CardType.MOVEMENT]: '位移',
  [CardType.BUFF]: '增益',
  [CardType.DEBUFF]: '减益',
  [CardType.ATTACK]: '攻击',
  [CardType.ECONOMY]: '经济'
};

const TARGET_TYPE_LABELS: Record<SkillTarget, string> = {
  [SkillTarget.SELF]: '自己',
  [SkillTarget.ALLY]: '友方',
  [SkillTarget.ENEMY]: '敌方'
};

function summarizeCard(card: CardData): Record<string, unknown> {
  return {
    id: card.id,
    name: card.name,
    description: card.description,
    type: CARD_TYPE_LABELS[card.type],
    price: card.price,
    target: TARGET_TYPE_LABELS[card.targetType],
    passive: card.isPassive
  };
}

function summarizePlayer(player: PlayerData): Record<string, unknown> {
  return {
    id: player.id,
    name: player.name,
    team: player.team === 0 ? '赤队' : '青队',
    isBot: player.isBot,
    sect: getSectLabel(player.sect),
    position: player.position + 1,
    gold: player.gold,
    handLimit: getHandLimit(player),
    handCards: player.handCards.map(summarizeCard),
    buffs: player.buffs,
    debuffs: player.debuffs,
    status: player.status,
    activeSkillCooldown: player.activeSkillCooldown,
    lastRoll: player.lastRoll,
    hasRolledThisTurn: player.hasRolledThisTurn,
    hasMovedThisTurn: player.hasMovedThisTurn,
    hasUsedSkillThisTurn: player.hasUsedSkillThisTurn
  };
}

function getActiveCards(player: PlayerData): CardData[] {
  return player.handCards.filter((card) => !card.isPassive);
}

function getPlayersByTargetType(G: GameState, playerId: PlayerID, targetType: SkillTarget): PlayerID[] {
  if (targetType === SkillTarget.SELF) {
    return [playerId];
  }

  const ownTeam = G.players[playerId].team;
  return Object.values(G.players)
    .filter((player) => (targetType === SkillTarget.ALLY ? player.team === ownTeam : player.team !== ownTeam))
    .map((player) => player.id as PlayerID);
}

function canUseCardAction(G: GameState, playerId: PlayerID, card: CardData, targetPlayerId?: PlayerID): boolean {
  const player = G.players[playerId];
  const target = targetPlayerId ? G.players[targetPlayerId] : null;

  switch (card.id) {
    case 'shexing_nayue':
    case 'daodao_budaodao':
      return Boolean(target && target.handCards.length > 0);
    case 'liangshang_junzi':
      return Boolean(target && target.gold > 0);
    case 'lingxu_yizhi':
      return Boolean(targetPlayerId && getAbsoluteDistance(G, playerId, targetPlayerId) <= 2 + getAttackRangeBonus(player));
    case 'yizhi_qianjin':
      return player.gold > 0;
    case 'pofu_chenzhou':
      return player.gold >= 20;
    case 'youqian_renxing':
      return Boolean(target && target.team === player.team && target.id !== playerId && player.gold > 0);
    case 'paiyou_jienan':
      return Boolean(target && target.team === player.team && target.id !== playerId && player.handCards.length > 1);
    default:
      return true;
  }
}

function buildUseCardActions(G: GameState, playerId: PlayerID): GameActionRequest[] {
  const player = G.players[playerId];
  const actions: GameActionRequest[] = [];

  for (const card of getActiveCards(player)) {
    if (card.targetType === SkillTarget.SELF) {
      if (!canUseCardAction(G, playerId, card)) {
        continue;
      }

      if (card.id === 'lingyun_ta') {
        for (let selectedSteps = 3; selectedSteps <= 6; selectedSteps += 1) {
          actions.push({
              type: 'useCard',
              cardId: card.id,
              usageArgs: {
                selectedSteps
              }
            });
        }
      } else {
        actions.push({
          type: 'useCard',
          cardId: card.id
        });
      }
      continue;
    }

    for (const targetPlayerId of getPlayersByTargetType(G, playerId, card.targetType)) {
      if (!canUseCardAction(G, playerId, card, targetPlayerId)) {
        continue;
      }

      actions.push({
        type: 'useCard',
        cardId: card.id,
        targetPlayerId
      });
    }
  }

  return actions;
}

function buildSkillActions(G: GameState, playerId: PlayerID): GameActionRequest[] {
  const player = G.players[playerId];
  if (player.activeSkillCooldown > 0 || player.hasUsedSkillThisTurn) {
    return [];
  }

  switch (player.sect) {
    case Sect.LIYUAN:
    case Sect.SANGENGTIAN:
    case Sect.ZUIHUAYIN:
      return Object.values(G.players)
        .filter((candidate) => candidate.team !== player.team)
        .map((candidate) => ({
          type: 'useActiveSkill',
          targetPlayerId: candidate.id as PlayerID
        }));
    default:
      return [
        {
          type: 'useActiveSkill'
        }
      ];
  }
}

export function buildAllowedLlmActions(snapshot: MatchSnapshot, playerId: PlayerID): GameActionRequest[] {
  const { G } = snapshot;
  const player = G.players[playerId];
  if (!player) {
    return [];
  }

  const pendingDiscard = G.pendingDiscards[0];
  if (pendingDiscard) {
    if (pendingDiscard.playerId !== playerId) {
      return [];
    }

    return player.handCards.map((card) => ({
      type: 'discardOverflowCard',
      cardId: card.id
    }));
  }

  if (snapshot.ctx.currentPlayer !== playerId) {
    return [];
  }

  switch (G.turnStage) {
    case TurnStage.ROLL:
      return [
        ...buildSkillActions(G, playerId),
        ...buildUseCardActions(G, playerId),
        {
          type: 'rollDice'
        }
      ];
    case TurnStage.MOVE:
      return Array.from({ length: (G.pendingRoll ?? 0) + 1 }, (_unused, steps) => ({
        type: 'movePlayer',
        steps
      })) as GameActionRequest[];
    case TurnStage.SHOP:
      return [
        ...G.currentShop
          .filter((card) => card.price <= player.gold)
          .map((card) => ({
            type: 'buyCard' as const,
            cardId: card.id
          })),
        {
          type: 'finishShop'
        }
      ];
    case TurnStage.CARD:
      return [
        ...buildUseCardActions(G, playerId),
        ...buildSkillActions(G, playerId),
        {
          type: 'finishCardStage'
        }
      ];
    case TurnStage.SKILL:
      return [
        ...buildSkillActions(G, playerId),
        {
          type: 'finishSkillStage'
        }
      ];
    default:
      return [];
  }
}

export function buildLlmPrompt(snapshot: MatchSnapshot, playerId: PlayerID): PromptBundle {
  const { G, ctx } = snapshot;
  const allowedActions = buildAllowedLlmActions(snapshot, playerId);
  const player = G.players[playerId];
  const nearbyTiles = G.board.tiles.slice(player.position, Math.min(player.position + 16, G.board.totalTiles));

  const state = {
    goal: '四名玩家按 1P/2P/3P/4P 顺序行动，1P+3P 为赤队，2P+4P 为青队；队伍任一成员率先到终点即获胜。',
    currentPlayerId: ctx.currentPlayer,
    controlledPlayerId: playerId,
    turn: ctx.turn,
    turnStage: G.turnStage,
    pendingRoll: G.pendingRoll,
    pendingMovement: G.pendingMovement,
    pendingShop: G.pendingShop,
    pendingDiscards: G.pendingDiscards,
    board: {
      totalTiles: G.board.totalTiles,
      nearbyTiles
    },
    players: Object.values(G.players).map(summarizePlayer),
    currentShop: G.currentShop.map(summarizeCard),
    recentLog: G.actionLog.slice(0, 20),
    allowedActions
  };

  return {
    allowedActions,
    system:
      '你是打马棋游戏 AI。你只能从用户给出的 allowedActions 中选择一个动作。必须只输出一个 JSON 对象，不要输出 Markdown，不要解释。',
    user: [
      '根据当前游戏状态选择本阶段最优的一个动作。',
      '输出格式必须是：{"action":动作名,"cardId":可选,"targetPlayerId":可选,"usageArgs":可选,"steps":可选,"reason":"不超过30字"}',
      '动作名必须对应 allowedActions 里的 type。不要发明动作、卡牌、目标或参数。',
      JSON.stringify(state)
    ].join('\n')
  };
}
