import type { Ctx, PlayerID } from 'boardgame.io';

import { DamaqiGame, runBotTurn, syncActivePlayers } from '../game/gameConfig';
import { appendLog } from '../game/helpers';
import type { AiPlayerControl, SetupData, GameState } from '../types';
import type { GameActionRequest, MatchSnapshot, OperationResult } from '../multiplayer/protocol';

type MutableCtx = Ctx & {
  currentPlayer: PlayerID;
  turn: number;
};

type EndGameResult = {
  winner?: unknown;
  playerId?: PlayerID;
} | null;

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class ServerGameSession {
  private G: GameState;

  private ctx: MutableCtx;

  private gameover: EndGameResult = null;

  constructor(setupData: SetupData) {
    const setup = DamaqiGame.setup;
    if (!setup) {
      throw new Error('DamaqiGame.setup is not defined.');
    }

    this.G = setup({} as never, setupData);
    this.ctx = {
      currentPlayer: '0',
      turn: 1
    } as MutableCtx;

    this.beginTurn();
    this.syncGameOver();
  }

  getSnapshot(): MatchSnapshot {
    return {
      G: cloneSerializable(this.G),
      ctx: cloneSerializable({
        currentPlayer: this.ctx.currentPlayer,
        turn: this.ctx.turn
      })
    };
  }

  isFinished(): boolean {
    return this.gameover !== null || this.G.winnerTeam !== null;
  }

  getCurrentPlayer(): PlayerID {
    return this.ctx.currentPlayer;
  }

  getPendingDiscardPlayer(): PlayerID | null {
    return this.G.pendingDiscards[0]?.playerId ?? null;
  }

  getAiControl(playerID: PlayerID): AiPlayerControl {
    return this.G.aiControls?.[playerID] ?? { mode: 'rules' };
  }

  isBotPlayer(playerID: PlayerID): boolean {
    return Boolean(this.G.players[playerID]?.isBot);
  }

  setPlayerMetadata(playerID: PlayerID, data: { isBot?: boolean; name?: string }): void {
    const player = this.G.players[playerID];
    if (!player) {
      return;
    }

    if (typeof data.isBot === 'boolean') {
      player.isBot = data.isBot;
    }

    if (data.name) {
      player.name = data.name;
    }
  }

  setAiControl(playerID: PlayerID, control: AiPlayerControl): void {
    this.G.aiControls = this.G.aiControls ?? {};
    this.G.aiControls[playerID] = control;
  }

  appendAutomationLog(message: string): void {
    appendLog(this.G, message);
  }

  runRulesAutomation(): void {
    if (this.isFinished()) {
      return;
    }

    const events = this.createEvents();
    syncActivePlayers(this.G, this.ctx, events as never);

    if (this.G.players[this.ctx.currentPlayer].isBot) {
      runBotTurn(this.G, this.ctx, events as never);
    }

    this.syncGameOver();
  }

  resumeAutomations(): void {
    if (this.isFinished()) {
      return;
    }

    const events = this.createEvents();
    syncActivePlayers(this.G, this.ctx, events as never);

    if (this.G.players[this.ctx.currentPlayer].isBot && this.getAiControl(this.ctx.currentPlayer).mode === 'rules') {
      runBotTurn(this.G, this.ctx, events as never);
    }

    this.syncGameOver();
  }

  forfeitCurrentTurn(playerID: PlayerID): void {
    if (this.isFinished() || this.ctx.currentPlayer !== playerID) {
      return;
    }

    this.performEndTurn();
  }

  applyAction(playerID: PlayerID, action: GameActionRequest): OperationResult {
    if (this.isFinished()) {
      return {
        ok: false,
        error: '对局已结束。'
      };
    }

    const pendingDiscardPlayer = this.getPendingDiscardPlayer();
    const canResolveDiscard = action.type === 'discardOverflowCard' && pendingDiscardPlayer === playerID;
    if (!canResolveDiscard && playerID !== this.ctx.currentPlayer) {
      return {
        ok: false,
        error: '现在还没轮到这个座位行动。'
      };
    }

    const moves = DamaqiGame.moves as Record<string, ((context: never, ...args: never[]) => void) | undefined>;
    const move = moves[action.type];
    if (!move) {
      return {
        ok: false,
        error: '未知动作。'
      };
    }

    const context = this.createMoveContext(playerID);

    switch (action.type) {
      case 'rollDice':
      case 'finishShop':
      case 'finishCardStage':
      case 'finishSkillStage':
        move(context);
        break;
      case 'movePlayer':
        move(context, action.steps as never);
        break;
      case 'buyCard':
        move(context, action.cardId as never);
        break;
      case 'useCard':
        move(context, action.cardId as never, action.targetPlayerId as never, action.usageArgs as never);
        break;
      case 'useActiveSkill':
        move(context, action.targetPlayerId as never);
        break;
      case 'discardOverflowCard':
        move(context, action.cardId as never);
        break;
      default:
        return {
          ok: false,
          error: '未知动作。'
        };
    }

    this.syncGameOver();
    return { ok: true };
  }

  private createMoveContext(playerID: PlayerID) {
    return {
      G: this.G,
      ctx: this.ctx,
      playerID,
      events: this.createEvents()
    } as never;
  }

  private createEvents() {
    return {
      setActivePlayers: () => {
        return;
      },
      endGame: (result?: { winner?: unknown; playerId?: PlayerID }) => {
        this.gameover = result ?? {};
      },
      endTurn: () => {
        this.performEndTurn();
      }
    };
  }

  private performEndTurn(): void {
    if (this.isFinished()) {
      return;
    }

    DamaqiGame.turn?.onEnd?.({
      G: this.G,
      ctx: this.ctx
    } as never);

    const nextPlayer = ((Number(this.ctx.currentPlayer) + 1) % 4).toString() as PlayerID;
    this.ctx = {
      ...this.ctx,
      currentPlayer: nextPlayer,
      turn: this.ctx.turn + 1
    };

    this.beginTurn();
    this.syncGameOver();
  }

  private beginTurn(): void {
    if (this.isFinished()) {
      return;
    }

    DamaqiGame.turn?.onBegin?.({
      G: this.G,
      ctx: this.ctx,
      events: this.createEvents()
    } as never);
  }

  private syncGameOver(): void {
    if (this.gameover || this.G.winnerTeam !== null) {
      return;
    }

    const result = DamaqiGame.endIf?.({
      G: this.G,
      ctx: this.ctx
    } as never);
    if (result) {
      this.gameover = result;
    }
  }
}
