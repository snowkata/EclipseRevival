// Interfaz de cuentas: sesión, perfil, taller de mejoras, clasificación e historial.
import { DIFFICULTIES, MAPS } from '../../shared/data.js';
import type { Account, HistoryRow, LeaderboardRow, Profile } from '../../shared/protocol.js';
import { api, getToken, setToken } from './net.js';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const time = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export const session = {
  /** El servidor tiene base de datos (si no, solo hay modo invitado con todo desbloqueado). */
  enabled: false,
  profile: null as Profile | null,
};
export const accountLevel = () => session.profile?.account.level ?? 1;

let onChange: () => void = () => {};

export async function initAccount(changed: () => void) {
  onChange = changed;
  try {
    session.enabled = (await api<{ accounts: boolean }>('/status')).accounts;
  } catch {
    session.enabled = false;
  }
  if (session.enabled && getToken()) await refreshProfile(false);
  renderBar();
  onChange();
}

export async function refreshProfile(notify = true) {
  if (!session.enabled || !getToken()) return;
  try {
    session.profile = await api<Profile>('/me');
  } catch {
    // Sesión vencida (24 h) o cuenta eliminada
    session.profile = null;
    setToken(null);
  }
  renderBar();
  if (notify) onChange();
}

function setSession(token: string, account: Account) {
  session.profile = { account, shop: [], progress: [] };
  setToken(token);
  closeModal();
  void refreshProfile();
}

function logout() {
  session.profile = null;
  setToken(null);
  renderBar();
  onChange();
}

// ---------- Barra de cuenta del menú ----------
function renderBar() {
  const bar = $('account-bar');
  bar.classList.toggle('hidden', !session.enabled);
  $('name-field').classList.toggle('hidden', !!session.profile);
  if (!session.enabled) return;
  const a = session.profile?.account;
  if (!a) {
    bar.innerHTML = `<div class="who"><b>Invitado</b><br><small class="hint">Inicia sesión para guardar tu progreso y desbloquear mejoras.</small></div>
      <button data-act="login" class="primary">Iniciar sesión</button><button data-act="register">Crear cuenta</button><button data-act="board">Clasificación</button>`;
    return;
  }
  bar.innerHTML = `<div class="who"><b>${esc(a.displayName)}</b> · Nivel ${a.level} · <span class="gold">💰 ${a.gold}</span>
      <div class="xp" title="${a.xp} / ${a.xpNext} XP"><div style="width:${(a.xp / a.xpNext) * 100}%"></div></div></div>
    <button data-act="shop" class="primary">Taller</button><button data-act="board">Clasificación</button>
    <button data-act="history">Historial</button><button data-act="profile">Perfil</button><button data-act="logout">Salir</button>`;
}

$('account-bar').addEventListener('click', (ev) => {
  const act = (ev.target as HTMLElement).closest<HTMLElement>('button')?.dataset.act;
  if (act === 'login') openAuth('login');
  else if (act === 'register') openAuth('register');
  else if (act === 'shop') void openShop();
  else if (act === 'board') void openBoard();
  else if (act === 'history') void openHistory();
  else if (act === 'profile') openProfile();
  else if (act === 'logout') logout();
});

// ---------- Ventana ----------
function openModal(html: string) {
  $('modal-body').innerHTML = html;
  $('modal').classList.remove('hidden');
}
function closeModal() { $('modal').classList.add('hidden'); }
$('modal-close').onclick = closeModal;
$('modal').addEventListener('click', (ev) => { if (ev.target === $('modal')) closeModal(); });

function field(id: string) { return ($(id) as HTMLInputElement).value; }
function fail(err: unknown) { $('modal-error').textContent = (err as Error).message; }

function openAuth(mode: 'login' | 'register') {
  const reg = mode === 'register';
  openModal(`
    <h2>${reg ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
    <form id="auth-form">
      ${reg
        ? `<label>Nombre de usuario <input id="f-user" required minlength="3" maxlength="30" autocomplete="username" /></label>
           <label>Correo <input id="f-email" type="email" required maxlength="100" autocomplete="email" /></label>`
        : `<label>Usuario o correo <input id="f-user" required autocomplete="username" /></label>`}
      <label>Contraseña <input id="f-pass" type="password" required minlength="8" maxlength="72" autocomplete="${reg ? 'new-password' : 'current-password'}" /></label>
      <button class="primary" type="submit">${reg ? 'Crear cuenta' : 'Entrar'}</button>
      <button type="button" id="auth-switch">${reg ? 'Ya tengo cuenta' : 'Crear una cuenta nueva'}</button>
    </form>
    <p id="modal-error" class="error"></p>`);
  $('auth-switch').onclick = () => openAuth(reg ? 'login' : 'register');
  $<HTMLFormElement>('auth-form').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const out = reg
        ? await api<{ token: string; account: Account }>('/register', { body: { username: field('f-user'), email: field('f-email'), password: field('f-pass') } })
        : await api<{ token: string; account: Account }>('/login', { body: { identifier: field('f-user'), password: field('f-pass') } });
      setSession(out.token, out.account);
    } catch (err) { fail(err); }
  };
}

