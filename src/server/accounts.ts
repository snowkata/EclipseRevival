// Cuentas, taller de mejoras permanentes, clasificación e historial (RF01–RF04, RF36–RF40).
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { DIFFICULTIES, MAPS, type PermAttr, type PermBonus } from '../shared/data.js';
import { accountXpToNext, upgradeCost } from '../shared/formulas.js';
import type { Account, HistoryRow, LeaderboardRow, MapProgress, Profile, ShopItem } from '../shared/protocol.js';
import { dbEnabled, query, transaction } from './db.js';

const SECRET = process.env.JWT_SECRET ?? randomBytes(32).toString('hex');
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  // Una clave corta se puede adivinar y con ella cualquiera fabricaría sesiones falsas
  console.error('[cuentas] JWT_SECRET es muy corta: usa al menos 32 caracteres aleatorios.');
  if (process.env.NODE_ENV === 'production') process.exit(1);
}
if (!process.env.JWT_SECRET && dbEnabled()) console.warn('[cuentas] Falta JWT_SECRET: las sesiones se cerrarán al reiniciar el servidor.');

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

interface UserRow {
  id_usuario: number; nombre_usuario: string; correo: string; contrasena_hash: string; rol: 'jugador' | 'administrador';
  nombre_visible: string; color_avatar: string | null; nivel_cuenta: number; xp_cuenta: number; oro: number; estado: string;
}

const toAccount = (u: UserRow): Account => ({
  id: u.id_usuario, username: u.nombre_usuario, displayName: u.nombre_visible, color: u.color_avatar, role: u.rol,
  level: u.nivel_cuenta, xp: u.xp_cuenta, xpNext: accountXpToNext(u.nivel_cuenta), gold: u.oro,
});

