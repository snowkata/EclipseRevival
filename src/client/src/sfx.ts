// Efectos de sonido generados por código con WebAudio: no hay archivos de audio.
// Cada sonido es una mezcla corta de osciladores y ruido con su envolvente.

export type SfxName =
  | 'shoot' | 'hit' | 'crit' | 'kill' | 'gem' | 'item' | 'levelup' | 'hurt' | 'down' | 'revive'
  | 'boom' | 'bolt' | 'boss' | 'event' | 'round' | 'evolve' | 'victory' | 'defeat' | 'click' | 'gold';

const KEY = 'er-muted';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch { /* almacenamiento bloqueado */ }

/** Mínimo de segundos entre dos repeticiones del mismo sonido, para que las hordas no saturen. */
const GAP: Partial<Record<SfxName, number>> = { shoot: 0.09, hit: 0.05, crit: 0.08, kill: 0.06, gem: 0.05, boom: 0.12, bolt: 0.12, hurt: 0.25 };
const last = new Map<SfxName, number>();

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.32;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Los navegadores solo dejan sonar tras una interacción del usuario. */
export function unlockAudio() {
  const c = audio();
  if (c && c.state === 'suspended') void c.resume();
}

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* sin almacenamiento */ }
}

interface Tone { type?: OscillatorType; f: number; to?: number; at?: number; dur: number; vol?: number }

