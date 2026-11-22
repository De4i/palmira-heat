// Palmira Heat — shared configuration: world layout, palette, tuning numbers and the seeded
// random generator every system shares, so a given seed always builds the same city and the
// screenshot scenes (?shot=...&seed=...) come out identical frame for frame.

/** mulberry32: tiny deterministic PRNG. Returns a function giving floats in [0, 1). */
export function createRng(seed) {
  let state = (seed >>> 0) || 1;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The city grid: square blocks of BLOCK_SIZE with ROAD_WIDTH streets between them. */
export const GRID = {
  blocksPerSide: 7, // blocks across (and down) the city
  blockSize: 34, // building plot size, metres
  roadWidth: 14, // street width between plots
  get pitch() {
    return this.blockSize + this.roadWidth;
  },
  get halfExtent() {
    return (this.blocksPerSide * this.pitch) / 2;
  },
};

/** World-coordinate x of the centre of the road that runs north-south at grid column `i`. */
export function roadCenter(i) {
  return (i - (GRID.blocksPerSide - 1) / 2) * GRID.pitch;
}

/** Centre of city block (col, row) — the plot buildings sit on. */
export function blockCenter(col, row) {
  return {
    x: roadCenter(col) + GRID.pitch / 2,
    z: roadCenter(row) + GRID.pitch / 2,
  };
}

/** Sun-soaked pastel palette, shared by city, vehicles and characters. */
export const PALETTE = {
  sky: 0x8fd8ef,
  skyHorizon: 0xffd9a0,
  fog: 0xf6cf9f,
  sand: 0xf2d492,
  ocean: 0x2e9db8,
  oceanDeep: 0x1f7d99,
  grass: 0x7ec850,
  road: 0x3c4148,
  roadLine: 0xf7e08a,
  sidewalk: 0xd9cfc0,
  palmTrunk: 0x8a6844,
  palmLeaf: 0x3fa34d,
  buildings: [0xf6b8c1, 0xf9d976, 0xa8d8ea, 0xf6a35c, 0xc3e6c0, 0xe8b4d8, 0xffe5b4, 0xb5ead7, 0xff9e7d, 0xd5aaff],
  roofs: [0xc96f4a, 0xa85751, 0x8d6e63, 0xb5524d],
  carPaints: [0xe63946, 0xf1fa8c, 0x2ec4b6, 0xff9f1c, 0x9b5de5, 0x00bbf9, 0xf15bb5, 0x8ac926, 0xffca3a, 0x6a4c93, 0xe0e0e0, 0x222831],
  policePaint: 0x1d3557,
  policeAccent: 0xf1faee,
  skinTones: [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac],
  shirts: [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93, 0xff924c, 0x2ec4b6, 0xf15bb5],
  pants: [0x2b2d42, 0x4a4e69, 0x606c38, 0x283618, 0x5f6c7d],
};

/** Player and camera tuning. */
export const PLAYER = {
  walkSpeed: 5.2,
  runSpeed: 9.0,
  radius: 0.55,
  height: 1.8,
  maxHealth: 100,
  punchRange: 1.7,
  punchDamage: 34,
};

/** Car tuning shared by player driving, traffic and police (police get a grip/top-speed bonus). */
export const CAR = {
  length: 4.4,
  width: 2.0,
  maxSpeed: 34,
  maxReverse: 10,
  accel: 16,
  brake: 30,
  drag: 0.6,
  turnRate: 1.9,
  trafficSpeed: 11,
  policeSpeedBonus: 1.12,
};

/** Wanted-system tuning: heat per crime, how fast it cools, when each response unlocks. */
export const WANTED = {
  maxStars: 5,
  heatPerStar: 100,
  heatCarTheft: 45,
  heatHitPedestrian: 100,
  heatHitCar: 25,
  heatPunch: 55,
  heatShotFired: 40,
  heatPoliceHit: 130,
  coolRate: 9, // heat per second while hidden
  hideSecondsNeeded: 2.5, // unseen this long before cooling starts
  roadblockStars: 3,
  helicopterStars: 4,
  bustSeconds: 2.2, // standing next to a cop this long while slow = busted
};

/** Where the story starts: on the beachfront promenade, facing the city. */
export const SPAWN = { x: -138, z: 24, heading: Math.PI / 2 };

/** localStorage key for the save game. */
export const SAVE_KEY = 'palmira-heat-save-v1';
