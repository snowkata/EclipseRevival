// Salas de juego: código de 6 caracteres, lobby, inicio y reconexión (RF05–RF09).
import { randomBytes } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { CHARACTERS, CHARACTER_LEVEL_REQ, DIFFICULTIES, MAPS, PARAMS, WEAPONS, WEAPON_LEVEL_REQ, type PermBonus } from '../shared/data.js';
import type { ClientToServer, LobbyState, RoomPhase, ServerToClient } from '../shared/protocol.js';
import { getProgress, getUser, loadPermBonus, unlockedOptions } from './accounts.js';
import { dbEnabled } from './db.js';
import { Game } from './game.js';
import { saveMatch, type Participant } from './persist.js';
import { RateLimiter, asInt, asObject, asString } from './security.js';

/** Máximo de salas abiertas a la vez en el servidor (protege la memoria y la CPU). */
const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 100) || 100;
/** Cada IP puede crear 5 salas por minuto y fallar 15 códigos de sala por minuto. */
const roomCreateLimit = new RateLimiter(5, 60_000);
const joinFailLimit = new RateLimiter(15, 60_000);

/** Cuenta con la que se conectó el navegador (null = invitado). */
export interface SocketAccount { id: number; level: number; displayName: string }
export interface SocketData { room?: string; player?: string; account?: SocketAccount | null; ip?: string }

export type IO = Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>;
type Sock = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface RoomPlayer {
  id: string; token: string; name: string; character: number; ready: boolean;
  socket: Sock | null; leftTimer: NodeJS.Timeout | null;
  userId: number | null; accountLevel: number;
}

/** Sin base de datos todo está desbloqueado; con ella, depende del nivel de cuenta (los invitados son nivel 1). */
const characterAllowed = (id: number, level: number) => !dbEnabled() || (CHARACTER_LEVEL_REQ[id] ?? 1) <= level;
const allowedWeapons = (level: number): number[] | null =>
  dbEnabled() ? WEAPONS.filter((w) => !w.isEvolution && (WEAPON_LEVEL_REQ[w.id] ?? 1) <= level).map((w) => w.id) : null;

function validCharacter(c: unknown, level: number): number {
  return CHARACTERS.some((x) => x.id === c) && characterAllowed(c as number, level) ? (c as number) : 1;
}
function cleanName(n: unknown): string {
  const s = (typeof n === 'string' ? n.slice(0, 64) : '').replace(/[<>\u0000-\u001f\u007f]/g, '').trim().slice(0, 16);
  return s || 'Jugador';
}

export class Room {
  players: RoomPlayer[] = [];
  phase: RoomPhase = 'lobby';
  hostId = '';
  mapId = 1;
  difficultyId = 2;
  game: Game | null = null;
  unlocked: [number, number][] = unlockedOptions(dbEnabled() ? [] : null);
  private loop: NodeJS.Timeout | null = null;
  private starting = false;
  private roster: Participant[] = [];

  constructor(public code: string, private io: IO, private onEmpty: (r: Room) => void) {}

