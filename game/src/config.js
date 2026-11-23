// Every tuning number and colour in one place for PORT MERIDIAN.
// The world is a fixed 120x120 tile grid (1 tile = 32 px); the camera shows a
// 1280x720 logical viewport of it. No rule below depends on the screen size.

/** One map tile, in pixels. */
export const TILE = 32;
/** City size, in tiles. */
export const CITY_W = 120;
export const CITY_H = 120;
/** City size, in pixels (120 * 32). */
export const CITY_PX = CITY_W * TILE;
/** Logical viewport, in pixels. */
export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;
/** Game clock starts at 08:00 (seconds since midnight). */
export const DAY_START = 8 * 3600;
/** How many game seconds pass per real second. */
export const TIME_SCALE = 144;

export const PLAYER = {
  /** Walking speed, px/s. */
  walk: 170,
  /** Running speed (Shift), px/s. */
  run: 300,
  radius: 12,
  health: 100,
  armor: 100,
  /** Seconds of invulnerability after being revived at the hospital. */
  reviveInvulnerable: 2,
};

/**
 * Original car models. maxSpeed / accel / brake are px/s (and px/s^2);
 * handling is 0..1 (higher turns sharper). len/wid are pixels, top-down.
 */
export const CAR_MODELS = {
  comet: { id: 'comet', name: 'Comet Coupe', color: '#d9382b', len: 76, wid: 34, maxSpeed: 520, accel: 320, brake: 420, handling: 0.9 },
  sedan: { id: 'sedan', name: 'Harbor Sedan', color: '#3f6fb5', len: 72, wid: 34, maxSpeed: 380, accel: 240, brake: 380, handling: 0.7 },
  van: { id: 'van', name: 'Dock Van', color: '#c8a24a', len: 88, wid: 38, maxSpeed: 320, accel: 180, brake: 340, handling: 0.5 },
  bike: { id: 'bike', name: 'Street Hawk', color: '#7a3fd1', len: 56, wid: 20, maxSpeed: 480, accel: 360, brake: 400, handling: 1.0 },
  taxi: { id: 'taxi', name: 'Cruiser Taxi', color: '#f2c230', len: 72, wid: 34, maxSpeed: 390, accel: 250, brake: 380, handling: 0.72 },
  police: { id: 'police', name: 'Interceptor', color: '#27408b', len: 76, wid: 34, maxSpeed: 500, accel: 330, brake: 430, handling: 0.88 },
  rust: { id: 'rust', name: 'Rust Bucket', color: '#7a5a3a', len: 68, wid: 32, maxSpeed: 280, accel: 170, brake: 300, handling: 0.55 },
  gt: { id: 'gt', name: 'Meridian GT', color: '#12b5a5', len: 78, wid: 34, maxSpeed: 560, accel: 350, brake: 440, handling: 0.95 },
};
/** The same models as a list, in showroom order. */
export const CAR_MODEL_LIST = Object.values(CAR_MODELS);

/**
 * Weapons. fireRate is shots per second, range is pixels, magSize is rounds
 * per magazine (0 = no magazine, melee). price is the Ironworks shop price.
 */
export const WEAPONS = {
  fist: { id: 'fist', name: 'Fists', damage: 10, fireRate: 2, range: 28, magSize: 0, price: 0, reloadTime: 0, bulletSpeed: 0 },
  pistol: { id: 'pistol', name: 'Pistol', damage: 25, fireRate: 3.5, range: 320, magSize: 12, price: 300, reloadTime: 1.1, bulletSpeed: 900 },
  smg: { id: 'smg', name: 'SMG', damage: 16, fireRate: 9, range: 260, magSize: 30, price: 900, reloadTime: 1.4, bulletSpeed: 1000 },
  shotgun: { id: 'shotgun', name: 'Shotgun', damage: 18, fireRate: 1.2, range: 200, magSize: 6, price: 1200, reloadTime: 1.8, bulletSpeed: 750, pellets: 6 },
};

/**
 * Heat needed to reach each wanted level (index = stars, 0..5).
 * Wanted falls as heat decays while the player hides from the police.
 */
export const WANTED_THRESHOLDS = [0, 10, 25, 45, 70, 90];
export const WANTED_MAX = 5;
/** Police cars chasing the player at each wanted level. */
export const WANTED_COPS = [0, 1, 2, 3, 4, 6];
/** Heat lost per second while no cop can see the player. */
export const HEAT_DECAY = 0.6;

/** Prices in dollars. */
export const PRICES = {
  spray: 150,
  repair: 120,
  repairFull: 250,
  hospital: 200,
  outfit: 50,
  ammoPistol: 40,
  ammoSmg: 80,
  ammoShotgun: 60,
  healthPickup: 0,
  packageReward: 50,
  /** Dealer showroom prices, keyed by car model id. */
  cars: { sedan: 2500, comet: 8000, van: 4000, bike: 3500, gt: 12000, taxi: 3000 },
};

/** World colours. */
export const PALETTE = {
  asphalt: '#26292f',
  roadLine: '#d8b13a',
  roadEdge: '#c8cdd4',
  sidewalk: '#3d4148',
  sidewalkDark: '#34383f',
  building: '#4a4f58',
  roof: '#2f333a',
  water: '#1d4e6b',
  waterDeep: '#14394e',
  waterLight: '#2f6f92',
  sand: '#c2a878',
  sandDark: '#a98f63',
  grass: '#2e5d33',
  grassLight: '#3a7040',
  plaza: '#555a63',
  parkPath: '#6b5a3e',
  dock: '#6b4f2e',
  dockDark: '#543d22',
  night: '#080a28',
  sunset: '#ff783c',
  neon: ['#ff2d95', '#00e5ff', '#ffe600', '#ff6b00', '#7c4dff', '#39ff6a'],
  player: '#f0a832',
  playerDark: '#b97d1e',
  skin: '#e8b88a',
};

/** Named zones, in tiles (x0/y0/x1/y1 inclusive). */
export const ZONES = [
  { name: 'North Hills', x0: 0, y0: 0, x1: 119, y1: 23 },
  { name: 'Downtown', x0: 44, y0: 36, x1: 76, y1: 64 },
  { name: 'Old Harbor', x0: 0, y0: 40, x1: 23, y1: 80 },
  { name: 'Neon Row', x0: 76, y0: 36, x1: 119, y1: 64 },
  { name: 'Sunset Beach', x0: 0, y0: 104, x1: 119, y1: 119 },
];
/** Fallback zone name for tiles outside every named zone. */
export const DEFAULT_ZONE = 'Midtown';

/** Where the save game is kept (this browser only). */
export const SAVE_KEY = 'port-meridian.save.v1';

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
