// VELVET BAY — tuning and world constants. One place for every number the
// rest of the game shares, so a balance change never means hunting through
// five files. Velvet Bay is a neon-noir coastal city at dusk: the game
// opens at 17:40 with the neon already on, and the sky deepens as the
// story runs toward midnight.
export const CFG = {
  seed: 1,
  // City grid: blocks of blockSize, roads of roadWidth, pitch between road
  // centre lines. Roads run from -4*pitch to +4*pitch on both axes.
  pitch: 50,
  roadWidth: 14,
  blockSize: 36,
  gridHalf: 4,
  cityHalf: 225,
  beachZ: 212,
  seaZ: 260,
  // The story opens at dusk: clock in minutes, dusk blend 0..1.
  startClockMin: 17 * 60 + 40,
  startDusk: 0.55,
  // Player on foot.
  walkSpeed: 7,
  sprintSpeed: 11,
  jumpSpeed: 9,
  gravity: 24,
  playerRadius: 0.7,
  playerHealth: 100,
  // Cars.
  carAccel: 26,
  carBrake: 42,
  carMaxSpeed: 38,
  carReverseMax: 12,
  carTurn: 1.9,
  carRadius: 2.2,
  handbrakeTurn: 2.6,
  // Traffic and pedestrians.
  trafficCount: 14,
  trafficSpeed: 9,
  pedCount: 26,
  pedSpeed: 1.6,
  pedFleeSpeed: 4.5,
  // Wanted / police.
  maxStars: 5,
  policeMax: 7,
  policeSpeed: 30,
  policeRamDamage: 12,
  heatDecayDelay: 8,
  heatDecayInterval: 7,
  // Combat.
  pistolDamage: 34,
  pistolRange: 60,
  pistolMag: 12,
  punchDamage: 25,
  punchRange: 2.4,
  // Style scoring: drifting and near misses at speed build a multiplier
  // that pays out in cash when a mission completes.
  styleDriftPerSec: 40,
  styleNearMiss: 60,
  styleNearMissMinSpeed: 18,
  styleNearMissDist: 5,
  styleMaxMult: 5,
  // Missions.
  missionRewards: [500, 800, 1000, 1500, 5000],
  packageTimer: 90,
  getawayTimer: 120,
  bustedFine: 200,
  // Rendering: dusk-first sky, wet-look asphalt, neon accents.
  skyDay: 0x87bfe8,
  skyDusk: 0x2a1745,
  sunDay: 0xfff2d8,
  sunDusk: 0xff7733,
  sea: 0x14324e,
  sand: 0xcbb28a,
  asphalt: 0x232329,
  sidewalk: 0x6f6f74,
  neonPink: 0xff2e88,
  neonCyan: 0x22d3ee,
  neonGold: 0xffd23f,
  // Smoothness budgets: the dynamic-resolution scaler steps the pixel
  // ratio down when frames run long and back up when they run short, so
  // the game holds 60 fps on weak machines instead of stuttering.
  pixelRatioSteps: [2, 1.5, 1.25, 1],
  frameTimeHighMs: 19,
  frameTimeLowMs: 11,
  scalerCooldownSec: 2,
};

export const PALETTE = {
  building: [0x3a3348, 0x4a3a52, 0x2e3a4a, 0x54423a, 0x3a4a44, 0x5a3a4a, 0x41364e, 0x37303e],
  roof: [0x241d2e, 0x2e2430, 0x1e1e26, 0x33262a],
  car: [0xff2e88, 0x22d3ee, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xecf0f1, 0x2c3e50, 0xe67e22, 0xc0392b],
  palmTrunk: 0x5a4030,
  palmLeaf: 0x1e6b4a,
  lamp: 0x2a2a30,
  neonSign: [0xff2e88, 0x22d3ee, 0xffd23f, 0x7c3aed, 0x10b981, 0xff6b35],
};

export const MISSION_NAMES = [
  'Hot Wheels',
  'The Velvet Run',
  'Lose the Heat',
  'Neon Getaway',
  'The Velvet Job',
];

export const MISSION_BRIEFS = [
  'Lift any car and drive it to the garage.',
  'Grab the package, then deliver it across town before time runs out.',
  'Reach 3 stars, then break line of sight and cool off to zero.',
  'Dusk drive: hit every checkpoint before the clock dies.',
  'Grab the cash and escape a 4-star pursuit to the safehouse.',
];
