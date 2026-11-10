// Pruebas de cuentas y guardado contra una base PostgreSQL real.
// Se saltan si no hay DATABASE_URL. Úsalas con una base de pruebas, nunca con la de producción:
//   DATABASE_URL=postgres://... DATABASE_SSL=off npm test
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { PARAMS } from '../src/shared/data.js';
import type { GameOver } from '../src/shared/protocol.js';
import { buyUpgrade, getProfile, history, leaderboard, loadPermBonus, login, register, unlockedOptions, updateProfile, verifyToken } from '../src/server/accounts.js';
import { pool, query } from '../src/server/db.js';
import { Game } from '../src/server/game.js';
import { saveMatch } from '../src/server/persist.js';

const skip = !process.env.DATABASE_URL;
const name = `prueba_${Date.now().toString(36)}`;
let userId = 0;

after(async () => {
  if (userId) await query('DELETE FROM usuario WHERE id_usuario = $1', [userId]);
  await query("DELETE FROM partida p WHERE NOT EXISTS (SELECT 1 FROM participacion pa WHERE pa.id_partida = p.id_partida) AND p.codigo_sala = 'TEST01'").catch(() => {});
  await pool?.end();
});

test('registro, inicio de sesión y perfil', { skip }, async () => {
  await assert.rejects(register('a', 'x@y.z', '12345678'), /usuario/);
  await assert.rejects(register(name, 'correo-malo', '12345678'), /correo/);
  await assert.rejects(register(name, `${name}@ejemplo.com`, 'corta'), /contraseña/);
  const reg = await register(name, `${name}@ejemplo.com`, 'secreto-123');
  userId = reg.account.id;
  assert.equal(verifyToken(reg.token), userId);
  assert.equal(verifyToken('token-falso'), null);
  await assert.rejects(register(name.toUpperCase(), `otro_${name}@ejemplo.com`, 'secreto-123'), /Ya existe/);

  const hash = (await query<{ contrasena_hash: string }>('SELECT contrasena_hash FROM usuario WHERE id_usuario = $1', [userId]))[0].contrasena_hash;
  assert.match(hash, /^\$2[aby]\$10\$/, 'la contraseña se guarda con bcrypt');

  await assert.rejects(login(name, 'incorrecta'), /incorrectos/);
  await assert.rejects(login('no_existe', 'secreto-123'), /incorrectos/);
  assert.equal((await login(`${name}@ejemplo.com`, 'secreto-123')).account.id, userId);

  const acc = await updateProfile(userId, 'Ángel <b>', '#ff8800');
  assert.equal(acc.displayName, 'Ángel b');
  assert.equal(acc.color, '#ff8800');
});

test('guardar una partida da experiencia, oro y progreso', { skip }, async () => {
  let over: GameOver | null = null;
  const game = new Game(1, 1, [{ id: 'p0', name: 'Ángel', character: 1 }], {
    snapshot() {}, fx() {}, announce() {}, toast() {}, offer: (id) => game.choose(id, 0), end: (r) => { over = r; },
  });
  for (let t = 0; t < 140 * PARAMS.tickRate && !over; t++) game.tick(1 / PARAMS.tickRate);
  // Fuerza una victoria para probar el desbloqueo
  const result: GameOver = { ...(over ?? { round: game.round, totalRounds: 10, seconds: 140, gold: game.gold, mapId: 1, difficultyId: 1, stats: [] }), victory: true, gold: 500, mapId: 1, difficultyId: 1 } as GameOver;
  const rewards = await saveMatch('TEST01', game, result, [{ playerId: 'p0', userId, host: true }]);
  const r = rewards.get('p0')!;
  assert.ok(r.xp > 0 && r.gold === 500, JSON.stringify(r));

  const profile = await getProfile(userId);
  assert.equal(profile.account.gold, 500);
  assert.ok(profile.account.level >= 2, 'sube de nivel de cuenta');
  assert.deepEqual(profile.progress.map((p) => [p.mapId, p.difficultyId, p.completed]), [[1, 1, true]]);
  assert.ok(unlockedOptions(profile.progress).some(([m]) => m === 2), 'se desbloquea el segundo mapa');
  assert.ok(!unlockedOptions(profile.progress).some(([m, d]) => m === 1 && d === 3), 'Difícil sigue bloqueado');
  assert.ok(!unlockedOptions([]).some(([m]) => m === 2));

  const rounds = await query('SELECT numero, tipo FROM ronda r JOIN partida p USING (id_partida) JOIN participacion pa USING (id_partida) WHERE pa.id_usuario = $1 ORDER BY numero', [userId]);
  assert.equal(rounds.length, game.rounds.length);
  const weapons = await query('SELECT e.* FROM estadistica_arma e JOIN participacion pa USING (id_participacion) WHERE pa.id_usuario = $1', [userId]);
  assert.ok(weapons.length >= 1);

  const hist = await history(userId);
  assert.equal(hist.length, 1);
  assert.equal(hist[0].result, 'victoria');
  const board = await leaderboard(1, 1);
  assert.ok(board.some((b) => b.team.includes('Ángel b')));
});

test('taller: comprar mejoras permanentes', { skip }, async () => {
  const before = await getProfile(userId);
  const vida = before.shop.find((s) => s.attr === 'vida')!;
  assert.equal(vida.cost, 100);
  await buyUpgrade(userId, vida.id);
  await buyUpgrade(userId, vida.id);
  const after2 = await getProfile(userId);
  assert.equal(after2.account.gold, 500 - 100 - 150);
  assert.equal(after2.shop.find((s) => s.attr === 'vida')!.level, 2);
  assert.deepEqual(await loadPermBonus(userId), { vida: 10 });
  await assert.rejects(buyUpgrade(userId, after2.shop.find((s) => s.attr === 'revivir')!.id), /nivel de cuenta|oro/);
  await query('UPDATE usuario SET oro = 0 WHERE id_usuario = $1', [userId]);
  await assert.rejects(buyUpgrade(userId, vida.id), /oro/);

  // La mejora se aplica dentro de la partida
  const game = new Game(1, 1, [{ id: 'p0', name: 'x', character: 1, perm: await loadPermBonus(userId) }], { snapshot() {}, fx() {}, announce() {}, toast() {}, offer() {}, end() {} });
  assert.equal(game.maxHp(game.players.get('p0')!), 110);
});
