import Phaser from 'phaser';
import { ELEMENTS, PARAMS, enemyById, mapById, weaponById, type ElementId } from '../../../shared/data.js';
import { orbitAngle, orbitCount } from '../../../shared/formulas.js';
import type { FxEvent, PlayerSnap, Snapshot } from '../../../shared/protocol.js';
import { socket } from '../net.js';
import { state } from '../state.js';
import { makeTextures } from '../textures.js';

const W = PARAMS.worldSize;

interface PlayerView {
  root: Phaser.GameObjects.Container; body: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Graphics; tx: number; ty: number; snap: PlayerSnap;
}
interface Moving { img: Phaser.GameObjects.Image; tx: number; ty: number; seen: number }
interface Bolt { pts: number[]; color: number; life: number }

const hex = (c: string) => parseInt(c.slice(1), 16);

export class GameScene extends Phaser.Scene {
  private players = new Map<string, PlayerView>();
  private enemies = new Map<number, Moving & { type: number }>();
  private projectiles = new Map<number, Moving>();
  private pickups = new Map<number, Moving>();
  private pools = new Map<string, Phaser.GameObjects.Image[]>();
  private orbs: Phaser.GameObjects.Image[] = [];
  private zoneG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private dark!: Phaser.GameObjects.RenderTexture;
  private bolts: Bolt[] = [];
  private texts: Phaser.GameObjects.Text[] = [];
  private activeTexts = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private me = { x: W / 2, y: W / 2, ready: false, sendAcc: 0, lastSentX: 0, lastSentY: 0 };
  private snapAt = 0;
  private seenTick = 0;
  private following = false;

  constructor() {
    super('game');
  }

  create() {
    makeTextures(this);
    this.players.clear(); this.enemies.clear(); this.projectiles.clear(); this.pickups.clear();
    this.pools.clear(); this.orbs = []; this.bolts = []; this.texts = []; this.activeTexts = 0;
    this.me.ready = false;
    this.following = false;

    const map = mapById(state.mapId);
    this.cameras.main.setBackgroundColor(map.ground);
    this.cameras.main.setBounds(-200, -200, W + 400, W + 400);
    this.add.tileSprite(0, 0, W, W, `ground-${map.id}`).setOrigin(0).setDepth(0);
    const border = this.add.graphics().setDepth(1);
    border.lineStyle(6, 0x8f6bff, 0.5).strokeRect(0, 0, W, W);

    const rnd = new Phaser.Math.RandomDataGenerator([`deco-${map.id}`]);
    for (let i = 0; i < 160; i++) {
      const x = rnd.between(40, W - 40), y = rnd.between(40, W - 40);
      if (Math.hypot(x - W / 2, y - W / 2) < 260) continue;
      this.add.image(x, y, `deco-${map.id}`).setDepth(2).setScale(rnd.realInRange(0.7, 1.4)).setAlpha(0.9);
    }

    this.zoneG = this.add.graphics().setDepth(3);
    this.fxG = this.add.graphics().setDepth(9);
    this.dark = this.add.renderTexture(0, 0, this.scale.width, this.scale.height).setOrigin(0).setScrollFactor(0).setDepth(50).setVisible(false);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;

    this.fitCamera();
    this.scale.on('resize', this.onResize, this);

    socket.on('snap', this.onSnap);
    socket.on('fx', this.onFx);
    this.events.once('shutdown', () => {
      socket.off('snap', this.onSnap);
      socket.off('fx', this.onFx);
      this.scale.off('resize', this.onResize, this);
    });
    if (state.snap) this.onSnap(state.snap);
  }

  private onResize = () => {
    this.fitCamera();
    this.dark.resize(this.scale.width, this.scale.height);
  };

  /** Muestra aproximadamente lo mismo en 1280×720 y en 1920×1080 (RNF04). */
  private fitCamera() {
    const z = Phaser.Math.Clamp(Math.min(this.scale.width / 1280, this.scale.height / 720), 0.55, 1.6);
    this.cameras.main.setZoom(z);
  }

  // ---------- Pools de sprites ----------
  private take(key: string, depth: number): Phaser.GameObjects.Image {
    const pool = this.pools.get(key);
    const img = pool?.pop() ?? this.add.image(0, 0, key);
    return img.setActive(true).setVisible(true).setDepth(depth).setAlpha(1).setScale(1).clearTint().setRotation(0);
  }
  private give(img: Phaser.GameObjects.Image) {
    img.setActive(false).setVisible(false);
    const key = img.texture.key;
    let pool = this.pools.get(key);
    if (!pool) this.pools.set(key, (pool = []));
    pool.push(img);
  }

