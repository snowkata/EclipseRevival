// Arte 2D generado con código (sin archivos de imagen). Cada sprite se dibuja una vez
// en una textura al cargar el juego. Si más adelante hay sprites dibujados a mano,
// basta con cargar imágenes con estas mismas claves.
import Phaser from 'phaser';
import { CHARACTERS, ENEMIES, MAPS, type EnemyDef } from '../../shared/data.js';
import type { ObstacleKind } from '../../shared/world.js';

type G = Phaser.GameObjects.Graphics;
const P = (x: number, y: number) => ({ x, y });

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, Math.ceil(w), Math.ceil(h));
  g.destroy();
}

const shade = (color: number, f: number) => {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const k = (v: number) => Math.max(0, Math.min(255, Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1))));
  return Phaser.Display.Color.GetColor(k(c.red), k(c.green), k(c.blue));
};
const shadow = (g: G, x: number, y: number, w: number) => g.fillStyle(0x000000, 0.32).fillEllipse(x, y, w, w * 0.32);
const eyes = (g: G, x: number, y: number, gap: number, r: number, color = 0xff3b3b) => {
  g.fillStyle(color, 1).fillCircle(x - gap, y, r).fillCircle(x + gap, y, r);
  g.fillStyle(0xffffff, 0.9).fillCircle(x - gap - r * 0.3, y - r * 0.3, r * 0.35).fillCircle(x + gap - r * 0.3, y - r * 0.3, r * 0.35);
};

// ---------- Personajes (48×56, pies en y≈50) ----------
function hero(g: G, id: number, color: number) {
  const dark = shade(color, 0.6), light = shade(color, 1.45);
  shadow(g, 24, 50, 30);
  // Capa
  g.fillStyle(dark, 1).fillPoints([P(10, 26), P(38, 26), P(42, 48), P(6, 48)], true);
  // Piernas y cuerpo
  g.fillStyle(0x2a2340, 1).fillRoundedRect(16, 40, 6, 10, 2).fillRoundedRect(26, 40, 6, 10, 2);
  g.fillStyle(color, 1).fillRoundedRect(13, 24, 22, 20, 6);
  g.fillStyle(light, 1).fillRoundedRect(15, 26, 6, 14, 3);
  g.fillStyle(0x2a2340, 1).fillRect(13, 37, 22, 3); // cinturón
  g.fillStyle(0xffd54f, 1).fillRect(22, 36, 4, 5);
  // Cabeza
  g.fillStyle(0xf1c9a5, 1).fillCircle(24, 16, 10);
  g.fillStyle(0x1b1530, 1).fillCircle(20, 17, 1.8).fillCircle(28, 17, 1.8);
  g.lineStyle(2, 0xffffff, 0.9).strokeRoundedRect(13, 24, 22, 20, 6);
  if (id === 1) { // Nova: capucha de maga con estrella
    g.fillStyle(color, 1).slice(24, 15, 12, Math.PI, 0, false).fillPath();
    g.fillStyle(dark, 1).fillTriangle(12, 15, 36, 15, 24, 0);
    g.fillStyle(0xfff59d, 1).fillCircle(24, 6, 2.5);
    g.fillStyle(0xfff59d, 1).fillPoints([P(24, 28), P(26, 32), P(30, 32), P(27, 35), P(28, 39), P(24, 37), P(20, 39), P(21, 35), P(18, 32), P(22, 32)], true);
  } else if (id === 2) { // Brasa: pelo de fuego y hombreras
    g.fillStyle(0xff3d00, 1).fillTriangle(14, 14, 20, 2, 24, 12).fillTriangle(20, 12, 26, -1, 30, 12).fillTriangle(26, 13, 33, 3, 34, 15);
    g.fillStyle(0xffca28, 1).fillTriangle(20, 12, 25, 4, 28, 12);
    g.fillStyle(0x6d4c41, 1).fillCircle(12, 27, 5).fillCircle(36, 27, 5);
    g.fillStyle(0xffca28, 1).fillTriangle(24, 28, 20, 36, 28, 36);
  } else if (id === 3) { // Escarcha: corona de cristales
    g.fillStyle(0xe1f5fe, 1).fillTriangle(15, 10, 18, 0, 21, 9).fillTriangle(21, 8, 24, -3, 27, 8).fillTriangle(27, 9, 30, 0, 33, 10);
    g.fillStyle(0xffffff, 1).fillRect(14, 9, 20, 3);
    g.fillStyle(0xe1f5fe, 1).fillPoints([P(24, 27), P(28, 32), P(24, 38), P(20, 32)], true);
  } else { // Volt: visor y rayo
    g.fillStyle(0x263238, 1).fillRoundedRect(14, 5, 20, 9, 4);
    g.fillStyle(0x00e5ff, 1).fillRect(16, 13, 16, 4);
    g.fillStyle(0x263238, 1).fillPoints([P(26, 26), P(20, 34), P(24, 34), P(21, 42), P(29, 32), P(25, 32), P(28, 26)], true);
  }
}

