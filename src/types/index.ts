import type { Ctx, PlayerID } from 'boardgame.io';

export enum PlayerTeam {
  RED = 0,
  BLUE = 1
}

export enum PlayerStatus {
  NORMAL = 0,
  SKIP_TURN = 1,
  FROZEN = 2
}

export enum CardType {
  MOVEMENT = 0,
  BUFF = 1,
  DEBUFF = 2,
  ATTACK = 3,
  ECONOMY = 4
}

export enum SkillTarget {
  SELF = 0,
  ALLY = 1,
  ENEMY = 2
}

export enum MapEventType {
  SHOP = 0,
  MYSTERY = 1,
  BOSS = 2,
  EMPTY = 3
}

export enum Sect {
  QINGXI = 0,
  LIYUAN = 1,
  TIANQUAN = 2,
  GUYUN = 3,
  SANGENGTIAN = 4,
  KUANGLAN = 5,
  ZUIHUAYIN = 6,
  MOSHANDAO = 7,
  JIULIUMEN = 8
}

export enum TurnStage {
  ROLL = 'roll',
  MOVE = 'move',
  SHOP = 'shop',
  CARD = 'card',
  SKILL = 'skill',
  DISCARD = 'discard'
}

export interface TimedEffectState {
  remainingTurns: number;
  value: unknown;
}

export interface CardData {
  id: string;
  name: string;
  description: string;
  type: CardType;
  price: number;
  targetType: SkillTarget;
  isPassive: boolean;
}

export interface CardDefinition extends CardData {
  effect: CardEffectHandler;
}

export type TimedEffectMap = Record<string, TimedEffectState>;

export interface CardUsageArgs {
  selectedSteps?: number;
}

export interface PlayerData {
  id: string;
  name: string;
  team: PlayerTeam;
  sect: Sect;
  position: number;
  gold: number;
  handCards: CardData[];
  buffs: TimedEffectMap;
  debuffs: TimedEffectMap;
  status: PlayerStatus;
  activeSkillCooldown: number;
  lastRoll: number | null;
  hasRolledThisTurn: boolean;
  hasMovedThisTurn: boolean;
  hasUsedSkillThisTurn: boolean;
}

export interface TileData {
  index: number;
  eventType: MapEventType;
  eventData?: unknown;
  label: string;
  x: number;
  y: number;
}

export interface BoardData {
  totalTiles: number;
  tiles: TileData[];
}

export interface SetupData {
  sects?: Sect[];
  playerNames?: string[];
}

export interface PendingDiscardState {
  playerId: PlayerID;
  reason: string;
}

export interface GameState {
  players: Record<PlayerID, PlayerData>;
  board: BoardData;
  currentShop: CardData[];
  pendingShop: boolean;
  pendingShopResumeStage: TurnStage | null;
  pendingDiscards: PendingDiscardState[];
  pendingTurnResolution: 'endTurn' | null;
  pendingRoll: number | null;
  pendingMovement: number | null;
  pendingMovementSource: string | null;
  turnStage: TurnStage;
  actionLog: string[];
  winnerTeam: PlayerTeam | null;
  turnMessage: string;
}

export type CardEffectHandler = (
  G: GameState,
  ctx: Ctx,
  casterId: PlayerID,
  targetPlayerId?: PlayerID,
  usageArgs?: CardUsageArgs
) => void;
