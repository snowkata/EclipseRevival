// Simulación autoritativa de una partida (RNF12): el servidor calcula
// enemigos, daño, experiencia y oro; el navegador solo dibuja y manda su posición.
import {
  COMBOS, EVENTS, ITEMS, LOOT, PARAMS, PASSIVES, RESISTANCES, WEAPONS,
  characterById, difficultyById, enemyById, mapById, passiveById, weaponById,
  type CharacterDef, type DifficultyDef, type ElementId, type EnemyDef, type EventId,
  type ItemKind, type MapDef, type PassiveAttr, type PermBonus, type WeaponDef,
} from '../shared/data.js';
import { enemiesPerWave, enemyHp, orbitAngle, orbitCount, weaponLevelMult, xpToNext } from '../shared/formulas.js';
import type { Announcement, FxEvent, GameOver, PlayerSnap, Snapshot, UpgradeOption } from '../shared/protocol.js';
import { SpatialGrid } from './grid.js';

const W = PARAMS.worldSize;
const PLAYER_R = 16;
const ITEM_TYPES: ItemKind[] = ['oro', 'curar', 'iman', 'bomba', 'cofre', 'cofre_maldito'];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;

interface OwnedWeapon { def: WeaponDef; level: number; cd: number; hitCd: Map<number, number> }

export interface SimPlayer {
  id: string; name: string; char: CharacterDef;
  x: number; y: number; hp: number; level: number; xp: number;
  down: boolean; revive: number; connected: boolean; disconnectedAt: number;
  weapons: OwnedWeapon[]; passives: Map<number, number>;
  pending: number; offer: UpgradeOption[] | null;
  hurtCd: number; lastMoveAt: number;
  kills: number; damageDealt: number; damageTaken: number; revives: number;
  weaponDamage: Map<number, number>; weaponKills: Map<number, number>;
  /** Mejoras permanentes del taller y armas desbloqueadas por nivel de cuenta (RF39, RF40) */
  perm: PermBonus; allowedWeapons: Set<number> | null; extraLives: number;
  choices: { round: number; weapon: number | null; passive: number | null; level: number }[];
}

interface Enemy {
  id: number; def: EnemyDef; x: number; y: number; hp: number; maxHp: number; dmg: number;
  slowT: number; burnT: number; burnDps: number; poisonT: number; poisonDps: number; stunT: number;
  last: { el: ElementId; pid: string; t: number } | null;
  atkCd: number; summonCd: number; dashT: number; windT: number; dx: number; dy: number;
  final: boolean; lastHitBy: string | null;
  /** Élite de un evento y, si es el cazador, el jugador al que persigue */
  elite: boolean; hunt: string | null;
}

interface Projectile {
  id: number; type: number; x: number; y: number; vx: number; vy: number; life: number;
  dmg: number; el: ElementId; crit: number; pierce: number; hit: Set<number>;
  owner: string | null; weapon: number; r: number;
}

interface Pickup { id: number; type: number; x: number; y: number; value: number; pull: string | null }

interface Zone {
  id: number; type: 1 | 2; x: number; y: number; r: number; life: number; tick: number;
  dmg: number; el: ElementId; owner: string | null; weapon: number; crit: number;
}

export interface GameCallbacks {
  snapshot(s: Snapshot): void;
  fx(list: FxEvent[]): void;
  announce(a: Announcement): void;
  offer(playerId: string, opts: UpgradeOption[]): void;
  toast(msg: string): void;
  end(r: GameOver): void;
}

export interface StartPlayer { id: string; name: string; character: number; perm?: PermBonus; allowedWeapons?: number[] | null }

/** Resumen de cada ronda para guardarla en la base de datos (tabla ronda). */
export interface RoundLog { number: number; type: 'normal' | 'jefe' | 'evento' | 'jefe_final'; event: EventId | null; kills: number; done: boolean | null }

export class Game {
  map: MapDef; diff: DifficultyDef;
  players = new Map<string, SimPlayer>();
  enemies = new Map<number, Enemy>();
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  zones: Zone[] = [];
  grid = new SpatialGrid<Enemy>(80);
  private scratch: Enemy[] = [];
  private nextId = 1;
  time = 0;
  round = 0;
  roundLeft = PARAMS.roundSeconds;
  waveCd = 1;
  gold = 0;
  kills = 0;
  event: EventId | null = null;
  // Para probar eventos en desarrollo: ER_FIRST_EVENT_ROUND=1 ER_FORCE_EVENT=escolta
  nextEventRound = Number(process.env.ER_FIRST_EVENT_ROUND) || 3;
  meteorCd = 0;
  // Eventos con objetivo (RF29–RF31)
  eventGoal: boolean | null = null;
  private eventElites = new Set<number>();
  private cursedOpened = false;
  hunted: string | null = null;
  escort: { x: number; y: number; hp: number; maxHp: number; zx: number; zy: number } | null = null;
  bossId: number | null = null;
  finished = false;
  private tickCount = 0;
  private fxQueue: FxEvent[] = [];
  private hitFx = 0;

  constructor(mapId: number, difficultyId: number, players: StartPlayer[], private cb: GameCallbacks) {
    this.map = mapById(mapId);
    this.diff = difficultyById(difficultyId);
    players.forEach((p, i) => {
      const char = characterById(p.character);
      const a = (i / Math.max(1, players.length)) * Math.PI * 2;
      const sp: SimPlayer = {
        id: p.id, name: p.name, char,
        x: W / 2 + Math.cos(a) * 60, y: W / 2 + Math.sin(a) * 60,
        hp: char.hp, level: 1, xp: 0, down: false, revive: 0, connected: true, disconnectedAt: 0,
        weapons: [], passives: new Map(), pending: 0, offer: null, hurtCd: 0, lastMoveAt: 0,
        kills: 0, damageDealt: 0, damageTaken: 0, revives: 0, weaponDamage: new Map(), weaponKills: new Map(),
        perm: p.perm ?? {}, allowedWeapons: p.allowedWeapons ? new Set(p.allowedWeapons) : null,
        extraLives: Math.round(p.perm?.revivir ?? 0), choices: [],
      };
      this.addWeapon(sp, char.startWeapon);
      this.players.set(p.id, sp);
    });
    this.startRound(1);
  }