// ---------- Enemigos ----------
function enemy(g: G, e: EnemyDef) {
  const r = e.radius, c = r + 10, col = e.color, dark = shade(col, 0.6), light = shade(col, 1.4);
  shadow(g, c, c + r * 0.85, r * 1.8);
  g.lineStyle(2, 0x000000, 0.55);
  switch (e.id) {
    case 1: { // Sombra: fantasma con borde ondulado
      g.fillStyle(col, 1).slice(c, c, r, Math.PI, 0, false).fillPath();
      g.fillRect(c - r, c, r * 2, r * 0.6);
      for (let i = 0; i < 4; i++) g.fillCircle(c - r + r * 0.25 + i * r * 0.5, c + r * 0.6, r * 0.25);
      g.fillStyle(light, 0.5).fillCircle(c - r * 0.3, c - r * 0.4, r * 0.3);
      eyes(g, c, c - r * 0.1, r * 0.35, r * 0.2);
      break;
    }
    case 2: { // Murciélago
      g.fillStyle(dark, 1);
      g.fillTriangle(c - 2, c, c - r - 9, c - r, c - r - 4, c + r * 0.6).fillTriangle(c + 2, c, c + r + 9, c - r, c + r + 4, c + r * 0.6);
      g.fillStyle(col, 1).fillCircle(c, c, r * 0.75);
      g.fillTriangle(c - r * 0.6, c - r * 0.4, c - r * 0.3, c - r * 1.2, c, c - r * 0.5).fillTriangle(c + r * 0.6, c - r * 0.4, c + r * 0.3, c - r * 1.2, c, c - r * 0.5);
      eyes(g, c, c - 1, r * 0.3, r * 0.17, 0xffeb3b);
      g.fillStyle(0xffffff, 1).fillTriangle(c - 3, c + 3, c - 1, c + 3, c - 2, c + 7).fillTriangle(c + 1, c + 3, c + 3, c + 3, c + 2, c + 7);
      break;
    }
    case 3: { // Esqueleto
      g.fillStyle(dark, 1).fillRoundedRect(c - r * 0.5, c + r * 0.1, r, r * 0.9, 3);
      g.fillStyle(0x3e2723, 0.7).fillRect(c - r * 0.4, c + r * 0.3, r * 0.8, 2).fillRect(c - r * 0.4, c + r * 0.6, r * 0.8, 2);
      g.fillStyle(col, 1).fillCircle(c, c - r * 0.25, r * 0.7).fillRoundedRect(c - r * 0.4, c + r * 0.1, r * 0.8, r * 0.35, 2);
      g.fillStyle(0x1b1530, 1).fillCircle(c - r * 0.28, c - r * 0.3, r * 0.2).fillCircle(c + r * 0.28, c - r * 0.3, r * 0.2).fillTriangle(c, c - r * 0.05, c - 2, c + r * 0.12, c + 2, c + r * 0.12);
      g.fillStyle(0xff3b3b, 1).fillCircle(c - r * 0.28, c - r * 0.3, r * 0.08).fillCircle(c + r * 0.28, c - r * 0.3, r * 0.08);
      break;
    }
    case 4: { // Lobo de ceniza
      g.fillStyle(col, 1).fillEllipse(c, c + r * 0.2, r * 2, r * 1.3);
      g.fillStyle(dark, 1).fillTriangle(c - r * 0.8, c - r * 0.3, c - r * 0.5, c - r * 1.1, c - r * 0.1, c - r * 0.4).fillTriangle(c + r * 0.8, c - r * 0.3, c + r * 0.5, c - r * 1.1, c + r * 0.1, c - r * 0.4);
      g.fillStyle(light, 1).fillEllipse(c, c + r * 0.45, r * 0.9, r * 0.6);
      g.fillStyle(0x1b1530, 1).fillCircle(c, c + r * 0.35, r * 0.14);
      g.fillStyle(0xff6a00, 0.9).fillCircle(c - r * 0.75, c + r * 0.5, 2.5).fillCircle(c + r * 0.8, c, 2).fillCircle(c - r * 0.2, c - r * 0.6, 2);
      eyes(g, c, c - r * 0.05, r * 0.4, r * 0.16, 0xffca28);
      break;
    }
    case 5: { // Arquero espectral
      g.fillStyle(col, 0.9).fillTriangle(c - r * 0.8, c + r, c + r * 0.8, c + r, c, c - r * 0.2);
      g.fillStyle(dark, 1).fillCircle(c, c - r * 0.3, r * 0.6);
      g.fillStyle(0x0b1a1a, 1).fillEllipse(c, c - r * 0.2, r * 0.75, r * 0.6);
      eyes(g, c, c - r * 0.2, r * 0.22, r * 0.13, 0x80ffea);
      g.lineStyle(2.5, 0xe0f2f1, 1).beginPath().arc(c + r * 0.6, c + r * 0.2, r * 0.85, -1.2, 1.2, false).strokePath();
      g.lineStyle(1, 0xffffff, 0.8).lineBetween(c + r * 0.9, c - r * 0.6, c + r * 0.9, c + r);
      break;
    }
    case 6: { // Escarabajo de cristal
      g.fillStyle(dark, 1).fillEllipse(c, c, r * 2, r * 1.6);
      g.fillStyle(col, 1).fillEllipse(c, c - 1, r * 1.7, r * 1.35);
      g.lineStyle(2, dark, 1).lineBetween(c, c - r * 0.7, c, c + r * 0.7);
      g.fillStyle(0xe8eaf6, 1).fillTriangle(c - r * 0.5, c - r * 0.3, c - r * 0.25, c - r * 1.05, c - r * 0.05, c - r * 0.35).fillTriangle(c + r * 0.15, c - r * 0.35, c + r * 0.4, c - r * 1.0, c + r * 0.6, c - r * 0.25);
      g.fillStyle(0xffffff, 0.6).fillCircle(c - r * 0.4, c - r * 0.1, r * 0.18);
      eyes(g, c, c + r * 0.45, r * 0.3, r * 0.13);
      break;
    }
    case 7: { // Espíritu helado
      g.fillStyle(col, 0.85).fillCircle(c, c - r * 0.1, r * 0.8).fillTriangle(c - r * 0.7, c + r * 0.1, c + r * 0.7, c + r * 0.1, c + r * 0.2, c + r * 1.1);
      g.fillStyle(0xffffff, 0.9).fillTriangle(c - r, c - r * 0.2, c - r * 0.5, c - r * 0.9, c - r * 0.4, c - r * 0.1).fillTriangle(c + r, c - r * 0.2, c + r * 0.5, c - r * 0.9, c + r * 0.4, c - r * 0.1).fillTriangle(c - 3, c - r * 0.7, c, c - r * 1.3, c + 3, c - r * 0.7);
      eyes(g, c, c - r * 0.15, r * 0.28, r * 0.15, 0x0288d1);
      break;
    }
    case 8: { // Bomba viviente
      g.fillStyle(0x263238, 1).fillCircle(c, c + 1, r);
      g.fillStyle(col, 1).fillCircle(c, c + 1, r * 0.72);
      g.fillStyle(0xffeb3b, 1).fillCircle(c, c + 1, r * 0.35);
      g.lineStyle(3, 0x8d6e63, 1).lineBetween(c, c - r, c + 4, c - r - 6);
      g.fillStyle(0xfff176, 1).fillCircle(c + 5, c - r - 7, 3);
      g.lineStyle(2, 0x1b1530, 1).lineBetween(c - r * 0.55, c - r * 0.45, c - r * 0.15, c - r * 0.25).lineBetween(c + r * 0.55, c - r * 0.45, c + r * 0.15, c - r * 0.25);
      break;
    }
    case 9: { // Gólem de hielo
      g.fillStyle(dark, 1).fillRoundedRect(c - r * 0.85, c - r * 0.5, r * 1.7, r * 1.5, 6);
      g.fillStyle(col, 1).fillRoundedRect(c - r * 0.75, c - r * 0.6, r * 1.5, r * 1.3, 6);
      g.fillStyle(dark, 1).fillRoundedRect(c - r * 1.05, c - r * 0.3, r * 0.4, r, 4).fillRoundedRect(c + r * 0.65, c - r * 0.3, r * 0.4, r, 4);
      g.fillStyle(light, 1).fillRoundedRect(c - r * 0.45, c - r * 1.0, r * 0.9, r * 0.6, 4);
      g.fillStyle(0xffffff, 0.5).fillTriangle(c - r * 0.6, c - r * 0.4, c - r * 0.1, c - r * 0.5, c - r * 0.5, c + r * 0.2);
      eyes(g, c, c - r * 0.72, r * 0.2, r * 0.1, 0x01579b);
      break;
    }
    case 10: { // Brujo del eclipse
      g.fillStyle(dark, 1).fillTriangle(c - r * 0.9, c + r, c + r * 0.9, c + r, c, c - r * 0.3);
      g.fillStyle(col, 1).fillTriangle(c - r * 0.6, c + r, c + r * 0.6, c + r, c, c - r * 0.1);
      g.fillStyle(0xdcedc8, 1).fillCircle(c, c - r * 0.3, r * 0.42);
      g.fillStyle(0x1b1530, 1).fillTriangle(c - r * 0.8, c - r * 0.45, c + r * 0.8, c - r * 0.45, c + r * 0.15, c - r * 1.4);
      g.lineStyle(2.5, 0x5d4037, 1).lineBetween(c + r * 0.85, c - r * 0.6, c + r * 0.85, c + r);
      g.fillStyle(0xb388ff, 1).fillCircle(c + r * 0.85, c - r * 0.7, r * 0.22);
      eyes(g, c, c - r * 0.3, r * 0.17, r * 0.09, 0x7cfc00);
      break;
    }
    case 11: { // Guardián marchito: árbol monstruoso
      g.fillStyle(0x3e2723, 1).fillRoundedRect(c - r * 0.45, c - r * 0.2, r * 0.9, r * 1.15, 8);
      g.fillTriangle(c - r * 0.45, c + r * 0.6, c - r * 0.95, c + r * 0.95, c - r * 0.2, c + r * 0.9).fillTriangle(c + r * 0.45, c + r * 0.6, c + r * 0.95, c + r * 0.95, c + r * 0.2, c + r * 0.9);
      g.lineStyle(6, 0x3e2723, 1).lineBetween(c - r * 0.4, c, c - r, c - r * 0.4).lineBetween(c + r * 0.4, c, c + r, c - r * 0.4);
      g.fillStyle(dark, 1).fillCircle(c, c - r * 0.45, r * 0.62).fillCircle(c - r * 0.5, c - r * 0.3, r * 0.4).fillCircle(c + r * 0.5, c - r * 0.3, r * 0.4);
      g.fillStyle(col, 1).fillCircle(c - r * 0.15, c - r * 0.6, r * 0.42).fillCircle(c + r * 0.3, c - r * 0.5, r * 0.32);
      g.fillStyle(0x1b1530, 1).fillEllipse(c, c + r * 0.35, r * 0.4, r * 0.3);
      eyes(g, c, c + r * 0.05, r * 0.2, r * 0.1, 0xffe14d);
      break;
    }
    case 12: { // Coloso de cristal
      g.fillStyle(dark, 1).fillPoints([P(c - r * 0.8, c + r * 0.9), P(c + r * 0.8, c + r * 0.9), P(c + r, c), P(c + r * 0.4, c - r * 0.7), P(c - r * 0.4, c - r * 0.7), P(c - r, c)], true);
      g.fillStyle(col, 1).fillPoints([P(c - r * 0.5, c + r * 0.8), P(c + r * 0.5, c + r * 0.8), P(c + r * 0.7, c), P(c, c - r * 0.6), P(c - r * 0.7, c)], true);
      g.fillStyle(light, 1).fillTriangle(c - r * 0.35, c - r * 0.5, c - r * 0.15, c - r * 1.15, c + r * 0.05, c - r * 0.5).fillTriangle(c + r * 0.2, c - r * 0.45, c + r * 0.5, c - r, c + r * 0.6, c - r * 0.3).fillTriangle(c - r * 0.9, c - r * 0.1, c - r * 0.75, c - r * 0.75, c - r * 0.5, c - r * 0.3);
      g.fillStyle(0xffffff, 0.45).fillTriangle(c - r * 0.4, c + r * 0.1, c, c - r * 0.3, c - r * 0.1, c + r * 0.5);
      eyes(g, c, c + r * 0.1, r * 0.22, r * 0.1, 0xffe14d);
      break;
    }
    case 13: { // Devorador del Eclipse: sol negro con corona
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        g.fillStyle(i % 2 ? 0xffb547 : 0xff7043, 0.9).fillTriangle(
          c + Math.cos(a - 0.12) * r * 0.78, c + Math.sin(a - 0.12) * r * 0.78,
          c + Math.cos(a + 0.12) * r * 0.78, c + Math.sin(a + 0.12) * r * 0.78,
          c + Math.cos(a) * r * 1.12, c + Math.sin(a) * r * 1.12);
      }
      g.fillStyle(0xffe082, 1).fillCircle(c, c, r * 0.84);
      g.fillStyle(0x0b0616, 1).fillCircle(c, c, r * 0.76);
      g.fillStyle(col, 1).fillCircle(c - r * 0.1, c - r * 0.1, r * 0.55);
      g.fillStyle(0x0b0616, 1).fillCircle(c, c, r * 0.5);
      eyes(g, c, c - r * 0.15, r * 0.25, r * 0.11, 0xffe14d);
      g.fillStyle(0xffffff, 1);
      for (let i = -2; i <= 2; i++) g.fillTriangle(c + i * r * 0.12 - 3, c + r * 0.15, c + i * r * 0.12 + 3, c + r * 0.15, c + i * r * 0.12, c + r * 0.32);
      break;
    }
    default:
      g.fillStyle(col, 1).fillCircle(c, c, r).strokeCircle(c, c, r);
      eyes(g, c, c - r * 0.15, r * 0.32, Math.max(2, r * 0.18));
  }
}

