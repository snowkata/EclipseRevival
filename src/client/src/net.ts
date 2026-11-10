import { io, type Socket } from 'socket.io-client';
import type { ClientToServer, ServerToClient } from '../../shared/protocol.js';

export type GameSocket = Socket<ServerToClient, ClientToServer>;

// En desarrollo Vite redirige /socket.io al servidor (puerto 3000).
// VITE_SERVER_URL permite apuntar a un servidor en otro dominio.
export const socket: GameSocket = io(import.meta.env.VITE_SERVER_URL ?? undefined, {
  transports: ['websocket', 'polling'],
  // El token de la cuenta viaja al conectarse; sin token se entra como invitado
  auth: (cb) => cb({ token: getToken() }),
});

const TOKEN_KEY = 'er:token';
export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* almacenamiento no disponible */ }
  // Reconecta para que el servidor sepa con qué cuenta se juega
  socket.disconnect().connect();
}

/** Llama a la API de cuentas del servidor. */
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${import.meta.env.VITE_SERVER_URL ?? ''}/api${path}`, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'No se pudo conectar con el servidor.');
  return data as T;
}

const KEY = 'eclipse-revival:session';
export interface Session { code: string; token: string }

export function saveSession(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch { /* almacenamiento no disponible */ }
}
export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
