import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIFFICULTIES, PARAMS } from '../src/shared/data.js';
import { enemiesPerWave, enemyHp } from '../src/shared/formulas.js';
import type { GameOver, Snapshot, UpgradeOption } from '../src/shared/protocol.js';
import { Game } from '../src/server/game.js';

test('fórmulas de escalado (RF18, RF19)', () => {
  const normal = DIFFICULTIES[1];
  assert.equal(enemiesPerWave(1, 1, normal), 12); // 10 × 1.15
  assert.equal(enemiesPerWave(10, 4, normal), 70); // 10 × 2.5 × 2.8
  assert.equal(enemyHp(100, 10, 1, normal), 200);
  assert.equal(enemyHp(100, 10, 4, normal), 350);
});

/** Juega una partida completa con bots que se mueven en círculo y eligen la primera mejora. */
function simulate(mapId: number, difficultyId: number, n: number, maxSeconds: number) {
  let last: Snapshot | null = null;
  let over: GameOver | null = null;
  const offers = new Map<string, UpgradeOption[]>();
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Bot ${i}`, character: (i % 4) + 1 }));
  const game = new Game(mapId, difficultyId, players, {
    snapshot: (s) => { last = s; },
    fx: () => {}, announce: () => {}, toast: () => {},
    offer: (id, opts) => offers.set(id, opts),
    end: (r) => { over = r; },
  });
  const dt = 1 / PARAMS.tickRate;
  for (let t = 0; t < maxSeconds * PARAMS.tickRate && !over; t++) {
    for (const [id] of offers) game.choose(id, 0);
    offers.clear();
    for (const p of game.players.values()) {
      const a = game.time * 0.8 + Number(p.id.slice(1));
      game.move(p.id, p.x + Math.cos(a) * 5, p.y + Math.sin(a) * 5);
    }
    game.tick(dt);
  }
  return { game, last: last as Snapshot | null, over: over as GameOver | null };
}

test('una partida corre sin errores y avanza de ronda', () => {
  const { game, last } = simulate(1, 1, 2, 200);
  assert.ok(last, 'se enviaron estados');
  assert.ok(game.round >= 3 || game.finished, `ronda ${game.round}`);
  assert.ok(game.kills > 50, `eliminados ${game.kills}`);
  assert.ok(game.enemies.size <= PARAMS.maxEnemies);
  for (const p of game.players.values()) assert.ok(p.level > 1, 'los jugadores suben de nivel');
});

test('la partida siempre termina con un resultado', () => {
  const { over } = simulate(2, 1, 4, 1500);
  assert.ok(over, 'la partida terminó');
  assert.equal(over!.stats.length, 4);
});

test('progresión de cuenta y costos del taller', async () => {
  const { accountXpToNext, applyAccountXp, matchAccountXp, upgradeCost } = await import('../src/shared/formulas.js');
  assert.equal(accountXpToNext(1), 100);
  assert.deepEqual(applyAccountXp(1, 50, 260), { level: 3, xp: 10 }); // 310 = 100 + 200 + 10
  assert.equal(matchAccountXp(10, true, 0.8), 320);
  assert.equal(matchAccountXp(4, false, 1), 80);
  assert.equal(upgradeCost(100, 1.5, 0), 100);
  assert.equal(upgradeCost(100, 1.5, 2), 225);
});

// ---------- Eventos con objetivo (RF29–RF32) ----------
function eventGame(n = 2) {
  const toasts: string[] = [];
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Bot ${i}`, character: 1 }));
  const game = new Game(1, 2, players, { snapshot() {}, fx() {}, announce() {}, toast: (m) => toasts.push(m), offer() {}, end() {} });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = game as any;
  const start = (id: string) => { g.event = id; g.rounds[g.rounds.length - 1].type = 'evento'; g.beginEvent(id); };
  const step = (seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds * PARAMS.tickRate; t++) { each?.(); game.tick(1 / PARAMS.tickRate); }
  };
  return { game, g, start, step, toasts };
}

test('evento Cazador de recompensa: se cumple al derrotar al élite', () => {
  const { game, g, start } = eventGame();
  start('cazador');
  assert.equal(game.eventGoal, false);
  assert.ok(game.hunted && game.players.has(game.hunted));
  const elites = [...game.enemies.values()].filter((e) => e.elite);
  assert.equal(elites.length, 1);
  assert.equal(elites[0].hunt, game.hunted);
  g.killEnemy(elites[0], 'p0');
  assert.equal(game.eventGoal, true);
  assert.equal(game.hunted, null);
  // Al cambiar de ronda se entrega la recompensa (RF32)
  const gold = game.gold;
  g.startRound(game.round + 1);
  assert.ok(game.gold >= gold + 150);
  assert.ok(game.rounds[0].done === true);
});

