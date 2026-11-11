import type { LobbyState, Snapshot } from '../../shared/protocol.js';

/** Estado compartido entre la interfaz (HTML) y la escena del juego (Phaser). */
export const state = {
  you: '' as string,
  lobby: null as LobbyState | null,
  snap: null as Snapshot | null,
  mapId: 1,
  difficultyId: 2,
  inGame: false,
  /** Recarga del impulso del jugador local: 0 = recién usado, 1 = listo */
  dashReady: 1,
};
