import Phaser from 'phaser';
import { CHARACTERS, DIFFICULTIES, MAPS, characterById, difficultyById, mapById, passiveById, weaponById } from '../../shared/data.js';
import type { Announcement, GameOver, Snapshot, UpgradeOption } from '../../shared/protocol.js';
import { loadSession, saveSession, socket } from './net.js';
import { GameScene, bossHp, bossName } from './scenes/GameScene.js';
import { state } from './state.js';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const show = (id: string, on: boolean) => $(id).classList.toggle('hidden', !on);

// ---------- Phaser ----------
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#07060d',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  input: { gamepad: true },
  render: { antialias: true },
  scene: [],
});
game.scene.add('game', GameScene, false);

// ---------- Menú ----------
let myChar = Number(localStorage.getItem('er:char') ?? 1) || 1;
const nameInput = $<HTMLInputElement>('in-name');
nameInput.value = localStorage.getItem('er:name') ?? '';

function fillSelects(mapSel: HTMLSelectElement, diffSel: HTMLSelectElement) {
  mapSel.innerHTML = MAPS.map((m) => `<option value="${m.id}" ${m.available ? '' : 'disabled'}>${m.name}${m.available ? '' : ' (próximamente)'}</option>`).join('');
  diffSel.innerHTML = DIFFICULTIES.map((d) => `<option value="${d.id}">${d.name} · ${d.rounds} rondas</option>`).join('');
  diffSel.value = '2';
}
fillSelects($('in-map'), $('in-diff'));
fillSelects($('lb-map'), $('lb-diff'));

function renderChars(containerId: string) {
  $(containerId).innerHTML = CHARACTERS.map((c) => `
    <div class="char ${c.id === myChar ? 'sel' : ''}" data-id="${c.id}">
      <span class="dot" style="background:#${c.color.toString(16).padStart(6, '0')}"></span><b>${c.name}</b>
      <small>❤ ${c.hp} · 👟 ${c.speed}<br>${c.ability}<br>Arma: ${weaponById(c.startWeapon).name}</small>
    </div>`).join('');
}
for (const id of ['menu-chars', 'lobby-chars']) {
  $(id).addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('.char');
    if (!el) return;
    myChar = Number(el.dataset.id);
    localStorage.setItem('er:char', String(myChar));
    renderChars('menu-chars');
    renderChars('lobby-chars');
    if (state.lobby) socket.emit('setCharacter', myChar);
  });
}
renderChars('menu-chars');

const myName = () => {
  const n = nameInput.value.trim() || 'Jugador';
  localStorage.setItem('er:name', n);
  return n;
};

$('btn-create').onclick = () => {
  $('menu-error').textContent = '';
  socket.emit('createRoom', { name: myName(), character: myChar, mapId: Number($<HTMLSelectElement>('in-map').value), difficultyId: Number($<HTMLSelectElement>('in-diff').value) });
};
$('btn-join').onclick = () => {
  const code = $<HTMLInputElement>('in-code').value.trim().toUpperCase();
  if (code.length !== 6) { $('menu-error').textContent = 'El código tiene 6 caracteres.'; return; }
  $('menu-error').textContent = '';
  socket.emit('joinRoom', { code, name: myName(), character: myChar });
};

// Enlace de invitación: ?sala=CODIGO (RF06)
const urlCode = new URLSearchParams(location.search).get('sala');
if (urlCode) $<HTMLInputElement>('in-code').value = urlCode.toUpperCase();

// ---------- Lobby ----------
$('btn-copy').onclick = async () => {
  const link = `${location.origin}${location.pathname}?sala=${state.lobby?.code ?? ''}`;
  try { await navigator.clipboard.writeText(link); toast('Enlace copiado'); } catch { prompt('Copia este enlace:', link); }
};
$('btn-leave').onclick = () => { socket.emit('leaveRoom'); leaveToMenu(); };
$('btn-ready').onclick = () => {
  const me = state.lobby?.players.find((p) => p.id === state.you);
  socket.emit('setReady', !me?.ready);
};
$('btn-start').onclick = () => socket.emit('startGame');
$('lb-map').onchange = () => socket.emit('setOptions', { mapId: Number($<HTMLSelectElement>('lb-map').value) });
$('lb-diff').onchange = () => socket.emit('setOptions', { difficultyId: Number($<HTMLSelectElement>('lb-diff').value) });

function leaveToMenu() {
  saveSession(null);
  state.lobby = null;
  state.inGame = false;
  history.replaceState(null, '', location.pathname);
  stopGame();
  showScreen('menu');
}

