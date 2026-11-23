// Screenshot scenes behind ?shot=drive|chase|mission|night. Each one stages a real,
// deterministic slice of the game from a fixed seed (1337) so the same URL always
// renders the same frame: a fresh city, placed cars, peds and cops, the clock set,
// the camera centred on the player, and the screen set to 'playing'.
// Cars come from vehicles.js (createCar) and the mission scene from missions.js
// (startMission); if either helper is unavailable the scene still stages from a
// plain car object built from CAR_MODELS, so a screenshot never blanks.
import { CAR_MODELS, CITY_PX, DAY_START, VIEW } from './config.js';
import { createRandom, randPick } from './random.js';
import { createCity } from './city.js';
import { createCar } from './vehicles.js';
import { startMission } from './missions.js';

const SHOT_SEED = 1337;
const SHIRT_COLORS = ['#c94f4f', '#4f7ec9', '#4fc94f', '#c9a44f', '#9a4fc9', '#4fc9c2', '#e8e8e8'];

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/** Fresh world state for a shot: new seeded city, empty entity lists, day 1. */
function resetWorld(G) {
  G.rng = createRandom(SHOT_SEED);
  G.city = createCity(G.rng);
  G.clock = DAY_START;
  G.day = 1;
  G.timeScale = 144;
  G.weather = 'clear';
  G.rain = 0;
  G.screen = 'playing';
  G.shake = 0;
  G.wanted = 0;
  G.heat = 0;
  G.cars = [];
  G.peds = [];
  G.cops = [];
  G.bullets = [];
  G.particles = [];
  G.pickups = [];
  G.skids = [];
  G.notifications = [];
  G.dialog = null;
  G.stats = G.stats || {};
  G.taxi = {};
  G.rampage = {};
  G.mission = { index: 0, stage: 0, status: 'none', objective: 'Explore Port Meridian', target: null, data: {} };
  G.camera = { x: 0, y: 0 };
  G.player = {
    x: 0, y: 0, angle: 0, health: 100, armor: 0, money: 500,
    onFoot: true, car: null, weapon: 'pistol',
    ammo: { pistol: 48, smg: 0, shotgun: 0 }, owned: ['pistol'],
    speed: 0, dead: false,
  };
}

/** Nearest road centre to a tile, in pixels. */
function roadNear(G, tx, ty) {
  return G.city.nearestRoadPx(tx * 32 + 16, ty * 32 + 16);
}

/** A car via vehicles.js, normalised to the shared Car shape; literal fallback. */
function makeCar(G, modelKey, x, y, angle, driver) {
  const model = CAR_MODELS[modelKey];
  let car = null;
  try {
    car = createCar(G, modelKey, x, y, angle, driver);
  } catch {
    car = null;
  }
  if (!car || typeof car !== 'object') {
    car = { id: `car-${G.cars.length + 1}`, x, y, angle, speed: 0, model, hp: 100, driver: driver || null, parked: false, smoke: false, siren: false };
  }
  car.id = car.id || `car-${G.cars.length + 1}`;
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.model = car.model || model;
  car.driver = driver || car.driver || null;
  if (car.hp === undefined) car.hp = 100;
  if (car.parked === undefined) car.parked = false;
  if (car.smoke === undefined) car.smoke = false;
  if (car.siren === undefined) car.siren = false;
  G.cars.push(car);
  return car;
}

/** A pedestrian standing (or strolling) on the sidewalk near a road point. */
function makePed(G, x, y, state) {
  const ped = {
    x, y,
    angle: G.rng() * Math.PI * 2,
    speed: 0,
    state: state || 'walk',
    color: randPick(G.rng, SHIRT_COLORS),
    shirt: randPick(G.rng, SHIRT_COLORS),
    dest: null,
    wait: 0,
  };
  ped.shirt = ped.color;
  G.peds.push(ped);
  return ped;
}

/** A ped on the sidewalk beside a road point, nudged until it is not blocked. */
function makePedNear(G, road, dx, dy) {
  const offsets = [[dx, dy], [-dx, dy], [dx, -dy], [-dx, -dy], [0, 48], [48, 0]];
  for (const [ox, oy] of offsets) {
    const x = road.x + ox;
    const y = road.y + oy;
    if (!G.city.isBlockedPx(x, y)) return makePed(G, x, y, 'walk');
  }
  return makePed(G, road.x + 40, road.y + 40, 'walk');
}

function putPlayerInCar(G, car) {
  const p = G.player;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.onFoot = false;
  p.car = car;
  car.driver = 'player';
  car.parked = false;
}

function centreCameraOnPlayer(G) {
  const p = G.player;
  G.camera.x = clamp(p.x - VIEW.width / 2, 0, CITY_PX - VIEW.width);
  G.camera.y = clamp(p.y - VIEW.height / 2, 0, CITY_PX - VIEW.height);
}

