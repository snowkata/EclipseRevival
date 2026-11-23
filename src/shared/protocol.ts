// Mensajes entre el navegador y el servidor (Socket.IO).
import type { EventId, ItemKind } from './data.js';

export type RoomPhase = 'lobby' | 'playing' | 'ended';

export interface LobbyPlayer {
  id: string; name: string; character: number; ready: boolean; host: boolean; connected: boolean;
  accountLevel: number; guest: boolean;
}
export interface LobbyState {
  code: string; phase: RoomPhase; mapId: number; difficultyId: number; players: LobbyPlayer[];
  /** Mapas y dificultades que el anfitrión tiene desbloqueados: [idMapa, idDificultad][] (RF38) */
  unlocked: [number, number][];
}

export interface PlayerSnap {
  id: string; name: string; character: number;
  x: number; y: number; hp: number; maxHp: number;
  level: number; xp: number; xpNext: number;
  down: boolean; revive: number; // progreso de revivir 0..1
  connected: boolean;
  weapons: [number, number][]; // [idArma, nivel]
  passives: [number, number][]; // [idPasiva, nivel]
  area: number; // multiplicador de área (para dibujar auras y órbitas)
  speed: number; // velocidad actual en px/s (para mover al jugador en su navegador)
  pendingLevelUps: number;
}

export interface Snapshot {
  t: number; // tiempo de partida en segundos
  round: number; totalRounds: number; roundLeft: number;
  event: EventId | null;
  gold: number; kills: number;
  players: PlayerSnap[];
  /** Enemigos en arreglo plano: [id, tipo, x, y, vida% (0..100), estado (bit 1 = lento, 2 = quemado, 4 = envenenado, 8 = élite)] */
  enemies: number[];
  /** Proyectiles: [id, tipo, x, y] (tipo: 1 pistola, 6 hoja, 101 ocaso, 50 enemigo, 51 jefe) */
  projectiles: number[];
  /** Gemas y objetos: [id, tipo, x, y] (tipo 0..2 = gema chica/media/grande, 10+ = objeto) */
  pickups: number[];
  /** Zonas en el suelo: [id, tipo, x, y, radio, segundosRestantes] (tipo 1 = veneno, 2 = meteoro o derrumbe, 3 = remolino de arena) */
  zones: number[];
  bossId: number | null;
  /** Evento con objetivo: null = solo sobrevivir, false = pendiente, true = cumplido */
  eventGoal: boolean | null;
  /** Jugador perseguido en el evento Cazador de recompensa */
  hunted: string | null;
  /** Evento Escolta: [x, y, vida%, zonaX, zonaY] del superviviente y la zona de rescate */
  escort: number[] | null;
  /** Altares, en el orden de shrinesFor(mapa): [progreso de canalización 0..100, segundos de recarga] por altar */
  shrines: number[];
  /** Bendiciones activas del equipo: segundos restantes de [furia, celeridad] */
  buffs: [number, number];
}

export type FxEvent =
  | { k: 'hit'; x: number; y: number; dmg: number; el: number; crit: boolean }
  | { k: 'bolt'; pts: number[]; el: number }
  | { k: 'boom'; x: number; y: number; r: number; color: number; label?: string }
  | { k: 'death'; x: number; y: number; color: number; big: boolean }
  | { k: 'levelup'; id: string }
  | { k: 'pickup'; x: number; y: number; item: ItemKind }
  | { k: 'evolve'; id: string; weapon: number }
  | { k: 'revive'; id: string }
  | { k: 'down'; id: string }
  | { k: 'dash'; id: string }
  | { k: 'shrine'; i: number; x: number; y: number };

export interface Announcement { title: string; subtitle?: string; tone: 'round' | 'boss' | 'event' | 'info' | 'danger' }

export interface UpgradeOption {
  kind: 'weapon' | 'passive' | 'gold' | 'heal';
  id: number; level: number; // nivel que tendrá tras elegirla
  name: string; desc: string; isNew: boolean;
}

export interface PlayerStats {
  id: string; name: string; character: number; kills: number; damageDealt: number; damageTaken: number;
  revives: number; level: number; weaponDamage: [number, number][];
}
export interface GameOver {
  victory: boolean; round: number; totalRounds: number; seconds: number; gold: number;
  mapId: number; difficultyId: number; stats: PlayerStats[];
}

export interface ServerToClient {
  lobby: (s: LobbyState) => void;
  joined: (info: { you: string; token: string; code: string }) => void;
  errorMsg: (msg: string) => void;
  start: (info: { mapId: number; difficultyId: number; seed: number }) => void;
  snap: (s: Snapshot) => void;
  fx: (list: FxEvent[]) => void;
  announce: (a: Announcement) => void;
  levelUp: (opts: UpgradeOption[]) => void;
  gameOver: (r: GameOver) => void;
  toast: (msg: string) => void;
  reward: (r: Reward) => void;
}

export interface ClientToServer {
  createRoom: (p: { name: string; character: number; mapId: number; difficultyId: number }) => void;
  joinRoom: (p: { code: string; name: string; character: number; token?: string }) => void;
  leaveRoom: () => void;
  setCharacter: (id: number) => void;
  setReady: (ready: boolean) => void;
  setOptions: (o: { mapId?: number; difficultyId?: number }) => void;
  startGame: () => void;
  move: (p: { x: number; y: number }) => void;
  chooseUpgrade: (index: number) => void;
  backToLobby: () => void;
}

// ---------- Cuentas (API REST) ----------
export interface Account {
  id: number; username: string; displayName: string; color: string | null; role: 'jugador' | 'administrador';
  level: number; xp: number; xpNext: number; gold: number;
}
export interface ShopItem {
  id: number; name: string; attr: string; perLevel: number; maxLevel: number; level: number;
  cost: number | null; levelReq: number; locked: boolean;
}
export interface MapProgress { mapId: number; difficultyId: number; completed: boolean; bestRound: number; bestSeconds: number | null }
export interface Profile { account: Account; shop: ShopItem[]; progress: MapProgress[] }
export interface LeaderboardRow { position: number; team: string; result: string; round: number; players: number; seconds: number }
export interface HistoryRow {
  date: string; map: string; mode: string; result: string; round: number; seconds: number;
  character: string; level: number; kills: number; gold: number; xp: number;
}
export interface Reward { xp: number; gold: number; level: number; leveledUp: boolean }
