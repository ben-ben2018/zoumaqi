import type { Ctx, FnContext, Game, PlayerID } from 'boardgame.io';
import { TurnOrder } from 'boardgame.io/core';

import {
  type CardUsageArgs,
  type CardData,
  MapEventType,
  Sect,
  TurnStage,
  type GameState,
  type SetupData
} from '../types';
import { applyBossEvent, applyMysteryEvent, createBoardData, generateShopCards } from './board/boardData';
import { executeCardEffect } from './cards/cardEffects';
import {
  applyStartTurnCardPassives,
  useActiveSectSkill,
  applyPassiveRollModifiers,
  consumeControlledBaseRoll,
  getActiveSkillCooldownTurns
} from './skills/sectSkills';
import {
  appendLog,
  applyOpeningEconomy,
  createPlayers,
  endTurnEffects,
  getPendingDiscard,
  grantCardsToPlayer,
  movePlayerOnTrack,
  popResolvedPendingDiscards,
  resetSkippedStatus,
  startTurn,
  shouldAutoSkipTurn,
  takeRandomCard
} from './helpers';

type GameContext = FnContext<GameState>;
type MoveContext = GameContext & { playerID: PlayerID };
type EventsAPI = GameContext['events'];

function setStage(events: EventsAPI, stage: TurnStage): void {
  events?.setActivePlayers?.({
    currentPlayer: stage
  });
}

function setDiscardStage(events: EventsAPI, playerId: PlayerID): void {
  events?.setActivePlayers?.({
    value: {
      [playerId]: TurnStage.DISCARD
    }
  });
}

function syncActivePlayers(G: GameState, events: EventsAPI): void {
  const pendingDiscard = getPendingDiscard(G);
  if (pendingDiscard) {
    setDiscardStage(events, pendingDiscard.playerId);
    return;
  }

  setStage(events, G.turnStage);
}

function resolveJiuliumenBegging(G: GameState, moverId: PlayerID): void {
  const mover = G.players[moverId];

  for (const [playerId, player] of Object.entries(G.players)) {
    if (playerId === moverId) {
      continue;
    }

    if (player.sect !== Sect.JIULIUMEN || player.position !== mover.position) {
      continue;
    }

    const tribute = Math.min(mover.gold, 30);
    if (tribute > 0) {
      mover.gold -= tribute;
      player.gold += tribute;
      appendLog(G, `${player.name} 触发【举起鼠爪】，从 ${mover.name} 处乞讨到 ${tribute} 棋珍。`);
      continue;
    }

    const first = takeRandomCard(mover);
    const second = takeRandomCard(mover);
    const takenCards = [first, second].filter((card): card is CardData => card !== null);
    const accepted = grantCardsToPlayer(G, playerId as PlayerID, takenCards, '九流门乞讨');
    if (accepted.length > 0) {
      appendLog(G, `${player.name} 触发【举起鼠爪】，从 ${mover.name} 处讨走了 ${accepted.length} 张卡牌。`);
    }
  }
}

function resolveStopConsequences(G: GameState, events: EventsAPI, playerId: PlayerID): void {
  const player = G.players[playerId];
  resolveJiuliumenBegging(G, playerId);

  if (player.position >= G.board.totalTiles - 1) {
    G.winnerTeam = player.team;
    appendLog(G, `${player.name} 冲线成功，${player.team === 0 ? '赤队' : '青队'}获胜。`);
    events?.endGame?.({
      winner: player.team,
      playerId
    });
  }
}

function findFirstShopStopIndex(G: GameState, from: number, to: number): number | null {
  for (let index = from + 1; index <= to; index += 1) {
    if (G.board.tiles[index]?.eventType === MapEventType.SHOP) {
      return index;
    }
  }

  return null;
}

function openShopStop(
  G: GameState,
  playerId: PlayerID,
  remainingSteps: number,
  source: string,
  resumeStage: TurnStage
): void {
  const player = G.players[playerId];
  G.currentShop = generateShopCards();
  G.pendingShop = true;
  G.pendingShopResumeStage = resumeStage;
  G.pendingMovement = remainingSteps > 0 ? remainingSteps : null;
  G.pendingMovementSource = remainingSteps > 0 ? source : null;
  appendLog(
    G,
    remainingSteps > 0
      ? `${player.name} 路过商店格并停下采购，买完后还需继续前进 ${remainingSteps} 格。`
      : `${player.name} 准确停在商店格，可以采购卡牌。`
  );
}

