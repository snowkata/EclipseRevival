// Salas de juego: código de 6 caracteres, lobby, inicio y reconexión (RF05–RF09).
import { randomBytes } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { CHARACTERS, DIFFICULTIES, MAPS, PARAMS } from '../shared/data.js';
import type { ClientToServer, LobbyState, RoomPhase, ServerToClient } from '../shared/protocol.js';
import { Game } from './game.js';

type IO = Server<ClientToServer, ServerToClient>;
type Sock = Socket<ClientToServer, ServerToClient>;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface RoomPlayer {
  id: string; token: string; name: string; character: number; ready: boolean;
  socket: Sock | null; leftTimer: NodeJS.Timeout | null;
}

export class Room {
  players: RoomPlayer[] = [];
  phase: RoomPhase = 'lobby';
  hostId = '';
  mapId = 1;
  difficultyId = 2;
  game: Game | null = null;
  private loop: NodeJS.Timeout | null = null;

  constructor(public code: string, private io: IO, private onEmpty: (r: Room) => void) {}

  state(): LobbyState {
    return {
      code: this.code, phase: this.phase, mapId: this.mapId, difficultyId: this.difficultyId,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, character: p.character, ready: p.ready, host: p.id === this.hostId, connected: !!p.socket,
      })),
    };
  }

  broadcast() { this.io.to(this.code).emit('lobby', this.state()); }

  add(socket: Sock, name: string, character: number): RoomPlayer {
    const p: RoomPlayer = {
      id: randomBytes(4).toString('hex'), token: randomBytes(12).toString('hex'),
      name: cleanName(name), character: validCharacter(character), ready: false, socket: null, leftTimer: null,
    };
    if (!this.players.length) this.hostId = p.id;
    this.players.push(p);
    this.attach(p, socket);
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
    if (this.hostId === id && this.players.length) this.hostId = this.players[0].id;
    if (!this.players.length) { this.stopLoop(); this.onEmpty(this); return; }
    this.broadcast();
  }

  start(byId: string): string | null {
    if (byId !== this.hostId) return 'Solo el anfitrión puede iniciar la partida.';
    if (this.phase !== 'lobby') return 'La partida ya empezó.';
    const others = this.players.filter((p) => p.id !== this.hostId && p.socket);
    if (others.some((p) => !p.ready)) return 'Todos los jugadores deben estar listos.';
    const active = this.players.filter((p) => p.socket);
    this.phase = 'playing';
    this.game = new Game(this.mapId, this.difficultyId, active.map((p) => ({ id: p.id, name: p.name, character: p.character })), {
      snapshot: (s) => this.io.to(this.code).volatile.emit('snap', s),
      fx: (list) => this.io.to(this.code).emit('fx', list),
      announce: (a) => this.io.to(this.code).emit('announce', a),
      toast: (m) => this.io.to(this.code).emit('toast', m),
      offer: (pid, opts) => this.players.find((p) => p.id === pid)?.socket?.emit('levelUp', opts),
      end: (r) => {
        this.phase = 'ended';
        this.io.to(this.code).emit('gameOver', r);
        // TODO(BD): guardar partida, participaciones y estadísticas en Supabase (RF35, RF37)
        setTimeout(() => this.stopLoop(), 0);
        this.broadcast();
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
    this.broadcast();
  }

  stopLoop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }
}

function cleanName(n: unknown): string {
  const s = String(n ?? '').replace(/[<>]/g, '').trim().slice(0, 16);
  return s || 'Jugador';
}
function validCharacter(c: unknown): number {
  return CHARACTERS.some((x) => x.id === c) ? (c as number) : 1;
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
    const current = () => {
      const room = socket.data.room ? this.rooms.get(socket.data.room as string) : undefined;
      const player = room?.players.find((p) => p.id === socket.data.player);
      return room && player ? { room, player } : null;
    };

    socket.on('createRoom', ({ name, character, mapId, difficultyId }) => {
      if (current()) return;
      const room = new Room(this.newCode(), this.io, (r) => this.rooms.delete(r.code));
      if (MAPS.some((m) => m.id === mapId && m.available)) room.mapId = mapId;
      if (DIFFICULTIES.some((d) => d.id === difficultyId)) room.difficultyId = difficultyId;
      this.rooms.set(room.code, room);
      room.add(socket, name, character);
    });

    socket.on('joinRoom', ({ code, name, character, token }) => {
      if (current()) return;
      const room = this.rooms.get(String(code ?? '').toUpperCase().trim());
      if (!room) return void socket.emit('errorMsg', 'No existe una sala con ese código.');
      const back = token ? room.players.find((p) => p.token === token) : undefined;
      if (back) return void room.attach(back, socket);
      if (room.phase !== 'lobby') return void socket.emit('errorMsg', 'La partida de esa sala ya empezó.');
      if (room.players.length >= PARAMS.maxPlayers) return void socket.emit('errorMsg', 'La sala está llena (máximo 4 jugadores).');
      room.add(socket, name, character);
    });

    socket.on('leaveRoom', () => {
      const c = current();
      if (c) c.room.remove(c.player.id);
    });

    socket.on('setCharacter', (id) => {
      const c = current();
      if (!c || c.room.phase !== 'lobby') return;
      c.player.character = validCharacter(id);
      c.room.broadcast();
    });

    socket.on('setReady', (ready) => {
      const c = current();
      if (!c || c.room.phase !== 'lobby') return;
      c.player.ready = !!ready;
      c.room.broadcast();
    });

    socket.on('setOptions', ({ mapId, difficultyId }) => {
      const c = current();
      if (!c || c.room.phase !== 'lobby' || c.room.hostId !== c.player.id) return;
      if (mapId !== undefined && MAPS.some((m) => m.id === mapId && m.available)) c.room.mapId = mapId;
      if (difficultyId !== undefined && DIFFICULTIES.some((d) => d.id === difficultyId)) c.room.difficultyId = difficultyId;
      c.room.broadcast();
    });

    socket.on('startGame', () => {
      const c = current();
      if (!c) return;
      const err = c.room.start(c.player.id);
      if (err) socket.emit('errorMsg', err);
    });

    socket.on('move', (p) => {
      const c = current();
      if (c && c.room.phase === 'playing' && p) c.room.game?.move(c.player.id, Number(p.x), Number(p.y));
    });

    socket.on('chooseUpgrade', (i) => {
      const c = current();
      if (c && c.room.phase === 'playing') c.room.game?.choose(c.player.id, Number(i));
    });

    socket.on('backToLobby', () => {
      const c = current();
      if (c) c.room.backToLobby();
    });

    socket.on('disconnect', () => {
      const c = current();
      if (c && c.player.socket?.id === socket.id) c.room.disconnected(c.player);
    });
  }
}
