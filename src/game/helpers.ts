import type { PlayerID } from 'boardgame.io';

import {
  type PendingDiscardState,
  PlayerStatus,
  PlayerTeam,
  Sect,
  type CardData,
  type CardDefinition,
  type CardUsageArgs,
  type GameState,
  type PlayerData,
  type SetupData,
  type TileData,
  type TimedEffectMap,
  TurnStage
} from '../types';

const DEFAULT_SECTS: Sect[] = [
  Sect.QINGXI,
  Sect.LIYUAN,
  Sect.TIANQUAN,
  Sect.GUYUN
];

export function getTeamLabel(team: PlayerTeam): string {
  return team === PlayerTeam.RED ? '赤队' : '青队';
}

export function getSectLabel(sect: Sect): string {
  const labels: Record<Sect, string> = {
    [Sect.QINGXI]: '清溪',
    [Sect.LIYUAN]: '梨园',
    [Sect.TIANQUAN]: '天泉',
    [Sect.GUYUN]: '孤云',
    [Sect.SANGENGTIAN]: '三更天',
    [Sect.KUANGLAN]: '狂澜',
    [Sect.ZUIHUAYIN]: '醉花阴',
    [Sect.MOSHANDAO]: '墨山道',
    [Sect.JIULIUMEN]: '九流门'
  };

  return labels[sect];
}

export function appendLog(G: GameState, message: string): void {
  G.actionLog = [message, ...G.actionLog].slice(0, 16);
  G.turnMessage = message;
}

export function cloneCard(card: CardData | CardDefinition): CardData {
  const { effect: _effect, ...plainCard } = card as CardDefinition;
  return plainCard;
}

export function getHandLimit(player: PlayerData): number {
  return player.sect === Sect.MOSHANDAO ? 8 : 6;
}

export function addCardsToHand(player: PlayerData, cards: CardData[]): CardData[] {
  const accepted: CardData[] = [];

  for (const card of cards) {
    player.handCards.push(cloneCard(card));
    accepted.push(card);
  }

  return accepted;
}

export function getHandOverflowCount(player: PlayerData): number {
  return Math.max(0, player.handCards.length - getHandLimit(player));
}

export function isOverHandLimit(player: PlayerData): boolean {
  return getHandOverflowCount(player) > 0;
}

export function getPendingDiscard(G: GameState): PendingDiscardState | null {
  return G.pendingDiscards[0] ?? null;
}

export function enqueuePendingDiscard(G: GameState, playerId: PlayerID, reason: string): boolean {
  const player = G.players[playerId];
  if (!isOverHandLimit(player)) {
    return false;
  }

  if (G.pendingDiscards.some((pending) => pending.playerId === playerId)) {
    return true;
  }

  G.pendingDiscards.push({
    playerId,
    reason
  });
  appendLog(G, `${player.name} 因${reason}导致手牌超出上限，需要先弃牌后才能继续。`);
  return true;
}

export function popResolvedPendingDiscards(G: GameState): void {
  while (G.pendingDiscards.length > 0) {
    const pending = G.pendingDiscards[0];
    if (!pending || isOverHandLimit(G.players[pending.playerId])) {
      return;
    }

    G.pendingDiscards.shift();
  }
}

export function grantCardsToPlayer(G: GameState, playerId: PlayerID, cards: CardData[], reason: string): CardData[] {
  const accepted = addCardsToHand(G.players[playerId], cards);
  enqueuePendingDiscard(G, playerId, reason);
  return accepted;
}

export function createPlayers(setupData?: SetupData): Record<PlayerID, PlayerData> {
  const players: Record<PlayerID, PlayerData> = {};

  for (let index = 0; index < 4; index += 1) {
    const playerId = String(index);
    const sect = setupData?.sects?.[index] ?? DEFAULT_SECTS[index] ?? DEFAULT_SECTS[0];
    const team = index % 2 === 0 ? PlayerTeam.RED : PlayerTeam.BLUE;

    players[playerId] = {
      id: playerId,
      name: setupData?.playerNames?.[index] ?? `${index + 1}P`,
      team,
      sect,
      position: 0,
      gold: 0,
      handCards: [],
      buffs: {},
      debuffs: {},
      status: PlayerStatus.NORMAL,
      activeSkillCooldown: 0,
      lastRoll: null,
      hasRolledThisTurn: false,
      hasMovedThisTurn: false,
      hasUsedSkillThisTurn: false
    };
  }

  return players;
}

export function applyOpeningEconomy(players: Record<PlayerID, PlayerData>): void {
  const tianquanPlayers = Object.values(players).filter((player) => player.sect === Sect.TIANQUAN);

  for (const player of tianquanPlayers) {
    player.gold += 100;
  }

  if (tianquanPlayers.length === 0) {
    return;
  }

  const grant = 40 * tianquanPlayers.length;

  for (const player of Object.values(players)) {
    if (player.sect !== Sect.TIANQUAN) {
      player.gold += grant;
    }
  }
}

