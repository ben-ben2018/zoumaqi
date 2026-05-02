import { randomUUID } from 'node:crypto';

import type { PlayerID } from 'boardgame.io';
import type { Server, Socket } from 'socket.io';

import { Sect, type AiMode, type AiPlayerControl, type LlmModelSelection, type SetupData } from '../types';
import {
  ROOM_CLEANUP_INTERVAL_MS,
  ROOM_IDLE_TIMEOUT_MS,
  type ClaimSeatPayload,
  type ClientToServerEvents,
  type CreateRoomPayload,
  type GameActionRequest,
  type JoinRoomPayload,
  type KickMemberPayload,
  type InterServerEvents,
  type LobbyRoomSummary,
  type OperationResult,
  type RoomMemberSnapshot,
  type RoomSeatSnapshot,
  type RoomSnapshot,
  type RoomStatus,
  type SeatID,
  type ServerToClientEvents,
  type SetSeatAiPayload,
  type SetSectPayload,
  type SocketData,
  type UpdateRoomSettingsPayload
} from '../multiplayer/protocol';
import { ServerGameSession } from './gameSession';
import { decideLlmAction } from './llm/decision';
import { getDefaultLlmSelection, getPublicLlmOptions, isValidLlmSelection } from './llm/config';

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const DEFAULT_ROOM_SECTS: Sect[] = [Sect.QINGXI, Sect.LIYUAN, Sect.TIANQUAN, Sect.GUYUN];
const AVAILABLE_ROOM_SECTS: Sect[] = [
  Sect.QINGXI,
  Sect.LIYUAN,
  Sect.TIANQUAN,
  Sect.GUYUN,
  Sect.SANGENGTIAN,
  Sect.KUANGLAN,
  Sect.ZUIHUAYIN,
  Sect.MOSHANDAO,
  Sect.JIULIUMEN
];

interface RoomMember {
  id: string;
  socketId: string;
  name: string;
  seatId: SeatID | null;
  joinedAt: number;
}

interface RoomSeatState {
  id: SeatID;
  memberId: string | null;
  sect: Sect | null;
  isBot: boolean;
  aiMode: AiMode;
  llmSelection: LlmModelSelection | null;
}

interface RoomState {
  code: string;
  password: string | null;
  status: RoomStatus;
  hostMemberId: string;
  createdAt: number;
  updatedAt: number;
  emptySince: number | null;
  members: Map<string, RoomMember>;
  seats: RoomSeatState[];
  match: ServerGameSession | null;
}

function serializeProgressSnapshot(match: ServerGameSession): string {
  const snapshot = match.getSnapshot();
  const { actionLog: _actionLog, turnMessage: _turnMessage, ...progressState } = snapshot.G;

  return JSON.stringify({
    G: progressState,
    ctx: snapshot.ctx
  });
}

function normalizeName(name: string): string {
  return name.trim().slice(0, 20);
}

function normalizePassword(password?: string | null): string | null {
  const value = password?.trim() ?? '';
  return value.length > 0 ? value.slice(0, 24) : null;
}