function resolveMovement(
  G: GameState,
  events: EventsAPI,
  playerId: PlayerID,
  steps: number,
  source: string,
  resumeStage: TurnStage
): void {
  const player = G.players[playerId];
  const from = player.position;
  const target = Math.min(player.position + Math.max(0, steps), G.board.totalTiles - 1);
  const shopStopIndex = findFirstShopStopIndex(G, from, target);

  if (shopStopIndex !== null) {
    const stepsToShop = shopStopIndex - from;
    const { to } = movePlayerOnTrack(G, playerId, stepsToShop);
    const movedSteps = to - from;
    if (source === '掷骰' && player.buffs.shengcai) {
      player.gold += Math.max(0, movedSteps);
      appendLog(G, `${player.name} 的【生财有道】生效，额外获得 ${Math.max(0, movedSteps)} 棋珍。`);
    }
    appendLog(G, `${player.name} 通过 ${source} 从 ${from + 1} 格前进到 ${to + 1} 格。`);
    openShopStop(G, playerId, target - shopStopIndex, source, resumeStage);
    resolveStopConsequences(G, events, playerId);
    return;
  }

  const { to } = movePlayerOnTrack(G, playerId, steps);
  const movedSteps = to - from;
  if (source === '掷骰' && player.buffs.shengcai) {
    player.gold += Math.max(0, movedSteps);
    appendLog(G, `${player.name} 的【生财有道】生效，额外获得 ${Math.max(0, movedSteps)} 棋珍。`);
  }
  appendLog(G, `${player.name} 通过 ${source} 从 ${from + 1} 格前进到 ${to + 1} 格。`);

  if (movedSteps > 0) {
    const tile = G.board.tiles[to];
    if (tile.eventType === MapEventType.MYSTERY) {
      applyMysteryEvent(G, playerId);
    } else if (tile.eventType === MapEventType.BOSS) {
      applyBossEvent(G, playerId);
    }
  }

  resolveStopConsequences(G, events, playerId);
}

function resolvePendingMovementIfNeeded(
  G: GameState,
  events: EventsAPI,
  playerId: PlayerID,
  source: string,
  resumeStage: TurnStage
): void {
  if ((G.pendingMovement ?? 0) <= 0) {
    return;
  }

  const steps = G.pendingMovement ?? 0;
  const pendingSource = G.pendingMovementSource ?? source;
  G.pendingMovement = null;
  G.pendingMovementSource = null;
  resolveMovement(G, events, playerId, steps, pendingSource, resumeStage);
}

function ensureStage(G: GameState, stage: TurnStage): boolean {
  return G.turnStage === stage;
}

const rollDice = ({ G, ctx, events }: MoveContext) => {
  if (getPendingDiscard(G)) {
    return;
  }

  if (!ensureStage(G, TurnStage.ROLL)) {
    return;
  }

  const player = G.players[ctx.currentPlayer];
  if (player.hasRolledThisTurn) {
    return;
  }

  const randomRoll = Math.floor(Math.random() * 6) + 1;
  const controlledRoll = consumeControlledBaseRoll(G, ctx.currentPlayer, randomRoll);
  if (controlledRoll.note) {
    appendLog(G, `${player.name} 的${controlledRoll.note}。`);
  }
  const baseRoll = controlledRoll.roll;
  const finalRoll = applyPassiveRollModifiers(G, ctx.currentPlayer, baseRoll);
  player.lastRoll = finalRoll;
  player.hasRolledThisTurn = true;
  G.pendingRoll = finalRoll;
  G.turnStage = TurnStage.MOVE;
  appendLog(G, `${player.name} 掷出了 ${baseRoll} 点，当前可移动 ${finalRoll} 格。`);
  syncActivePlayers(G, events);
};

const movePlayer = ({ G, ctx, events }: MoveContext, requestedSteps?: number) => {
  if (getPendingDiscard(G)) {
    return;
  }

  if (!ensureStage(G, TurnStage.MOVE)) {
    return;
  }

  const player = G.players[ctx.currentPlayer];
  if (player.hasMovedThisTurn) {
    return;
  }

  const steps = requestedSteps ?? G.pendingRoll ?? 0;
  resolveMovement(G, events, ctx.currentPlayer, steps, '掷骰', TurnStage.CARD);
  player.hasMovedThisTurn = true;
  G.pendingRoll = null;

  if (G.winnerTeam !== null) {
    return;
  }

  if (G.pendingShop) {
    G.turnStage = TurnStage.SHOP;
    syncActivePlayers(G, events);
    return;
  }

  G.turnStage = TurnStage.CARD;
  syncActivePlayers(G, events);
};