  get totalRounds() { return this.diff.rounds; }
  private get activeCount() { return [...this.players.values()].filter((p) => p.connected).length || 1; }

  // ---------- Atributos derivados ----------
  private passive(p: SimPlayer, attr: PassiveAttr): number {
    let v = 0;
    for (const [id, lvl] of p.passives) {
      const d = passiveById(id);
      if (d.attr === attr) v += d.perLevel * lvl;
    }
    return v;
  }
  maxHp(p: SimPlayer) { return Math.round(p.char.hp * (1 + (this.passive(p, 'vida') + (p.perm.vida ?? 0)) / 100)); }
  speed(p: SimPlayer) { return p.char.speed * (1 + (this.passive(p, 'velocidad') + (p.perm.velocidad ?? 0)) / 100 + (p.char.bonus.velocidad ?? 0)); }
  area(p: SimPlayer) { return 1 + this.passive(p, 'area') / 100 + (p.char.bonus.area ?? 0); }
  private rateMult(p: SimPlayer) { return 1 + this.passive(p, 'cadencia') / 100 + (p.char.bonus.cadencia ?? 0); }
  private dmgMult(p: SimPlayer, w: OwnedWeapon) {
    let m = (1 + (this.passive(p, 'dano') + (p.perm.dano ?? 0)) / 100 + (p.char.bonus.dano ?? 0)) * weaponLevelMult(w.def.perLevel, w.level);
    if (w.def.element === 2 && p.char.bonus.fuego) m *= 1 + p.char.bonus.fuego;
    return m;
  }
  private pickupRadius(p: SimPlayer) { return 50 * (1 + (this.passive(p, 'iman') + (p.perm.iman ?? 0)) / 100); }

  private addWeapon(p: SimPlayer, id: number) {
    p.weapons.push({ def: weaponById(id), level: 1, cd: 0.5, hitCd: new Map() });
  }

  // ---------- Entrada de los jugadores ----------
  /** Valida el movimiento que manda el navegador (no puede ir más rápido que su velocidad). */
  move(id: string, x: number, y: number) {
    const p = this.players.get(id);
    if (!p || p.down || !p.connected || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const elapsed = clamp(this.time - p.lastMoveAt, 0.01, 0.25);
    p.lastMoveAt = this.time;
    const max = this.speed(p) * elapsed * 1.35 + 6;
    const dx = x - p.x, dy = y - p.y;
    const d = Math.hypot(dx, dy);
    const k = d > max ? max / d : 1;
    p.x = clamp(p.x + dx * k, PLAYER_R, W - PLAYER_R);
    p.y = clamp(p.y + dy * k, PLAYER_R, W - PLAYER_R);
  }

  choose(id: string, index: number) {
    const p = this.players.get(id);
    if (!p || !p.offer) return;
    const opt = p.offer[index];
    if (!opt) return;
    p.offer = null;
    p.pending = Math.max(0, p.pending - 1);
    if (opt.kind === 'weapon' || opt.kind === 'passive')
      p.choices.push({ round: this.round, weapon: opt.kind === 'weapon' ? opt.id : null, passive: opt.kind === 'passive' ? opt.id : null, level: p.level });
    if (opt.kind === 'weapon') {
      const w = p.weapons.find((x) => x.def.id === opt.id);
      if (w) w.level = Math.min(w.def.maxLevel, w.level + 1);
      else if (p.weapons.length < PARAMS.maxWeapons) this.addWeapon(p, opt.id);
    } else if (opt.kind === 'passive') {
      const before = this.maxHp(p);
      p.passives.set(opt.id, Math.min(passiveById(opt.id).maxLevel, (p.passives.get(opt.id) ?? 0) + 1));
      p.hp += Math.max(0, this.maxHp(p) - before);
    } else if (opt.kind === 'gold') {
      this.gold += 25;
    } else if (opt.kind === 'heal') {
      p.hp = Math.min(this.maxHp(p), p.hp + 40);
    }
    this.offerNext(p);
  }

  setConnected(id: string, connected: boolean) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = connected;
    p.disconnectedAt = this.time;
    if (connected && p.offer) this.cb.offer(id, p.offer);
  }

  removePlayer(id: string) {
    this.players.delete(id);
  }

  // ---------- Mejoras al subir de nivel (RF23) ----------
  private buildOffer(p: SimPlayer): UpgradeOption[] {
    const pool: UpgradeOption[] = [];
    for (const w of p.weapons) {
      if (w.level < w.def.maxLevel)
        pool.push({ kind: 'weapon', id: w.def.id, level: w.level + 1, name: w.def.name, desc: `Nivel ${w.level + 1}: +daño y más ataques`, isNew: false });
    }
    if (p.weapons.length < PARAMS.maxWeapons) {
      for (const d of WEAPONS) {
        if (d.isEvolution || p.weapons.some((w) => w.def.id === d.id || w.def.id === d.evolution)) continue;
        if (p.allowedWeapons && !p.allowedWeapons.has(d.id)) continue;
        pool.push({ kind: 'weapon', id: d.id, level: 1, name: d.name, desc: d.desc, isNew: true });
      }
    }
    for (const [id, lvl] of p.passives) {
      const d = passiveById(id);
      if (lvl < d.maxLevel) pool.push({ kind: 'passive', id, level: lvl + 1, name: d.name, desc: d.desc, isNew: false });
    }
    if (p.passives.size < PARAMS.maxPassives) {
      for (const d of PASSIVES)
        if (!p.passives.has(d.id)) pool.push({ kind: 'passive', id: d.id, level: 1, name: d.name, desc: d.desc, isNew: true });
    }
    const out: UpgradeOption[] = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    if (out.length === 0) {
      out.push({ kind: 'gold', id: 0, level: 0, name: 'Bolsa de oro', desc: '+25 de oro para el equipo', isNew: false });
      out.push({ kind: 'heal', id: 0, level: 0, name: 'Pollo asado', desc: 'Recupera 40 de vida', isNew: false });
    }
    return out;
  }

  private offerNext(p: SimPlayer) {
    if (p.offer || p.pending <= 0) return;
    p.offer = this.buildOffer(p);
    if (p.connected) this.cb.offer(p.id, p.offer);
  }