function stageDrive(G) {
  G.clock = 18.5 * 3600; // 18:30, dusk over Downtown
  const road = roadNear(G, 60, 50);
  const car = makeCar(G, 'comet', road.x, road.y, 0, 'player');
  putPlayerInCar(G, car);
  G.player.money = 1250;
  // Six traffic cars on the streets around the player.
  const traffic = [
    ['sedan', 52, 50, 0], ['van', 68, 50, Math.PI], ['taxi', 60, 42, Math.PI / 2],
    ['rust', 60, 58, -Math.PI / 2], ['gt', 54, 46, 0], ['bike', 66, 54, Math.PI],
  ];
  for (const [model, tx, ty, angle] of traffic) {
    const spot = roadNear(G, tx, ty);
    const c = makeCar(G, model, spot.x, spot.y, angle, 'npc');
    c.speed = 60 + G.rng() * 80;
  }
  const base = roadNear(G, 58, 50);
  makePedNear(G, base, 48, 48);
  makePedNear(G, base, -56, 48);
  makePedNear(G, base, 48, -56);
  makePedNear(G, base, -48, -56);
  G.wanted = 1;
  G.heat = 10;
  G.notifications.push({ text: 'Wanted level 1 — stay out of sight', ttl: 4 });
}

function stageChase(G) {
  G.clock = 17 * 3600; // 17:00, late afternoon
  const road = roadNear(G, 60, 44);
  const car = makeCar(G, 'gt', road.x, road.y, 0, 'player');
  car.hp = 55;
  car.smoke = true;
  putPlayerInCar(G, car);
  G.player.money = 2400;
  // Three police Interceptors closing in from behind, sirens on.
  const escort = [[-130, 0], [-230, 44], [-150, -44]];
  for (const [dx, dy] of escort) {
    const cop = makeCar(G, 'police', road.x + dx, road.y + dy, 0, 'police');
    cop.siren = true;
    cop.speed = 320;
    G.cops.push({ x: cop.x, y: cop.y, angle: 0, speed: 320, state: 'chase', car: cop, onFoot: false, health: 100 });
  }
  // Skid marks and smoke trailing the player's car.
  for (let i = 1; i <= 4; i += 1) {
    const bx = road.x - i * 40;
    G.skids.push({ x1: bx, y1: road.y - 12, x2: bx - 30, y2: road.y - 12, angle: 0, length: 30 });
    G.skids.push({ x1: bx, y1: road.y + 12, x2: bx - 30, y2: road.y + 12, angle: 0, length: 30 });
  }
  for (let i = 0; i < 8; i += 1) {
    G.particles.push({
      x: road.x - 50 - i * 12, y: road.y + (G.rng() - 0.5) * 20,
      life: 0.6 + G.rng() * 0.4, maxLife: 1, color: '#8a8a8a', size: 5 + G.rng() * 5,
    });
  }
  G.wanted = 3;
  G.heat = 45;
  G.notifications.push({ text: 'Wanted level 3 — lose the cops!', ttl: 4 });
}

function stageMission(G) {
  G.clock = 10 * 3600; // 10:00, morning
  let started = false;
  try {
    startMission(G, 1); // "Cab Fever"
    started = true;
  } catch {
    started = false;
  }
  // The mission module owns objective/target/dialog; stage the visible pieces
  // ourselves when it is not there yet, so the frame still reads as a mission.
  const stand = G.city.landmarks.taxiStand;
  const spot = roadNear(G, 66, 42);
  const passenger = makePed(G, stand.x + 24, stand.y, 'walk');
  if (!started || !G.mission || G.mission.status !== 'active') {
    G.mission = {
      index: 1, stage: 0, status: 'active',
      objective: 'Pick up the first passenger',
      target: { x: passenger.x, y: passenger.y },
      data: { passengers: 0, total: 3 },
    };
  }
  if (!G.mission.target) G.mission.target = { x: passenger.x, y: passenger.y };
  if (!G.dialog) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    G.dialog = {
      name: 'Dispatcher',
      text: 'Three fares are waiting across town. Pick them up before the meter runs out.',
      until: now + 60000,
    };
  }
  const taxi = makeCar(G, 'taxi', spot.x, spot.y - 20, Math.PI / 2, 'player');
  putPlayerInCar(G, taxi);
  G.player.money = 800;
  G.wanted = 0;
  G.heat = 0;
}

function stageNight(G) {
  G.clock = 22 * 3600; // 22:00, Neon Row after dark
  const road = roadNear(G, 96, 50);
  const p = G.player;
  p.x = road.x + 40;
  p.y = road.y + 40;
  p.angle = -Math.PI / 2;
  p.onFoot = true;
  p.car = null;
  p.weapon = 'pistol';
  p.money = 1750;
  for (let i = 0; i < 6; i += 1) {
    makePedNear(G, road, (G.rng() - 0.5) * 320, (G.rng() - 0.5) * 200);
  }
  // Parked cars along the neon strip.
  const parked = [['sedan', 90, 48], ['gt', 102, 52], ['taxi', 96, 56]];
  for (const [model, tx, ty] of parked) {
    const spot = roadNear(G, tx, ty);
    const c = makeCar(G, model, spot.x + 20, spot.y, 0, null);
    c.parked = true;
    c.speed = 0;
  }
  G.wanted = 0;
  G.heat = 0;
}

/**
 * Set `G` to the named scene (drive, chase, mission or night; anything else is
 * drive) and return the screen main.js should draw: always 'playing'.
 */
export function stageShot(name, G) {
  resetWorld(G);
  if (name === 'chase') stageChase(G);
  else if (name === 'mission') stageMission(G);
  else if (name === 'night') stageNight(G);
  else stageDrive(G);
  centreCameraOnPlayer(G);
  return 'playing';
}
