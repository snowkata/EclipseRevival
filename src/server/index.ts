import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server } from 'socket.io';
import {
  ApiError, buyUpgrade, getProfile, history, leaderboard, login, register, updateProfile, verifyToken,
} from './accounts.js';
import { checkDb, dbEnabled } from './db.js';
import { RoomManager, accountFromToken, type IO } from './rooms.js';

const PORT = Number(process.env.PORT ?? 3000);
const app = express();
const http = createServer(app);
const io: IO = new Server(http, { cors: { origin: process.env.CORS_ORIGIN ?? '*' } });
const rooms = new RoomManager(io);

app.use(express.json({ limit: '10kb' }));

app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.rooms.size, db: dbEnabled() }));

// ---------- API de cuentas ----------
type Handler = (req: Request, res: Response) => Promise<unknown>;
const api = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  if (!dbEnabled()) return void res.status(503).json({ error: 'El servidor no tiene base de datos configurada.' });
  fn(req, res).then((out) => res.json(out ?? { ok: true })).catch(next);
};
const userId = (req: Request): number => {
  const id = verifyToken((req.headers.authorization ?? '').replace(/^Bearer /, ''));
  if (!id) throw new ApiError(401, 'Inicia sesión para continuar.');
  return id;
};

// Límite sencillo de intentos de registro e inicio de sesión por dirección IP
const attempts = new Map<string, { n: number; reset: number }>();
function limit(req: Request) {
  const key = req.ip ?? 'x', now = Date.now();
  const a = attempts.get(key);
  if (!a || a.reset < now) { attempts.set(key, { n: 1, reset: now + 5 * 60_000 }); return; }
  if (++a.n > 20) throw new ApiError(429, 'Demasiados intentos. Espera unos minutos.');
}
setInterval(() => { const now = Date.now(); for (const [k, a] of attempts) if (a.reset < now) attempts.delete(k); }, 60_000).unref();

app.get('/api/status', (_req, res) => res.json({ accounts: dbEnabled() }));
app.post('/api/register', api(async (req) => { limit(req); return register(req.body?.username, req.body?.email, req.body?.password); }));
app.post('/api/login', api(async (req) => { limit(req); return login(req.body?.identifier, req.body?.password); }));
app.get('/api/me', api(async (req) => getProfile(userId(req))));
app.patch('/api/profile', api(async (req) => ({ account: await updateProfile(userId(req), req.body?.displayName, req.body?.color) })));
app.post('/api/shop/buy', api(async (req) => { const id = userId(req); await buyUpgrade(id, req.body?.id); return getProfile(id); }));
app.get('/api/leaderboard', api(async (req) => ({ rows: await leaderboard(Number(req.query.map) || 1, Number(req.query.difficulty) || 2) })));
app.get('/api/history', api(async (req) => ({ rows: await history(userId(req)) })));

app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) return void res.status(err.status).json({ error: err.message });
  console.error('[api]', err);
  res.status(500).json({ error: 'Error del servidor. Inténtalo de nuevo.' });
});

// En producción el mismo servidor entrega el juego ya compilado (dist/client)
const here = dirname(fileURLToPath(import.meta.url));
const clientDir = [join(here, 'client'), join(here, '../../dist/client')].find((d) => existsSync(d));
if (clientDir) {
  app.use(express.static(clientDir));
  app.get('*', (_req, res) => res.sendFile(join(clientDir, 'index.html')));
}

// El navegador manda su token de sesión al conectarse; sin token entra como invitado
io.use(async (socket, next) => {
  try {
    socket.data.account = await accountFromToken(verifyToken(socket.handshake.auth?.token));
  } catch {
    socket.data.account = null;
  }
  next();
});
io.on('connection', (socket) => rooms.handle(socket));

http.listen(PORT, async () => {
  console.log(`Eclipse Revival escuchando en http://localhost:${PORT}`);
  console.log(`Base de datos: ${await checkDb()}`);
});