function tone(c: AudioContext, t0: number, { type = 'square', f, to, at = 0, dur, vol = 0.5 }: Tone) {
  const o = c.createOscillator(), g = c.createGain(), t = t0 + at;
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(c: AudioContext, t0: number, o: { at?: number; dur: number; vol?: number; f: number; to?: number; q?: number; kind?: BiquadFilterType }) {
  const src = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(), t = t0 + (o.at ?? 0);
  src.buffer = noiseBuf; src.loop = true;
  fl.type = o.kind ?? 'lowpass'; fl.Q.value = o.q ?? 1;
  fl.frequency.setValueAtTime(o.f, t);
  if (o.to) fl.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  g.gain.setValueAtTime(o.vol ?? 0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(fl).connect(g).connect(master!);
  src.start(t, Math.random()); src.stop(t + o.dur + 0.02);
}

/** Notas de una escala menor para las melodías cortas. */
const N = { a3: 220, c4: 261.6, d4: 293.7, e4: 329.6, g4: 392, a4: 440, c5: 523.3, d5: 587.3, e5: 659.3, g5: 784, a5: 880, c6: 1046.5 };

const SOUNDS: Record<SfxName, (c: AudioContext, t: number) => void> = {
  shoot: (c, t) => tone(c, t, { type: 'triangle', f: 760 + Math.random() * 120, to: 300, dur: 0.07, vol: 0.12 }),
  hit: (c, t) => noise(c, t, { dur: 0.05, vol: 0.16, f: 2400, to: 700, kind: 'bandpass', q: 1.5 }),
  crit: (c, t) => { noise(c, t, { dur: 0.07, vol: 0.2, f: 3600, to: 1200, kind: 'bandpass', q: 2 }); tone(c, t, { f: 1250, to: 1900, dur: 0.07, vol: 0.1 }); },
  kill: (c, t) => { tone(c, t, { type: 'sawtooth', f: 300 + Math.random() * 80, to: 70, dur: 0.14, vol: 0.14 }); noise(c, t, { dur: 0.1, vol: 0.12, f: 1400, to: 250 }); },
  gem: (c, t) => tone(c, t, { type: 'sine', f: 1150 + Math.random() * 350, to: 1900, dur: 0.07, vol: 0.14 }),
  gold: (c, t) => { tone(c, t, { type: 'square', f: N.e5 * 2, dur: 0.05, vol: 0.1 }); tone(c, t, { type: 'square', f: N.a5 * 2, at: 0.05, dur: 0.12, vol: 0.1 }); },
  item: (c, t) => [N.c5, N.e5, N.g5].forEach((f, i) => tone(c, t, { type: 'triangle', f, at: i * 0.06, dur: 0.14, vol: 0.22 })),
  levelup: (c, t) => [N.a4, N.c5, N.e5, N.a5].forEach((f, i) => { tone(c, t, { type: 'square', f, at: i * 0.075, dur: 0.2, vol: 0.14 }); tone(c, t, { type: 'triangle', f: f * 2, at: i * 0.075, dur: 0.2, vol: 0.1 }); }),
  hurt: (c, t) => { tone(c, t, { type: 'sawtooth', f: 190, to: 85, dur: 0.16, vol: 0.28 }); noise(c, t, { dur: 0.09, vol: 0.2, f: 900, to: 200 }); },
  down: (c, t) => [N.e4, N.c4, N.a3, 147].forEach((f, i) => tone(c, t, { type: 'sawtooth', f, to: f * 0.92, at: i * 0.16, dur: 0.3, vol: 0.2 })),
  revive: (c, t) => [N.c5, N.e5, N.g5, N.c6].forEach((f, i) => tone(c, t, { type: 'sine', f, at: i * 0.09, dur: 0.3, vol: 0.22 })),
  boom: (c, t) => { noise(c, t, { dur: 0.5, vol: 0.5, f: 1600, to: 60 }); tone(c, t, { type: 'sine', f: 130, to: 34, dur: 0.45, vol: 0.5 }); },
  bolt: (c, t) => { noise(c, t, { dur: 0.16, vol: 0.2, f: 5200, to: 1500, kind: 'highpass' }); tone(c, t, { type: 'sawtooth', f: 1700, to: 240, dur: 0.12, vol: 0.09 }); },
  boss: (c, t) => {
    [55, 58.3].forEach((f) => tone(c, t, { type: 'sawtooth', f, to: f * 0.8, dur: 1.5, vol: 0.34 }));
    noise(c, t, { dur: 1.3, vol: 0.22, f: 500, to: 60 });
    [N.a3, 207.7, N.a3 / 2].forEach((f, i) => tone(c, t, { type: 'square', f, at: 0.25 + i * 0.28, dur: 0.4, vol: 0.12 }));
  },
  event: (c, t) => [N.e5, N.c5, N.e5, 622.3].forEach((f, i) => tone(c, t, { type: 'triangle', f, at: i * 0.13, dur: 0.22, vol: 0.2 })),
  round: (c, t) => { tone(c, t, { type: 'sine', f: N.a4, dur: 0.9, vol: 0.2 }); tone(c, t, { type: 'sine', f: N.e5, dur: 0.9, vol: 0.12 }); tone(c, t, { type: 'sine', f: N.a5 * 1.006, dur: 0.7, vol: 0.06 }); },
  evolve: (c, t) => { [N.a4, N.c5, N.e5, N.a5, N.c6, N.e5 * 2].forEach((f, i) => tone(c, t, { type: 'triangle', f, at: i * 0.06, dur: 0.35, vol: 0.2 })); noise(c, t, { dur: 0.7, vol: 0.1, f: 800, to: 7000, kind: 'bandpass', q: 3 }); },
  victory: (c, t) => [N.c5, N.e5, N.g5, N.c6, N.g5, N.c6].forEach((f, i) => { tone(c, t, { type: 'square', f, at: i * 0.15, dur: i === 5 ? 0.9 : 0.2, vol: 0.14 }); tone(c, t, { type: 'triangle', f: f / 2, at: i * 0.15, dur: i === 5 ? 0.9 : 0.2, vol: 0.18 }); }),
  defeat: (c, t) => [N.a4, N.g4, N.e4, N.d4, N.a3].forEach((f, i) => tone(c, t, { type: 'triangle', f, at: i * 0.24, dur: i === 4 ? 1.1 : 0.32, vol: 0.24 })),
  click: (c, t) => tone(c, t, { type: 'sine', f: 620, to: 880, dur: 0.05, vol: 0.14 }),
};

export function sfx(name: SfxName) {
  if (muted) return;
  const c = audio();
  if (!c || c.state !== 'running') return;
  const now = c.currentTime, gap = GAP[name];
  if (gap && now - (last.get(name) ?? -1) < gap) return;
  last.set(name, now);
  SOUNDS[name](c, now);
}