/** Sesión de 24 horas (RNF13). */
export const signToken = (userId: number) => jwt.sign({ sub: String(userId) }, SECRET, { expiresIn: '24h', algorithm: 'HS256' });
export function verifyToken(token: unknown): number | null {
  if (typeof token !== 'string' || !token || token.length > 1000) return null;
  try {
    const p = jwt.verify(token, SECRET, { algorithms: ['HS256'] }) as { sub?: string };
    const id = Number(p.sub);
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

export async function register(username: unknown, email: unknown, password: unknown): Promise<{ token: string; account: Account }> {
  if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') throw new ApiError(400, 'Datos no válidos.');
  const u = username.trim(), e = email.trim().toLowerCase(), p = password;
  if (!/^[A-Za-z0-9_]{3,30}$/.test(u)) throw new ApiError(400, 'El nombre de usuario debe tener de 3 a 30 letras, números o guion bajo.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 100) throw new ApiError(400, 'El correo no es válido.');
  if (p.length < 8 || p.length > 72) throw new ApiError(400, 'La contraseña debe tener entre 8 y 72 caracteres.');
  const exists = await query('SELECT 1 FROM usuario WHERE lower(nombre_usuario) = lower($1) OR correo = $2', [u, e]);
  if (exists.length) throw new ApiError(409, 'Ya existe una cuenta con ese usuario o correo.');
  const hash = await bcrypt.hash(p, 10); // RNF10
  const rows = await query<UserRow>(
    'INSERT INTO usuario (nombre_usuario, correo, contrasena_hash, nombre_visible) VALUES ($1, $2, $3, $4) RETURNING *', [u, e, hash, u.slice(0, 16)]);
  return { token: signToken(rows[0].id_usuario), account: toAccount(rows[0]) };
}

export async function login(identifier: unknown, password: unknown): Promise<{ token: string; account: Account }> {
  if (typeof identifier !== 'string' || typeof password !== 'string' || identifier.length > 100 || password.length > 72) throw new ApiError(401, 'Usuario o contraseña incorrectos.');
  const id = identifier.trim(), p = password;
  const rows = await query<UserRow>('SELECT * FROM usuario WHERE lower(nombre_usuario) = lower($1) OR correo = lower($1)', [id]);
  const user = rows[0];
  // Se compara siempre contra un hash para no revelar si la cuenta existe
  const ok = await bcrypt.compare(p, user?.contrasena_hash ?? '$2a$10$CwTycUXWue0Thq9StjUM0uJ8e3nG8xK0n0C0p8g7lW4H0e9b0ZbXe');
  if (!user || !ok) throw new ApiError(401, 'Usuario o contraseña incorrectos.');
  if (user.estado !== 'activo') throw new ApiError(403, 'La cuenta está desactivada.');
  return { token: signToken(user.id_usuario), account: toAccount(user) };
}

export async function getUser(userId: number): Promise<Account | null> {
  const rows = await query<UserRow>("SELECT * FROM usuario WHERE id_usuario = $1 AND estado = 'activo'", [userId]);
  return rows[0] ? toAccount(rows[0]) : null;
}

export async function getProfile(userId: number): Promise<Profile> {
  const account = await getUser(userId);
  if (!account) throw new ApiError(401, 'Sesión no válida.');
  const shopRows = await query<{ id_mejora: number; nombre: string; atributo: string; valor_nivel: string; nivel_max: number; costo_base: number; incremento_costo: string; nivel_cuenta_req: number; nivel: number }>(
    `SELECT m.*, COALESCE(p.nivel, 0) AS nivel FROM mejora_permanente m
     LEFT JOIN progreso_mejora p ON p.id_mejora = m.id_mejora AND p.id_usuario = $1 ORDER BY m.id_mejora`, [userId]);
  const shop: ShopItem[] = shopRows.map((r) => ({
    id: r.id_mejora, name: r.nombre, attr: r.atributo, perLevel: Number(r.valor_nivel), maxLevel: r.nivel_max, level: r.nivel,
    cost: r.nivel >= r.nivel_max ? null : upgradeCost(r.costo_base, Number(r.incremento_costo), r.nivel),
    levelReq: r.nivel_cuenta_req, locked: account.level < r.nivel_cuenta_req,
  }));
  return { account, shop, progress: await getProgress(userId) };
}

export async function getProgress(userId: number): Promise<MapProgress[]> {
  const rows = await query<{ id_mapa: number; id_dificultad: number; completado: boolean; mejor_ronda: number; mejor_tiempo_seg: number | null }>(
    'SELECT * FROM progreso_mapa WHERE id_usuario = $1', [userId]);
  return rows.map((r) => ({ mapId: r.id_mapa, difficultyId: r.id_dificultad, completed: r.completado, bestRound: r.mejor_ronda, bestSeconds: r.mejor_tiempo_seg }));
}

/** RF38: el siguiente mapa se abre al completar el anterior; Difícil se abre al completar Normal en ese mapa. */
export function unlockedOptions(progress: MapProgress[] | null): [number, number][] {
  const out: [number, number][] = [];
  const maps = MAPS.filter((m) => m.available);
  maps.forEach((m, i) => {
    const prev = maps[i - 1];
    const open = !progress || i === 0 || progress.some((p) => p.mapId === prev.id && p.completed);
    if (!open) return;
    for (const d of DIFFICULTIES) {
      if (!progress || d.id !== 3 || progress.some((p) => p.mapId === m.id && p.difficultyId === 2 && p.completed)) out.push([m.id, d.id]);
    }
  });
  return out;
}

export async function updateProfile(userId: number, displayName: unknown, color: unknown): Promise<Account> {
  const name = (typeof displayName === 'string' ? displayName.slice(0, 64) : '').replace(/[<>\u0000-\u001f\u007f]/g, '').trim().slice(0, 16);
  if (name.length < 2) throw new ApiError(400, 'El nombre visible debe tener al menos 2 caracteres.');
  const col = typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
  const rows = await query<UserRow>("UPDATE usuario SET nombre_visible = $2, color_avatar = $3 WHERE id_usuario = $1 AND estado = 'activo' RETURNING *", [userId, name, col]);
  if (!rows[0]) throw new ApiError(401, 'Sesión no válida.');
  return toAccount(rows[0]);
}

/** RF39: comprar con oro el siguiente nivel de una mejora permanente. */
export async function buyUpgrade(userId: number, upgradeId: unknown): Promise<void> {
  const id = Number(upgradeId);
  if (!Number.isInteger(id)) throw new ApiError(400, 'Mejora no válida.');
  await transaction(async (c) => {
    const user = (await c.query<UserRow>("SELECT * FROM usuario WHERE id_usuario = $1 AND estado = 'activo' FOR UPDATE", [userId])).rows[0];
    const up = (await c.query('SELECT * FROM mejora_permanente WHERE id_mejora = $1', [id])).rows[0];
    if (!user || !up) throw new ApiError(404, 'Mejora no encontrada.');
    if (user.nivel_cuenta < up.nivel_cuenta_req) throw new ApiError(403, `Necesitas nivel de cuenta ${up.nivel_cuenta_req}.`);
    const cur = (await c.query<{ nivel: number }>('SELECT nivel FROM progreso_mejora WHERE id_usuario = $1 AND id_mejora = $2', [userId, id])).rows[0]?.nivel ?? 0;
    if (cur >= up.nivel_max) throw new ApiError(400, 'La mejora ya está al máximo.');
    const cost = upgradeCost(up.costo_base, Number(up.incremento_costo), cur);
    if (user.oro < cost) throw new ApiError(400, 'No tienes suficiente oro.');
    await c.query('UPDATE usuario SET oro = oro - $2 WHERE id_usuario = $1', [userId, cost]);
    await c.query(
      `INSERT INTO progreso_mejora (id_usuario, id_mejora, nivel) VALUES ($1, $2, 1)
       ON CONFLICT (id_usuario, id_mejora) DO UPDATE SET nivel = progreso_mejora.nivel + 1`, [userId, id]);
  });
}

/** Bonificaciones permanentes de un usuario, sumadas por atributo, para aplicarlas en la partida. */
export async function loadPermBonus(userId: number): Promise<PermBonus> {
  const rows = await query<{ atributo: PermAttr; total: string }>(
    `SELECT m.atributo, SUM(m.valor_nivel * p.nivel) AS total FROM progreso_mejora p
     JOIN mejora_permanente m ON m.id_mejora = p.id_mejora WHERE p.id_usuario = $1 GROUP BY m.atributo`, [userId]);
  const out: PermBonus = {};
  for (const r of rows) out[r.atributo] = Number(r.total);
  return out;
}

export async function leaderboard(mapId: number, difficultyId: number): Promise<LeaderboardRow[]> {
  const rows = await query<{ posicion: string; equipo: string; resultado: string; ronda_alcanzada: number; num_jugadores: number; duracion_seg: number }>(
    `SELECT v.* FROM v_clasificacion v
     WHERE v.mapa = (SELECT nombre FROM mapa WHERE id_mapa = $1) AND v.modo = (SELECT nombre FROM dificultad WHERE id_dificultad = $2)
     ORDER BY v.posicion LIMIT 20`, [mapId, difficultyId]);
  return rows.map((r) => ({ position: Number(r.posicion), team: r.equipo, result: r.resultado, round: r.ronda_alcanzada, players: r.num_jugadores, seconds: r.duracion_seg }));
}

export async function history(userId: number): Promise<HistoryRow[]> {
  const rows = await query<{ fecha_fin: Date; mapa: string; modo: string; resultado: string; ronda_alcanzada: number; seg: number; personaje: string; nivel_final: number; enemigos_eliminados: number; oro_ganado: number; xp_cuenta_ganada: number }>(
    `SELECT p.fecha_fin, m.nombre AS mapa, d.nombre AS modo, p.resultado, p.ronda_alcanzada,
            EXTRACT(EPOCH FROM (p.fecha_fin - p.fecha_inicio))::INT AS seg, pe.nombre AS personaje,
            pa.nivel_final, pa.enemigos_eliminados, pa.oro_ganado, pa.xp_cuenta_ganada
     FROM participacion pa JOIN partida p ON p.id_partida = pa.id_partida
     JOIN mapa m ON m.id_mapa = p.id_mapa JOIN dificultad d ON d.id_dificultad = p.id_dificultad
     JOIN personaje pe ON pe.id_personaje = pa.id_personaje
     WHERE pa.id_usuario = $1 ORDER BY p.fecha_fin DESC LIMIT 20`, [userId]);
  return rows.map((r) => ({
    date: new Date(r.fecha_fin).toISOString(), map: r.mapa, mode: r.modo, result: r.resultado, round: r.ronda_alcanzada, seconds: r.seg,
    character: r.personaje, level: r.nivel_final, kills: r.enemigos_eliminados, gold: r.oro_ganado, xp: r.xp_cuenta_ganada,
  }));
}
