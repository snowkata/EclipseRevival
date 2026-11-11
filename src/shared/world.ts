// Obstáculos y decoración de cada mapa. Se generan con una semilla fija por mapa,
// así el servidor (colisiones) y el navegador (dibujo) obtienen exactamente lo mismo.
import { PARAMS, SHRINE_KINDS, type ShrineKind } from './data.js';

export type ObstacleKind =
  // Con colisión
  | 'arbol' | 'arbol_seco' | 'roca' | 'tocon' | 'muro' | 'columna' | 'farola' | 'estatua' | 'cristal' | 'cactus'
  // Solo decoración (se puede caminar encima)
  | 'arbusto' | 'hierba' | 'flores' | 'hongos' | 'escombros' | 'grieta' | 'huesos' | 'duna' | 'esquirlas';

export interface Obstacle {
  kind: ObstacleKind; x: number; y: number;
  /** Radio de colisión; 0 = decoración sin colisión */
  r: number;
  /** Escala del dibujo */
  s: number;
}

/** Radio de colisión de un jugador (lo usan el servidor y el navegador). */
export const PLAYER_RADIUS = 16;

interface KindDef { r: number; weight: number }
const SOLID: Record<number, Partial<Record<ObstacleKind, KindDef>>> = {
  1: { arbol: { r: 22, weight: 10 }, arbol_seco: { r: 16, weight: 4 }, roca: { r: 24, weight: 4 }, tocon: { r: 15, weight: 2 } },
  2: { muro: { r: 38, weight: 7 }, columna: { r: 18, weight: 6 }, farola: { r: 9, weight: 3 }, estatua: { r: 24, weight: 2 }, roca: { r: 24, weight: 3 } },
  3: { cristal: { r: 22, weight: 9 }, cactus: { r: 13, weight: 6 }, roca: { r: 24, weight: 5 }, arbol_seco: { r: 16, weight: 2 }, columna: { r: 18, weight: 1 } },
};
const DECOR: Record<number, ObstacleKind[]> = {
  1: ['arbusto', 'hierba', 'hierba', 'flores', 'hongos', 'huesos'],
  2: ['escombros', 'escombros', 'grieta', 'grieta', 'huesos', 'hierba'],
  3: ['duna', 'duna', 'duna', 'esquirlas', 'esquirlas', 'huesos', 'grieta'],
};

/** Generador pseudoaleatorio determinista (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<number, Obstacle[]>();

export function obstaclesFor(mapId: number): Obstacle[] {
  const hit = cache.get(mapId);
  if (hit) return hit;
  const W = PARAMS.worldSize;
  const rand = rng(9001 + mapId * 77);
  const solid = SOLID[mapId] ?? SOLID[1];
  const kinds = Object.entries(solid) as [ObstacleKind, KindDef][];
  const total = kinds.reduce((a, [, k]) => a + k.weight, 0);
  const out: Obstacle[] = [];

  // Obstáculos con colisión: separados entre sí y lejos del centro, donde aparecen los jugadores
  for (let tries = 0; out.length < 110 && tries < 4000; tries++) {
    const x = 80 + rand() * (W - 160), y = 80 + rand() * (W - 160);
    if (Math.hypot(x - W / 2, y - W / 2) < 280) continue;
    let pickW = rand() * total;
    const [kind, def] = kinds.find(([, k]) => (pickW -= k.weight) < 0) ?? kinds[0];
    const s = 0.85 + rand() * 0.45;
    const r = Math.round(def.r * s);
    if (out.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 110)) continue;
    out.push({ kind, x: Math.round(x), y: Math.round(y), r, s: Math.round(s * 100) / 100 });
    // A veces se agrupan: bosquecillos o restos de un edificio
    if (rand() < 0.35) {
      const n = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2, d = r * 2 + 30 + rand() * 30;
        const gx = x + Math.cos(a) * d, gy = y + Math.sin(a) * d;
        if (gx < 80 || gy < 80 || gx > W - 80 || gy > W - 80) continue;
        if (Math.hypot(gx - W / 2, gy - W / 2) < 280) continue;
        if (out.some((o) => Math.hypot(o.x - gx, o.y - gy) < o.r + r + 14)) continue;
        out.push({ kind, x: Math.round(gx), y: Math.round(gy), r, s: Math.round(s * 100) / 100 });
      }
    }
  }
  const solidCount = out.length;

  // Decoración sin colisión
  const decor = DECOR[mapId] ?? DECOR[1];
  for (let i = 0; i < 260; i++) {
    const x = 30 + rand() * (W - 60), y = 30 + rand() * (W - 60);
    const kind = decor[Math.floor(rand() * decor.length)];
    if (out.slice(0, solidCount).some((o) => Math.hypot(o.x - x, o.y - y) < o.r + 26)) continue;
    out.push({ kind, x: Math.round(x), y: Math.round(y), r: 0, s: Math.round((0.7 + rand() * 0.7) * 100) / 100 });
  }
  cache.set(mapId, out);
  return out;
}

/** Rejilla fija para consultar rápido los obstáculos con colisión cercanos a un punto. */
export class ObstacleField {
  private cells = new Map<number, Obstacle[]>();
  private readonly size = 128;
  readonly solids: Obstacle[];

