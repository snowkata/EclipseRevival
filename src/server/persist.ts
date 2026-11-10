// Guarda una partida terminada y reparte la progresión de cuenta (RF35, RF37, RF38).
import { EVENTS, difficultyById } from '../shared/data.js';
import { applyAccountXp, matchAccountXp } from '../shared/formulas.js';
import type { GameOver, Reward } from '../shared/protocol.js';
import { transaction } from './db.js';
import type { Game } from './game.js';

export interface Participant { playerId: string; userId: number; host: boolean }

/**
 * Inserta partida, rondas, participaciones, elecciones de nivel y estadísticas por arma,
 * y actualiza la experiencia, el oro y el progreso de mapa de cada usuario registrado.
 * Los invitados juegan, pero no se guardan (la tabla participacion exige un usuario).
 */
export async function saveMatch(code: string, game: Game, result: GameOver, participants: Participant[]): Promise<Map<string, Reward>> {
  const rewards = new Map<string, Reward>();
  const present = participants.filter((p) => game.players.has(p.playerId));
  if (!present.length) return rewards;
  const diff = difficultyById(result.difficultyId);

  await transaction(async (c) => {
    const partida = await c.query<{ id_partida: number }>(
      `INSERT INTO partida (codigo_sala, id_mapa, id_dificultad, num_jugadores, fecha_inicio, fecha_fin, ronda_alcanzada, resultado)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP - make_interval(secs => $5), CURRENT_TIMESTAMP, $6, $7) RETURNING id_partida`,
      [code, result.mapId, result.difficultyId, Math.min(4, Math.max(1, game.players.size)), result.seconds, result.round, result.victory ? 'victoria' : 'derrota']);
    const idPartida = partida.rows[0].id_partida;

    // Rondas jugadas
    const events = await c.query<{ id_evento: number; nombre: string }>('SELECT id_evento, nombre FROM evento_especial');
    const roundIds = new Map<number, number>();
    for (const r of game.rounds) {
      const evName = r.event ? EVENTS.find((e) => e.id === r.event)?.name : null;
      const idEvento = evName ? events.rows.find((e) => e.nombre === evName)?.id_evento ?? null : null;
      const row = await c.query<{ id_ronda: number }>(
        `INSERT INTO ronda (id_partida, numero, tipo, id_evento, enemigos_eliminados, objetivo_cumplido)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_ronda`, [idPartida, r.number, r.type, idEvento, r.kills, r.done]);
      roundIds.set(r.number, row.rows[0].id_ronda);
    }

    for (const part of present) {
      const p = game.players.get(part.playerId)!;
      const xp = matchAccountXp(result.round, result.victory, diff.mReward);
      const gold = Math.round(result.gold * (1 + (p.perm.oro ?? 0) / 100)); // mejora Codicia
      const row = await c.query<{ id_participacion: number }>(
        `INSERT INTO participacion (id_partida, id_usuario, id_personaje, es_anfitrion, nivel_final, enemigos_eliminados,
                                    dano_recibido, companeros_revividos, oro_ganado, xp_cuenta_ganada)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id_participacion`,
        [idPartida, part.userId, p.char.id, part.host, p.level, p.kills, Math.round(p.damageTaken), p.revives, gold, xp]);
      const idPart = row.rows[0].id_participacion;

      for (const [weaponId, dmg] of p.weaponDamage) {
        if (weaponId <= 0) continue;
        const owned = p.weapons.find((w) => w.def.id === weaponId);
        await c.query(
          'INSERT INTO estadistica_arma (id_participacion, id_arma, nivel_final, dano_causado, eliminaciones) VALUES ($1, $2, $3, $4, $5)',
          [idPart, weaponId, owned?.level ?? 1, Math.round(dmg), p.weaponKills.get(weaponId) ?? 0]);
      }
      for (const ch of p.choices) {
        const idRonda = roundIds.get(ch.round);
        if (idRonda) await c.query(
          'INSERT INTO eleccion_nivel (id_participacion, id_ronda, id_arma, id_pasiva, nivel_jugador) VALUES ($1, $2, $3, $4, $5)',
          [idPart, idRonda, ch.weapon, ch.passive, ch.level]);
      }

      // Progresión de la cuenta
      const user = (await c.query<{ nivel_cuenta: number; xp_cuenta: number }>(
        'SELECT nivel_cuenta, xp_cuenta FROM usuario WHERE id_usuario = $1 FOR UPDATE', [part.userId])).rows[0];
      if (!user) continue;
      const next = applyAccountXp(user.nivel_cuenta, user.xp_cuenta, xp);
      await c.query('UPDATE usuario SET nivel_cuenta = $2, xp_cuenta = $3, oro = oro + $4 WHERE id_usuario = $1', [part.userId, next.level, next.xp, gold]);
      await c.query(
        `INSERT INTO progreso_mapa (id_usuario, id_mapa, id_dificultad, completado, mejor_ronda, mejor_tiempo_seg)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id_usuario, id_mapa, id_dificultad) DO UPDATE SET
           completado = progreso_mapa.completado OR EXCLUDED.completado,
           mejor_ronda = GREATEST(progreso_mapa.mejor_ronda, EXCLUDED.mejor_ronda),
           mejor_tiempo_seg = LEAST(progreso_mapa.mejor_tiempo_seg, EXCLUDED.mejor_tiempo_seg)`,
        [part.userId, result.mapId, result.difficultyId, result.victory, result.round, result.victory ? result.seconds : null]);
      rewards.set(part.playerId, { xp, gold, level: next.level, leveledUp: next.level > user.nivel_cuenta });
    }
  });
  return rewards;
}
