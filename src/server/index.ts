import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server } from 'socket.io';
import {
  ApiError, buyUpgrade, getProfile, history, leaderboard, login, register, updateProfile, verifyToken,
} from './accounts.js';
import { checkDb, dbEnabled, pool } from './db.js';
import { RoomManager, accountFromToken, type IO } from './rooms.js';
import { ConnectionCounter, RateLimiter, SECURITY_HEADERS, clientIp, isProduction, trustProxyHops } from './security.js';

const PORT = Number(process.env.PORT ?? 3000);
const app = express();
const http = createServer(app);

// Por defecto solo se aceptan conexiones desde la misma página que entrega el servidor.
// CORS_ORIGIN permite otro dominio (por ejemplo, si el cliente se publica aparte).
const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean);
const io: IO = new Server(http, {
  cors: corsOrigin?.length ? { origin: corsOrigin } : undefined,
  maxHttpBufferSize: 16 * 1024, // ningún mensaje del juego pesa más de unos cientos de bytes
});
const rooms = new RoomManager(io);

app.disable('x-powered-by');
app.set('trust proxy', trustProxyHops);
app.use((_req, res, next) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
});
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

// Límites por dirección IP: 20 intentos de registro o inicio de sesión cada 5 minutos
// y 120 consultas a la API por minuto
const authLimit = new RateLimiter(20, 5 * 60_000);
const apiLimit = new RateLimiter(120, 60_000);
function limit(req: Request) {
  if (!authLimit.take(req.ip ?? 'x')) throw new ApiError(429, 'Demasiados intentos. Espera unos minutos.');
}
app.use('/api', (req, res, next) => {
  if (!apiLimit.take(req.ip ?? 'x')) return void res.status(429).json({ error: 'Demasiadas peticiones. Espera un momento.' });
  next();
});

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

// Máximo de conexiones abiertas a la vez desde una misma IP
const connections = new ConnectionCounter(Number(process.env.MAX_CONNECTIONS_PER_IP ?? 10) || 10);
io.use((socket, next) => {
  const ip = clientIp(socket.request);
  if (!connections.add(ip)) return next(new Error('Demasiadas conexiones desde tu red.'));
  socket.data.ip = ip;
  socket.on('disconnect', () => connections.remove(ip));
  next();
});

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
  console.log(`Eclipse Revival escuchando en el puerto ${PORT}`);
  console.log(`Base de datos: ${await checkDb()}`);
});

// El hosting manda SIGTERM al actualizar o apagar: se cierra con orden
process.on('SIGTERM', () => {
  console.log('Apagando el servidor…');
  io.close();
  void pool?.end();
  setTimeout(() => process.exit(0), 3000).unref();
});
