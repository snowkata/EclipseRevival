// Arte 2D provisional generado con código (sin archivos de imagen),
// para poder jugar mientras se diseñan los sprites definitivos.
import Phaser from 'phaser';
import { CHARACTERS, ENEMIES, MAPS, type EnemyDef } from '../../shared/data.js';

function gfx(scene: Phaser.Scene) {
  return scene.make.graphics({ x: 0, y: 0 }, false);
}

function enemyShape(g: Phaser.GameObjects.Graphics, e: EnemyDef) {
  const r = e.radius, c = r + 4;
  g.fillStyle(0x000000, 0.35).fillEllipse(c, c + r * 0.7, r * 1.8, r * 0.6);
  g.fillStyle(e.color, 1).lineStyle(2, 0x000000, 0.6);
  switch (e.behavior) {
    case 'embestir':
      g.fillTriangle(c - r, c + r * 0.8, c + r, c + r * 0.8, c, c - r);
      g.strokeTriangle(c - r, c + r * 0.8, c + r, c + r * 0.8, c, c - r);
      break;
    case 'distancia':
      g.fillPoints([{ x: c, y: c - r }, { x: c + r, y: c }, { x: c, y: c + r }, { x: c - r, y: c }], true);
      break;
    case 'invocar': {
      const pts = Array.from({ length: 6 }, (_, i) => ({ x: c + Math.cos((i * Math.PI) / 3) * r, y: c + Math.sin((i * Math.PI) / 3) * r }));
      g.fillPoints(pts, true);
      break;
    }
    case 'jefe': {
      const pts = Array.from({ length: 24 }, (_, i) => {
        const rr = i % 2 ? r : r * 0.82;
        const a = (i * Math.PI) / 12;
        return { x: c + Math.cos(a) * rr, y: c + Math.sin(a) * rr };
      });
      g.fillPoints(pts, true);
      g.fillStyle(0x000000, 0.25).fillCircle(c, c, r * 0.6);
      break;
    }
    case 'explotar':
      g.fillCircle(c, c, r).strokeCircle(c, c, r);
      g.fillStyle(0xffeb3b, 1).fillCircle(c, c, r * 0.45);
      break;
    default:
      g.fillCircle(c, c, r).strokeCircle(c, c, r);
  }
  // Ojos
  const eye = Math.max(2, r * 0.18);
  g.fillStyle(e.boss ? 0xffe14d : 0xff3b3b, 1);
  g.fillCircle(c - r * 0.32, c - r * 0.15, eye).fillCircle(c + r * 0.32, c - r * 0.15, eye);
}