function isSeatId(value: number): value is SeatID {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

function createDefaultSeats(): RoomSeatState[] {
  return [0, 1, 2, 3].map((id) => ({
    id: id as SeatID,
    memberId: null,
    sect: null,
    isBot: true,
    aiMode: 'rules',
    llmSelection: null
  }));
}

function toPlayerId(seatId: SeatID): PlayerID {
  return String(seatId) as PlayerID;
}

export class RoomManager {
  private readonly rooms = new Map<string, RoomState>();

  private readonly automationRooms = new Set<string>();

  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(private readonly io: TypedServer) {
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleRooms();
    }, ROOM_CLEANUP_INTERVAL_MS);
  }

  attach(): void {
    this.io.on('connection', (socket) => {
      socket.emit('lobby:rooms', this.listLobbyRooms());
      socket.emit('room:snapshot', null);

      socket.on('lobby:list', () => {
        socket.emit('lobby:rooms', this.listLobbyRooms());
      });

      socket.on('room:create', (payload, callback) => {
        callback(this.handleCreateRoom(socket, payload));
      });

      socket.on('room:join', (payload, callback) => {
        callback(this.handleJoinRoom(socket, payload));
      });

      socket.on('room:leave', (callback) => {
        const result = this.leaveCurrentRoom(socket, true);
        callback?.(result);
      });

      socket.on('room:claimSeat', (payload, callback) => {
        callback(this.handleClaimSeat(socket, payload));
      });

      socket.on('room:leaveSeat', (callback) => {
        callback(this.handleLeaveSeat(socket));
      });

      socket.on('room:setSect', (payload, callback) => {
        callback(this.handleSetSect(socket, payload));
      });

      socket.on('room:setSeatAi', (payload, callback) => {
        callback(this.handleSetSeatAi(socket, payload));
      });

      socket.on('room:updateSettings', (payload, callback) => {
        callback(this.handleUpdateSettings(socket, payload));
      });

      socket.on('room:kickMember', (payload, callback) => {
        callback(this.handleKickMember(socket, payload));
      });

      socket.on('room:startGame', (callback) => {
        callback(this.handleStartGame(socket));
      });

      socket.on('game:action', (payload, callback) => {
        callback(this.handleGameAction(socket, payload));
      });

      socket.on('disconnect', () => {
        this.leaveCurrentRoom(socket, false);
      });
    });
  }

  dispose(): void {
    clearInterval(this.cleanupTimer);
  }

  private handleCreateRoom(socket: TypedSocket, payload: CreateRoomPayload): OperationResult {
    if (socket.data.roomCode) {
      return {
        ok: false,
        error: '请先退出当前房间。'
      };
    }

    const name = normalizeName(payload.name);
    if (!name) {
      return {
        ok: false,
        error: '昵称不能为空。'
      };
    }

    const now = Date.now();
    const roomCode = this.generateRoomCode();
    const memberId = randomUUID();
    const room: RoomState = {
      code: roomCode,
      password: normalizePassword(payload.password),
      status: 'lobby',
      hostMemberId: memberId,
      createdAt: now,
      updatedAt: now,
      emptySince: null,
      members: new Map(),
      seats: createDefaultSeats(),
      match: null
    };

    room.members.set(memberId, {
      id: memberId,
      socketId: socket.id,
      name,
      seatId: null,
      joinedAt: now
    });

    this.rooms.set(roomCode, room);
    socket.data.memberId = memberId;
    socket.data.roomCode = roomCode;
    socket.join(roomCode);

    this.emitRoomSnapshots(room);
    this.broadcastLobbyList();

    return {
      ok: true,
      roomCode
    };
  }

  private handleJoinRoom(socket: TypedSocket, payload: JoinRoomPayload): OperationResult {
    if (socket.data.roomCode) {
      return {
        ok: false,
        error: '请先退出当前房间。'
      };
    }

    const roomCode = payload.roomCode.trim().toUpperCase();
    const room = this.rooms.get(roomCode);
    if (!room) {
      return {
        ok: false,
        error: '房间不存在。'
      };
    }

    const name = normalizeName(payload.name);
    if (!name) {
      return {
        ok: false,
        error: '昵称不能为空。'
      };
    }

    if (room.password && room.password !== normalizePassword(payload.password)) {
      return {
        ok: false,
        error: '房间密码错误。'
      };
    }

    const now = Date.now();
    const memberId = randomUUID();
    const shouldAssignHost = room.members.size === 0;
    room.members.set(memberId, {
      id: memberId,
      socketId: socket.id,
      name,
      seatId: null,
      joinedAt: now
    });
    if (shouldAssignHost) {
      room.hostMemberId = memberId;
    }
    room.updatedAt = now;
    room.emptySince = null;

    socket.data.memberId = memberId;
    socket.data.roomCode = roomCode;
    socket.join(roomCode);

    this.emitRoomSnapshots(room);
    this.broadcastLobbyList();

    return {
      ok: true,
      roomCode
    };
  }

  private handleClaimSeat(socket: TypedSocket, payload: ClaimSeatPayload): OperationResult {
    const room = this.getRoomForSocket(socket);
    const member = this.getMemberForSocket(socket, room);
    if (!room || !member) {
      return this.notInRoom();
    }

    if (room.status !== 'lobby') {
      return {
        ok: false,
        error: '开局后不能再换座位。'
      };
    }

    if (!isSeatId(payload.seatId)) {
      return {
        ok: false,
        error: '无效座位。'
      };
    }

    const seat = room.seats[payload.seatId];
    if (!seat) {
      return {
        ok: false,
        error: '无效座位。'
      };
    }

    if (seat.memberId && seat.memberId !== member.id) {
      return {
        ok: false,
        error: '该座位已有人。'
      };
    }

    if (member.seatId !== null) {
      this.releaseSeat(room, member.seatId);
    }

    seat.memberId = member.id;
    seat.isBot = false;
    seat.aiMode = 'rules';
    seat.llmSelection = null;
    seat.sect = seat.sect ?? this.getDefaultHumanSect(payload.seatId);
    member.seatId = payload.seatId;
    room.updatedAt = Date.now();

    this.emitRoomSnapshots(room);
    this.broadcastLobbyList();

    return {
      ok: true
    };
  }

  private handleLeaveSeat(socket: TypedSocket): OperationResult {
    const room = this.getRoomForSocket(socket);
    const member = this.getMemberForSocket(socket, room);
    if (!room || !member) {
      return this.notInRoom();
    }

    if (room.status !== 'lobby') {
      return {
        ok: false,
        error: '对局开始后不能离开座位。'
      };
    }

    if (member.seatId === null) {
      return {
        ok: false,
        error: '你当前没有占座。'
      };
    }

    this.releaseSeat(room, member.seatId);
    member.seatId = null;
    room.updatedAt = Date.now();

    this.emitRoomSnapshots(room);
    this.broadcastLobbyList();

    return {
      ok: true
    };
  }

  private handleSetSect(socket: TypedSocket, payload: SetSectPayload): OperationResult {
    const room = this.getRoomForSocket(socket);
    const member = this.getMemberForSocket(socket, room);
    if (!room || !member) {
      return this.notInRoom();
    }

    if (room.status !== 'lobby') {
      return {
        ok: false,
        error: '开局后不能再换门派。'
      };
    }

    if (member.seatId === null) {
      return {
        ok: false,
        error: '请先选择座位。'
      };
    }

    room.seats[member.seatId].sect = payload.sect;
    room.updatedAt = Date.now();
    this.emitRoomSnapshots(room);
    return {
      ok: true
    };
  }

  private handleSetSeatAi(socket: TypedSocket, payload: SetSeatAiPayload): OperationResult {
    const room = this.getRoomForSocket(socket);
    const member = this.getMemberForSocket(socket, room);
    if (!room || !member) {
      return this.notInRoom();
    }

    if (room.hostMemberId !== member.id) {
      return {
        ok: false,
        error: '只有房主可以设置 AI。'
      };
    }

    if (room.status !== 'lobby') {
      return {
        ok: false,
        error: '开局后不能再修改 AI。'
      };
    }

    if (!isSeatId(payload.seatId)) {
      return {
        ok: false,
        error: '无效座位。'
      };
    }

    const seat = room.seats[payload.seatId];
    if (!seat || seat.memberId) {
      return {
        ok: false,
        error: '只能设置空置的 AI 座位。'
      };
    }

    if (payload.aiMode === 'rules') {
      seat.aiMode = 'rules';
      seat.llmSelection = null;
      room.updatedAt = Date.now();
      this.emitRoomSnapshots(room);
      return {
        ok: true
      };
    }

    if (payload.aiMode !== 'llm') {
      return {
        ok: false,
        error: '未知 AI 模式。'
      };
    }

    const fallbackSelection = getDefaultLlmSelection();
    const providerName = payload.providerName ?? fallbackSelection?.providerName;
    const modelId = payload.modelId ?? fallbackSelection?.modelId;
    if (!providerName || !modelId || !isValidLlmSelection(providerName, modelId)) {
      return {
        ok: false,
        error: 'LLM 提供商或模型不可用。'
      };
    }

    seat.aiMode = 'llm';
    seat.llmSelection = {
      providerName,
      modelId
    };
    room.updatedAt = Date.now();
    this.emitRoomSnapshots(room);

    return {
      ok: true
    };
  }

  private handleUpdateSettings(socket: TypedSocket, payload: UpdateRoomSettingsPayload): OperationResult {
    const room = this.getRoomForSocket(socket);
    const member = this.getMemberForSocket(socket, room);
    if (!room || !member) {
      return this.notInRoom();
    }

    if (room.hostMemberId !== member.id) {
      return {
        ok: false,
        error: '只有房主可以修改房间设置。'
      };
    }

    room.password = normalizePassword(payload.password);
    room.updatedAt = Date.now();
    this.emitRoomSnapshots(room);
    this.broadcastLobbyList();

    return {
      ok: true
    };
  }

  private handleKickMember(socket: TypedSocket, payload: KickMemberPayload): OperationResult {
    const room = this.getRoomForSocket(socket);
    const member = this.getMemberForSocket(socket, room);
    if (!room || !member) {
      return this.notInRoom();
    }

    if (room.hostMemberId !== member.id) {
      return {
        ok: false,
        error: '只有房主可以踢人。'
      };
    }

    if (payload.memberId === member.id) {
      return {
        ok: false,
        error: '不能踢自己。'
      };
    }

    const target = room.members.get(payload.memberId);
    if (!target) {
      return {
        ok: false,
        error: '目标成员不存在。'
      };
    }

    this.removeMemberFromRoom(room, target.id, true, '你已被房主移出房间。');
    return {
      ok: true
    };
  }

  private handleStartGame(socket: TypedSocket): OperationResult {
    const room = this.getRoomForSocket(socket);
    const member = this.getMemberForSocket(socket, room);
    if (!room || !member) {
      return this.notInRoom();
    }

    if (room.hostMemberId !== member.id) {
      return {
        ok: false,
        error: '只有房主可以开始游戏。'
      };
    }

    if (room.status !== 'lobby') {
      return {
        ok: false,
        error: '当前房间不在大厅状态。'
      };
    }

    const seatedHumans = Array.from(room.members.values()).filter((item) => item.seatId !== null);
    if (seatedHumans.length === 0) {
      return {
        ok: false,
        error: '至少需要一名已落座玩家。'
      };
    }

    const setupData: SetupData = {
      playerNames: room.seats.map((seat) => {
        const memberForSeat = seat.memberId ? room.members.get(seat.memberId) : null;
        return memberForSeat?.name ?? `AI ${seat.id + 1}P`;
      }),
      sects: room.seats.map((seat) => {
        const resolvedSect = seat.sect ?? this.getRandomSect();
        seat.sect = resolvedSect;
        return resolvedSect;
      }),
      botPlayerIds: room.seats.filter((seat) => !seat.memberId).map((seat) => toPlayerId(seat.id)),
      aiControls: this.createAiControls(room)
    };

    room.match = new ServerGameSession(setupData);
    room.status = room.match.isFinished() ? 'finished' : 'in_game';
    room.updatedAt = Date.now();

    for (const seat of room.seats) {
      seat.isBot = !seat.memberId;
    }

    this.emitRoomSnapshots(room);
    this.broadcastLobbyList();
    this.runRoomAutomations(room);

    return {
      ok: true
    };
  }

  private handleGameAction(socket: TypedSocket, payload: GameActionRequest): OperationResult {
    const room = this.getRoomForSocket(socket);
    const member = this.getMemberForSocket(socket, room);
    if (!room || !member) {
      return this.notInRoom();
    }

    if (!room.match || room.status === 'lobby') {
      return {
        ok: false,
        error: '对局尚未开始。'
      };
    }

    if (member.seatId === null) {
      return {
        ok: false,
        error: '观战成员不能操作。'
      };
    }

    const result = room.match.applyAction(toPlayerId(member.seatId), payload);
    if (!result.ok) {
      return result;
    }

    room.status = room.match.isFinished() ? 'finished' : 'in_game';
    room.updatedAt = Date.now();

    this.emitRoomSnapshots(room);
    this.broadcastLobbyList();
    this.runRoomAutomations(room);

    return {
      ok: true
    };
  }

  private leaveCurrentRoom(socket: TypedSocket, notifySocket: boolean): OperationResult {
    const room = this.getRoomForSocket(socket);
    const member = this.getMemberForSocket(socket, room);
    if (!room || !member) {
      if (notifySocket) {
        socket.emit('room:snapshot', null);
      }

      return this.notInRoom();
    }

    this.removeMemberFromRoom(room, member.id, notifySocket);

    return {
      ok: true
    };
  }

  private removeMemberFromRoom(
    room: RoomState,
    memberId: string,
    notifySocket: boolean,
    message = '你已离开房间。'
  ): void {
    const member = room.members.get(memberId);
    if (!member) {
      return;
    }

    const socket = this.io.sockets.sockets.get(member.socketId) as TypedSocket | undefined;
    if (socket) {
      socket.leave(room.code);
      socket.data.memberId = undefined;
      socket.data.roomCode = undefined;
      if (notifySocket) {
        socket.emit('server:error', message);
        socket.emit('room:snapshot', null);
      }
    }

    if (member.seatId !== null) {
      if (room.status === 'lobby') {
        this.releaseSeat(room, member.seatId);
      } else {
        const seat = room.seats[member.seatId];
        seat.memberId = null;
        seat.isBot = true;
        room.match?.setPlayerMetadata(toPlayerId(member.seatId), {
          isBot: true,
          name: `AI ${seat.id + 1}P`
        });
        room.match?.setAiControl(toPlayerId(member.seatId), {
          mode: 'rules'
        });
      }
    }

    room.members.delete(memberId);
    room.updatedAt = Date.now();

    if (room.hostMemberId === memberId && room.members.size > 0) {
      room.hostMemberId = this.pickNextHostMemberId(room);
    }

    if (room.members.size === 0) {
      room.emptySince = Date.now();
    }

    room.match?.resumeAutomations();
    this.emitRoomSnapshots(room);
    this.broadcastLobbyList();
  }

  private releaseSeat(room: RoomState, seatId: SeatID): void {
    const seat = room.seats[seatId];
    seat.memberId = null;
    seat.sect = null;
    seat.isBot = true;
    seat.aiMode = 'rules';
    seat.llmSelection = null;
  }

  private emitRoomSnapshots(room: RoomState): void {
    for (const member of room.members.values()) {
      const socket = this.io.sockets.sockets.get(member.socketId) as TypedSocket | undefined;
      socket?.emit('room:snapshot', this.serializeRoom(room, member.id));
    }
  }

  private serializeRoom(room: RoomState, selfMemberId: string | null): RoomSnapshot {
    const members: RoomMemberSnapshot[] = Array.from(room.members.values())
      .sort((left, right) => left.joinedAt - right.joinedAt)
      .map((member) => ({
        id: member.id,
        name: member.name,
        seatId: member.seatId,
        isHost: member.id === room.hostMemberId,
        joinedAt: member.joinedAt
      }));

    const seats: RoomSeatSnapshot[] = room.seats.map((seat) => {
      const member = seat.memberId ? room.members.get(seat.memberId) : null;
      return {
        id: seat.id,
        memberId: seat.memberId,
        memberName: member?.name ?? null,
        sect: seat.sect,
        isBot: seat.isBot,
        aiMode: seat.aiMode,
        llmProviderName: seat.llmSelection?.providerName ?? null,
        llmModelId: seat.llmSelection?.modelId ?? null
      };
    });

    return {
      selfMemberId,
      roomCode: room.code,
      hostMemberId: room.hostMemberId,
      hasPassword: Boolean(room.password),
      status: room.status,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      members,
      seats,
      llmOptions: getPublicLlmOptions(),
      match: room.match?.getSnapshot() ?? null
    };
  }

  private createAiControls(room: RoomState): Record<string, AiPlayerControl> {
    const controls: Record<string, AiPlayerControl> = {};
    for (const seat of room.seats) {
      if (seat.memberId) {
        continue;
      }

      controls[toPlayerId(seat.id)] = {
        mode: seat.aiMode,
        llm: seat.aiMode === 'llm' ? seat.llmSelection : null
      };
    }

    return controls;
  }

  private runRoomAutomations(room: RoomState): void {
    if (this.automationRooms.has(room.code)) {
      return;
    }

    this.automationRooms.add(room.code);
    void this.runRoomAutomationsLoop(room).finally(() => {
      this.automationRooms.delete(room.code);
    });
  }

  private async runRoomAutomationsLoop(room: RoomState): Promise<void> {
    for (let safety = 0; safety < 96; safety += 1) {
      if (!room.match || room.match.isFinished()) {
        break;
      }

      const snapshot = room.match.getSnapshot();
      const pendingDiscardPlayer = room.match.getPendingDiscardPlayer();
      const actingPlayerId = pendingDiscardPlayer ?? room.match.getCurrentPlayer();
      if (!room.match.isBotPlayer(actingPlayerId)) {
        break;
      }

      const control = room.match.getAiControl(actingPlayerId);
      if (control.mode !== 'llm' || !control.llm) {
        room.match.runRulesAutomation();
        room.status = room.match.isFinished() ? 'finished' : 'in_game';
        room.updatedAt = Date.now();
        this.emitRoomSnapshots(room);
        this.broadcastLobbyList();
        continue;
      }

      try {
        const action = await decideLlmAction(snapshot, actingPlayerId, control.llm);
        if (!action) {
          room.match.appendAutomationLog(`${snapshot.G.players[actingPlayerId].name}（LLM）未返回合法动作，改用规则 AI。`);
          room.match.runRulesAutomation();
        } else {
          room.match.appendAutomationLog(`${snapshot.G.players[actingPlayerId].name}（LLM）决定执行 ${action.type}。`);
          const beforeActionSnapshot = serializeProgressSnapshot(room.match);
          const result = room.match.applyAction(actingPlayerId, action);
          const afterActionSnapshot = serializeProgressSnapshot(room.match);
          if (!result.ok || beforeActionSnapshot === afterActionSnapshot) {
            room.match.appendAutomationLog(`${snapshot.G.players[actingPlayerId].name}（LLM）动作无效，改用规则 AI。`);
            room.match.runRulesAutomation();
          }
        }
      } catch {
        room.match.appendAutomationLog(`${snapshot.G.players[actingPlayerId].name}（LLM）调用失败，改用规则 AI。`);
        room.match.runRulesAutomation();
      }

      room.status = room.match.isFinished() ? 'finished' : 'in_game';
      room.updatedAt = Date.now();
      this.emitRoomSnapshots(room);
      this.broadcastLobbyList();
    }
  }

  private listLobbyRooms(): LobbyRoomSummary[] {
    return Array.from(this.rooms.values())
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((room) => {
        const host = room.members.get(room.hostMemberId);
        return {
          roomCode: room.code,
          hostName: host?.name ?? '空房',
          memberCount: room.members.size,
          seatedCount: room.seats.filter((seat) => seat.memberId !== null).length,
          hasPassword: Boolean(room.password),
          status: room.status,
          updatedAt: room.updatedAt
        };
      });
  }

  private broadcastLobbyList(): void {
    this.io.emit('lobby:rooms', this.listLobbyRooms());
  }

  private cleanupIdleRooms(): void {
    const now = Date.now();

    for (const [code, room] of this.rooms.entries()) {
      if (room.members.size > 0 || room.emptySince === null) {
        continue;
      }

      if (now - room.emptySince < ROOM_IDLE_TIMEOUT_MS) {
        continue;
      }

      this.rooms.delete(code);
    }

    this.broadcastLobbyList();
  }

  private pickNextHostMemberId(room: RoomState): string {
    const [nextHost] = Array.from(room.members.values()).sort((left, right) => left.joinedAt - right.joinedAt);
    return nextHost?.id ?? room.hostMemberId;
  }

  private getDefaultHumanSect(seatId: SeatID): Sect {
    return DEFAULT_ROOM_SECTS[seatId] ?? DEFAULT_ROOM_SECTS[0];
  }

  private getRandomSect(): Sect {
    const index = Math.floor(Math.random() * AVAILABLE_ROOM_SECTS.length);
    return AVAILABLE_ROOM_SECTS[index] ?? AVAILABLE_ROOM_SECTS[0];
  }

  private generateRoomCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    while (true) {
      let code = '';
      for (let index = 0; index < 6; index += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
      }

      if (!this.rooms.has(code)) {
        return code;
      }
    }
  }

  private getRoomForSocket(socket: TypedSocket): RoomState | null {
    const roomCode = socket.data.roomCode;
    if (!roomCode) {
      return null;
    }

    return this.rooms.get(roomCode) ?? null;
  }

  private getMemberForSocket(socket: TypedSocket, room: RoomState | null): RoomMember | null {
    const memberId = socket.data.memberId;
    if (!room || !memberId) {
      return null;
    }

    return room.members.get(memberId) ?? null;
  }

  private notInRoom(): OperationResult {
    return {
      ok: false,
      error: '当前不在任何房间中。'
    };
  }
}
