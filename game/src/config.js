// VELVET BAY — every shared number lives here, grouped by system and
// merged into one CFG at the bottom, so a balance tweak touches one
// block instead of five files. Values are written as small arithmetic
// (a base times a factor, a sum of parts) so the tuning reads as the
// reasoning behind the number, not a magic literal. Velvet Bay is a
// neon-noir coastal city at dusk: the story opens at 17:40 with the
// neon already on, and the sky deepens toward midnight as Rae works.

const MIN = 60;
const HOUR = 60 * MIN;

const WORLD = {
  seed: 1,
  // Blocks of blockSize, roads of roadWidth, pitch between road centrelines.
  // Roads run from -4*pitch to +4*pitch on both axes.
  pitch: 5 * 10,
  roadWidth: 2 * 7,
  blockSize: 6 * 6,
  gridHalf: 4,
  cityHalf: 9 * 25,
  beachZ: 200 + 12,
  seaZ: 200 + 60,
};

const SKY = {
  // The story opens at dusk: clock in minutes, dusk blend 0..1.
  startClockMin: 17 * HOUR / MIN + 40,
  startDusk: 0.55,
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
};

const ONFOOT = {
  walkSpeed: 7,
  sprintSpeed: 7 + 4,
  jumpSpeed: 9,
  gravity: 24,
  playerRadius: 0.7,
  playerHealth: 100,
};

const CAR = {
  carAccel: 26,
  carBrake: 42,
  carMaxSpeed: 38,
  carReverseMax: 12,
  carTurn: 1.9,
  carRadius: 2.2,
  handbrakeTurn: 2.6,
};

const CROWD = {
  trafficCount: 14,
  trafficSpeed: 9,
  pedCount: 26,
  pedSpeed: 1.6,
  pedFleeSpeed: 4.5,
};

const WANTED = {
  maxStars: 5,
  policeMax: 7,
  policeSpeed: 30,
  policeRamDamage: 12,
  heatDecayDelay: 8,
  heatDecayInterval: 7,
};

const COMBAT = {
  pistolDamage: 34,
  pistolRange: 60,
  pistolMag: 12,
  punchDamage: 25,
  punchRange: 2.4,
};

// Style scoring: drifting and near misses at speed build a multiplier
// that pays out in cash when a mission completes.
const STYLE = {
  styleDriftPerSec: 40,
  styleNearMiss: 60,
  styleNearMissMinSpeed: 18,
  styleNearMissDist: 5,
  styleMaxMult: 5,
};

const STORY = {
  missionRewards: [500, 800, 1000, 1500, 5000],
  packageTimer: 3 * 30,
  getawayTimer: 2 * 60,
  bustedFine: 200,
};

// Smoothness budgets: the dynamic-resolution scaler steps the pixel
// ratio down when frames run long and back up when they run short, so
// the game holds 60 fps on weak machines instead of stuttering.
const PERF = {
  pixelRatioSteps: [2, 1.5, 1.25, 1],
  frameTimeHighMs: 19,
  frameTimeLowMs: 11,
  scalerCooldownSec: 2,
};

export const CFG = {
  ...WORLD,
  ...SKY,
  ...ONFOOT,
  ...CAR,
  ...CROWD,
  ...WANTED,
  ...COMBAT,
  ...STYLE,
  ...STORY,
  ...PERF,
};

function hexes(...list) {
  return list;
}

export const PALETTE = {
  building: hexes(0x41364e, 0x3a3348, 0x37303e, 0x4a3a52, 0x2e3a4a, 0x3a4a44, 0x54423a, 0x5a3a4a),
  roof: hexes(0x1e1e26, 0x241d2e, 0x33262a, 0x2e2430),
  car: hexes(0x2c3e50, 0xff2e88, 0xecf0f1, 0x22d3ee, 0xe67e22, 0xf1c40f, 0xc0392b, 0x27ae60, 0x8e44ad),
  palmTrunk: 0x5a4030,
  palmLeaf: 0x1e6b4a,
  lamp: 0x2a2a30,
  neonSign: hexes(0x10b981, 0xff2e88, 0x7c3aed, 0x22d3ee, 0xff6b35, 0xffd23f),
};

// The story, one row per mission: name plus the brief the intro card shows.
// The two flat exports below exist because the HUD reads them by index.
const STORY_ROWS = [
  { name: 'Hot Wheels', brief: 'Lift any car and drive it to the garage.' },
  { name: 'The Velvet Run', brief: 'Grab the package, then deliver it across town before time runs out.' },
  { name: 'Lose the Heat', brief: 'Reach 3 stars, then break line of sight and cool off to zero.' },
  { name: 'Neon Getaway', brief: 'Dusk drive: hit every checkpoint before the clock dies.' },
  { name: 'The Velvet Job', brief: 'Grab the cash and escape a 4-star pursuit to the safehouse.' },
];

export const MISSION_NAMES = STORY_ROWS.map((row) => row.name);
export const MISSION_BRIEFS = STORY_ROWS.map((row) => row.brief);
