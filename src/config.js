export const ARENA_SIZE = 64;
export const HALF = ARENA_SIZE / 2;
export const MATCH_SECONDS = 180;
export const RESPAWN_SECONDS = 3;
export const COUNTDOWN_SECONDS = 3;

export const TEAMS = [
  { id: 1, name: 'Tangerine', css: '#ff7a1a', hex: 0xff7a1a },
  { id: 2, name: 'Cobalt', css: '#3a5cff', hex: 0x3a5cff },
];

export const SPAWNS = [
  { x: -27, z: 0, yaw: Math.PI / 2 },
  { x: 27, z: 0, yaw: -Math.PI / 2 },
];

export const MOVE = {
  walk: 7.5,
  walkFiring: 5.5,
  enemyInk: 3,
  swim: 14,
  squidDry: 3.2,
  turnKey: 2.8,
  turnPad: 3.8,
  pitchPad: 1.6,
};

export const SHOT = {
  cooldown: 0.09,
  inkCost: 1.1,
  speed: 28,
  lift: 4.5,
  gravity: 28,
  spread: 0.07,
  damage: 36,
  splat: 1.2,
  drip: 0.5,
  dripEvery: 0.05,
};

export const BOMB = {
  inkCost: 65,
  cooldown: 0.6,
  speed: 13,
  lift: 8,
  gravity: 26,
  fuse: 0.75,
  radius: 4,
  killRadius: 1.8,
  damageNear: 140,
  damageFar: 55,
};

// [centerX, centerZ, width (x), depth (z), height]. The map is mirrored across x = 0 so both sides are fair.
const CENTER = [
  [0, 0, 6, 6, 3],
  [0, -21, 10, 2, 2.2],
  [0, 21, 10, 2, 2.2],
];
const ONE_SIDE = [
  [-19, 0, 2, 12, 2.2],
  [-10, -12, 3, 8, 2.6],
  [-10, 12, 3, 8, 2.6],
  [-24, -19, 5, 4, 2],
  [-24, 19, 5, 4, 2],
  [-12, 0, 2, 2, 1.2],
  [-5, -27, 3, 3, 1.5],
  [-5, 27, 3, 3, 1.5],
];

export const OBSTACLES = [...CENTER, ...ONE_SIDE, ...ONE_SIDE.map(([x, z, w, d, h]) => [-x, z, w, d, h])].map(
  ([x, z, w, d, h]) => ({ x, z, w, d, h, minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }),
);