  state(): LobbyState {
    return {
      code: this.code, phase: this.phase, mapId: this.mapId, difficultyId: this.difficultyId, unlocked: this.unlocked,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, character: p.character, ready: p.ready, host: p.id === this.hostId, connected: !!p.socket,
        accountLevel: p.accountLevel, guest: p.userId === null,
      })),
    };
  }

  broadcast() { this.io.to(this.code).emit('lobby', this.state()); }

  isOptionUnlocked(mapId: number, difficultyId: number) {
    return this.unlocked.some(([m, d]) => m === mapId && d === difficultyId);
  }

  /** RF38: lo que se puede elegir depende del progreso del anfitrión. */
  async refreshUnlocked() {
    const host = this.players.find((p) => p.id === this.hostId);
    try {
      this.unlocked = unlockedOptions(!dbEnabled() ? null : host?.userId ? await getProgress(host.userId) : []);
    } catch (err) {
      console.error('[sala] no se pudo leer el progreso:', (err as Error).message);
    }
    if (!this.isOptionUnlocked(this.mapId, this.difficultyId)) { this.mapId = 1; this.difficultyId = this.isOptionUnlocked(1, 2) ? 2 : 1; }
    this.broadcast();
  }

  add(socket: Sock, name: unknown, character: unknown): RoomPlayer {
    const acc = socket.data.account ?? null;
    const level = acc?.level ?? 1;
    const p: RoomPlayer = {
      id: randomBytes(4).toString('hex'), token: randomBytes(12).toString('hex'),
      name: acc ? cleanName(acc.displayName) : cleanName(name), character: validCharacter(character, level),
      ready: false, socket: null, leftTimer: null, userId: acc?.id ?? null, accountLevel: level,
    };
    const first = !this.players.length;
    if (first) this.hostId = p.id;
    this.players.push(p);
    this.attach(p, socket);
    if (first) void this.refreshUnlocked();
    return p;
  }

  attach(p: RoomPlayer, socket: Sock) {
    if (p.leftTimer) { clearTimeout(p.leftTimer); p.leftTimer = null; }
    if (p.socket && p.socket.id !== socket.id) p.socket.disconnect(true);
    p.socket = socket;
    socket.data.room = this.code;
    socket.data.player = p.id;
    socket.join(this.code);
    socket.emit('joined', { you: p.id, token: p.token, code: this.code });
    if (this.phase === 'playing' && this.game) {
      socket.emit('start', { mapId: this.mapId, difficultyId: this.difficultyId, seed: 0 });
      this.game.setConnected(p.id, true);
      this.io.to(this.code).emit('toast', `${p.name} se reconectó`);
    }
    this.broadcast();
  }

  /** El navegador se desconectó: en el lobby sale de la sala; en partida tiene 60 s para volver. */
  disconnected(p: RoomPlayer) {
    p.socket = null;
    if (this.phase === 'playing' && this.game?.players.has(p.id)) {
      this.game.setConnected(p.id, false);
      this.io.to(this.code).emit('toast', `${p.name} se desconectó. Tiene ${PARAMS.reconnectSeconds} s para volver.`);
      p.leftTimer = setTimeout(() => this.remove(p.id), PARAMS.reconnectSeconds * 1000);
    } else {
      // Unos segundos de gracia por si solo recargó la página
      p.leftTimer = setTimeout(() => this.remove(p.id), 5000);
    }
    this.broadcast();
  }

  remove(id: string) {
    const p = this.players.find((x) => x.id === id);
    if (!p) return;
    if (p.leftTimer) clearTimeout(p.leftTimer);
    if (p.socket) { p.socket.leave(this.code); p.socket.data.room = undefined; }
    this.players = this.players.filter((x) => x.id !== id);
    this.game?.removePlayer(id);
    const hostLeft = this.hostId === id;
    if (hostLeft && this.players.length) this.hostId = this.players[0].id;
    if (!this.players.length) { this.stopLoop(); this.onEmpty(this); return; }
    if (hostLeft && this.phase === 'lobby') void this.refreshUnlocked();
    else this.broadcast();
  }

  async start(byId: string): Promise<string | null> {
    if (byId !== this.hostId) return 'Solo el anfitrión puede iniciar la partida.';
    if (this.phase !== 'lobby' || this.starting) return 'La partida ya empezó.';
    const others = this.players.filter((p) => p.id !== this.hostId && p.socket);
    if (others.some((p) => !p.ready)) return 'Todos los jugadores deben estar listos.';
    if (!this.isOptionUnlocked(this.mapId, this.difficultyId)) return 'Ese mapa o dificultad todavía no está desbloqueado.';
    const active = this.players.filter((p) => p.socket);

    // Mejoras permanentes de cada cuenta (RF39)
    this.starting = true;
    const perms = new Map<string, PermBonus>();
    try {
      for (const p of active) if (p.userId && dbEnabled()) perms.set(p.id, await loadPermBonus(p.userId));
    } catch (err) {
      console.error('[sala] no se pudieron leer las mejoras permanentes:', (err as Error).message);
    } finally {
      this.starting = false;
    }
    if (this.phase !== 'lobby') return 'La partida ya empezó.';

    this.phase = 'playing';
    this.roster = active.filter((p) => p.userId !== null).map((p) => ({ playerId: p.id, userId: p.userId as number, host: p.id === this.hostId }));
    const startPlayers = active.map((p) => ({
      id: p.id, name: p.name, character: p.character, perm: perms.get(p.id), allowedWeapons: allowedWeapons(p.accountLevel),
    }));
    this.game = new Game(this.mapId, this.difficultyId, startPlayers, {
      snapshot: (s) => this.io.to(this.code).volatile.emit('snap', s),
      fx: (list) => this.io.to(this.code).emit('fx', list),
      announce: (a) => this.io.to(this.code).emit('announce', a),
      toast: (m) => this.io.to(this.code).emit('toast', m),
      offer: (pid, opts) => this.players.find((p) => p.id === pid)?.socket?.emit('levelUp', opts),
      end: (r) => {
        this.phase = 'ended';
        this.io.to(this.code).emit('gameOver', r);
        setTimeout(() => this.stopLoop(), 0);
        this.broadcast();
        const game = this.game;
        if (game && dbEnabled() && this.roster.length) {
          saveMatch(this.code, game, r, this.roster)
            .then((rewards) => {
              for (const [pid, reward] of rewards) {
                const pl = this.players.find((p) => p.id === pid);
                if (!pl) continue;
                pl.accountLevel = reward.level;
                if (pl.socket?.data.account) pl.socket.data.account.level = reward.level;
                pl.socket?.emit('reward', reward);
              }
            })
            .catch((err) => {
              console.error('[sala] no se pudo guardar la partida:', (err as Error).message);
              this.io.to(this.code).emit('toast', 'No se pudo guardar la partida en la base de datos.');
            });
        }
      },
    });
    this.io.to(this.code).emit('start', { mapId: this.mapId, difficultyId: this.difficultyId, seed: 0 });
    this.broadcast();
    const dt = 1 / PARAMS.tickRate;
    this.loop = setInterval(() => this.game?.tick(dt), 1000 / PARAMS.tickRate);
    return null;
  }

  backToLobby() {
    if (this.phase !== 'ended') return;
    this.phase = 'lobby';
    this.game = null;
    for (const p of [...this.players]) {
      p.ready = false;
      if (!p.socket) this.remove(p.id);
    }
    void this.refreshUnlocked();
  }

  stopLoop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }
}

