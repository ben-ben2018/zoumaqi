import type { PlayerID } from 'boardgame.io';

import { TurnStage, type AiMode, type CardUsageArgs, type GameState, type Sect } from '../types';

export type RoomStatus = 'lobby' | 'in_game' | 'finished';
export type SeatID = 0 | 1 | 2 | 3;

export interface OperationResult {
  ok: boolean;
  error?: string;
  roomCode?: string;
}

export interface LobbyRoomSummary {
  roomCode: string;
  hostName: string;
  memberCount: number;
  seatedCount: number;
  hasPassword: boolean;
  status: RoomStatus;
  updatedAt: number;
}

export interface RoomMemberSnapshot {
  id: string;
  name: string;
  seatId: SeatID | null;
  isHost: boolean;
  joinedAt: number;
}

export interface RoomSeatSnapshot {
  id: SeatID;
  memberId: string | null;
  memberName: string | null;
  sect: Sect | null;
  isBot: boolean;
  aiMode: AiMode;
  llmProviderName: string | null;
  llmModelId: string | null;
}

export interface LlmProviderOption {
  providerName: string;
  modelIds: string[];
}

export interface MatchContextSnapshot {
  currentPlayer: PlayerID;
  turn: number;
}

export interface MatchSnapshot {
  G: GameState;
  ctx: MatchContextSnapshot;
}

export interface RoomSnapshot {
  selfMemberId: string | null;
  roomCode: string;
  hostMemberId: string;
  hasPassword: boolean;
  status: RoomStatus;
  createdAt: number;
  updatedAt: number;
  members: RoomMemberSnapshot[];
  seats: RoomSeatSnapshot[];
  llmOptions: LlmProviderOption[];
  match: MatchSnapshot | null;
}

export interface CreateRoomPayload {
  name: string;
  password?: string;
}

export interface JoinRoomPayload {
  roomCode: string;
  name: string;
  password?: string;
}

export interface UpdateRoomSettingsPayload {
  password: string | null;
}

export interface ClaimSeatPayload {
  seatId: SeatID;
}

export interface SetSectPayload {
  sect: Sect;
}

export interface SetSeatAiPayload {
  seatId: SeatID;
  aiMode: AiMode;
  providerName?: string;
  modelId?: string;
}

export interface KickMemberPayload {
  memberId: string;
}

export type GameActionRequest =
  | {
      type: 'rollDice';
    }
  | {
      type: 'movePlayer';
      steps?: number;
    }
  | {
      type: 'buyCard';
      cardId: string;
    }
  | {
      type: 'finishShop';
    }
  | {
      type: 'useCard';
      cardId: string;
      targetPlayerId?: PlayerID;
      usageArgs?: CardUsageArgs;
    }
  | {
      type: 'finishCardStage';
    }
  | {
      type: 'useActiveSkill';
      targetPlayerId?: PlayerID;
    }
  | {
      type: 'finishSkillStage';
    }
  | {
      type: 'discardOverflowCard';
      cardId: string;
    };

export interface ClientToServerEvents {
  'lobby:list': () => void;
  'room:create': (payload: CreateRoomPayload, callback: (result: OperationResult) => void) => void;
  'room:join': (payload: JoinRoomPayload, callback: (result: OperationResult) => void) => void;
  'room:leave': (callback?: (result: OperationResult) => void) => void;
  'room:claimSeat': (payload: ClaimSeatPayload, callback: (result: OperationResult) => void) => void;
  'room:leaveSeat': (callback: (result: OperationResult) => void) => void;
  'room:setSect': (payload: SetSectPayload, callback: (result: OperationResult) => void) => void;
  'room:setSeatAi': (payload: SetSeatAiPayload, callback: (result: OperationResult) => void) => void;
  'room:updateSettings': (payload: UpdateRoomSettingsPayload, callback: (result: OperationResult) => void) => void;
  'room:kickMember': (payload: KickMemberPayload, callback: (result: OperationResult) => void) => void;
  'room:startGame': (callback: (result: OperationResult) => void) => void;
  'game:action': (payload: GameActionRequest, callback: (result: OperationResult) => void) => void;
}

export interface ServerToClientEvents {
  'lobby:rooms': (rooms: LobbyRoomSummary[]) => void;
  'room:snapshot': (snapshot: RoomSnapshot | null) => void;
  'server:error': (message: string) => void;
}

export interface InterServerEvents {
  noop: () => void;
}

export interface SocketData {
  memberId?: string;
  roomCode?: string;
}

export const ROOM_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const ROOM_CLEANUP_INTERVAL_MS = 15 * 1000;
export const DEFAULT_SOCKET_PORT = 3011;
export const SOCKET_PATH = '/ws';

export const PLAYABLE_STAGES: TurnStage[] = [
  TurnStage.ROLL,
  TurnStage.MOVE,
  TurnStage.SHOP,
  TurnStage.CARD,
  TurnStage.SKILL,
  TurnStage.DISCARD
];