function showScreen(which: 'menu' | 'lobby' | 'game' | 'end') {
  show('menu', which === 'menu');
  show('lobby', which === 'lobby');
  show('end', which === 'end');
  show('hud', which === 'game');
  if (which !== 'game') show('levelup', false);
}

function renderLobby() {
  const l = state.lobby;
  if (!l) return;
  const me = l.players.find((p) => p.id === state.you);
  const isHost = !!me?.host;
  $('lobby-code').textContent = l.code;
  $('lobby-count').textContent = `(${l.players.length}/4)`;
  $('lobby-players').innerHTML = l.players.map((p) => {
    const c = characterById(p.character);
    const tag = p.host ? 'Anfitrión' : p.ready ? '<span class="ready">Listo</span>' : 'Esperando…';
    return `<li><span class="dot" style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#${c.color.toString(16).padStart(6, '0')}"></span>
      <b>${esc(p.name)}</b> <small>${c.name}</small>${p.connected ? '' : ' <small>(desconectado)</small>'}<span class="tag">${tag}</span></li>`;
  }).join('');
  const mapSel = $<HTMLSelectElement>('lb-map'), diffSel = $<HTMLSelectElement>('lb-diff');
  mapSel.value = String(l.mapId); diffSel.value = String(l.difficultyId);
  mapSel.disabled = diffSel.disabled = !isHost;
  const d = difficultyById(l.difficultyId);
  $('lb-map-desc').textContent = `${mapById(l.mapId).desc} ${d.name}: ${d.rounds} rondas de ${60} s, jefe cada 5 rondas y jefe final en la última.`;
  show('btn-start', isHost);
  show('btn-ready', !isHost);
  $('btn-ready').textContent = me?.ready ? 'No estoy listo' : 'Estoy listo';
  $('btn-ready').classList.toggle('on', !!me?.ready);
  const allReady = l.players.filter((p) => !p.host && p.connected).every((p) => p.ready);
  $<HTMLButtonElement>('btn-start').disabled = !allReady;
  if (me && me.character !== myChar) { myChar = me.character; }
  renderChars('lobby-chars');
}

// ---------- Eventos del servidor ----------
socket.on('connect', () => {
  const s = loadSession();
  if (s && !state.lobby) socket.emit('joinRoom', { code: s.code, token: s.token, name: myName(), character: myChar });
});

socket.on('joined', ({ you, token, code }) => {
  state.you = you;
  saveSession({ code, token });
  history.replaceState(null, '', `${location.pathname}?sala=${code}`);
});

socket.on('lobby', (l) => {
  const first = !state.lobby;
  state.lobby = l;
  state.mapId = l.mapId;
  state.difficultyId = l.difficultyId;
  if (l.phase === 'lobby') {
    if (state.inGame || first || !$('end').classList.contains('hidden')) {
      state.inGame = false;
      stopGame();
    }
    showScreen('lobby');
  }
  renderLobby();
});

socket.on('errorMsg', (msg) => {
  const target = state.lobby ? 'lobby-error' : 'menu-error';
  $(target).textContent = msg;
  if (!state.lobby && loadSession()) saveSession(null);
  setTimeout(() => { $(target).textContent = ''; }, 5000);
});

socket.on('start', ({ mapId, difficultyId }) => {
  state.mapId = mapId;
  state.difficultyId = difficultyId;
  state.snap = null;
  state.inGame = true;
  showScreen('game');
  stopGame();
  game.scene.start('game');
});

function stopGame() {
  if (game.scene.isActive('game') || game.scene.isPaused('game')) game.scene.stop('game');
  pendingOffer = null;
}

let lastHud = 0;
socket.on('snap', (s) => {
  const now = performance.now();
  if (now - lastHud > 100) { lastHud = now; renderHud(s); }
});