  // ---------- Red ----------
  private onSnap = (s: Snapshot) => {
    state.snap = s;
    this.snapAt = performance.now();
    const tick = ++this.seenTick;

    for (const p of s.players) {
      let v = this.players.get(p.id);
      if (!v) v = this.createPlayer(p);
      v.snap = p;
      v.tx = p.x; v.ty = p.y;
      if (p.id === state.you) {
        const off = Math.hypot(this.me.x - p.x, this.me.y - p.y);
        if (!this.me.ready || p.down || off > 220) {
          this.me.x = p.x; this.me.y = p.y; this.me.ready = true;
          if (!this.following) { this.following = true; this.cameras.main.startFollow(v.root, true, 0.15, 0.15); }
        }
      }
    }
    for (const [id, v] of this.players) {
      if (!s.players.some((p) => p.id === id)) { v.root.destroy(); this.players.delete(id); }
    }

    this.syncFlat(s.enemies, 6, this.enemies as Map<number, Moving>, tick, (type) => `enemy-${type}`, 5, (m, arr, i) => {
      const e = m as Moving & { type: number };
      e.type = arr[i + 1];
      const st = arr[i + 5];
      if (st & 1) m.img.setTint(0x9ad9ff); else if (st & 4) m.img.setTint(0xa5ff7a); else if (st & 2) m.img.setTint(0xffa07a); else m.img.clearTint();
    });
    this.syncFlat(s.projectiles, 4, this.projectiles, tick, (type) => (type === 101 ? 'proj-101' : type === 6 ? 'proj-6' : type >= 50 ? `proj-${type}` : 'proj-1'), 7);
    this.syncFlat(s.pickups, 4, this.pickups, tick, (type) => (type < 10 ? `gem-${type}` : `item-${type}`), 4);
  };

  private syncFlat(arr: number[], step: number, map: Map<number, Moving>, tick: number, key: (type: number) => string, depth: number,
    extra?: (m: Moving, arr: number[], i: number) => void) {
    for (let i = 0; i < arr.length; i += step) {
      const id = arr[i];
      let m = map.get(id);
      if (!m) {
        m = { img: this.take(key(arr[i + 1]), depth), tx: arr[i + 2], ty: arr[i + 3], seen: tick };
        m.img.setPosition(arr[i + 2], arr[i + 3]);
        map.set(id, m);
      }
      m.tx = arr[i + 2]; m.ty = arr[i + 3]; m.seen = tick;
      extra?.(m, arr, i);
    }
    for (const [id, m] of map) if (m.seen !== tick) { this.give(m.img); map.delete(id); }
  }