export function makeTextures(scene: Phaser.Scene) {
  const t = scene.textures;
  if (t.exists('ground-1')) return;

  for (const ch of CHARACTERS) {
    const g = gfx(scene);
    g.fillStyle(0x000000, 0.35).fillEllipse(20, 33, 30, 10);
    g.fillStyle(ch.color, 1).fillCircle(20, 20, 16);
    g.lineStyle(3, 0xffffff, 1).strokeCircle(20, 20, 16);
    g.fillStyle(0xffffff, 0.9).fillCircle(14, 14, 4);
    g.fillStyle(0x1b1530, 1).fillCircle(15, 21, 2.5).fillCircle(25, 21, 2.5);
    g.generateTexture(`player-${ch.id}`, 40, 40);
    g.destroy();
  }

  for (const e of ENEMIES) {
    const g = gfx(scene);
    enemyShape(g, e);
    g.generateTexture(`enemy-${e.id}`, (e.radius + 4) * 2, (e.radius + 4) * 2 + 4);
    g.destroy();
  }

  const simple = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    const g = gfx(scene);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  };

  // Proyectiles
  simple('proj-1', 14, 14, (g) => { g.fillStyle(0xfff2c2, 1).fillCircle(7, 7, 5); g.fillStyle(0xffffff, 1).fillCircle(7, 7, 2.5); });
  simple('proj-101', 20, 20, (g) => { g.fillStyle(0xffb547, 0.6).fillCircle(10, 10, 9); g.fillStyle(0xffffff, 1).fillCircle(10, 10, 5); });
  simple('proj-6', 28, 28, (g) => {
    g.fillStyle(0xd9e6ff, 1).slice(14, 14, 12, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340), false).fillPath();
    g.fillStyle(0x07060d, 1).fillCircle(14, 18, 9);
  });
  simple('proj-50', 14, 14, (g) => { g.fillStyle(0x9cf, 1).fillCircle(7, 7, 6); g.fillStyle(0xffffff, 1).fillCircle(7, 7, 2); });
  simple('proj-51', 22, 22, (g) => { g.fillStyle(0xff3b6b, 0.5).fillCircle(11, 11, 10); g.fillStyle(0xffd0d6, 1).fillCircle(11, 11, 5); });

  // Orbe de fuego / anillo solar
  simple('orb-fire', 36, 36, (g) => {
    g.fillStyle(0xff6a00, 0.35).fillCircle(18, 18, 17);
    g.fillStyle(0xff8f00, 1).fillCircle(18, 18, 11);
    g.fillStyle(0xffe082, 1).fillCircle(16, 16, 5);
  });
  simple('orb-sun', 44, 44, (g) => {
    g.fillStyle(0xffd54f, 0.35).fillCircle(22, 22, 21);
    g.fillStyle(0xffb300, 1).fillCircle(22, 22, 14);
    g.fillStyle(0xffffff, 1).fillCircle(20, 20, 6);
  });

  // Gemas de experiencia
  const gem = (key: string, color: number, s: number) =>
    simple(key, s * 2 + 4, s * 2 + 4, (g) => {
      const c = s + 2;
      g.fillStyle(color, 1).fillPoints([{ x: c, y: 2 }, { x: c + s * 0.8, y: c }, { x: c, y: c + s }, { x: c - s * 0.8, y: c }], true);
      g.fillStyle(0xffffff, 0.6).fillPoints([{ x: c, y: 4 }, { x: c + s * 0.35, y: c - 1 }, { x: c, y: c }], true);
    });
  gem('gem-0', 0x4fc3f7, 7);
  gem('gem-1', 0x66bb6a, 9);
  gem('gem-2', 0xef5350, 11);

  // Objetos
  simple('item-10', 22, 22, (g) => { g.fillStyle(0xffc107, 1).fillCircle(11, 11, 9); g.lineStyle(2, 0xb07800, 1).strokeCircle(11, 11, 9); g.fillStyle(0xfff59d, 1).fillRect(9, 6, 4, 10); });
  simple('item-11', 24, 24, (g) => { g.fillStyle(0xffffff, 1).fillRoundedRect(2, 2, 20, 20, 4); g.fillStyle(0xe53935, 1).fillRect(10, 5, 4, 14).fillRect(5, 10, 14, 4); });
  simple('item-12', 24, 24, (g) => {
    g.lineStyle(6, 0xe53935, 1).beginPath().arc(12, 10, 7, 0, Math.PI, false).strokePath();
    g.fillStyle(0xcfd8dc, 1).fillRect(2, 2, 6, 7).fillRect(16, 2, 6, 7);
  });
  simple('item-13', 24, 24, (g) => { g.fillStyle(0x212121, 1).fillCircle(12, 14, 9); g.fillStyle(0xff9800, 1).fillRect(11, 1, 3, 6); g.fillStyle(0xffffff, 0.5).fillCircle(9, 11, 2); });
  simple('item-14', 34, 28, (g) => {
    g.fillStyle(0x8d5524, 1).fillRoundedRect(1, 6, 32, 21, 4);
    g.fillStyle(0xa86b32, 1).fillRoundedRect(1, 1, 32, 10, 4);
    g.fillStyle(0xffd54f, 1).fillRect(14, 8, 6, 8);
  });

  simple('item-15', 34, 28, (g) => {
    g.fillStyle(0x3b1d5e, 1).fillRoundedRect(1, 6, 32, 21, 4);
    g.fillStyle(0x5a2d8f, 1).fillRoundedRect(1, 1, 32, 10, 4);
    g.fillStyle(0xff3b6b, 1).fillCircle(17, 12, 4);
  });
  // Superviviente del evento Escolta
  simple('escort', 40, 40, (g) => {
    g.fillStyle(0x000000, 0.35).fillEllipse(20, 33, 30, 10);
    g.fillStyle(0x6ee7a8, 1).fillCircle(20, 20, 14);
    g.lineStyle(3, 0xffffff, 1).strokeCircle(20, 20, 14);
    g.fillStyle(0x1b1530, 1).fillCircle(15, 19, 2.5).fillCircle(25, 19, 2.5);
  });

  // Luz para el evento Eclipse total
  const light = t.createCanvas('light', 512, 512);
  if (light) {
    const ctx = light.getContext();
    const grad = ctx.createRadialGradient(256, 256, 40, 256, 256, 256);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    light.refresh();
  }

  // Suelo y decoración por mapa
  for (const m of MAPS) {
    simple(`ground-${m.id}`, 256, 256, (g) => {
      g.fillStyle(m.ground, 1).fillRect(0, 0, 256, 256);
      const rnd = new Phaser.Math.RandomDataGenerator([`suelo-${m.id}`]);
      for (let i = 0; i < 90; i++) {
        g.fillStyle(rnd.pick([m.deco, 0x000000, 0xffffff]), rnd.realInRange(0.04, 0.12));
        g.fillCircle(rnd.between(0, 256), rnd.between(0, 256), rnd.between(2, 9));
      }
    });
    simple(`deco-${m.id}`, 96, 96, (g) => {
      g.fillStyle(0x000000, 0.3).fillEllipse(48, 80, 70, 20);
      if (m.id === 2) {
        g.fillStyle(m.deco, 1).fillRect(18, 22, 26, 56).fillRect(50, 40, 28, 38);
        g.fillStyle(0x000000, 0.25).fillRect(18, 22, 8, 56).fillRect(50, 40, 8, 38);
      } else {
        g.fillStyle(0x2b1d14, 1).fillRect(44, 50, 8, 30);
        g.fillStyle(m.deco, 1).fillCircle(48, 36, 26).fillCircle(32, 46, 16).fillCircle(64, 46, 16);
        g.fillStyle(0x000000, 0.2).fillCircle(56, 44, 18);
      }
    });
  }
}