export class RoomManager {
  rooms = new Map<string, Room>();
  constructor(private io: IO) {}

  newCode(): string {
    for (;;) {
      const bytes = randomBytes(6);
      const code = [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
      if (!this.rooms.has(code)) return code;
    }
  }

  handle(socket: Sock) {
    const ip = socket.data.ip ?? 'desconocida';
    const current = () => {
      const room = socket.data.room ? this.rooms.get(socket.data.room) : undefined;
      const player = room?.players.find((p) => p.id === socket.data.player);
      return room && player ? { room, player } : null;
    };

    // Límite de mensajes por conexión: el juego manda ~30 por segundo al moverse.
    // Lo que pase de 80 por segundo se ignora; si alguien manda muchísimos, se le desconecta.
    let windowStart = Date.now(), count = 0;
    socket.use((_packet, next) => {
      const now = Date.now();
      if (now - windowStart >= 1000) { windowStart = now; count = 0; }
      count++;
      if (count > 400) return void socket.disconnect(true);
      if (count <= 80) next();
    });

    /** Registra un evento sin que un dato raro o un error tumbe el servidor entero. */
    const on = (event: keyof ClientToServer, fn: (arg: unknown) => void | Promise<void>) => {
      (socket as unknown as { on(e: string, f: (a: unknown) => void): void }).on(event, (arg) => {
        try {
          const out = fn(arg);
          if (out) out.catch((err: unknown) => console.error(`[socket] ${event}:`, err));
        } catch (err) {
          console.error(`[socket] ${event}:`, err);
        }
      });
    };

    on('createRoom', (raw) => {
      const o = asObject(raw);
      if (!o || current()) return;
      if (this.rooms.size >= MAX_ROOMS) return void socket.emit('errorMsg', 'El servidor está lleno. Inténtalo en unos minutos.');
      if (!roomCreateLimit.take(ip)) return void socket.emit('errorMsg', 'Has creado demasiadas salas. Espera un minuto.');
      const room = new Room(this.newCode(), this.io, (r) => this.rooms.delete(r.code));
      const mapId = asInt(o.mapId), difficultyId = asInt(o.difficultyId);
      if (MAPS.some((m) => m.id === mapId && m.available)) room.mapId = mapId as number;
      if (DIFFICULTIES.some((d) => d.id === difficultyId)) room.difficultyId = difficultyId as number;
      this.rooms.set(room.code, room);
      room.add(socket, o.name, o.character);
    });

    on('joinRoom', (raw) => {
      const o = asObject(raw);
      if (!o || current()) return;
      const code = (asString(o.code, 12) ?? '').toUpperCase().trim();
      const token = asString(o.token, 64);
      const room = this.rooms.get(code);
      if (!room) {
        // Frena a quien intenta adivinar códigos de sala probando muchos seguidos
        if (!joinFailLimit.take(ip)) return void socket.emit('errorMsg', 'Demasiados intentos con códigos incorrectos. Espera un minuto.');
        return void socket.emit('errorMsg', 'No existe una sala con ese código.');
      }
      const back = token ? room.players.find((p) => p.token === token) : undefined;
      if (back) return void room.attach(back, socket);
      if (room.phase !== 'lobby') return void socket.emit('errorMsg', 'La partida de esa sala ya empezó.');
      if (room.players.length >= PARAMS.maxPlayers) return void socket.emit('errorMsg', 'La sala está llena (máximo 4 jugadores).');
      const acc = socket.data.account;
      if (acc && room.players.some((p) => p.userId === acc.id)) return void socket.emit('errorMsg', 'Tu cuenta ya está en esa sala.');
      room.add(socket, o.name, o.character);
    });

    on('leaveRoom', () => {
      const c = current();
      if (c) c.room.remove(c.player.id);
    });

    on('setCharacter', (id) => {
      const c = current();
      if (!c || c.room.phase !== 'lobby') return;
      c.player.character = validCharacter(id, c.player.accountLevel);
      c.room.broadcast();
    });

    on('setReady', (ready) => {
      const c = current();
      if (!c || c.room.phase !== 'lobby') return;
      c.player.ready = ready === true;
      c.room.broadcast();
    });

    on('setOptions', (raw) => {
      const o = asObject(raw);
      const c = current();
      if (!o || !c || c.room.phase !== 'lobby' || c.room.hostId !== c.player.id) return;
      const mapId = asInt(o.mapId), difficultyId = asInt(o.difficultyId);
      const m = mapId ?? c.room.mapId, d = difficultyId ?? c.room.difficultyId;
      if (c.room.isOptionUnlocked(m, d)) { c.room.mapId = m; c.room.difficultyId = d; }
      else if (mapId !== undefined && c.room.isOptionUnlocked(m, 2)) { c.room.mapId = m; c.room.difficultyId = 2; }
      c.room.broadcast();
    });

    on('startGame', async () => {
      const c = current();
      if (!c) return;
      const err = await c.room.start(c.player.id);
      if (err) socket.emit('errorMsg', err);
    });

    on('move', (raw) => {
      const o = asObject(raw);
      const c = current();
      if (o && c && c.room.phase === 'playing') c.room.game?.move(c.player.id, Number(o.x), Number(o.y));
    });

    on('chooseUpgrade', (i) => {
      const c = current();
      const index = asInt(i);
      if (c && index !== undefined && c.room.phase === 'playing') c.room.game?.choose(c.player.id, index);
    });

    on('backToLobby', () => {
      const c = current();
      if (c) c.room.backToLobby();
    });

    socket.on('disconnect', () => {
      const c = current();
      if (c && c.player.socket?.id === socket.id) c.room.disconnected(c.player);
    });
  }
}

/** Lee la cuenta del token que manda el navegador al conectarse. */
export async function accountFromToken(userId: number | null): Promise<SocketAccount | null> {
  if (!userId || !dbEnabled()) return null;
  const acc = await getUser(userId);
  return acc ? { id: acc.id, level: acc.level, displayName: acc.displayName } : null;
}
