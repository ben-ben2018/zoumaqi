import { createServer } from 'node:http';

import { Server } from 'socket.io';

import { DEFAULT_SOCKET_PORT, SOCKET_PATH, type ClientToServerEvents, type InterServerEvents, type ServerToClientEvents, type SocketData } from '../multiplayer/protocol';
import { RoomManager } from './roomManager';

const port = Number(process.env.SOCKET_PORT ?? DEFAULT_SOCKET_PORT);
const httpServer = createServer();

const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
  path: SOCKET_PATH,
  cors: {
    origin: '*'
  }
});

const roomManager = new RoomManager(io);
roomManager.attach();

httpServer.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Damaqi socket server listening on :${port}${SOCKET_PATH}`);
});

const shutdown = () => {
  roomManager.dispose();
  io.close(() => {
    httpServer.close(() => {
      process.exit(0);
    });
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
