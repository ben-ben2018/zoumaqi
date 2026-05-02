import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import {
  type ClaimSeatPayload,
  type CreateRoomPayload,
  type GameActionRequest,
  type JoinRoomPayload,
  type LobbyRoomSummary,
  type OperationResult,
  type RoomSnapshot,
  type SetSeatAiPayload,
  type SetSectPayload,
  type ServerToClientEvents,
  type ClientToServerEvents,
  type UpdateRoomSettingsPayload
} from './protocol';
import { createMultiplayerSocket } from './socket';

type MultiplayerSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type ToastState = { id: number; message: string } | null;

const PLAYER_NAME_STORAGE_KEY = 'damaqi-player-name';

function readStoredPlayerName(): string {
  return window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? '';
}

export function useMultiplayerSession() {
  const socketRef = useRef<MultiplayerSocket | null>(null);
  const toastIdRef = useRef(0);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [rooms, setRooms] = useState<LobbyRoomSummary[]>([]);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [error, setErrorState] = useState<ToastState>(null);
  const [playerName, setPlayerNameState] = useState<string>(() => readStoredPlayerName());

  const setError = (message: string | null) => {
    if (!message) {
      setErrorState(null);
      return;
    }

    toastIdRef.current += 1;
    setErrorState({
      id: toastIdRef.current,
      message
    });
  };

  useEffect(() => {
    const socket = createMultiplayerSocket();
    socketRef.current = socket;

    const handleConnect = () => {
      setConnectionState('connected');
      socket.emit('lobby:list');
    };

    const handleDisconnect = () => {
      setConnectionState('disconnected');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('lobby:rooms', (nextRooms) => {
      setRooms(nextRooms);
    });
    socket.on('room:snapshot', (snapshot) => {
      setRoom(snapshot);
    });
    socket.on('server:error', (message) => {
      setError(message);
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const setPlayerName = (value: string) => {
    setPlayerNameState(value);
    window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, value);
  };

  const emitWithAck = <TArgs extends unknown[]>(
    emitter: (callback: (result: OperationResult) => void, ...args: TArgs) => void,
    ...args: TArgs
  ) =>
    new Promise<OperationResult>((resolve) => {
      emitter(
        (result) => {
          if (!result.ok && result.error) {
            setError(result.error);
          }
          resolve(result);
        },
        ...args
      );
    });

  const createRoom = async (payload: CreateRoomPayload) => {
    const socket = socketRef.current;
    if (!socket) {
      return {
        ok: false,
        error: 'Socket 尚未连接。'
      } satisfies OperationResult;
    }

    return emitWithAck((callback) => socket.emit('room:create', payload, callback));
  };

  const joinRoom = async (payload: JoinRoomPayload) => {
    const socket = socketRef.current;
    if (!socket) {
      return {
        ok: false,
        error: 'Socket 尚未连接。'
      } satisfies OperationResult;
    }

    return emitWithAck((callback) => socket.emit('room:join', payload, callback));
  };

  const leaveRoom = async () => {
    const socket = socketRef.current;
    if (!socket) {
      return {
        ok: false,
        error: 'Socket 尚未连接。'
      } satisfies OperationResult;
    }

    return emitWithAck((callback) => socket.emit('room:leave', callback));
  };

  const claimSeat = async (payload: ClaimSeatPayload) => {
    const socket = socketRef.current;
    if (!socket) {
      return {
        ok: false,
        error: 'Socket 尚未连接。'
      } satisfies OperationResult;
    }

    return emitWithAck((callback) => socket.emit('room:claimSeat', payload, callback));
  };

  const leaveSeat = async () => {
    const socket = socketRef.current;
    if (!socket) {
      return {
        ok: false,
        error: 'Socket 尚未连接。'
      } satisfies OperationResult;
    }

    return emitWithAck((callback) => socket.emit('room:leaveSeat', callback));
  };

  const setSect = async (payload: SetSectPayload) => {
    const socket = socketRef.current;
    if (!socket) {
      return {
        ok: false,
        error: 'Socket 尚未连接。'
      } satisfies OperationResult;
    }

    return emitWithAck((callback) => socket.emit('room:setSect', payload, callback));
  };

  const setSeatAi = async (payload: SetSeatAiPayload) => {
    const socket = socketRef.current;
    if (!socket) {
      return {
        ok: false,
        error: 'Socket 尚未连接。'
      } satisfies OperationResult;
    }

    return emitWithAck((callback) => socket.emit('room:setSeatAi', payload, callback));
  };

  const updateRoomSettings = async (payload: UpdateRoomSettingsPayload) => {
    const socket = socketRef.current;
    if (!socket) {
      return {
        ok: false,
        error: 'Socket 尚未连接。'
      } satisfies OperationResult;
    }

    return emitWithAck((callback) => socket.emit('room:updateSettings', payload, callback));
  };

  const kickMember = async (memberId: string) => {
    const socket = socketRef.current;
    if (!socket) {
      return {
        ok: false,
        error: 'Socket 尚未连接。'
      } satisfies OperationResult;
    }

    return emitWithAck((callback) => socket.emit('room:kickMember', { memberId }, callback));
  };

  const startGame = async () => {
    const socket = socketRef.current;
    if (!socket) {
      return {
        ok: false,
        error: 'Socket 尚未连接。'
      } satisfies OperationResult;
    }

    return emitWithAck((callback) => socket.emit('room:startGame', callback));
  };

  const sendGameAction = async (payload: GameActionRequest) => {
    const socket = socketRef.current;
    if (!socket) {
      return {
        ok: false,
        error: 'Socket 尚未连接。'
      } satisfies OperationResult;
    }

    return emitWithAck((callback) => socket.emit('game:action', payload, callback));
  };

  const refreshRooms = () => {
    socketRef.current?.emit('lobby:list');
  };

  return {
    connectionState,
    rooms,
    room,
    error,
    playerName,
    setPlayerName,
    setError,
    refreshRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    claimSeat,
    leaveSeat,
    setSect,
    setSeatAi,
    updateRoomSettings,
    kickMember,
    startGame,
    sendGameAction
  };
}