const buyCard = ({ G, ctx, events }: MoveContext, cardId: string) => {
  if (getPendingDiscard(G)) {
    return;
  }

  if (!ensureStage(G, TurnStage.SHOP)) {
    return;
  }

  const player = G.players[ctx.currentPlayer];
  const card = G.currentShop.find((item) => item.id === cardId);
  if (!card) {
    return;
  }

  if (player.gold < card.price) {
    return;
  }

  player.gold -= card.price;
  grantCardsToPlayer(G, ctx.currentPlayer, [card], '商店购买');
  G.currentShop = G.currentShop.filter((item) => item.id !== cardId);
  appendLog(G, `${player.name} 购入了 ${card.name}。`);
  syncActivePlayers(G, events);
};

const finishShop = ({ G, ctx, events }: MoveContext) => {
  if (getPendingDiscard(G)) {
    return;
  }

  if (!ensureStage(G, TurnStage.SHOP)) {
    return;
  }

  G.pendingShop = false;
  G.currentShop = [];
  const resumeStage = G.pendingShopResumeStage ?? TurnStage.CARD;
  G.pendingShopResumeStage = null;

  if ((G.pendingMovement ?? 0) > 0) {
    const remainingSteps = G.pendingMovement ?? 0;
    const pendingSource = G.pendingMovementSource ?? '继续移动';
    G.pendingMovement = null;
    G.pendingMovementSource = null;
    resolveMovement(G, events, ctx.currentPlayer, remainingSteps, pendingSource, resumeStage);

    if (G.winnerTeam !== null) {
      return;
    }

    if (G.pendingShop) {
      G.turnStage = TurnStage.SHOP;
      syncActivePlayers(G, events);
      return;
    }
  }

  if (G.pendingTurnResolution === 'endTurn') {
    if (getPendingDiscard(G)) {
      syncActivePlayers(G, events);
      return;
    }

    G.pendingTurnResolution = null;
    events?.endTurn?.();
    return;
  }

  G.turnStage = resumeStage;
  syncActivePlayers(G, events);
};

const useCard = (
  { G, ctx, events }: MoveContext,
  cardId: string,
  targetPlayerId?: PlayerID,
  usageArgs?: CardUsageArgs
) => {
  if (getPendingDiscard(G)) {
    return;
  }

  if (!ensureStage(G, TurnStage.CARD)) {
    return;
  }

  const player = G.players[ctx.currentPlayer];
  const card = player.handCards.find((item) => item.id === cardId);
  if (!card || card.isPassive) {
    return;
  }

  executeCardEffect(card, ctx.currentPlayer, targetPlayerId, G, ctx, usageArgs);
  player.handCards = player.handCards.filter((item) => item !== card);
  resolvePendingMovementIfNeeded(G, events, ctx.currentPlayer, card.name, TurnStage.CARD);

  if (G.winnerTeam !== null) {
    return;
  }

  if (G.pendingShop) {
    G.turnStage = TurnStage.SHOP;
  }

  syncActivePlayers(G, events);
};

const finishCardStage = ({ G, events }: MoveContext) => {
  if (getPendingDiscard(G)) {
    return;
  }

  if (!ensureStage(G, TurnStage.CARD)) {
    return;
  }

  G.turnStage = TurnStage.SKILL;
  syncActivePlayers(G, events);
};

const useActiveSkill = ({ G, ctx, events }: MoveContext, targetPlayerId?: PlayerID) => {
  if (getPendingDiscard(G)) {
    return;
  }

  if (!ensureStage(G, TurnStage.SKILL)) {
    return;
  }

  const player = G.players[ctx.currentPlayer];
  if (player.activeSkillCooldown > 0 || player.hasUsedSkillThisTurn) {
    return;
  }

  const success = useActiveSectSkill(G, ctx.currentPlayer, targetPlayerId);
  if (!success) {
    return;
  }

  player.activeSkillCooldown = getActiveSkillCooldownTurns(player.sect);
  player.hasUsedSkillThisTurn = true;
  resolvePendingMovementIfNeeded(G, events, ctx.currentPlayer, '主动技能', TurnStage.SKILL);

  if (G.winnerTeam !== null) {
    return;
  }

  if (G.pendingShop) {
    G.pendingTurnResolution = 'endTurn';
    G.turnStage = TurnStage.SHOP;
    syncActivePlayers(G, events);
    return;
  }

  if (getPendingDiscard(G)) {
    G.pendingTurnResolution = 'endTurn';
    syncActivePlayers(G, events);
    return;
  }

  events?.endTurn?.();
};

