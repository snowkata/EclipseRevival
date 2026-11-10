import { PARAMS, PLAYER_SCALING, type DifficultyDef } from './data.js';

const clampPlayers = (n: number) => Math.min(4, Math.max(1, n));

/** RF18: enemigos de cada oleada = base × (1 + 0.15 × ronda) × factorJugadores × multiplicadorModo. */
export function enemiesPerWave(round: number, players: number, diff: DifficultyDef): number {
  const f = PLAYER_SCALING[clampPlayers(players)].count;
  return Math.round(PARAMS.baseEnemies * (1 + PARAMS.countPerRound * round) * f * diff.mCount);
}

/** RF19: vida = vidaBase × (1 + 0.10 × ronda) × (1 + 0.25 × (jugadores − 1)) × multiplicadorModo. */
export function enemyHp(baseHp: number, round: number, players: number, diff: DifficultyDef): number {
  return Math.round(baseHp * (1 + PARAMS.hpPerRound * round) * (1 + 0.25 * (clampPlayers(players) - 1)) * diff.mHp);
}

/** Experiencia necesaria para pasar del nivel `level` al siguiente. */
export function xpToNext(level: number): number {
  return Math.round(5 + level * 8 + Math.pow(level, 1.6) * 2);
}

/** Nivel de un arma: daño = base × (1 + bono × (nivel − 1)). */
export function weaponLevelMult(perLevel: number, level: number): number {
  return 1 + perLevel * (level - 1);
}

/** Cantidad de orbes de un arma de órbita según su nivel. */
export const orbitCount = (level: number, evolved: boolean) => (evolved ? 6 : 1 + Math.floor(level / 3));
/** Velocidad angular de las órbitas (rad/s). */
export const ORBIT_SPEED = 3.2;
/** Ángulo del orbe i en el tiempo t (segundos) — lo usan servidor y cliente para dibujar lo mismo. */
export function orbitAngle(t: number, i: number, count: number): number {
  return t * ORBIT_SPEED + (i * Math.PI * 2) / count;
}

/** Experiencia de cuenta necesaria para pasar del nivel `level` al siguiente. */
export const accountXpToNext = (level: number) => 100 * level;

/** Aplica experiencia de cuenta y devuelve el nuevo nivel y la experiencia restante. */
export function applyAccountXp(level: number, xp: number, gained: number): { level: number; xp: number } {
  xp += gained;
  while (xp >= accountXpToNext(level)) { xp -= accountXpToNext(level); level++; }
  return { level, xp };
}

/** RF37: experiencia de cuenta según resultado, ronda alcanzada y modo. */
export function matchAccountXp(round: number, victory: boolean, mReward: number): number {
  return Math.round((round * 20 + (victory ? 200 : 0)) * mReward);
}

/** Costo del siguiente nivel de una mejora permanente (nivel actual 0 = primera compra). */
export function upgradeCost(base: number, increment: number, currentLevel: number): number {
  return Math.round(base * Math.pow(increment, currentLevel));
}
