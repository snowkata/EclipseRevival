// Datos del juego. Son una copia de los valores iniciales del script
// eclipse_revival.sql (Entrega 1). Más adelante se leerán de la base de datos
// en Supabase (RNF18); mientras tanto viven aquí para poder jugar sin BD.

export type ElementId = 1 | 2 | 3 | 4 | 5;
export const ELEMENTS: Record<ElementId, { name: string; color: string; status: string | null }> = {
  1: { name: 'Físico', color: '#E0E0E0', status: null },
  2: { name: 'Fuego', color: '#FF6A00', status: 'quemadura' },
  3: { name: 'Hielo', color: '#66CCFF', status: 'congelacion' },
  4: { name: 'Rayo', color: '#FFE14D', status: 'aturdimiento' },
  5: { name: 'Veneno', color: '#7CFC00', status: 'veneno' },
};

export interface ComboDef { a: ElementId; b: ElementId; name: string; mult: number; radius: number }
export const COMBOS: ComboDef[] = [
  { a: 2, b: 3, name: 'Explosión de vapor', mult: 2.0, radius: 120 },
  { a: 3, b: 4, name: 'Cristal eléctrico', mult: 1.8, radius: 100 },
  { a: 2, b: 5, name: 'Nube tóxica ardiente', mult: 1.7, radius: 140 },
  { a: 4, b: 5, name: 'Toxina eléctrica', mult: 1.6, radius: 110 },
];

export type PassiveAttr = 'vida' | 'cadencia' | 'dano' | 'velocidad' | 'area' | 'critico' | 'iman' | 'regeneracion';
export interface PassiveDef { id: number; name: string; attr: PassiveAttr; perLevel: number; maxLevel: number; desc: string }
export const PASSIVES: PassiveDef[] = [
  { id: 1, name: 'Corazón robusto', attr: 'vida', perLevel: 10, maxLevel: 5, desc: '+10 % de vida máxima' },
  { id: 2, name: 'Gatillo rápido', attr: 'cadencia', perLevel: 8, maxLevel: 5, desc: '+8 % de cadencia' },
  { id: 3, name: 'Filo oscuro', attr: 'dano', perLevel: 10, maxLevel: 5, desc: '+10 % de daño' },
  { id: 4, name: 'Botas ligeras', attr: 'velocidad', perLevel: 8, maxLevel: 5, desc: '+8 % de velocidad' },
  { id: 5, name: 'Lente amplia', attr: 'area', perLevel: 10, maxLevel: 5, desc: '+10 % de área' },
  { id: 6, name: 'Ojo crítico', attr: 'critico', perLevel: 5, maxLevel: 5, desc: '+5 % de probabilidad de crítico' },
  { id: 7, name: 'Imán lunar', attr: 'iman', perLevel: 20, maxLevel: 5, desc: '+20 % de radio de recogida' },
  { id: 8, name: 'Regeneración', attr: 'regeneracion', perLevel: 0.5, maxLevel: 5, desc: '+0.5 de vida por segundo' },
];