  constructor(mapId: number) {
    this.solids = obstaclesFor(mapId).filter((o) => o.r > 0);
    for (const o of this.solids) {
      const x0 = Math.floor((o.x - o.r) / this.size), x1 = Math.floor((o.x + o.r) / this.size);
      const y0 = Math.floor((o.y - o.r) / this.size), y1 = Math.floor((o.y + o.r) / this.size);
      for (let cx = x0; cx <= x1; cx++)
        for (let cy = y0; cy <= y1; cy++) {
          const k = cx * 1000 + cy;
          let c = this.cells.get(k);
          if (!c) this.cells.set(k, (c = []));
          c.push(o);
        }
    }
  }

  private near(x: number, y: number, r: number, fn: (o: Obstacle) => boolean | void): boolean {
    const x0 = Math.floor((x - r) / this.size), x1 = Math.floor((x + r) / this.size);
    const y0 = Math.floor((y - r) / this.size), y1 = Math.floor((y + r) / this.size);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const c = this.cells.get(cx * 1000 + cy);
        if (c) for (const o of c) if (fn(o)) return true;
      }
    return false;
  }

  /** ¿El círculo toca algún obstáculo? */
  blocked(x: number, y: number, r: number): boolean {
    return this.near(x, y, r, (o) => (o.x - x) ** 2 + (o.y - y) ** 2 < (o.r + r) ** 2);
  }

  /** Empuja un círculo fuera de los obstáculos que toca (modifica y devuelve `pos`). */
  resolve<T extends { x: number; y: number }>(pos: T, r: number): T {
    for (let pass = 0; pass < 2; pass++) {
      this.near(pos.x, pos.y, r, (o) => {
        const dx = pos.x - o.x, dy = pos.y - o.y, min = o.r + r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) return;
        const d = Math.sqrt(d2);
        if (d < 0.001) { pos.x = o.x + min; return; }
        pos.x = o.x + (dx / d) * min;
        pos.y = o.y + (dy / d) * min;
      });
    }
    return pos;
  }
}

export interface Shrine { kind: ShrineKind; x: number; y: number }
const shrineCache = new Map<number, Shrine[]>();

/** Altares de cada mapa: uno por cuadrante, a media distancia del centro y fuera de los obstáculos. */
export function shrinesFor(mapId: number): Shrine[] {
  const hit = shrineCache.get(mapId);
  if (hit) return hit;
  const W = PARAMS.worldSize, rand = rng(4242 + mapId * 131), field = new ObstacleField(mapId);
  const kinds = [...SHRINE_KINDS];
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const start = rand() * Math.PI * 2;
  const out = kinds.map((kind, i) => {
    const a = start + (i / kinds.length) * Math.PI * 2 + (rand() - 0.5) * 0.5, d = 700 + rand() * 350;
    const pos = field.resolve({ x: W / 2 + Math.cos(a) * d, y: W / 2 + Math.sin(a) * d }, 60);
    return { kind, x: Math.round(pos.x), y: Math.round(pos.y) };
  });
  shrineCache.set(mapId, out);
  return out;
}