export function startTurn(G: GameState, playerId: PlayerID): void {
  const player = G.players[playerId];

  player.hasRolledThisTurn = false;
  player.hasMovedThisTurn = false;
  player.hasUsedSkillThisTurn = false;
  G.pendingTurnResolution = null;
  G.pendingRoll = null;
  G.pendingMovement = null;
  G.pendingMovementSource = null;
  G.pendingShop = false;
  G.pendingShopResumeStage = null;
  G.currentShop = [];
  G.turnStage = TurnStage.ROLL;
  player.gold += 10; // TODO: 调整为最终经济系统的固定回合收入。
}

export function endTurnEffects(G: GameState, playerId: PlayerID): void {
  const player = G.players[playerId];

  if (player.activeSkillCooldown > 0) {
    player.activeSkillCooldown -= 1;
  }

  for (const [key, effect] of Object.entries(player.buffs)) {
    effect.remainingTurns -= 1;
    if (effect.remainingTurns <= 0) {
      delete player.buffs[key];
    }
  }

  for (const [key, effect] of Object.entries(player.debuffs)) {
    if (key === 'zuihua_poison') {
      const casterId = (effect.value as { casterId?: PlayerID }).casterId;
      if (casterId && G.players[casterId]) {
        const tribute = Math.min(player.gold, 15);
        player.gold -= tribute;
        G.players[casterId].gold += tribute;
      }
    }

    effect.remainingTurns -= 1;
    if (effect.remainingTurns <= 0) {
      delete player.debuffs[key];
    }
  }
}

export function isInLead(G: GameState, playerId: PlayerID): boolean {
  const player = G.players[playerId];
  const leaderPosition = Math.max(...Object.values(G.players).map((item) => item.position));
  return player.position >= leaderPosition;
}

export function getTeammateId(G: GameState, playerId: PlayerID): PlayerID | null {
  const player = G.players[playerId];
  const teammate = Object.keys(G.players).find(
    (candidateId) => candidateId !== playerId && G.players[candidateId].team === player.team
  );

  return teammate ?? null;
}

export function getEnemyIds(G: GameState, playerId: PlayerID): PlayerID[] {
  const player = G.players[playerId];
  return Object.keys(G.players).filter((candidateId) => G.players[candidateId].team !== player.team);
}

export function getAbsoluteDistance(G: GameState, sourceId: PlayerID, targetId: PlayerID): number {
  return Math.abs(G.players[sourceId].position - G.players[targetId].position);
}

export function getNearestEnemyDistance(G: GameState, playerId: PlayerID): number {
  const distances = getEnemyIds(G, playerId).map((enemyId) => getAbsoluteDistance(G, playerId, enemyId));
  return distances.length > 0 ? Math.min(...distances) : 0;
}

export function setTimedEffect(
  container: TimedEffectMap,
  key: string,
  remainingTurns: number,
  value: unknown
): void {
  container[key] = {
    remainingTurns,
    value
  };
}

export function cleanseDebuffs(player: PlayerData): void {
  Object.keys(player.debuffs).forEach((key) => {
    delete player.debuffs[key];
  });
  if (player.status !== PlayerStatus.NORMAL) {
    player.status = PlayerStatus.NORMAL;
  }
}

export function takeRandomCard(player: PlayerData): CardData | null {
  if (player.handCards.length === 0) {
    return null;
  }

  const index = Math.floor(Math.random() * player.handCards.length);
  const [card] = player.handCards.splice(index, 1);
  return card ?? null;
}

export function consumeCardById(player: PlayerData, cardId: string): CardData | null {
  const index = player.handCards.findIndex((card) => card.id === cardId);
  if (index < 0) {
    return null;
  }

  const [card] = player.handCards.splice(index, 1);
  return card ?? null;
}

export function hasCardInHand(player: PlayerData, cardId: string): boolean {
  return player.handCards.some((card) => card.id === cardId);
}

export function hasAnyCardInHand(player: PlayerData, cardIds: string[]): boolean {
  return cardIds.some((cardId) => hasCardInHand(player, cardId));
}

export function hasAllCardsInHand(player: PlayerData, cardIds: string[]): boolean {
  return cardIds.every((cardId) => hasCardInHand(player, cardId));
}

export function getAttackRangeBonus(player: PlayerData): number {
  return hasCardInHand(player, 'qianlimu') ? 3 : 0;
}

export function normalizeLingyunSteps(usageArgs?: CardUsageArgs): number {
  const selectedSteps = usageArgs?.selectedSteps ?? 3;
  return Math.min(6, Math.max(3, selectedSteps));
}

export function movePlayerOnTrack(
  G: GameState,
  playerId: PlayerID,
  steps: number
): { from: number; to: number; tile: TileData } {
  const player = G.players[playerId];
  const from = player.position;
  const safeSteps = Math.max(0, steps);
  const to = Math.min(player.position + safeSteps, G.board.totalTiles - 1);

  player.position = to;
  player.gold += safeSteps * 2; // TODO: 与正式经济公式对齐。

  return {
    from,
    to,
    tile: G.board.tiles[to]
  };
}

export function shouldAutoSkipTurn(player: PlayerData): boolean {
  return player.status === PlayerStatus.SKIP_TURN || player.status === PlayerStatus.FROZEN;
}

export function resetSkippedStatus(player: PlayerData): void {
  player.status = PlayerStatus.NORMAL;
}