export type WeaponPattern = 'proyectil' | 'orbita' | 'aura' | 'rayo' | 'area';
export interface WeaponDef {
  id: number; name: string; element: ElementId; pattern: WeaponPattern;
  damage: number; rate: number; range: number; crit: number; maxLevel: number; perLevel: number;
  evolution: number | null; requiredPassive: number | null; isEvolution: boolean; desc: string;
}
export const WEAPONS: WeaponDef[] = [
  { id: 101, name: 'Pistola del ocaso', element: 1, pattern: 'proyectil', damage: 30, rate: 6.0, range: 650, crit: 0.15, maxLevel: 1, perLevel: 0, evolution: null, requiredPassive: null, isEvolution: true, desc: 'Ráfaga incesante que atraviesa filas enteras' },
  { id: 102, name: 'Anillo solar', element: 2, pattern: 'orbita', damage: 45, rate: 2.0, range: 160, crit: 0.10, maxLevel: 1, perLevel: 0, evolution: null, requiredPassive: null, isEvolution: true, desc: 'Seis soles giran a tu alrededor' },
  { id: 103, name: 'Ventisca eterna', element: 3, pattern: 'aura', damage: 25, rate: 3.0, range: 220, crit: 0.05, maxLevel: 1, perLevel: 0, evolution: null, requiredPassive: null, isEvolution: true, desc: 'Una tormenta de hielo te rodea' },
  { id: 104, name: 'Tormenta del eclipse', element: 4, pattern: 'rayo', damage: 60, rate: 1.5, range: 700, crit: 0.20, maxLevel: 1, perLevel: 0, evolution: null, requiredPassive: null, isEvolution: true, desc: 'Rayos que saltan entre decenas de enemigos' },
  { id: 1, name: 'Pistola eclipse', element: 1, pattern: 'proyectil', damage: 10, rate: 3.0, range: 500, crit: 0.05, maxLevel: 8, perLevel: 0.10, evolution: 101, requiredPassive: 2, isEvolution: false, desc: 'Dispara al enemigo más cercano' },
  { id: 2, name: 'Orbe de llamas', element: 2, pattern: 'orbita', damage: 12, rate: 1.0, range: 120, crit: 0.05, maxLevel: 8, perLevel: 0.10, evolution: 102, requiredPassive: 5, isEvolution: false, desc: 'Orbes de fuego giran a tu alrededor' },
  { id: 3, name: 'Aura gélida', element: 3, pattern: 'aura', damage: 6, rate: 2.0, range: 150, crit: 0.0, maxLevel: 8, perLevel: 0.12, evolution: 103, requiredPassive: 1, isEvolution: false, desc: 'Daña y ralentiza a los enemigos cercanos' },
  { id: 4, name: 'Rayo en cadena', element: 4, pattern: 'rayo', damage: 18, rate: 0.8, range: 600, crit: 0.10, maxLevel: 8, perLevel: 0.10, evolution: 104, requiredPassive: 6, isEvolution: false, desc: 'Un rayo que salta entre enemigos' },
  { id: 5, name: 'Frasco tóxico', element: 5, pattern: 'area', damage: 8, rate: 0.7, range: 350, crit: 0.05, maxLevel: 8, perLevel: 0.12, evolution: null, requiredPassive: null, isEvolution: false, desc: 'Deja charcos de veneno en el suelo' },
  { id: 6, name: 'Hoja lunar', element: 1, pattern: 'proyectil', damage: 14, rate: 1.2, range: 400, crit: 0.15, maxLevel: 8, perLevel: 0.10, evolution: null, requiredPassive: null, isEvolution: false, desc: 'Cuchillas que atraviesan a varios enemigos' },
];
export const weaponById = (id: number) => WEAPONS.find((w) => w.id === id)!;
export const passiveById = (id: number) => PASSIVES.find((p) => p.id === id)!;

export interface CharacterDef {
  id: number; name: string; hp: number; speed: number; ability: string; startWeapon: number; color: number;
  bonus: { dano?: number; area?: number; velocidad?: number; cadencia?: number; fuego?: number };
}
export const CHARACTERS: CharacterDef[] = [
  { id: 1, name: 'Nova', hp: 100, speed: 200, ability: '+10 % de daño con todas las armas', startWeapon: 1, color: 0xb388ff, bonus: { dano: 0.10 } },
  { id: 2, name: 'Brasa', hp: 120, speed: 180, ability: 'Los ataques de fuego hacen un 20 % más', startWeapon: 2, color: 0xff7043, bonus: { fuego: 0.20 } },
  { id: 3, name: 'Escarcha', hp: 90, speed: 210, ability: '+15 % de área de efecto', startWeapon: 3, color: 0x4fc3f7, bonus: { area: 0.15 } },
  { id: 4, name: 'Volt', hp: 80, speed: 240, ability: '+10 % de velocidad y de cadencia', startWeapon: 4, color: 0xffee58, bonus: { velocidad: 0.10, cadencia: 0.10 } },
];
export const characterById = (id: number) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];