function openProfile() {
  const a = session.profile?.account;
  if (!a) return;
  openModal(`
    <h2>Perfil</h2>
    <form id="profile-form">
      <label>Nombre visible <input id="f-name" required minlength="2" maxlength="16" value="${esc(a.displayName)}" /></label>
      <label>Color del avatar <input id="f-color" type="color" value="${a.color ?? '#b388ff'}" style="height:44px;padding:4px" /></label>
      <button class="primary" type="submit">Guardar</button>
    </form>
    <p class="hint">Usuario: ${esc(a.username)}</p>
    <p id="modal-error" class="error"></p>`);
  $<HTMLFormElement>('profile-form').onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await api('/profile', { method: 'PATCH', body: { displayName: field('f-name'), color: field('f-color') } });
      closeModal();
      // Reconecta para que la sala use el nombre nuevo
      setToken(getToken());
      await refreshProfile();
    } catch (err) { fail(err); }
  };
}

const ATTR_UNIT: Record<string, string> = {
  vida: '% de vida máxima', dano: '% de daño', velocidad: '% de velocidad', iman: '% de radio de recogida',
  armadura: ' de daño recibido menos', suerte: '% de botín', oro: '% de oro por partida', revivir: ' revivir automático por partida',
};

async function openShop() {
  await refreshProfile(false);
  const p = session.profile;
  if (!p) return;
  const items = p.shop.map((it) => {
    const pips = '●'.repeat(it.level) + '○'.repeat(it.maxLevel - it.level);
    const btn = it.locked ? `<button disabled>Nivel de cuenta ${it.levelReq}</button>`
      : it.cost === null ? '<button disabled>Al máximo</button>'
      : `<button data-buy="${it.id}" ${p.account.gold < it.cost ? 'disabled' : ''} class="primary">Comprar · 💰 ${it.cost}</button>`;
    return `<div class="item ${it.locked ? 'locked' : ''}"><b>${esc(it.name)}</b> <span class="pips">${pips}</span>
      <small>+${it.perLevel}${ATTR_UNIT[it.attr] ?? ''} por nivel</small>${btn}</div>`;
  }).join('');
  openModal(`<h2>Taller</h2><p class="hint">Mejoras permanentes para todas tus partidas. Tienes <span class="gold">💰 ${p.account.gold}</span> · Nivel de cuenta ${p.account.level}</p>
    <div class="shop" id="shop-items">${items}</div><p id="modal-error" class="error"></p>`);
  $('shop-items').onclick = async (ev) => {
    const id = (ev.target as HTMLElement).closest<HTMLElement>('button')?.dataset.buy;
    if (!id) return;
    try {
      session.profile = await api<Profile>('/shop/buy', { body: { id: Number(id) } });
      renderBar();
      await openShop();
    } catch (err) { fail(err); }
  };
}

const RESULT: Record<string, string> = { victoria: 'Victoria', derrota: 'Derrota', abandonada: 'Abandonada', en_curso: 'En curso' };

async function openBoard(mapId = 1, diffId = 2) {
  openModal(`<h2>Clasificación</h2>
    <div class="row"><label class="col">Mapa <select id="b-map">${MAPS.filter((m) => m.available).map((m) => `<option value="${m.id}" ${m.id === mapId ? 'selected' : ''}>${m.name}</option>`).join('')}</select></label>
    <label class="col">Dificultad <select id="b-diff">${DIFFICULTIES.map((d) => `<option value="${d.id}" ${d.id === diffId ? 'selected' : ''}>${d.name}</option>`).join('')}</select></label></div>
    <div id="b-table" class="table-wrap"><p class="hint">Cargando…</p></div><p id="modal-error" class="error"></p>`);
  const reload = () => void openBoard(Number(field('b-map')), Number(field('b-diff')));
  $('b-map').onchange = reload;
  $('b-diff').onchange = reload;
  try {
    const { rows } = await api<{ rows: LeaderboardRow[] }>(`/leaderboard?map=${mapId}&difficulty=${diffId}`);
    $('b-table').innerHTML = rows.length
      ? `<table class="stats"><thead><tr><th>#</th><th>Equipo</th><th>Resultado</th><th>Ronda</th><th>Tiempo</th></tr></thead><tbody>${rows.map((r) =>
          `<tr><td>${r.position}</td><td>${esc(r.team)}</td><td>${RESULT[r.result] ?? r.result}</td><td>${r.round}</td><td>${time(r.seconds)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="hint">Todavía no hay partidas registradas en este mapa y dificultad.</p>';
  } catch (err) { fail(err); }
}

async function openHistory() {
  openModal('<h2>Historial de partidas</h2><div id="h-table" class="table-wrap"><p class="hint">Cargando…</p></div><p id="modal-error" class="error"></p>');
  try {
    const { rows } = await api<{ rows: HistoryRow[] }>('/history');
    $('h-table').innerHTML = rows.length
      ? `<table class="stats"><thead><tr><th>Fecha</th><th>Mapa</th><th>Modo</th><th>Resultado</th><th>Ronda</th><th>Tiempo</th><th>Personaje</th><th>Eliminados</th><th>Oro</th><th>XP</th></tr></thead><tbody>${rows.map((r) =>
          `<tr><td>${new Date(r.date).toLocaleDateString('es')}</td><td>${esc(r.map)}</td><td>${esc(r.mode)}</td><td>${RESULT[r.result] ?? r.result}</td><td>${r.round}</td><td>${time(r.seconds)}</td><td>${esc(r.character)}</td><td>${r.kills}</td><td>${r.gold}</td><td>${r.xp}</td></tr>`).join('')}</tbody></table>`
      : '<p class="hint">Aún no has jugado ninguna partida con tu cuenta.</p>';
  } catch (err) { fail(err); }
}