// ---------- HUD ----------
function renderHud(s: Snapshot) {
  const me = s.players.find((p) => p.id === state.you);
  $('hud-round').textContent = s.round >= s.totalRounds ? 'Ronda final' : `Ronda ${s.round}/${s.totalRounds}`;
  $('hud-timer').textContent = s.roundLeft < 0 ? '∞' : String(s.roundLeft);
  $('hud-gold').textContent = String(s.gold);
  $('hud-kills').textContent = String(s.kills);
  const ev = s.event === 'eclipse' ? '🌑 Eclipse total' : s.event === 'meteoros' ? '☄ Lluvia de meteoros' : '';
  $('hud-event').textContent = ev;
  show('hud-event', !!ev);
  const bn = bossName(s);
  show('hud-boss', !!bn);
  if (bn) { $('boss-name').textContent = bn; $('boss-bar').style.width = `${bossHp(s) * 100}%`; }

  if (me) {
    $('hud-hp').textContent = `${me.hp} / ${me.maxHp}`;
    $('hud-hp-bar').style.width = `${(me.hp / me.maxHp) * 100}%`;
    $('hud-xp-bar').style.width = `${(me.xp / me.xpNext) * 100}%`;
    $('hud-level').textContent = `Nv ${me.level}`;
    $('hud-weapons').innerHTML = me.weapons.map(([id, lvl]) => `<div class="slot" title="${weaponById(id).name}">${short(weaponById(id).name)}<i>${weaponById(id).isEvolution ? '★' : lvl}</i></div>`).join('');
    $('hud-passives').innerHTML = me.passives.map(([id, lvl]) => `<div class="slot" title="${passiveById(id).name}">${short(passiveById(id).name)}<i>${lvl}</i></div>`).join('');
    const pend = me.pendingLevelUps - (pendingOffer ? 1 : 0);
    $('hud-pending').textContent = `Mejoras pendientes: ${me.pendingLevelUps}`;
    show('hud-pending', pend > 0 && !pendingOffer);
  }
  $('hud-team').innerHTML = s.players.filter((p) => p.id !== state.you).map((p) => `
    <div class="mate ${p.down ? 'down' : ''}">${esc(p.name)} · Nv ${p.level}${p.down ? ' · <b>CAÍDO</b>' : ''}${p.connected ? '' : ' · desconectado'}
      <div class="bar"><div style="width:${(p.hp / p.maxHp) * 100}%"></div></div></div>`).join('');
}
const short = (n: string) => n.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase();

// ---------- Subir de nivel ----------
let pendingOffer: UpgradeOption[] | null = null;
socket.on('levelUp', (opts) => {
  pendingOffer = opts;
  $('levelup-cards').innerHTML = opts.map((o, i) => `
    <button class="card" data-i="${i}">
      <span class="k">[${i + 1}] ${o.kind === 'weapon' ? 'Arma' : o.kind === 'passive' ? 'Pasiva' : 'Extra'}</span>
      ${o.isNew ? '<span class="new">Nueva</span>' : ''}
      <b>${esc(o.name)}${o.level > 1 ? ` · Nv ${o.level}` : ''}</b><small>${esc(o.desc)}</small>
    </button>`).join('');
  show('levelup', true);
});
function choose(i: number) {
  if (!pendingOffer || !pendingOffer[i]) return;
  pendingOffer = null;
  show('levelup', false);
  socket.emit('chooseUpgrade', i);
}
$('levelup-cards').addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('.card');
  if (el) choose(Number(el.dataset.i));
});
window.addEventListener('keydown', (ev) => {
  if (!state.inGame) return;
  if (ev.key === '1' || ev.key === '2' || ev.key === '3') choose(Number(ev.key) - 1);
  if (ev.key === 'f' || ev.key === 'F') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
});

// ---------- Avisos ----------
let announceTimer = 0;
socket.on('announce', (a: Announcement) => {
  const el = $('announce');
  el.className = `announce show ${a.tone}`;
  el.innerHTML = `<h2>${esc(a.title)}</h2>${a.subtitle ? `<p>${esc(a.subtitle)}</p>` : ''}`;
  clearTimeout(announceTimer);
  announceTimer = window.setTimeout(() => el.classList.remove('show'), 3200);
});
function toast(msg: string) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 4000);
}
socket.on('toast', toast);
socket.on('disconnect', () => { if (state.lobby) toast('Conexión perdida. Reconectando…'); });

// ---------- Fin de partida ----------
socket.on('gameOver', (r: GameOver) => {
  state.inGame = false;
  $('end-title').textContent = r.victory ? 'Victoria' : 'Derrota';
  const m = Math.floor(r.seconds / 60), sec = String(r.seconds % 60).padStart(2, '0');
  $('end-sub').textContent = `${mapById(r.mapId).name} · ${difficultyById(r.difficultyId).name} · Ronda ${r.round}/${r.totalRounds} · ${m}:${sec} · ${r.gold} de oro`;
  $('end-stats').innerHTML = r.stats.map((p) => `<tr><td>${esc(p.name)} <small>(${characterById(p.character).name})</small></td><td>${p.level}</td><td>${p.kills}</td><td>${p.damageDealt}</td><td>${p.damageTaken}</td><td>${p.revives}</td></tr>`).join('');
  $('end-weapons').innerHTML = r.stats.map((p) => `<div><b>${esc(p.name)}</b>: ${p.weaponDamage.sort((a, b) => b[1] - a[1]).map(([id, d]) => `${weaponById(id).name} ${d}`).join(' · ') || '—'}</div>`).join('');
  showScreen('end');
});
$('btn-back').onclick = () => socket.emit('backToLobby');
