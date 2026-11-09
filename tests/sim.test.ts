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
