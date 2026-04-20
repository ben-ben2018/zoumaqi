import { io, type Socket } from 'socket.io-client';

import { DEFAULT_SOCKET_PORT, SOCKET_PATH, type ClientToServerEvents, type ServerToClientEvents } from './protocol';

function getSocketUrl(): string {
  const explicitUrl = import.meta.env.VITE_SOCKET_URL;
  if (explicitUrl) {
    return explicitUrl;
  }

  const protocol = window.location.protocol;
  const hostname = window.location.hostname || 'localhost';
  const port = import.meta.env.VITE_SOCKET_PORT ?? DEFAULT_SOCKET_PORT;
  return `${protocol}//${hostname}:${port}`;
}

export function createMultiplayerSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  return io(getSocketUrl(), {
    path: SOCKET_PATH,
    transports: ['websocket'],
    autoConnect: true
  });
}