export type Behavior = 'perseguir' | 'embestir' | 'distancia' | 'explotar' | 'invocar' | 'jefe';
export interface EnemyDef {
  id: number; name: string; behavior: Behavior; element: ElementId; hp: number; damage: number;
  speed: number; armor: number; xp: number; boss: boolean; radius: number; color: number;
}
export const ENEMIES: EnemyDef[] = [
  { id: 1, name: 'Sombra', behavior: 'perseguir', element: 1, hp: 15, damage: 5, speed: 150, armor: 0, xp: 1, boss: false, radius: 13, color: 0x5c4b8a },
  { id: 2, name: 'Murciélago', behavior: 'perseguir', element: 1, hp: 10, damage: 4, speed: 210, armor: 0, xp: 1, boss: false, radius: 10, color: 0x8d6e63 },
  { id: 3, name: 'Esqueleto', behavior: 'perseguir', element: 1, hp: 30, damage: 8, speed: 120, armor: 1, xp: 2, boss: false, radius: 14, color: 0xd7ccc8 },
  { id: 4, name: 'Lobo de ceniza', behavior: 'embestir', element: 2, hp: 40, damage: 10, speed: 200, armor: 0, xp: 3, boss: false, radius: 15, color: 0x795548 },
  { id: 5, name: 'Arquero espectral', behavior: 'distancia', element: 1, hp: 25, damage: 7, speed: 100, armor: 0, xp: 3, boss: false, radius: 13, color: 0x80cbc4 },
  { id: 6, name: 'Escarabajo de cristal', behavior: 'perseguir', element: 1, hp: 60, damage: 10, speed: 90, armor: 4, xp: 4, boss: false, radius: 16, color: 0x9fa8da },
  { id: 7, name: 'Espíritu helado', behavior: 'distancia', element: 3, hp: 35, damage: 8, speed: 110, armor: 0, xp: 4, boss: false, radius: 13, color: 0xb3e5fc },
  { id: 8, name: 'Bomba viviente', behavior: 'explotar', element: 2, hp: 30, damage: 30, speed: 180, armor: 0, xp: 3, boss: false, radius: 13, color: 0xff5722 },
  { id: 9, name: 'Gólem de hielo', behavior: 'embestir', element: 3, hp: 200, damage: 20, speed: 70, armor: 6, xp: 10, boss: false, radius: 24, color: 0x81d4fa },
  { id: 10, name: 'Brujo del eclipse', behavior: 'invocar', element: 5, hp: 80, damage: 6, speed: 90, armor: 1, xp: 8, boss: false, radius: 15, color: 0x7cb342 },
  { id: 11, name: 'Guardián marchito', behavior: 'jefe', element: 5, hp: 2500, damage: 30, speed: 80, armor: 5, xp: 300, boss: true, radius: 42, color: 0x558b2f },
  { id: 12, name: 'Coloso de cristal', behavior: 'jefe', element: 1, hp: 3500, damage: 35, speed: 70, armor: 8, xp: 400, boss: true, radius: 46, color: 0x7986cb },
  { id: 13, name: 'Devorador del Eclipse', behavior: 'jefe', element: 4, hp: 8000, damage: 45, speed: 90, armor: 10, xp: 1000, boss: true, radius: 56, color: 0x311b92 },
];
export const enemyById = (id: number) => ENEMIES.find((e) => e.id === id)!;

/** Multiplicador de daño recibido por tipo de enemigo y elemento (tabla resistencia). */
export const RESISTANCES: Record<number, Partial<Record<ElementId, number>>> = {
  3: { 5: 0.5 }, 4: { 2: 0.5 }, 6: { 1: 0.5, 4: 1.5 }, 7: { 3: 0.25, 2: 1.5 },
  9: { 3: 0.25, 2: 1.75 }, 11: { 5: 0.5, 2: 1.25 }, 13: { 1: 0.75 },
};

export type ItemKind = 'oro' | 'curar' | 'iman' | 'bomba' | 'cofre';
export const ITEMS: Record<ItemKind, { name: string; value: number }> = {
  oro: { name: 'Bolsa de oro', value: 10 },
  curar: { name: 'Botiquín', value: 30 },
  iman: { name: 'Imán', value: 1 },
  bomba: { name: 'Bomba', value: 500 },
  cofre: { name: 'Cofre', value: 1 },
};
/** Botín por tipo de enemigo (tabla botin_enemigo). */
export const LOOT: Record<number, [ItemKind, number][]> = {
  1: [['oro', 0.05]], 3: [['oro', 0.1], ['curar', 0.02]], 6: [['oro', 0.2]],
  9: [['curar', 0.25], ['iman', 0.05]], 10: [['bomba', 0.1]],
  11: [['cofre', 1]], 12: [['cofre', 1]], 13: [['oro', 1]],
};

