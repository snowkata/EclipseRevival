// Protecciones básicas del servidor: límites de uso, IP real detrás del proxy del hosting
// y validación de los datos que manda el navegador (nunca hay que confiar en ellos).
import type { IncomingMessage } from 'node:http';

export const isProduction = process.env.NODE_ENV === 'production';

/**
 * Cuántos proxies hay delante del servidor. En Render, Railway o Fly.io hay uno,
 * así que en producción se usa 1. Sirve para leer la IP real del jugador.
 */
export const trustProxyHops = Number(process.env.TRUST_PROXY ?? (isProduction ? 1 : 0)) || 0;

/** IP del cliente, con la misma regla que usa Express con `trust proxy` numérico. */
export function clientIp(req: IncomingMessage): string {
  const remote = req.socket.remoteAddress ?? 'desconocida';
  if (!trustProxyHops) return remote;
  const header = req.headers['x-forwarded-for'];
  const forwarded = (Array.isArray(header) ? header.join(',') : header ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const chain = [remote, ...forwarded.reverse()];
  return chain[Math.min(trustProxyHops, chain.length - 1)];
}

/** Cuenta acciones por clave (IP, sala…) dentro de una ventana de tiempo. */
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(private max: number, private windowMs: number) {
    setInterval(() => {
      const now = Date.now();
      for (const [k, h] of this.hits) if (h.reset < now) this.hits.delete(k);
    }, Math.max(windowMs, 10_000)).unref();
  }
  /** Suma un intento. Devuelve false si se pasó del límite. */
  take(key: string): boolean {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || h.reset < now) { this.hits.set(key, { n: 1, reset: now + this.windowMs }); return true; }
    return ++h.n <= this.max;
  }
}

/** Contador de conexiones abiertas por IP. */
export class ConnectionCounter {
  private open = new Map<string, number>();
  constructor(private max: number) {}
  add(ip: string): boolean {
    const n = this.open.get(ip) ?? 0;
    if (n >= this.max) return false;
    this.open.set(ip, n + 1);
    return true;
  }
  remove(ip: string) {
    const n = (this.open.get(ip) ?? 1) - 1;
    if (n <= 0) this.open.delete(ip); else this.open.set(ip, n);
  }
}

// ---------- Validación de datos que llegan por el socket ----------
export type Obj = Record<string, unknown>;
export const asObject = (v: unknown): Obj | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
export const asInt = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) ? v : undefined);
export const asString = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length <= max ? v : undefined);

/** Cabeceras HTTP que hacen más difícil abusar de la página (clickjacking, scripts inyectados…). */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' ws: wss:",
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; '),
};
