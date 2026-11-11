// Conexión a PostgreSQL (Supabase). Si no hay DATABASE_URL el juego funciona
// en "modo invitado": se puede jugar, pero sin cuentas ni progreso guardado.
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;

/**
 * La conexión va cifrada y verificando el certificado del servidor (RNF11).
 * Supabase firma con su propia autoridad: descarga el certificado en
 * Database > Settings > SSL Configuration y pon su ruta en DATABASE_CA_FILE.
 * Solo una base local (DATABASE_SSL=off) se conecta sin cifrado.
 */
function sslConfig(): pg.PoolConfig['ssl'] {
  if (process.env.DATABASE_SSL === 'off') return undefined;
  // El certificado puede venir pegado en DATABASE_CA o como archivo en DATABASE_CA_FILE
  // (en Render: "Secret Files", que quedan en /etc/secrets/<nombre>)
  if (process.env.DATABASE_CA) return { ca: process.env.DATABASE_CA.replace(/\\n/g, '\n') };
  const caFile = process.env.DATABASE_CA_FILE;
  if (!caFile) return true;
  try {
    return { ca: readFileSync(caFile, 'utf8') };
  } catch {
    console.error(`[bd] No se encontró el certificado ${caFile}. Revisa DATABASE_CA_FILE.`);
    return true;
  }
}

export const pool: pg.Pool | null = url ? new pg.Pool({ connectionString: url, max: 10, ssl: sslConfig() }) : null;

pool?.on('error', (err) => console.error('[bd] error de conexión:', err.message));

export const dbEnabled = () => pool !== null;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!pool) throw new Error('Base de datos no configurada');
  return (await pool.query<T>(text, params)).rows;
}

/** Ejecuta varias consultas en una transacción. */
export async function transaction<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  if (!pool) throw new Error('Base de datos no configurada');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDb(): Promise<string> {
  if (!pool) return 'sin base de datos (modo invitado)';
  try {
    const rows = await query<{ n: string }>("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'usuario'");
    return rows[0].n === '1' ? 'conectada' : 'conectada, pero faltan las tablas (ejecuta db/eclipse_revival.sql)';
  } catch (err) {
    return `error: ${(err as Error).message}`;
  }
}