  private giveXp(amount: number) {
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      p.xp += amount;
      while (p.xp >= xpToNext(p.level)) {
        p.xp -= xpToNext(p.level);
        p.level++;
        p.pending++;
        this.fxQueue.push({ k: 'levelup', id: p.id });
      }
      this.offerNext(p);
    }
  }

  // ---------- Rondas, jefes y eventos (RF16–RF20, RF26–RF32) ----------
  rounds: RoundLog[] = [];
  private roundKillsStart = 0;

  private closeRoundLog(done: boolean) {
    const last = this.rounds[this.rounds.length - 1];
    if (!last) return;
    last.kills = this.kills - this.roundKillsStart;
    if (last.type === 'evento') last.done = done;
    this.roundKillsStart = this.kills;
  }

  private startRound(n: number) {
    // Recompensa del evento que termina (RF32)
    const eventOk = this.anyoneAlive() && this.eventGoal !== false;
    if (this.event && !eventOk && this.anyoneAlive()) this.cb.toast('Evento fallido: no se cumplió el objetivo');
    if (this.event && eventOk) {
      const def = EVENTS.find((e) => e.id === this.event)!;
      const g = Math.round(def.gold * this.diff.mReward);
      this.gold += g;
      for (const p of this.players.values()) if (p.connected) { p.pending++; this.offerNext(p); }
      this.cb.toast(`Evento superado: +${g} de oro y una mejora extra`);
    }
    this.closeRoundLog(eventOk);
    this.endEvent();
    this.event = null;
    this.round = n;
    this.roundLeft = PARAMS.roundSeconds;
    this.waveCd = 1;
    const log: RoundLog = { number: n, type: 'normal', event: null, kills: 0, done: null };
    this.rounds.push(log);
    const isFinal = n >= this.totalRounds;
    if (isFinal) {
      log.type = 'jefe_final';
      const rule = this.map.spawns.find((s) => s.role === 'jefe_final');
      this.cb.announce({ title: `Ronda final`, subtitle: 'Derroten al jefe final para salvar el eclipse', tone: 'danger' });
      if (rule) this.spawnBoss(rule.enemy, true);
      return;
    }
    if (n % PARAMS.bossEvery === 0) {
      const rule = this.map.spawns.find((s) => s.role === 'jefe' && s.from <= n);
      if (rule) {
        log.type = 'jefe';
        this.spawnBoss(rule.enemy, false);
        this.cb.announce({ title: `Ronda ${n}`, subtitle: `¡Aparece ${enemyById(rule.enemy).name}!`, tone: 'boss' });
        return;
      }
    }
    if (n >= this.nextEventRound) {
      const ev = EVENTS.find((e) => e.id === process.env.ER_FORCE_EVENT) ?? pick([...EVENTS]);
      this.event = ev.id;
      log.type = 'evento';
      log.event = ev.id;
      this.nextEventRound = n + Math.round(rand(PARAMS.eventMin, PARAMS.eventMax));
      this.cb.announce({ title: ev.name, subtitle: ev.goal, tone: 'event' });
      this.beginEvent(ev.id);
      return;
    }
    this.cb.announce({ title: `Ronda ${n}`, subtitle: `de ${this.totalRounds}`, tone: 'round' });
  }

  // ---------- Eventos con objetivo ----------
  /** Tipo de enemigo más fuerte de la ronda actual, para los élites de los eventos. */
  private eliteDef(): EnemyDef {
    const rules = this.map.spawns.filter((s) => s.role === 'normal' && s.from <= this.round && (s.to == null || this.round <= s.to));
    const best = rules.sort((a, b) => enemyById(b.enemy).hp - enemyById(a.enemy).hp)[0];
    return enemyById(best?.enemy ?? 1);
  }

  private spawnElite(x: number, y: number): Enemy {
    const e = this.spawnEnemy(this.eliteDef(), clamp(x, 20, W - 20), clamp(y, 20, W - 20), false, true);
    this.eventElites.add(e.id);
    return e;
  }

  private beginEvent(id: EventId) {
    const alive = [...this.players.values()].filter((p) => p.connected && !p.down);
    const anchor = alive.length ? pick(alive) : null;
    if (id === 'eclipse' || id === 'meteoros' || !anchor) return; // solo hay que sobrevivir
    this.eventGoal = false;
    const a = Math.random() * Math.PI * 2;
    if (id === 'cazador') {
      // RF29: un élite persigue a un jugador elegido al azar
      this.hunted = anchor.id;
      const e = this.spawnElite(anchor.x + Math.cos(a) * 700, anchor.y + Math.sin(a) * 700);
      e.hunt = anchor.id;
      this.cb.toast(`El cazador va por ${anchor.name}. ¡Protéjanlo!`);
    } else if (id === 'cofre') {
      // RF30: el cofre libera una horda de élites al abrirse
      this.dropItem('cofre_maldito', clamp(anchor.x + Math.cos(a) * 320, 60, W - 60), clamp(anchor.y + Math.sin(a) * 320, 60, W - 60));
    } else if (id === 'escolta') {
      // RF31: el superviviente camina hacia la zona de rescate mientras haya un jugador cerca
      const hp = Math.round(150 * (1 + 0.1 * this.round));
      let zx = anchor.x + Math.cos(a) * 1000, zy = anchor.y + Math.sin(a) * 1000;
      if (zx < 150 || zx > W - 150) zx = anchor.x - Math.cos(a) * 1000;
      if (zy < 150 || zy > W - 150) zy = anchor.y - Math.sin(a) * 1000;
      this.escort = { x: anchor.x + 50, y: anchor.y, hp, maxHp: hp, zx: Math.round(clamp(zx, 150, W - 150)), zy: Math.round(clamp(zy, 150, W - 150)) };
    }
  }

  private completeEvent() {
    this.eventGoal = true;
    this.hunted = null;
    this.escort = null;
    this.cb.announce({ title: '¡Objetivo cumplido!', subtitle: 'Recibirán la recompensa al terminar la ronda', tone: 'info' });
  }

  /** Limpia lo que quedó del evento al cambiar de ronda. Los élites que sigan vivos se quedan como enemigos normales. */
  private endEvent() {
    this.eventGoal = null;
    this.eventElites.clear();
    this.cursedOpened = false;
    this.hunted = null;
    this.escort = null;
    this.pickups = this.pickups.filter((g) => g.type !== 10 + ITEM_TYPES.indexOf('cofre_maldito'));
    for (const e of this.enemies.values()) e.hunt = null;
  }

  private openCursedChest(p: SimPlayer) {
    if (this.event !== 'cofre' || this.cursedOpened) return;
    this.cursedOpened = true;
    const n = 3 + this.activeCount;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawnElite(p.x + Math.cos(a) * 320, p.y + Math.sin(a) * 320);
    }
    this.fxQueue.push({ k: 'boom', x: p.x, y: p.y, r: 320, color: 0x8f6bff });
    this.cb.announce({ title: '¡El cofre estaba maldito!', subtitle: `Derroten a los ${n} élites`, tone: 'danger' });
  }

  private updateEscort(dt: number) {
    const s = this.escort;
    if (!s || this.event !== 'escolta' || this.eventGoal !== false) return;
    const guarded = [...this.players.values()].some((p) => p.connected && !p.down && dist2(p.x, p.y, s.x, s.y) < 220 * 220);
    const dx = s.zx - s.x, dy = s.zy - s.y, d = Math.hypot(dx, dy) || 1;
    if (d < 70) return void this.completeEvent();
    if (guarded) { s.x += (dx / d) * 85 * dt; s.y += (dy / d) * 85 * dt; }
    // Los enemigos que lo tocan le hacen daño
    let hits = 0;
    for (const e of this.grid.query(s.x, s.y, 60, this.scratch)) {
      if (hits >= 3) break;
      if (dist2(e.x, e.y, s.x, s.y) < (e.def.radius + 18) ** 2) { s.hp -= e.dmg * dt; hits++; }
    }
    if (s.hp <= 0) {
      this.escort = null;
      this.fxQueue.push({ k: 'death', x: s.x, y: s.y, color: 0x6ee7a8, big: false });
      this.cb.toast('El superviviente cayó. Evento fallido.');
    }
  }

  private anyoneAlive() {
    return [...this.players.values()].some((p) => p.connected && !p.down);
  }

  private spawnPoint(): { x: number; y: number } {
    const alive = [...this.players.values()].filter((p) => p.connected && !p.down);
    const anchor = alive.length ? pick(alive) : { x: W / 2, y: W / 2 };
    const a = Math.random() * Math.PI * 2;
    const d = rand(720, 820);
    return { x: clamp(anchor.x + Math.cos(a) * d, 20, W - 20), y: clamp(anchor.y + Math.sin(a) * d, 20, W - 20) };
  }

  private spawnEnemy(def: EnemyDef, x: number, y: number, final = false, elite = false): Enemy {
    const players = this.activeCount;
    const maxHp = enemyHp(def.hp, this.round, players, this.diff) * (elite ? 8 : 1);
    const e: Enemy = {
      id: this.nextId++, def, x, y, hp: maxHp, maxHp, dmg: def.damage * this.diff.mDmg * (1 + 0.04 * this.round) * (elite ? 1.5 : 1),
      slowT: 0, burnT: 0, burnDps: 0, poisonT: 0, poisonDps: 0, stunT: 0, last: null,
      atkCd: rand(1, 2.5), summonCd: rand(3, 6), dashT: 0, windT: 0, dx: 0, dy: 0, final, lastHitBy: null, elite, hunt: null,
    };
    this.enemies.set(e.id, e);
    return e;
  }

  private spawnBoss(enemyId: number, final: boolean) {
    const sp = this.spawnPoint();
    const e = this.spawnEnemy(enemyById(enemyId), sp.x, sp.y, final);
    this.bossId = e.id;
  }

  private spawnWave() {
    const rules = this.map.spawns.filter((s) => s.role === 'normal' && s.from <= this.round && (s.to == null || this.round <= s.to));
    if (!rules.length) return;
    const total = rules.reduce((a, r) => a + r.weight, 0);
    let count = enemiesPerWave(this.round, this.activeCount, this.diff);
    count = Math.min(count, PARAMS.maxEnemies - this.enemies.size);
    // Las oleadas llegan en grupos desde distintos lados
    let group = this.spawnPoint();
    for (let i = 0; i < count; i++) {
      if (i % 6 === 0) group = this.spawnPoint();
      let r = Math.random() * total;
      const rule = rules.find((x) => (r -= x.weight) < 0) ?? rules[0];
      this.spawnEnemy(enemyById(rule.enemy), clamp(group.x + rand(-60, 60), 10, W - 10), clamp(group.y + rand(-60, 60), 10, W - 10));
    }
  }

  // ---------- Daño (RF12, RF13) ----------
  private damageEnemy(e: Enemy, base: number, el: ElementId, owner: string | null, weapon: number, critChance: number, allowCombo = true) {
    if (!this.enemies.has(e.id)) return;
    const crit = Math.random() < critChance;
    const res = RESISTANCES[e.def.id]?.[el] ?? 1;
    const dmg = Math.max(1, Math.round(base * (crit ? 2 : 1) * res - e.def.armor));
    e.hp -= dmg;
    if (owner) {
      e.lastHitBy = owner;
      const p = this.players.get(owner);
      if (p) {
        p.damageDealt += dmg;
        p.weaponDamage.set(weapon, (p.weaponDamage.get(weapon) ?? 0) + dmg);
      }
    }
    if (this.hitFx < 70 || crit) {
      this.hitFx++;
      this.fxQueue.push({ k: 'hit', x: Math.round(e.x), y: Math.round(e.y - e.def.radius), dmg, el, crit });
    }
    // Efectos de estado
    if (el === 2) { e.burnT = 2; e.burnDps = Math.max(e.burnDps * 0.5, dmg * 0.25); }
    else if (el === 3) e.slowT = e.def.boss ? 0.6 : 1.5;
    else if (el === 4 && !e.def.boss && Math.random() < 0.3) e.stunT = 0.3;
    else if (el === 5) { e.poisonT = 3; e.poisonDps = Math.max(e.poisonDps * 0.5, dmg * 0.35); }

    // Combo elemental entre jugadores distintos
    if (allowCombo && owner && el !== 1) {
      const l = e.last;
      if (l && l.el !== el && l.pid !== owner && this.time - l.t <= PARAMS.comboWindow) {
        const combo = COMBOS.find((c) => (c.a === l.el && c.b === el) || (c.a === el && c.b === l.el));
        if (combo) {
          e.last = null;
          const comboDmg = Math.max(15, dmg) * combo.mult;
          this.fxQueue.push({ k: 'boom', x: e.x, y: e.y, r: combo.radius, color: 0xffffff, label: combo.name });
          for (const o of this.grid.query(e.x, e.y, combo.radius, this.scratch).slice()) {
            if (dist2(o.x, o.y, e.x, e.y) <= (combo.radius + o.def.radius) ** 2)
              this.damageEnemy(o, comboDmg, 1, owner, weapon, 0, false);
          }
        }
      } else {
        e.last = { el, pid: owner, t: this.time };
      }
    }
    if (e.hp <= 0) this.killEnemy(e, owner, weapon);
  }

  private killEnemy(e: Enemy, killer: string | null, weapon = 0) {
    if (!this.enemies.delete(e.id)) return;
    this.kills++;
    const k = killer ?? e.lastHitBy;
    const kp = k ? this.players.get(k) : undefined;
    if (kp) { kp.kills++; if (weapon > 0) kp.weaponKills.set(weapon, (kp.weaponKills.get(weapon) ?? 0) + 1); }
    const luck = 1 + (kp?.perm.suerte ?? 0) / 100; // la mejora Suerte aumenta el botín
    this.fxQueue.push({ k: 'death', x: e.x, y: e.y, color: e.def.color, big: e.def.boss });
    this.dropGem(e.x, e.y, e.def.xp * (e.elite ? 10 : 1));
    if (e.elite) this.dropItem('oro', e.x, e.y);
    if (this.eventElites.delete(e.id) && this.eventElites.size === 0 && this.eventGoal === false
      && (this.event === 'cazador' || (this.event === 'cofre' && this.cursedOpened))) this.completeEvent();
    for (const [item, prob] of LOOT[e.def.id] ?? []) {
      if (Math.random() < prob * luck) this.dropItem(item, e.x + rand(-20, 20), e.y + rand(-20, 20));
    }
    if (e.id === this.bossId) this.bossId = null;
    if (e.final) this.finish(true);
  }

  private dropGem(x: number, y: number, xp: number) {
    // Si hay demasiadas gemas, se juntan con una cercana
    if (this.pickups.length > 350) {
      const near = this.pickups.find((g) => g.type < 10 && dist2(g.x, g.y, x, y) < 100 * 100);
      if (near) { near.value += xp; near.type = near.value >= 5 ? 2 : near.value >= 2 ? 1 : 0; return; }
    }
    this.pickups.push({ id: this.nextId++, type: xp >= 5 ? 2 : xp >= 2 ? 1 : 0, x, y, value: xp, pull: null });
  }

  private dropItem(item: ItemKind, x: number, y: number) {
    this.pickups.push({ id: this.nextId++, type: 10 + ITEM_TYPES.indexOf(item), x, y, value: ITEMS[item].value, pull: null });
  }

  private hurtPlayer(p: SimPlayer, dmg: number, ignoreCd = false) {
    if (p.down || !p.connected) return;
    if (!ignoreCd && p.hurtCd > 0) return;
    p.hurtCd = 0.35;
    const d = Math.max(1, Math.round(dmg - (p.perm.armadura ?? 0)));
    p.hp -= d;
    p.damageTaken += d;
    if (p.hp <= 0 && p.extraLives > 0) {
      // Mejora permanente "Revivir extra": se levanta solo una vez por partida
      p.extraLives--;
      p.hp = Math.round(this.maxHp(p) * 0.5);
      p.hurtCd = 1.5;
      this.fxQueue.push({ k: 'revive', id: p.id });
      return;
    }
    if (p.hp <= 0) {
      p.hp = 0;
      p.down = true;
      p.revive = 0;
      this.fxQueue.push({ k: 'down', id: p.id });
      this.cb.toast(`${p.name} ha caído. ¡Quédate junto a él 3 s para revivirlo!`);
    }
  }

  private nearestEnemy(x: number, y: number, range: number): Enemy | null {
    let best: Enemy | null = null, bd = range * range;
    for (const e of this.grid.query(x, y, range, this.scratch)) {
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private targetPlayer(x: number, y: number): SimPlayer | null {
    let best: SimPlayer | null = null, bd = Infinity;
    for (const p of this.players.values()) {
      if (p.down || !p.connected) continue;
      const d = dist2(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // ---------- Armas (RF10) ----------
  private fireWeapons(p: SimPlayer, dt: number) {
    const rate = this.rateMult(p), area = this.area(p), critBonus = this.passive(p, 'critico') / 100;
    for (const w of p.weapons) {
      const d = w.def, dmg = d.damage * this.dmgMult(p, w), crit = d.crit + critBonus;
      if (d.pattern === 'orbita') {
        const n = orbitCount(w.level, d.isEvolution), r = d.range * area, hitR = 18 * area;
        const cooldown = 1 / (d.rate * rate);
        for (let i = 0; i < n; i++) {
          const a = orbitAngle(this.time, i, n);
          const ox = p.x + Math.cos(a) * r, oy = p.y + Math.sin(a) * r;
          for (const e of this.grid.query(ox, oy, hitR + 60, this.scratch).slice()) {
            if (dist2(ox, oy, e.x, e.y) > (hitR + e.def.radius) ** 2) continue;
            if ((w.hitCd.get(e.id) ?? 0) > this.time) continue;
            w.hitCd.set(e.id, this.time + cooldown);
            this.damageEnemy(e, dmg, d.element, p.id, d.id, crit);
          }
        }
        if (w.hitCd.size > 500) for (const [k, t] of w.hitCd) if (t < this.time) w.hitCd.delete(k);
        continue;
      }
      w.cd -= dt * d.rate * rate;
      if (w.cd > 0) continue;
      w.cd += 1;
      if (d.pattern === 'proyectil') {
        const target = this.nearestEnemy(p.x, p.y, d.range);
        if (!target) { w.cd = 0; continue; }
        const count = d.isEvolution ? 3 : 1 + Math.floor((w.level - 1) / 3);
        const pierce = (d.isEvolution ? 6 : 1 + Math.floor(w.level / 4)) + (d.id === 6 ? 2 : 0);
        const base = Math.atan2(target.y - p.y, target.x - p.x);
        const speed = 650;
        for (let i = 0; i < count; i++) {
          const a = base + (i - (count - 1) / 2) * 0.13;
          this.projectiles.push({
            id: this.nextId++, type: d.id, x: p.x, y: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
            life: (d.range * 1.3) / speed, dmg, el: d.element, crit, pierce, hit: new Set(), owner: p.id, weapon: d.id, r: d.id === 6 ? 12 : 8,
          });
        }
      } else if (d.pattern === 'aura') {
        const r = d.range * area;
        for (const e of this.grid.query(p.x, p.y, r + 60, this.scratch).slice())
          if (dist2(p.x, p.y, e.x, e.y) <= (r + e.def.radius) ** 2) this.damageEnemy(e, dmg, d.element, p.id, d.id, crit);
      } else if (d.pattern === 'rayo') {
        const cands = this.grid.query(p.x, p.y, d.range, this.scratch).filter((e) => dist2(p.x, p.y, e.x, e.y) <= d.range * d.range);
        if (!cands.length) { w.cd = 0; continue; }
        let cur = pick(cands);
        const jumps = d.isEvolution ? 10 : 2 + Math.floor(w.level / 3);
        const pts = [Math.round(p.x), Math.round(p.y)];
        const hit = new Set<number>();
        for (let j = 0; j <= jumps && cur; j++) {
          hit.add(cur.id);
          pts.push(Math.round(cur.x), Math.round(cur.y));
          const cx = cur.x, cy = cur.y;
          this.damageEnemy(cur, dmg, d.element, p.id, d.id, crit);
          let next: Enemy | null = null, bd = 170 * 170;
          for (const e of this.grid.query(cx, cy, 170, this.scratch)) {
            if (hit.has(e.id) || !this.enemies.has(e.id)) continue;
            const dd = dist2(cx, cy, e.x, e.y);
            if (dd < bd) { bd = dd; next = e; }
          }
          cur = next as Enemy;
        }
        this.fxQueue.push({ k: 'bolt', pts, el: d.element });
      } else if (d.pattern === 'area') {
        const cands = this.grid.query(p.x, p.y, d.range, this.scratch).filter((e) => dist2(p.x, p.y, e.x, e.y) <= d.range * d.range);
        const t = cands.length ? pick(cands) : null;
        const x = t ? t.x : p.x + rand(-150, 150), y = t ? t.y : p.y + rand(-150, 150);
        this.zones.push({
          id: this.nextId++, type: 1, x, y, r: (55 + 5 * w.level) * area, life: 2.5 + 0.25 * w.level, tick: 0,
          dmg, el: d.element, owner: p.id, weapon: d.id, crit,
        });
      }
    }
  }

  // ---------- Bucle principal ----------
  tick(dt: number) {
    if (this.finished) return;
    this.time += dt;
    this.tickCount++;
    this.hitFx = 0;
    this.grid.rebuild(this.enemies.values());

    // Rondas
    const isFinal = this.round >= this.totalRounds;
    if (!isFinal) {
      this.roundLeft -= dt;
      if (this.roundLeft <= 0) this.startRound(this.round + 1);
    }
    this.waveCd -= dt;
    if (this.waveCd <= 0) {
      this.waveCd = PARAMS.waveInterval;
      this.spawnWave();
    }
    this.updateEscort(dt);
    if (this.event === 'meteoros') {
      this.meteorCd -= dt;
      if (this.meteorCd <= 0) {
        this.meteorCd = 1.6;
        for (const p of this.players.values()) {
          if (!p.connected || p.down) continue;
          this.zones.push({
            id: this.nextId++, type: 2, x: p.x + rand(-260, 260), y: p.y + rand(-200, 200), r: 85, life: 1.6, tick: 0,
            dmg: 15 * this.diff.mDmg, el: 2, owner: null, weapon: 0, crit: 0,
          });
        }
      }
    }

    // Jugadores: regeneración, revivir, armas
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      p.hurtCd -= dt;
      if (p.down) {
        const helper = [...this.players.values()].some((o) => o !== p && o.connected && !o.down && dist2(o.x, o.y, p.x, p.y) < 75 * 75);
        p.revive = helper ? p.revive + dt / PARAMS.reviveSeconds : Math.max(0, p.revive - dt * 0.5);
        if (p.revive >= 1) {
          p.down = false;
          p.revive = 0;
          p.hp = Math.round(this.maxHp(p) * 0.5);
          p.hurtCd = 1.5;
          for (const o of this.players.values()) if (o !== p && !o.down && dist2(o.x, o.y, p.x, p.y) < 75 * 75) o.revives++;
          this.fxQueue.push({ k: 'revive', id: p.id });
        }
        continue;
      }
      p.hp = Math.min(this.maxHp(p), p.hp + this.passive(p, 'regeneracion') * dt);
      this.fireWeapons(p, dt);
    }

    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateEnemies(dt);
    this.updatePickups(dt);

    // Desconectados que no regresan a tiempo (RF09)
    for (const p of [...this.players.values()]) {
      if (!p.connected && this.time - p.disconnectedAt > PARAMS.reconnectSeconds) this.players.delete(p.id);
    }

    // Derrota: todos los jugadores conectados caídos (RF33)
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length && connected.every((p) => p.down)) this.finish(false);
    if (this.players.size === 0) this.finish(false);

    if (this.tickCount % Math.round(PARAMS.tickRate / PARAMS.sendRate) === 0) this.flush();
  }

  private updateProjectiles(dt: number) {
    const keep: Projectile[] = [];
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      if (pr.life <= 0 || pr.x < 0 || pr.y < 0 || pr.x > W || pr.y > W) continue;
      let alive = true;
      if (pr.owner === null) {
        for (const p of this.players.values()) {
          if (p.down || !p.connected) continue;
          if (dist2(pr.x, pr.y, p.x, p.y) <= (pr.r + PLAYER_R) ** 2) { this.hurtPlayer(p, pr.dmg); alive = false; break; }
        }
      } else {
        for (const e of this.grid.query(pr.x, pr.y, pr.r + 60, this.scratch).slice()) {
          if (pr.hit.has(e.id) || !this.enemies.has(e.id)) continue;
          if (dist2(pr.x, pr.y, e.x, e.y) > (pr.r + e.def.radius) ** 2) continue;
          pr.hit.add(e.id);
          this.damageEnemy(e, pr.dmg, pr.el, pr.owner, pr.weapon, pr.crit);
          if (--pr.pierce <= 0) { alive = false; break; }
        }
      }
      if (alive) keep.push(pr);
    }
    this.projectiles = keep;
  }

  private updateZones(dt: number) {
    const keep: Zone[] = [];
    for (const z of this.zones) {
      z.life -= dt;
      if (z.type === 1) {
        z.tick -= dt;
        if (z.tick <= 0) {
          z.tick = 0.5;
          for (const e of this.grid.query(z.x, z.y, z.r + 60, this.scratch).slice())
            if (dist2(z.x, z.y, e.x, e.y) <= (z.r + e.def.radius) ** 2) this.damageEnemy(e, z.dmg, z.el, z.owner, z.weapon, z.crit);
        }
      } else if (z.type === 2 && z.life <= 0) {
        // Impacto del meteoro: daña a jugadores y enemigos (RF28)
        this.fxQueue.push({ k: 'boom', x: z.x, y: z.y, r: z.r, color: 0xff6a00 });
        for (const p of this.players.values())
          if (dist2(z.x, z.y, p.x, p.y) <= (z.r + PLAYER_R) ** 2) this.hurtPlayer(p, z.dmg, true);
        for (const e of this.grid.query(z.x, z.y, z.r + 60, this.scratch).slice())
          if (dist2(z.x, z.y, e.x, e.y) <= (z.r + e.def.radius) ** 2) this.damageEnemy(e, 60, 2, null, 0, 0);
      }
      if (z.life > 0) keep.push(z);
    }
    this.zones = keep;
  }

  private enemyShoot(e: Enemy, tx: number, ty: number, speed: number, type: number, spread = 0) {
    const a = Math.atan2(ty - e.y, tx - e.x) + spread;
    this.projectiles.push({
      id: this.nextId++, type, x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 4,
      dmg: e.dmg * (e.def.boss ? 0.5 : 1), el: e.def.element, crit: 0, pierce: 1, hit: new Set(), owner: null, weapon: 0, r: type === 51 ? 10 : 7,
    });
  }

  private updateEnemies(dt: number) {
    const sep = this.scratch;
    for (const e of [...this.enemies.values()]) {
      // Daño en el tiempo
      if (e.burnT > 0) { e.burnT -= dt; e.hp -= e.burnDps * dt; }
      if (e.poisonT > 0) { e.poisonT -= dt; e.hp -= e.poisonDps * dt; }
      if (e.hp <= 0) { this.killEnemy(e, null); continue; }
      e.slowT -= dt;
      if (e.stunT > 0) { e.stunT -= dt; continue; }

      const prey = e.hunt ? this.players.get(e.hunt) : undefined;
      const target = prey && !prey.down && prey.connected ? prey : this.targetPlayer(e.x, e.y);
      if (!target) continue;
      const dx = target.x - e.x, dy = target.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      let speed = e.def.speed * PARAMS.enemySpeedScale * (e.slowT > 0 ? 0.55 : 1);
      let mx = ux, my = uy;
      e.atkCd -= dt;
      e.summonCd -= dt;

      switch (e.def.behavior) {
        case 'embestir':
          if (e.dashT > 0) { e.dashT -= dt; mx = e.dx; my = e.dy; speed *= 3; }
          else if (e.windT > 0) { e.windT -= dt; speed = 0; if (e.windT <= 0) e.dashT = 0.5; }
          else if (d < 280 && e.atkCd <= 0) { e.atkCd = 3; e.windT = 0.45; e.dx = ux; e.dy = uy; speed = 0; }
          break;
        case 'distancia':
        case 'invocar':
          if (d < 240) { mx = -ux; my = -uy; }
          else if (d < 340) { mx = -uy; my = ux; speed *= 0.5; }
          if (e.def.behavior === 'distancia' && e.atkCd <= 0 && d < 520) { e.atkCd = 2.5; this.enemyShoot(e, target.x, target.y, 260, 50); }
          if (e.def.behavior === 'invocar' && e.summonCd <= 0 && this.enemies.size < PARAMS.maxEnemies) {
            e.summonCd = 6;
            for (let i = 0; i < 3; i++) this.spawnEnemy(enemyById(1), e.x + rand(-40, 40), e.y + rand(-40, 40));
          }
          break;
        case 'explotar':
          if (d < e.def.radius + PLAYER_R + 18) {
            this.fxQueue.push({ k: 'boom', x: e.x, y: e.y, r: 90, color: 0xff5722 });
            for (const p of this.players.values()) if (dist2(e.x, e.y, p.x, p.y) < 90 * 90) this.hurtPlayer(p, e.dmg, true);
            this.enemies.delete(e.id);
            this.fxQueue.push({ k: 'death', x: e.x, y: e.y, color: e.def.color, big: false });
            continue;
          }
          break;
        case 'jefe':
          if (e.atkCd <= 0) {
            e.atkCd = e.final ? 2.6 : 3.5;
            const n = e.final ? 18 : 12;
            const off = Math.random();
            for (let i = 0; i < n; i++) this.enemyShoot(e, e.x + 1, e.y, 230, 51, off + (i / n) * Math.PI * 2);
          }
          if (e.summonCd <= 0 && this.enemies.size < PARAMS.maxEnemies) {
            e.summonCd = e.final ? 7 : 9;
            const rule = this.map.spawns.find((s) => s.role === 'normal' && s.from <= this.round);
            if (rule) for (let i = 0; i < 5; i++) this.spawnEnemy(enemyById(rule.enemy), e.x + rand(-80, 80), e.y + rand(-80, 80));
          }
          break;
      }

      // Separación para que no se amontonen en un punto
      let px = 0, py = 0;
      for (const o of this.grid.query(e.x, e.y, e.def.radius * 2, sep)) {
        if (o === e) continue;
        const ox = e.x - o.x, oy = e.y - o.y;
        const dd = ox * ox + oy * oy, min = e.def.radius + o.def.radius;
        if (dd > 0 && dd < min * min) { const l = Math.sqrt(dd); px += (ox / l) * (min - l); py += (oy / l) * (min - l); }
      }
      e.x = clamp(e.x + mx * speed * dt + px * 0.3, 0, W);
      e.y = clamp(e.y + my * speed * dt + py * 0.3, 0, W);

      // Daño por contacto
      if (d < e.def.radius + PLAYER_R + 2) this.hurtPlayer(target, e.dmg);
    }
  }

  private updatePickups(dt: number) {
    const keep: Pickup[] = [];
    let xp = 0;
    for (const g of this.pickups) {
      let taken: SimPlayer | null = null;
      if (g.pull) {
        const p = this.players.get(g.pull);
        if (!p || p.down) g.pull = null;
        else {
          const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy) || 1;
          const s = Math.min(d, 650 * dt);
          g.x += (dx / d) * s; g.y += (dy / d) * s;
          if (d < 22) taken = p;
        }
      } else {
        for (const p of this.players.values()) {
          if (p.down || !p.connected) continue;
          const r = g.type >= 10 ? 28 : this.pickupRadius(p);
          if (dist2(g.x, g.y, p.x, p.y) < r * r) { if (g.type >= 10) taken = p; else g.pull = p.id; break; }
        }
      }
      if (!taken) { keep.push(g); continue; }
      if (g.type < 10) { xp += g.value; continue; }
      const item = ITEM_TYPES[g.type - 10];
      this.fxQueue.push({ k: 'pickup', x: g.x, y: g.y, item });
      this.useItem(taken, item, g.value);
    }
    this.pickups = keep;
    if (xp > 0) {
      const scale = ({ 1: 1, 2: 0.9, 3: 0.85, 4: 0.8 } as Record<number, number>)[Math.min(4, this.activeCount)];
      this.giveXp(xp * scale);
    }
  }

  private useItem(p: SimPlayer, item: ItemKind, value: number) {
    switch (item) {
      case 'oro': this.gold += Math.round(value * this.diff.mReward); break;
      case 'curar': p.hp = Math.min(this.maxHp(p), p.hp + value); break;
      case 'iman': for (const g of this.pickups) if (g.type < 10) g.pull = p.id; break;
      case 'bomba':
        this.fxQueue.push({ k: 'boom', x: p.x, y: p.y, r: 450, color: 0xffffff });
        for (const e of [...this.enemies.values()])
          if (dist2(p.x, p.y, e.x, e.y) < 450 * 450) this.damageEnemy(e, e.def.boss ? 200 : value, 1, p.id, 0, 0, false);
        break;
      case 'cofre': this.openChest(p); break;
      case 'cofre_maldito': this.openCursedChest(p); break;
    }
  }

  /** Cofre de jefe: evoluciona las armas listas o da una mejora extra (RF24). */
  private openChest(p: SimPlayer) {
    let evolved = false;
    for (const w of p.weapons) {
      const d = w.def;
      if (d.evolution && w.level >= d.maxLevel && d.requiredPassive && p.passives.has(d.requiredPassive)) {
        const evo = weaponById(d.evolution);
        w.def = evo; w.level = 1; w.hitCd.clear();
        evolved = true;
        this.fxQueue.push({ k: 'evolve', id: p.id, weapon: evo.id });
        this.cb.announce({ title: '¡Evolución!', subtitle: `${p.name}: ${d.name} → ${evo.name}`, tone: 'info' });
      }
    }
    if (!evolved) {
      this.gold += Math.round(50 * this.diff.mReward);
      p.pending++;
      this.offerNext(p);
      this.cb.toast(`${p.name} abrió el cofre: +50 de oro y una mejora`);
    }
  }

  private finish(victory: boolean) {
    if (this.finished) return;
    this.finished = true;
    this.closeRoundLog(victory);
    this.flush();
    this.cb.end({
      victory, round: this.round, totalRounds: this.totalRounds, seconds: Math.round(this.time), gold: this.gold,
      mapId: this.map.id, difficultyId: this.diff.id,
      stats: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, character: p.char.id, kills: p.kills, damageDealt: Math.round(p.damageDealt),
        damageTaken: Math.round(p.damageTaken), revives: p.revives, level: p.level,
        weaponDamage: [...p.weaponDamage.entries()].filter(([id]) => id > 0).map(([id, v]) => [id, Math.round(v)] as [number, number]),
      })),
    });
  }

  // ---------- Envío del estado (RF11) ----------
  private flush() {
    const players: PlayerSnap[] = [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, character: p.char.id, x: Math.round(p.x), y: Math.round(p.y),
      hp: Math.ceil(p.hp), maxHp: this.maxHp(p), level: p.level, xp: Math.floor(p.xp), xpNext: xpToNext(p.level),
      down: p.down, revive: Math.round(p.revive * 100) / 100, connected: p.connected,
      weapons: p.weapons.map((w) => [w.def.id, w.level]), passives: [...p.passives.entries()],
      area: Math.round(this.area(p) * 100) / 100, speed: Math.round(this.speed(p)), pendingLevelUps: p.pending,
    }));
    const enemies: number[] = [];
    for (const e of this.enemies.values())
      enemies.push(e.id, e.def.id, Math.round(e.x), Math.round(e.y), Math.max(0, Math.ceil((e.hp / e.maxHp) * 100)),
        (e.slowT > 0 ? 1 : 0) | (e.burnT > 0 ? 2 : 0) | (e.poisonT > 0 ? 4 : 0) | (e.elite ? 8 : 0));
    const projectiles: number[] = [];
    for (const p of this.projectiles) projectiles.push(p.id, p.type, Math.round(p.x), Math.round(p.y));
    const pickups: number[] = [];
    for (const g of this.pickups) pickups.push(g.id, g.type, Math.round(g.x), Math.round(g.y));
    const zones: number[] = [];
    for (const z of this.zones) zones.push(z.id, z.type, Math.round(z.x), Math.round(z.y), Math.round(z.r), Math.round(z.life * 10) / 10);
    this.cb.snapshot({
      t: Math.round(this.time * 1000) / 1000, round: this.round, totalRounds: this.totalRounds,
      roundLeft: this.round >= this.totalRounds ? -1 : Math.max(0, Math.ceil(this.roundLeft)),
      event: this.event, gold: this.gold, kills: this.kills, players, enemies, projectiles, pickups, zones, bossId: this.bossId,
      eventGoal: this.event ? this.eventGoal : null, hunted: this.hunted,
      escort: this.escort ? [Math.round(this.escort.x), Math.round(this.escort.y), Math.ceil((this.escort.hp / this.escort.maxHp) * 100), this.escort.zx, this.escort.zy] : null,
    });
    if (this.fxQueue.length) { this.cb.fx(this.fxQueue); this.fxQueue = []; }
  }
}