// ---------- Obstáculos y decoración ----------
/** Tamaño de la textura y punto de apoyo (centro de la colisión) de cada tipo, en píxeles. */
export const OBSTACLE_ART: Record<ObstacleKind, { w: number; h: number; ox: number; oy: number }> = {
  arbol: { w: 110, h: 140, ox: 55, oy: 118 }, arbol_seco: { w: 80, h: 110, ox: 40, oy: 94 },
  roca: { w: 70, h: 56, ox: 35, oy: 34 }, tocon: { w: 44, h: 40, ox: 22, oy: 24 },
  muro: { w: 100, h: 96, ox: 50, oy: 62 }, columna: { w: 48, h: 100, ox: 24, oy: 80 },
  farola: { w: 40, h: 110, ox: 20, oy: 98 }, estatua: { w: 64, h: 110, ox: 32, oy: 84 },
  arbusto: { w: 50, h: 36, ox: 25, oy: 22 }, hierba: { w: 30, h: 20, ox: 15, oy: 14 },
  flores: { w: 34, h: 24, ox: 17, oy: 16 }, hongos: { w: 30, h: 24, ox: 15, oy: 18 },
  escombros: { w: 56, h: 32, ox: 28, oy: 18 }, grieta: { w: 70, h: 36, ox: 35, oy: 18 }, huesos: { w: 36, h: 22, ox: 18, oy: 12 },
};