const finishSkillStage = ({ G, events }: MoveContext) => {
  if (getPendingDiscard(G)) {
    return;
  }

  if (!ensureStage(G, TurnStage.SKILL)) {
    return;
  }

  events?.endTurn?.();
};

const discardOverflowCard = ({ G, ctx, events, playerID }: MoveContext, cardId: string) => {
  const pendingDiscard = getPendingDiscard(G);
  if (!pendingDiscard || playerID !== pendingDiscard.playerId) {
    return;
  }

  const player = G.players[pendingDiscard.playerId];
  const cardIndex = player.handCards.findIndex((item) => item.id === cardId);
  if (cardIndex < 0) {
    return;
  }

  const [card] = player.handCards.splice(cardIndex, 1);
  appendLog(G, `${player.name} 为处理手牌上限，弃置了 ${card?.name ?? '一张手牌'}。`);
  popResolvedPendingDiscards(G);

  if (getPendingDiscard(G)) {
    syncActivePlayers(G, events);
    return;
  }

  if (G.pendingTurnResolution === 'endTurn') {
    G.pendingTurnResolution = null;
    const turnPlayer = G.players[ctx.currentPlayer];
    if (shouldAutoSkipTurn(turnPlayer)) {
      resetSkippedStatus(turnPlayer);
    }
    events?.endTurn?.();
    return;
  }

  syncActivePlayers(G, events);
};

export const DamaqiGame: Game<GameState, Record<string, never>, SetupData> = {
  name: 'damaqi',
  setup: (_context, setupData) => {
    const players = createPlayers(setupData);
    applyOpeningEconomy(players);

    return {
      players,
      board: createBoardData(),
      currentShop: [],
      pendingShop: false,
      pendingShopResumeStage: null,
      pendingDiscards: [],
      pendingTurnResolution: null,
      pendingRoll: null,
      pendingMovement: null,
      pendingMovementSource: null,
      turnStage: TurnStage.ROLL,
      actionLog: ['棋局已布设，等待首位玩家掷骰。'],
      winnerTeam: null,
      turnMessage: '棋局已布设，等待首位玩家掷骰。'
    };
  },
  moves: {
    rollDice,
    movePlayer,
    buyCard,
    finishShop,
    useCard,
    finishCardStage,
    useActiveSkill,
    finishSkillStage,
    discardOverflowCard
  },
  turn: {
    order: TurnOrder.DEFAULT,
    stages: {
      [TurnStage.ROLL]: {
        moves: {
          rollDice
        }
      },
      [TurnStage.MOVE]: {
        moves: {
          movePlayer
        }
      },
      [TurnStage.SHOP]: {
        moves: {
          buyCard,
          finishShop
        }
      },
      [TurnStage.CARD]: {
        moves: {
          useCard,
          finishCardStage
        }
      },
      [TurnStage.SKILL]: {
        moves: {
          useActiveSkill,
          finishSkillStage
        }
      },
      [TurnStage.DISCARD]: {
        moves: {
          discardOverflowCard
        }
      }
    },
    onBegin: ({ G, ctx, events }) => {
      startTurn(G, ctx.currentPlayer);
      applyStartTurnCardPassives(G, ctx.currentPlayer);
      const player = G.players[ctx.currentPlayer];

      if (shouldAutoSkipTurn(player)) {
        appendLog(G, `${player.name} 受控，自动跳过本回合。`);
        if (getPendingDiscard(G)) {
          G.pendingTurnResolution = 'endTurn';
          syncActivePlayers(G, events);
          return;
        }
        resetSkippedStatus(player);
        events?.endTurn?.();
        return;
      }

      appendLog(G, `轮到 ${player.name}（${player.team === 0 ? '赤队' : '青队'}）行动。`);
      syncActivePlayers(G, events);
    },
    onEnd: ({ G, ctx }) => {
      endTurnEffects(G, ctx.currentPlayer);
    }
  },
  endIf: ({ G }) => {
    if (G.winnerTeam !== null) {
      return {
        winner: G.winnerTeam
      };
    }

    for (const player of Object.values(G.players)) {
      if (player.position >= G.board.totalTiles - 1) {
        return {
          winner: player.team
        };
      }
    }

    return undefined;
  }
};