test('evento Cofre maldito: abrirlo libera élites y hay que vencerlos', () => {
  const { game, g, start, step } = eventGame();
  start('cofre');
  const chest = game.pickups.find((p) => p.type === 15);
  assert.ok(chest, 'aparece el cofre maldito');
  const p0 = game.players.get('p0')!;
  step(0.1, () => { p0.x = chest!.x; p0.y = chest!.y; });
  const elites = [...game.enemies.values()].filter((e) => e.elite);
  assert.equal(elites.length, 5, '3 + número de jugadores');
  assert.equal(game.eventGoal, false);
  for (const e of elites) g.killEnemy(e, 'p0');
  assert.equal(game.eventGoal, true);
});

test('evento Cofre maldito sin abrir: falla y no da recompensa', () => {
  const { game, g, start, toasts } = eventGame();
  start('cofre');
  const gold = game.gold;
  g.startRound(game.round + 1);
  assert.equal(game.gold, gold);
  assert.ok(toasts.some((t) => t.includes('fallido')));
  assert.ok(!game.pickups.some((p) => p.type === 15), 'el cofre desaparece');
  assert.equal(game.rounds[0].done, false);
});

test('evento Escolta: el superviviente avanza solo con un jugador cerca', () => {
  const { game, start, step } = eventGame();
  start('escolta');
  const s0 = { ...game.escort! };
  const p0 = game.players.get('p0')!, p1 = game.players.get('p1')!;
  // Lejos: no se mueve
  step(1, () => { game.enemies.clear(); p0.x = p1.x = s0.x + 600; p0.y = p1.y = s0.y; });
  assert.ok(Math.hypot(game.escort!.x - s0.x, game.escort!.y - s0.y) < 1);
  // Cerca: camina hasta la zona
  step(20, () => { game.enemies.clear(); if (game.escort) { p0.x = game.escort.x; p0.y = game.escort.y; } });
  assert.equal(game.eventGoal, true);
  assert.equal(game.escort, null);
});

test('evento Escolta: falla si los enemigos derrotan al superviviente', () => {
  const { game, g, start, step } = eventGame();
  start('escolta');
  const p0 = game.players.get('p0')!, p1 = game.players.get('p1')!;
  step(15, () => {
    if (!game.escort) return;
    p0.x = p1.x = 100; p0.y = p1.y = 100; p0.hp = p1.hp = 1000; // los jugadores lo abandonan
    for (const e of game.enemies.values()) { e.x = game.escort.x; e.y = game.escort.y; }
    if (game.enemies.size < 3) g.spawnEnemy(g.eliteDef(), game.escort.x, game.escort.y);
  });
  assert.equal(game.escort, null);
  assert.equal(game.eventGoal, false);
});

test('obstáculos: lista determinista, centro libre y colisión', async () => {
  const { obstaclesFor, ObstacleField, PLAYER_RADIUS } = await import('../src/shared/world.js');
  const { PARAMS } = await import('../src/shared/data.js');
  for (const mapId of [1, 2]) {
    const list = obstaclesFor(mapId);
    const solids = list.filter((o) => o.r > 0);
    assert.ok(solids.length >= 60, `mapa ${mapId}: pocos obstáculos (${solids.length})`);
    assert.ok(list.length > solids.length, 'debe haber decoración sin colisión');
    const c = PARAMS.worldSize / 2;
    assert.ok(solids.every((o) => Math.hypot(o.x - c, o.y - c) >= 280 - 1), 'el centro queda libre');
    const field = new ObstacleField(mapId);
    assert.equal(field.blocked(c, c, PLAYER_RADIUS), false);
    const o = solids[0];
    assert.equal(field.blocked(o.x, o.y, PLAYER_RADIUS), true);
    const pos = field.resolve({ x: o.x + 3, y: o.y + 2 }, PLAYER_RADIUS);
    assert.ok(Math.hypot(pos.x - o.x, pos.y - o.y) >= o.r + PLAYER_RADIUS - 0.01, 'el jugador queda fuera del obstáculo');
  }
});
