import { afterEach, describe, expect, it, vi } from 'vitest';

import { ROOM_IDLE_TIMEOUT_MS, type RoomSnapshot } from '../multiplayer/protocol';
import { ServerGameSession } from '../server/gameSession';
import { RoomManager } from '../server/roomManager';
import { Sect, TurnStage } from '../types';

type FakeSocket = {
  id: string;
  data: {
    memberId?: string;
    roomCode?: string;
  };
  emitted: Array<{ event: string; payload: unknown }>;
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

type FakeIo = {
  emitted: Array<{ event: string; payload: unknown }>;
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  sockets: {
    sockets: Map<string, FakeSocket>;
  };
};

const managersToDispose: RoomManager[] = [];

function createFakeSocket(id: string): FakeSocket {
  const emitted: Array<{ event: string; payload: unknown }> = [];

  return {
    id,
    data: {},
    emitted,
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn((event: string, payload: unknown) => {
      emitted.push({ event, payload });
    }),
    on: vi.fn()
  };
}

function createFakeIo(): FakeIo {
  const emitted: Array<{ event: string; payload: unknown }> = [];

  return {
    emitted,
    emit: vi.fn((event: string, payload: unknown) => {
      emitted.push({ event, payload });
    }),
    on: vi.fn(),
    sockets: {
      sockets: new Map<string, FakeSocket>()
    }
  };
}

function createRoomManagerHarness() {
  const io = createFakeIo();
  const manager = new RoomManager(io as never);
  managersToDispose.push(manager);

  return {
    io,
    manager,
    managerInternal: manager as any
  };
}

afterEach(() => {
  for (const manager of managersToDispose.splice(0)) {
    manager.dispose();
  }

  vi.restoreAllMocks();
});

describe('RoomManager', () => {
  it('reassigns the host to the second member who joined after the host leaves', () => {
    const { io, managerInternal } = createRoomManagerHarness();
    const hostSocket = createFakeSocket('socket-host');
    const secondSocket = createFakeSocket('socket-second');
    const thirdSocket = createFakeSocket('socket-third');
    io.sockets.sockets.set(hostSocket.id, hostSocket);
    io.sockets.sockets.set(secondSocket.id, secondSocket);
    io.sockets.sockets.set(thirdSocket.id, thirdSocket);

    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const createResult = managerInternal.handleCreateRoom(hostSocket, {
      name: 'Host'
    });
    const roomCode = createResult.roomCode as string;

    now = 2_000;
    managerInternal.handleJoinRoom(secondSocket, {
      roomCode,
      name: 'Second'
    });

    now = 3_000;
    managerInternal.handleJoinRoom(thirdSocket, {
      roomCode,
      name: 'Third'
    });

    managerInternal.leaveCurrentRoom(hostSocket, true);

    const room = managerInternal.rooms.get(roomCode);
    const snapshot = managerInternal.serializeRoom(room, secondSocket.data.memberId);

    expect(room.hostMemberId).toBe(secondSocket.data.memberId);
    expect(snapshot.members.map((member: { name: string }) => member.name)).toEqual(['Second', 'Third']);
    expect(
      snapshot.members.find((member: { id: string }) => member.id === secondSocket.data.memberId)?.isHost
    ).toBe(true);
    expect(
      snapshot.members.find((member: { id: string }) => member.id === thirdSocket.data.memberId)?.isHost
    ).toBe(false);
  });

  it('keeps empty rooms before 5 minutes and removes them once the idle timeout is reached', () => {
    const { io, managerInternal } = createRoomManagerHarness();
    const hostSocket = createFakeSocket('socket-host');
    io.sockets.sockets.set(hostSocket.id, hostSocket);

    let now = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const createResult = managerInternal.handleCreateRoom(hostSocket, {
      name: 'SoloHost'
    });
    const roomCode = createResult.roomCode as string;

    now = 12_000;
    managerInternal.leaveCurrentRoom(hostSocket, false);

    expect(managerInternal.rooms.get(roomCode)?.emptySince).toBe(12_000);

    now = 12_000 + ROOM_IDLE_TIMEOUT_MS - 1;
    managerInternal.cleanupIdleRooms();
    expect(managerInternal.rooms.has(roomCode)).toBe(true);

    now += 1;
    managerInternal.cleanupIdleRooms();
    expect(managerInternal.rooms.has(roomCode)).toBe(false);
  });

  it('assigns the first rejoining member as host after a room becomes empty', () => {
    const { io, managerInternal } = createRoomManagerHarness();
    const hostSocket = createFakeSocket('socket-host');
    const rejoinSocket = createFakeSocket('socket-rejoin');
    io.sockets.sockets.set(hostSocket.id, hostSocket);
    io.sockets.sockets.set(rejoinSocket.id, rejoinSocket);

    let now = 20_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const createResult = managerInternal.handleCreateRoom(hostSocket, {
      name: 'SoloHost'
    });
    const roomCode = createResult.roomCode as string;

    now = 21_000;
    managerInternal.leaveCurrentRoom(hostSocket, false);

    now = 22_000;
    managerInternal.handleJoinRoom(rejoinSocket, {
      roomCode,
      name: 'NewHost'
    });

    const room = managerInternal.rooms.get(roomCode);
    const snapshot = managerInternal.serializeRoom(room, rejoinSocket.data.memberId);

    expect(room.hostMemberId).toBe(rejoinSocket.data.memberId);
    expect(room.emptySince).toBeNull();
    expect(snapshot.members).toHaveLength(1);
    expect(snapshot.members[0]).toMatchObject({
      id: rejoinSocket.data.memberId,
      name: 'NewHost',
      isHost: true
    });
  });

  it('keeps empty seats without sects until start, then assigns random sects to AI seats', () => {
    const { io, managerInternal } = createRoomManagerHarness();
    const hostSocket = createFakeSocket('socket-host');
    io.sockets.sockets.set(hostSocket.id, hostSocket);

    vi.spyOn(Math, 'random').mockReturnValue(0.6);

    const createResult = managerInternal.handleCreateRoom(hostSocket, {
      name: 'Host'
    });
    const roomCode = createResult.roomCode as string;
    const room = managerInternal.rooms.get(roomCode);

    expect(room.seats.map((seat: { sect: Sect | null }) => seat.sect)).toEqual([null, null, null, null]);

    managerInternal.handleClaimSeat(hostSocket, { seatId: 0 });
    expect(room.seats[0].sect).toBe(Sect.QINGXI);
    expect(room.seats.slice(1).map((seat: { sect: Sect | null }) => seat.sect)).toEqual([null, null, null]);

    managerInternal.handleStartGame(hostSocket);

    expect(room.seats[0].sect).toBe(Sect.QINGXI);
    expect(room.seats[1].sect).toBe(Sect.KUANGLAN);
    expect(room.seats[2].sect).toBe(Sect.KUANGLAN);
    expect(room.seats[3].sect).toBe(Sect.KUANGLAN);
  });

  it('lets only the host configure an empty AI seat for LLM mode', () => {
    const { io, managerInternal } = createRoomManagerHarness();
    const hostSocket = createFakeSocket('socket-host');
    const guestSocket = createFakeSocket('socket-guest');
    io.sockets.sockets.set(hostSocket.id, hostSocket);
    io.sockets.sockets.set(guestSocket.id, guestSocket);

    const createResult = managerInternal.handleCreateRoom(hostSocket, {
      name: 'Host'
    });
    const roomCode = createResult.roomCode as string;
    managerInternal.handleJoinRoom(guestSocket, {
      roomCode,
      name: 'Guest'
    });

    expect(
      managerInternal.handleSetSeatAi(guestSocket, {
        seatId: 1,
        aiMode: 'llm',
        providerName: 'OpenAI',
        modelId: 'gpt-4o'
      })
    ).toMatchObject({
      ok: false
    });

    expect(
      managerInternal.handleSetSeatAi(hostSocket, {
        seatId: 1,
        aiMode: 'llm',
        providerName: 'OpenAI',
        modelId: 'gpt-4o'
      })
    ).toEqual({
      ok: true
    });

    const room = managerInternal.rooms.get(roomCode);
    const snapshot = managerInternal.serializeRoom(room, hostSocket.data.memberId) as RoomSnapshot;
    expect(snapshot.seats[1]).toMatchObject({
      aiMode: 'llm',
      llmProviderName: 'OpenAI',
      llmModelId: 'gpt-4o'
    });
    expect(JSON.stringify(snapshot.llmOptions)).not.toContain('sk-');
  });

  it('keeps an opening LLM bot waiting for async automation instead of running rules AI in setup', () => {
    const { io, managerInternal } = createRoomManagerHarness();
    const hostSocket = createFakeSocket('socket-host');
    io.sockets.sockets.set(hostSocket.id, hostSocket);

    vi.spyOn(Math, 'random').mockReturnValue(0);

    const createResult = managerInternal.handleCreateRoom(hostSocket, {
      name: 'Host'
    });
    const roomCode = createResult.roomCode as string;
    const room = managerInternal.rooms.get(roomCode);

    managerInternal.handleClaimSeat(hostSocket, { seatId: 1 });
    managerInternal.handleSetSeatAi(hostSocket, {
      seatId: 0,
      aiMode: 'llm',
      providerName: 'OpenAI',
      modelId: 'gpt-4o'
    });
    managerInternal.automationRooms.add(roomCode);

    managerInternal.handleStartGame(hostSocket);

    const snapshot = room.match.getSnapshot();
    expect(snapshot.ctx).toEqual({
      currentPlayer: '0',
      turn: 1
    });
    expect(snapshot.G.players['0'].position).toBe(0);
    expect(snapshot.G.aiControls?.['0']).toMatchObject({
      mode: 'llm',
      llm: {
        providerName: 'OpenAI',
        modelId: 'gpt-4o'
      }
    });
  });
});

describe('ServerGameSession', () => {
  it('runs setup and onBegin when the session is created', () => {
    const session = new ServerGameSession({
      playerNames: ['Alice', 'Bob', 'Carol', 'Dave'],
      botPlayerIds: ['1', '2', '3']
    });

    const snapshot = session.getSnapshot();

    expect(snapshot.ctx).toEqual({
      currentPlayer: '0',
      turn: 1
    });
    expect(snapshot.G.players['0'].name).toBe('Alice');
    expect(snapshot.G.players['0'].gold).toBe(55);
    expect(snapshot.G.players['1'].gold).toBe(55);
    expect(snapshot.G.players['0'].handCards).toHaveLength(1);
    expect(snapshot.G.players['1'].handCards).toHaveLength(1);
    expect(snapshot.G.turnStage).toBe(TurnStage.ROLL);
    expect(snapshot.G.turnMessage).toBe('轮到 Alice（赤队）行动。');
  });

  it('applies rollDice through the server wrapper and transitions into card stage', () => {
    const session = new ServerGameSession({
      playerNames: ['Alice', 'Bob', 'Carol', 'Dave'],
      botPlayerIds: ['1', '2', '3']
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const result = session.applyAction('0', {
      type: 'rollDice'
    });
    const snapshot = session.getSnapshot();

    expect(result).toEqual({ ok: true });
    expect(snapshot.ctx).toEqual({
      currentPlayer: '0',
      turn: 1
    });
    expect(snapshot.G.players['0'].lastRoll).toBe(1);
    expect(snapshot.G.players['0'].position).toBe(1);
    expect(snapshot.G.players['0'].hasRolledThisTurn).toBe(true);
    expect(snapshot.G.players['0'].hasMovedThisTurn).toBe(true);
    expect(snapshot.G.pendingRoll).toBeNull();
    expect(snapshot.G.turnStage).toBe(TurnStage.CARD);
  });

  it('automatically advances an opening bot turn until control reaches the next human seat', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const session = new ServerGameSession({
      playerNames: ['Bot Zero', 'Human One', 'Human Two', 'Human Three'],
      botPlayerIds: ['0']
    });
    const snapshot = session.getSnapshot();

    expect(snapshot.ctx).toEqual({
      currentPlayer: '1',
      turn: 2
    });
    expect(snapshot.G.players['0'].isBot).toBe(true);
    expect(snapshot.G.players['0'].position).toBe(7);
    expect(snapshot.G.players['0'].lastRoll).toBe(1);
    expect(snapshot.G.players['1'].lastRoll).toBeNull();
    expect(snapshot.G.turnStage).toBe(TurnStage.ROLL);
    expect(snapshot.G.turnMessage).toBe('轮到 Human One（青队）行动。');
  });
});
