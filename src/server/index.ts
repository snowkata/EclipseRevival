import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServer, ServerToClient } from '../shared/protocol.js';
import { RoomManager } from './rooms.js';

const PORT = Number(process.env.PORT ?? 3000);
const app = express();
const http = createServer(app);
const io = new Server<ClientToServer, ServerToClient>(http, { cors: { origin: process.env.CORS_ORIGIN ?? '*' } });
const rooms = new RoomManager(io);

app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.rooms.size }));

// En producción el mismo servidor entrega el juego ya compilado (dist/client)
const here = dirname(fileURLToPath(import.meta.url));
const clientDir = [join(here, 'client'), join(here, '../../dist/client')].find((d) => existsSync(d));
if (clientDir) {
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => res.sendFile(join(clientDir, 'index.html')));
}

io.on('connection', (socket) => rooms.handle(socket));

http.listen(PORT, () => {
  console.log(`Eclipse Revival escuchando en http://localhost:${PORT}`);
});