function obstacle(g: G, kind: ObstacleKind, leaf: number) {
  const a = OBSTACLE_ART[kind], x = a.ox, y = a.oy;
  switch (kind) {
    case 'arbol':
      shadow(g, x, y + 4, 70);
      g.fillStyle(0x3b2a1e, 1).fillRoundedRect(x - 9, y - 50, 18, 56, 5);
      g.fillStyle(0x2a1d14, 1).fillRect(x + 2, y - 50, 7, 54);
      g.fillStyle(shade(leaf, 0.7), 1).fillCircle(x, y - 62, 40).fillCircle(x - 26, y - 46, 26).fillCircle(x + 26, y - 46, 26);
      g.fillStyle(leaf, 1).fillCircle(x - 6, y - 72, 30).fillCircle(x - 28, y - 54, 18).fillCircle(x + 20, y - 58, 20);
      g.fillStyle(shade(leaf, 1.35), 0.8).fillCircle(x - 14, y - 82, 13).fillCircle(x + 14, y - 70, 8);
      break;
    case 'arbol_seco':
      shadow(g, x, y + 3, 44);
      g.fillStyle(0x4e3b2e, 1).fillRoundedRect(x - 6, y - 60, 12, 64, 4);
      g.lineStyle(5, 0x4e3b2e, 1).lineBetween(x, y - 40, x - 24, y - 66).lineBetween(x, y - 50, x + 26, y - 76).lineBetween(x, y - 58, x - 8, y - 90);
      g.lineStyle(3, 0x4e3b2e, 1).lineBetween(x - 24, y - 66, x - 34, y - 62).lineBetween(x + 26, y - 76, x + 30, y - 88).lineBetween(x + 14, y - 64, x + 28, y - 60);
      break;
    case 'roca':
      shadow(g, x, y + 12, 62);
      g.fillStyle(0x4a4a55, 1).fillPoints([P(x - 30, y + 14), P(x - 26, y - 8), P(x - 8, y - 26), P(x + 18, y - 22), P(x + 30, y - 2), P(x + 28, y + 14)], true);
      g.fillStyle(0x6b6b78, 1).fillPoints([P(x - 22, y - 6), P(x - 8, y - 22), P(x + 12, y - 18), P(x + 4, y - 2), P(x - 12, y + 4)], true);
      g.fillStyle(0x8b8b98, 0.7).fillTriangle(x - 8, y - 20, x + 6, y - 16, x - 4, y - 8);
      break;
    case 'tocon':
      shadow(g, x, y + 8, 40);
      g.fillStyle(0x4e3b2e, 1).fillRoundedRect(x - 16, y - 12, 32, 24, 5);
      g.fillStyle(0xa1887f, 1).fillEllipse(x, y - 12, 32, 14);
      g.lineStyle(1.5, 0x6d4c41, 1).strokeEllipse(x, y - 12, 20, 8).strokeEllipse(x, y - 12, 9, 3.5);
      break;
    case 'muro':
      shadow(g, x, y + 22, 92);
      g.fillStyle(0x3a3740, 1).fillPoints([P(x - 44, y + 26), P(x - 44, y - 30), P(x - 26, y - 44), P(x - 8, y - 34), P(x + 8, y - 56), P(x + 30, y - 40), P(x + 44, y - 14), P(x + 44, y + 26)], true);
      g.fillStyle(0x56525e, 1).fillPoints([P(x - 40, y + 20), P(x - 40, y - 26), P(x - 26, y - 38), P(x - 8, y - 28), P(x + 8, y - 50), P(x + 28, y - 36), P(x + 40, y - 12), P(x + 40, y + 20)], true);
      g.lineStyle(1.5, 0x3a3740, 1);
      for (let r = 0; r < 4; r++) {
        g.lineBetween(x - 40, y + 8 - r * 14, x + 40, y + 8 - r * 14);
        for (let c = 0; c < 5; c++) g.lineBetween(x - 34 + c * 18 + (r % 2) * 9, y + 8 - r * 14, x - 34 + c * 18 + (r % 2) * 9, y + 22 - r * 14);
      }
      g.fillStyle(0x1b1a20, 1).fillRoundedRect(x - 20, y - 18, 14, 18, 3);
      break;
    case 'columna':
      shadow(g, x, y + 6, 40);
      g.fillStyle(0x7d7888, 1).fillRect(x - 12, y - 66, 24, 70);
      g.fillStyle(0x9a95a6, 1).fillRect(x - 12, y - 66, 8, 70);
      g.fillStyle(0x5c5866, 1).fillRect(x + 5, y - 66, 7, 70);
      g.fillStyle(0x8f8a9c, 1).fillRoundedRect(x - 18, y - 4, 36, 10, 3).fillPoints([P(x - 16, y - 66), P(x - 10, y - 76), P(x + 2, y - 70), P(x + 10, y - 78), P(x + 16, y - 66)], true);
      break;
    case 'farola':
      shadow(g, x, y + 3, 24);
      g.fillStyle(0x263238, 1).fillRect(x - 3, y - 84, 6, 88).fillRoundedRect(x - 8, y - 2, 16, 6, 2);
      g.fillStyle(0xffe082, 0.25).fillCircle(x, y - 88, 18);
      g.fillStyle(0x263238, 1).fillRoundedRect(x - 9, y - 98, 18, 6, 2);
      g.fillStyle(0xffe082, 1).fillRoundedRect(x - 7, y - 94, 14, 12, 3);
      break;
    case 'estatua':
      shadow(g, x, y + 10, 56);
      g.fillStyle(0x5c5866, 1).fillRoundedRect(x - 24, y - 6, 48, 18, 3);
      g.fillStyle(0x8f8a9c, 1).fillRoundedRect(x - 20, y - 12, 40, 10, 2);
      g.fillStyle(0x9a95a6, 1).fillPoints([P(x - 12, y - 12), P(x - 14, y - 46), P(x + 14, y - 46), P(x + 12, y - 12)], true).fillCircle(x, y - 56, 10);
      g.fillStyle(0x7d7888, 1).fillRect(x + 14, y - 74, 4, 60).fillTriangle(x + 10, y - 74, x + 22, y - 74, x + 16, y - 84);
      break;
    case 'arbusto':
      g.fillStyle(shade(leaf, 0.75), 1).fillCircle(x - 10, y, 13).fillCircle(x + 10, y, 13).fillCircle(x, y - 6, 15);
      g.fillStyle(shade(leaf, 1.2), 0.8).fillCircle(x - 4, y - 10, 7);
      break;
    case 'hierba':
      g.lineStyle(2, shade(leaf, 1.3), 0.9);
      for (let i = -2; i <= 2; i++) g.lineBetween(x + i * 4, y + 4, x + i * 6, y - 8 + Math.abs(i) * 3);
      break;
    case 'flores':
      g.lineStyle(1.5, shade(leaf, 1.3), 1).lineBetween(x - 8, y + 6, x - 8, y - 4).lineBetween(x + 2, y + 6, x + 2, y - 8).lineBetween(x + 10, y + 6, x + 10, y - 2);
      g.fillStyle(0xce93d8, 1).fillCircle(x - 8, y - 5, 3.5).fillStyle(0xfff59d, 1).fillCircle(x + 2, y - 9, 3.5).fillStyle(0x90caf9, 1).fillCircle(x + 10, y - 3, 3);
      break;
    case 'hongos':
      g.fillStyle(0xeeeeee, 1).fillRect(x - 7, y - 4, 4, 9).fillRect(x + 4, y - 1, 3, 6);
      g.fillStyle(0xb388ff, 1).slice(x - 5, y - 4, 8, Math.PI, 0, false).fillPath().slice(x + 5.5, y - 1, 6, Math.PI, 0, false).fillPath();
      g.fillStyle(0xffffff, 0.8).fillCircle(x - 7, y - 8, 1.5).fillCircle(x - 2, y - 7, 1.2);
      break;
    case 'escombros':
      g.fillStyle(0x56525e, 1).fillRoundedRect(x - 24, y - 4, 18, 12, 2).fillRoundedRect(x - 2, y - 8, 14, 10, 2).fillRoundedRect(x + 10, y + 0, 14, 9, 2);
      g.fillStyle(0x7d7888, 1).fillRoundedRect(x - 22, y - 4, 14, 5, 2).fillRoundedRect(x, y - 8, 10, 4, 2);
      break;
    case 'grieta':
      g.lineStyle(3, 0x000000, 0.45).beginPath();
      g.moveTo(x - 30, y + 2).lineTo(x - 16, y - 6).lineTo(x - 4, y + 4).lineTo(x + 10, y - 4).lineTo(x + 30, y + 6).strokePath();
      g.lineStyle(2, 0x000000, 0.35).lineBetween(x - 4, y + 4, x - 10, y + 14).lineBetween(x + 10, y - 4, x + 16, y - 14);
      break;
    case 'huesos':
      g.lineStyle(3, 0xd7ccc8, 0.9).lineBetween(x - 12, y - 4, x + 12, y + 4).lineBetween(x - 10, y + 5, x + 8, y - 5);
      g.fillStyle(0xd7ccc8, 0.9).fillCircle(x - 12, y - 4, 2.5).fillCircle(x + 12, y + 4, 2.5).fillCircle(x - 10, y + 5, 2.5).fillCircle(x + 8, y - 5, 2.5);
      break;
  }
}