  private createPlayer(p: PlayerSnap): PlayerView {
    const body = this.add.image(0, 0, `player-${p.character}`);
    const label = this.add.text(0, -32, p.name, { fontFamily: 'Inter', fontSize: '13px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    const bar = this.add.graphics();
    const root = this.add.container(p.x, p.y, [body, bar, label]).setDepth(p.id === state.you ? 7 : 6);
    const v: PlayerView = { root, body, label, bar, tx: p.x, ty: p.y, snap: p };
    this.players.set(p.id, v);
    return v;
  }

  private onFx = (list: FxEvent[]) => {
    for (const f of list) {
      switch (f.k) {
        case 'hit': this.damageNumber(f.x, f.y, f.dmg, ELEMENTS[f.el as ElementId]?.color ?? '#fff', f.crit); break;
        case 'bolt': this.bolts.push({ pts: f.pts, color: hex(ELEMENTS[f.el as ElementId].color), life: 0.2 }); break;
        case 'boom': this.boom(f.x, f.y, f.r, f.color, f.label); break;
        case 'death': {
          const c = this.add.circle(f.x, f.y, f.big ? 60 : 12, f.color, 0.7).setDepth(4);
          this.tweens.add({ targets: c, scale: f.big ? 3 : 2, alpha: 0, duration: f.big ? 900 : 300, onComplete: () => c.destroy() });
          if (f.big) this.cameras.main.shake(400, 0.01);
          break;
        }
        case 'levelup': {
          const v = this.players.get(f.id);
          if (v) this.floatText(v.root.x, v.root.y - 50, '¡Nivel!', '#ffb547', 20);
          break;
        }
        case 'evolve': {
          const v = this.players.get(f.id);
          if (v) this.boom(v.root.x, v.root.y, 160, 0xffb547, weaponById(f.weapon).name);
          break;
        }
        case 'revive': {
          const v = this.players.get(f.id);
          if (v) this.floatText(v.root.x, v.root.y - 50, '¡Revivido!', '#6ee7a8', 18);
          break;
        }
        case 'pickup': if (f.item === 'bomba') this.cameras.main.flash(200, 255, 255, 255); break;
        case 'down': if (f.id === state.you) this.cameras.main.shake(300, 0.012); break;
      }
    }
  };

  private boom(x: number, y: number, r: number, color: number, label?: string) {
    const c = this.add.circle(x, y, r, color, 0.35).setDepth(8).setScale(0.3);
    this.tweens.add({ targets: c, scale: 1, alpha: 0, duration: 450, onComplete: () => c.destroy() });
    if (label) this.floatText(x, y - 20, label, '#ffffff', 18);
  }

  private floatText(x: number, y: number, msg: string, color: string, size: number) {
    const t = this.add.text(x, y, msg, { fontFamily: 'Inter', fontStyle: '800', fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(12);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
  }

  private damageNumber(x: number, y: number, dmg: number, color: string, crit: boolean) {
    if (this.activeTexts > 90) return;
    const t = this.texts.pop() ?? this.add.text(0, 0, '', { fontFamily: 'Inter', fontStyle: '800', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(11);
    this.activeTexts++;
    t.setText(String(dmg)).setPosition(x + Phaser.Math.Between(-8, 8), y).setColor(crit ? '#ffe14d' : color)
      .setFontSize(crit ? 20 : 14).setAlpha(1).setVisible(true).setActive(true);
    this.tweens.add({
      targets: t, y: y - 28, alpha: 0, duration: 650,
      onComplete: () => { t.setVisible(false).setActive(false); this.texts.push(t); this.activeTexts--; },
    });
  }

  // ---------- Bucle de dibujo ----------
  update(_time: number, delta: number) {
    const dt = Math.min(0.1, delta / 1000);
    const s = state.snap;
    if (!s) return;
    const serverT = s.t + (performance.now() - this.snapAt) / 1000;
    const k = 1 - Math.exp(-dt * 14);

    this.moveLocal(dt);

    for (const [id, v] of this.players) {
      if (id === state.you) v.root.setPosition(this.me.x, this.me.y);
      else v.root.setPosition(v.root.x + (v.tx - v.root.x) * k, v.root.y + (v.ty - v.root.y) * k);
      const p = v.snap;
      v.root.setAlpha(p.down || !p.connected ? 0.45 : 1);
      v.bar.clear();
      v.bar.fillStyle(0x000000, 0.6).fillRect(-18, 22, 36, 5);
      v.bar.fillStyle(p.down ? 0x777777 : 0xff4d5e, 1).fillRect(-18, 22, 36 * (p.hp / p.maxHp), 5);
      if (p.down) {
        v.bar.lineStyle(4, 0x6ee7a8, 1).beginPath().arc(0, 0, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.revive).strokePath();
      }
    }
    for (const m of this.enemies.values()) {
      const nx = m.img.x + (m.tx - m.img.x) * k;
      if (Math.abs(nx - m.img.x) > 0.3) m.img.setFlipX(nx < m.img.x);
      m.img.setPosition(nx, m.img.y + (m.ty - m.img.y) * k);
    }
    const kp = 1 - Math.exp(-dt * 25);
    for (const m of this.projectiles.values()) {
      m.img.setPosition(m.img.x + (m.tx - m.img.x) * kp, m.img.y + (m.ty - m.img.y) * kp);
      m.img.rotation += dt * 12;
    }
    for (const m of this.pickups.values()) m.img.setPosition(m.img.x + (m.tx - m.img.x) * k, m.img.y + (m.ty - m.img.y) * k);

    this.drawWeapons(serverT);
    this.drawZones(s);
    this.drawBolts(dt);
    this.drawDarkness(s);
  }

  private moveLocal(dt: number) {
    const v = this.players.get(state.you);
    if (!v || !this.me.ready) return;
    const p = v.snap;
    if (p.down || !p.connected) return;
    let dx = 0, dy = 0;
    const K = this.keys;
    if (K.A.isDown || K.LEFT.isDown) dx -= 1;
    if (K.D.isDown || K.RIGHT.isDown) dx += 1;
    if (K.W.isDown || K.UP.isDown) dy -= 1;
    if (K.S.isDown || K.DOWN.isDown) dy += 1;
    const pad = this.input.gamepad?.pad1;
    if (pad && (Math.abs(pad.leftStick.x) > 0.2 || Math.abs(pad.leftStick.y) > 0.2)) { dx = pad.leftStick.x; dy = pad.leftStick.y; }
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const speed = (p.speed * Math.min(1, len)) / len;
      this.me.x = Phaser.Math.Clamp(this.me.x + dx * speed * dt, 16, W - 16);
      this.me.y = Phaser.Math.Clamp(this.me.y + dy * speed * dt, 16, W - 16);
    }
    this.me.sendAcc += dt;
    if (this.me.sendAcc >= 1 / 30) {
      this.me.sendAcc = 0;
      if (this.me.x !== this.me.lastSentX || this.me.y !== this.me.lastSentY) {
        this.me.lastSentX = this.me.x; this.me.lastSentY = this.me.y;
        socket.emit('move', { x: Math.round(this.me.x * 10) / 10, y: Math.round(this.me.y * 10) / 10 });
      }
    }
  }

  /** Dibuja órbitas y auras con la misma fórmula que usa el servidor. */
  private drawWeapons(t: number) {
    let used = 0;
    this.fxG.clear();
    for (const v of this.players.values()) {
      const p = v.snap;
      if (p.down || !p.connected) continue;
      const x = v.root.x, y = v.root.y;
      for (const [id, lvl] of p.weapons) {
        const d = weaponById(id);
        if (d.pattern === 'orbita') {
          const n = orbitCount(lvl, d.isEvolution), r = d.range * p.area;
          for (let i = 0; i < n; i++) {
            const a = orbitAngle(t, i, n);
            let o = this.orbs[used];
            if (!o) { o = this.add.image(0, 0, 'orb-fire').setDepth(8); this.orbs.push(o); }
            o.setTexture(d.isEvolution ? 'orb-sun' : 'orb-fire').setVisible(true).setPosition(x + Math.cos(a) * r, y + Math.sin(a) * r).setRotation(a);
            used++;
          }
        } else if (d.pattern === 'aura') {
          const r = d.range * p.area;
          const pulse = 0.12 + Math.sin(t * 4) * 0.04;
          this.fxG.fillStyle(0x66ccff, pulse).fillCircle(x, y, r);
          this.fxG.lineStyle(2, 0xb3e5fc, 0.5).strokeCircle(x, y, r);
        }
      }
    }
    for (let i = used; i < this.orbs.length; i++) this.orbs[i].setVisible(false);
  }

  private drawZones(s: Snapshot) {
    const g = this.zoneG;
    g.clear();
    const z = s.zones;
    for (let i = 0; i < z.length; i += 6) {
      const type = z[i + 1], x = z[i + 2], y = z[i + 3], r = z[i + 4], life = z[i + 5];
      if (type === 1) {
        g.fillStyle(0x7cfc00, 0.22).fillCircle(x, y, r);
        g.lineStyle(2, 0x7cfc00, 0.45).strokeCircle(x, y, r);
      } else {
        const p = Phaser.Math.Clamp(1 - life / 1.6, 0, 1);
        g.lineStyle(3, 0xff3b3b, 0.9).strokeCircle(x, y, r);
        g.fillStyle(0xff6a00, 0.15 + p * 0.35).fillCircle(x, y, r * p);
      }
    }
  }

  private drawBolts(dt: number) {
    const g = this.fxG;
    this.bolts = this.bolts.filter((b) => (b.life -= dt) > 0);
    for (const b of this.bolts) {
      g.lineStyle(3, b.color, Math.min(1, b.life * 6));
      g.beginPath();
      g.moveTo(b.pts[0], b.pts[1]);
      for (let i = 2; i < b.pts.length; i += 2) {
        const mx = (b.pts[i - 2] + b.pts[i]) / 2 + Phaser.Math.Between(-10, 10);
        const my = (b.pts[i - 1] + b.pts[i + 1]) / 2 + Phaser.Math.Between(-10, 10);
        g.lineTo(mx, my);
        g.lineTo(b.pts[i], b.pts[i + 1]);
      }
      g.strokePath();
    }
  }

  /** Evento Eclipse total: solo se ve alrededor de cada jugador (RF27). */
  private drawDarkness(s: Snapshot) {
    const on = s.event === 'eclipse';
    this.dark.setVisible(on);
    if (!on) return;
    const cam = this.cameras.main;
    this.dark.clear();
    this.dark.fill(0x000000, 0.93);
    for (const v of this.players.values()) {
      const sx = (v.root.x - cam.worldView.x) * cam.zoom, sy = (v.root.y - cam.worldView.y) * cam.zoom;
      this.dark.erase('light', sx - 256, sy - 256);
    }
  }
}

// Para mostrar el nombre de un enemigo jefe en la interfaz
export const bossName = (s: Snapshot): string | null => {
  if (s.bossId == null) return null;
  for (let i = 0; i < s.enemies.length; i += 6) if (s.enemies[i] === s.bossId) return enemyById(s.enemies[i + 1]).name;
  return null;
};
export const bossHp = (s: Snapshot): number => {
  for (let i = 0; i < s.enemies.length; i += 6) if (s.enemies[i] === s.bossId) return s.enemies[i + 4] / 100;
  return 0;
};