export interface SpawnRule { enemy: number; from: number; to: number | null; weight: number; role: 'normal' | 'jefe' | 'jefe_final' }
export interface MapDef { id: number; name: string; desc: string; hazard: string | null; available: boolean; ground: number; deco: number; spawns: SpawnRule[] }
export const MAPS: MapDef[] = [
  {
    id: 1, name: 'Bosque Marchito', desc: 'Un bosque sin luz donde despiertan las primeras sombras.', hazard: null, available: true,
    ground: 0x1d2b1f, deco: 0x2e4630,
    spawns: [
      { enemy: 1, from: 1, to: null, weight: 10, role: 'normal' }, { enemy: 2, from: 1, to: 8, weight: 8, role: 'normal' },
      { enemy: 3, from: 3, to: null, weight: 6, role: 'normal' }, { enemy: 4, from: 6, to: null, weight: 4, role: 'normal' },
      { enemy: 10, from: 9, to: null, weight: 2, role: 'normal' }, { enemy: 11, from: 5, to: null, weight: 1, role: 'jefe' },
      { enemy: 13, from: 10, to: null, weight: 1, role: 'jefe_final' },
    ],
  },
  {
    id: 2, name: 'Ciudad en Ruinas', desc: 'Calles destruidas llenas de esqueletos y arqueros.', hazard: 'derrumbes', available: true,
    ground: 0x2b2a2e, deco: 0x46434d,
    spawns: [
      { enemy: 2, from: 1, to: 4, weight: 8, role: 'normal' }, { enemy: 3, from: 1, to: null, weight: 6, role: 'normal' }, { enemy: 5, from: 2, to: null, weight: 6, role: 'normal' },
      { enemy: 8, from: 4, to: null, weight: 4, role: 'normal' }, { enemy: 6, from: 7, to: null, weight: 3, role: 'normal' },
      { enemy: 12, from: 5, to: null, weight: 1, role: 'jefe' }, { enemy: 13, from: 10, to: null, weight: 1, role: 'jefe_final' },
    ],
  },
  { id: 3, name: 'Desierto de Cristal', desc: 'Dunas de cristal bajo un sol negro.', hazard: 'tormenta_arena', available: false, ground: 0x3d3424, deco: 0x5d5036, spawns: [] },
  { id: 4, name: 'Cripta Helada', desc: 'Túneles congelados donde el suelo resbala.', hazard: 'suelo_hielo', available: false, ground: 0x1c2a33, deco: 0x2f4a5a, spawns: [] },
  { id: 5, name: 'Corazón del Volcán', desc: 'El origen del eclipse, rodeado de lava.', hazard: 'lava', available: false, ground: 0x2e1a16, deco: 0x5a2a1e, spawns: [] },
];
export const mapById = (id: number) => MAPS.find((m) => m.id === id) ?? MAPS[0];

export interface DifficultyDef { id: number; name: string; rounds: number; mCount: number; mHp: number; mDmg: number; mReward: number }
export const DIFFICULTIES: DifficultyDef[] = [
  { id: 1, name: 'Fácil', rounds: 10, mCount: 0.8, mHp: 0.8, mDmg: 0.75, mReward: 0.8 },
  { id: 2, name: 'Normal', rounds: 15, mCount: 1.0, mHp: 1.0, mDmg: 1.0, mReward: 1.0 },
  { id: 3, name: 'Difícil', rounds: 20, mCount: 1.3, mHp: 1.5, mDmg: 1.4, mReward: 1.6 },
];
export const difficultyById = (id: number) => DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1];

export const PLAYER_SCALING: Record<number, { count: number; hp: number; xp: number }> = {
  1: { count: 1.0, hp: 1.0, xp: 1.0 }, 2: { count: 1.6, hp: 1.25, xp: 0.9 },
  3: { count: 2.2, hp: 1.5, xp: 0.85 }, 4: { count: 2.8, hp: 1.75, xp: 0.8 },
};

export const EVENTS = [
  { id: 'eclipse', name: 'Eclipse total', goal: 'Sobrevive a la ronda viendo solo el área cercana a tu personaje', gold: 120 },
  { id: 'meteoros', name: 'Lluvia de meteoros', goal: 'Esquiva las zonas marcadas; los meteoros dañan a todos', gold: 120 },
] as const;
export type EventId = (typeof EVENTS)[number]['id'];

/** Parámetros generales (tabla parametro_juego) y constantes de la simulación. */
export const PARAMS = {
  baseEnemies: 10,
  countPerRound: 0.15,
  hpPerRound: 0.10,
  roundSeconds: 60,
  bossEvery: 5,
  eventMin: 3,
  eventMax: 4,
  comboWindow: 2,
  reviveSeconds: 3,
  reconnectSeconds: 60,
  maxWeapons: 6,
  maxPassives: 6,
  // Propias de esta versión
  waveInterval: 6, // segundos entre oleadas dentro de una ronda
  enemySpeedScale: 0.6, // los enemigos normales van algo más lento que los jugadores
  maxEnemies: 300,
  worldSize: 3200,
  tickRate: 40, // simulación por segundo
  sendRate: 20, // estados enviados por segundo (RNF06)
  maxPlayers: 4,
};