export function makeTextures(scene: Phaser.Scene) {
  const t = scene.textures;
  if (t.exists('ground-1')) return;

  for (const ch of CHARACTERS) make(scene, `player-${ch.id}`, 48, 56, (g) => hero(g, ch.id, ch.color));
  for (const e of ENEMIES) make(scene, `enemy-${e.id}`, (e.radius + 10) * 2, (e.radius + 10) * 2 + 6, (g) => enemy(g, e));

  const simple = (key: string, w: number, h: number, draw: (g: G) => void) => make(scene, key, w, h, draw);

  // Proyectiles
  simple('proj-1', 18, 18, (g) => { g.fillStyle(0xb388ff, 0.45).fillCircle(9, 9, 8); g.fillStyle(0xfff2c2, 1).fillCircle(9, 9, 5); g.fillStyle(0xffffff, 1).fillCircle(9, 9, 2.5); });
  simple('proj-101', 24, 24, (g) => { g.fillStyle(0xffb547, 0.5).fillCircle(12, 12, 11); g.fillStyle(0xffe082, 1).fillCircle(12, 12, 7); g.fillStyle(0xffffff, 1).fillCircle(12, 12, 3.5); });
  simple('proj-6', 28, 28, (g) => {
    g.fillStyle(0xd9e6ff, 1).slice(14, 14, 12, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340), false).fillPath();
    g.fillStyle(0x07060d, 1).fillCircle(14, 18, 9);
  });
  simple('proj-50', 16, 16, (g) => { g.fillStyle(0x80ffea, 0.4).fillCircle(8, 8, 7.5); g.fillStyle(0x99ccff, 1).fillCircle(8, 8, 5); g.fillStyle(0xffffff, 1).fillCircle(8, 8, 2); });
  simple('proj-51', 24, 24, (g) => { g.fillStyle(0xff3b6b, 0.5).fillCircle(12, 12, 11); g.fillStyle(0xffd0d6, 1).fillCircle(12, 12, 6); });

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
      g.fillStyle(shade(color, 0.6), 1).fillPoints([P(c, 1), P(c + s * 0.85, c), P(c, c + s + 1), P(c - s * 0.85, c)], true);
      g.fillStyle(color, 1).fillPoints([P(c, 3), P(c + s * 0.65, c), P(c, c + s - 1), P(c - s * 0.65, c)], true);
      g.fillStyle(0xffffff, 0.7).fillPoints([P(c, 4), P(c + s * 0.35, c - 1), P(c, c)], true);
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

  // Suelo y obstáculos por mapa
  for (const m of MAPS) {
    simple(`ground-${m.id}`, 256, 256, (g) => {
      g.fillStyle(m.ground, 1).fillRect(0, 0, 256, 256);
      const rnd = new Phaser.Math.RandomDataGenerator([`suelo-${m.id}`]);
      for (let i = 0; i < 90; i++) {
        g.fillStyle(rnd.pick([m.deco, 0x000000, 0xffffff]), rnd.realInRange(0.04, 0.12));
        g.fillCircle(rnd.between(0, 256), rnd.between(0, 256), rnd.between(2, 9));
      }
    });
    for (const kind of Object.keys(OBSTACLE_ART) as ObstacleKind[]) {
      const a = OBSTACLE_ART[kind];
      simple(`obs-${m.id}-${kind}`, a.w, a.h, (g) => obstacle(g, kind, shade(m.deco, 1.15)));
    }
  }
}
