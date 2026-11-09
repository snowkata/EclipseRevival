import { io, type Socket } from 'socket.io-client';
import type { ClientToServer, ServerToClient } from '../../shared/protocol.js';

export type GameSocket = Socket<ServerToClient, ClientToServer>;

// En desarrollo Vite redirige /socket.io al servidor (puerto 3000).
// VITE_SERVER_URL permite apuntar a un servidor en otro dominio.
export const socket: GameSocket = io(import.meta.env.VITE_SERVER_URL ?? undefined, {
  transports: ['websocket', 'polling'],
});

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
