// Bootstrap & game loop for PORT MERIDIAN — Open World Crime.
// Imports every module. The world advances in fixed 1/60 s steps; rendering paints the
// 1280x720 logical playfield scaled to the window (main.js owns canvas sizing and the
// transform — render.js draws in logical coordinates and must not resize the canvas).
// ?shot=<name>&seed=<n> stages a scene, runs 90 steps, paints one frame and stops
// (deterministic screenshots). ?seed=<n> alone fixes the run's RNG.
// NOTE: this file only touches window/document inside boot(), so importing it under
// Node (for a parse check) is safe.
import * as CFG from './config.js';
import { createRandom } from './random.js';
import * as CityMod from './city.js';
import * as InputMod from './input.js';
import * as Entities from './entities.js';
import * as Vehicles from './vehicles.js';
import * as Police from './police.js';
import * as Combat from './combat.js';
import * as Missions from './missions.js';
import * as Economy from './economy.js';
import * as HUD from './hud.js';
import * as AudioMod from './audio.js';
import * as Save from './save.js';
import * as Render from './render.js';
import * as Shots from './shots.js';

const STEP = CFG.STEP ?? 1 / 60;
const TILE = CFG.TILE ?? 32;
const WORLD_W = (CFG.CITY_W ?? 120) * TILE;
const WORLD_H = (CFG.CITY_H ?? 120) * TILE;
const LOGICAL_W = 1280;
const LOGICAL_H = 720;
const MAX_FRAME = 0.25;
const AUTOSAVE_EVERY = 30;
const SHOT_STEPS = 90;

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Call a function from another specialist's module only when it exists. */
function callMod(mod, name, ...args) {
  const fn = mod && mod[name];
  if (typeof fn === 'function') return fn(...args);
  return undefined;
}

// ---------------------------------------------------------------------------
// Fallbacks (only used if a sibling module is missing or throws at boot)
// ---------------------------------------------------------------------------

function fallbackCity(rng) {
  const landmarks = {
    safehouse: { x: 1920, y: 1920 },
    sprayShop: { x: 2048, y: 1920 },
    gunShop: { x: 1824, y: 2016 },
    dealer: { x: 2144, y: 1888 },
    hospital: { x: 1888, y: 1792 },
    bank: { x: 2048, y: 2144 },
    warehouse: { x: 640, y: 640 },
    taxiStand: { x: 1920, y: 2016 },
  };
  const packages = [];
  for (let i = 0; i < 20; i += 1) {
    packages.push({ x: Math.floor(rng() * 115 + 2) * TILE + 16, y: Math.floor(rng() * 115 + 2) * TILE + 16, taken: false });
  }
  const ramps = [];
  for (let i = 0; i < 6; i += 1) {
    ramps.push({ x: Math.floor(rng() * 110 + 5) * TILE, y: Math.floor(rng() * 110 + 5) * TILE, angle: 0, cd: 0 });
  }
  return {
    landmarks, packages, ramps,
    isRoadPx(x, y) { return Math.floor(x / TILE) % 6 < 2 || Math.floor(y / TILE) % 6 < 2; },
    isBlockedPx() { return false; },
    isWaterPx(x, y) { return y > WORLD_H - 256; },
    zoneAtPx(x, y) {
      if (y < 768) return 'North Hills';
      if (x < 1280) return 'Old Harbor';
      if (y > WORLD_H - 768) return 'Sunset Beach';
      if (x > 2560) return 'Neon Row';
      return 'Downtown';
    },
    nearestRoadPx(x, y) { return { x, y }; },
    randomRoadPoint(r) {
      return { x: Math.floor(r() * 118 + 1) * TILE + 16, y: Math.floor(r() * 118 + 1) * TILE + 16 };
    },
  };
}

function defaultPlayer(x, y) {
  return {
    x, y, angle: 0, health: 100, armor: 0, money: 200,
    onFoot: true, car: null, weapon: 'fist',
    ammo: { pistol: 24, smg: 0, shotgun: 0 },
    owned: { pistol: true, smg: false, shotgun: false },
    speed: 0, dead: false, hurtT: 0,
  };
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

function buildGame(seed) {
  const rng = createRandom(seed);
  let city = null;
  try {
    city = typeof CityMod.createCity === 'function' ? CityMod.createCity(rng) : null;
  } catch {
    city = null;
  }
  if (!city || typeof city.isRoadPx !== 'function') city = fallbackCity(rng);

  const safe = (city.landmarks && city.landmarks.safehouse) || { x: WORLD_W / 2, y: WORLD_H / 2 };
  let player = defaultPlayer(safe.x, safe.y);
  try {
    const made = typeof Entities.createPlayer === 'function' ? Entities.createPlayer() : null;
    if (made && typeof made === 'object') {
      player = { ...player, ...made };
      if (!Number.isFinite(player.x)) player.x = safe.x;
      if (!Number.isFinite(player.y)) player.y = safe.y;
    }
  } catch {
    // Keep the default player.
  }

  const G = {
    rng, city,
    clock: 28800, // 08:00 on day one
    day: 1, timeScale: 144,
    weather: 'clear', rain: 0, rainTimer: 180,
    screen: 'title',
    player,
    cars: [], peds: [], cops: [], bullets: [], particles: [], pickups: [], skids: [],
    wanted: 0, heat: 0,
    mission: { index: 0, stage: 0, status: 'idle', objective: '', target: null, data: {} },
    stats: { kills: 0, carsStolen: 0, packages: 0, moneyEarned: 0, missionsDone: 0, shotsFired: 0 },
    taxi: { active: false, passenger: null, dest: null, fare: 0, timer: 0 },
    rampage: { active: false, timer: 0, score: 0, target: 1500, cooldown: 0 },
    camera: { x: clamp(safe.x - LOGICAL_W / 2, 0, WORLD_W - LOGICAL_W), y: clamp(safe.y - LOGICAL_H / 2, 0, WORLD_H - LOGICAL_H) },
    notifications: [], dialog: null,
    input: null, audio: AudioMod.createAudio(),
    mouse: { x: LOGICAL_W / 2, y: LOGICAL_H / 2, wx: safe.x, wy: safe.y, down: false },
    shake: 0, gang: [],
    showBigMap: false, menuIndex: 0, showHelp: false,
    gameoverReason: 'wasted', hasSave: false,
    autosaveT: 0, _prevMissionsDone: 0, _nearShop: '',
  };

  spawnInitialTraffic(G);
  spawnInitialPeds(G);
  return G;
}

/** A few parked/driving cars and walking pedestrians so the city is alive at boot. */
function spawnInitialTraffic(G) {
  const models = Object.values(CFG.CAR_MODELS || {});
  const names = models.length ? models.map((m) => m.name) : ['City Sedan', 'Cargo Van', 'Street Bike'];
  for (let i = 0; i < 14; i += 1) {
    const spot = G.city.randomRoadPoint(G.rng);
    const model = Economy.findModel(names[Math.floor(G.rng() * names.length)]);
    const car = Economy.makeCar(G, model, spot.x, spot.y, G.rng() * Math.PI * 2);
    car.parked = G.rng() < 0.4;
    car.driver = car.parked ? null : 'npc';
    car.speed = car.parked ? 0 : 60 + G.rng() * 120;
    G.cars.push(car);
  }
}

function spawnInitialPeds(G) {
  const shirts = ['#e8c15a', '#5a7d9a', '#c06a8e', '#6a9a5a', '#9a6a3a', '#7a6a9a'];
  for (let i = 0; i < 24; i += 1) {
    const spot = G.city.randomRoadPoint(G.rng);
    const dest = G.city.randomRoadPoint(G.rng);
    G.peds.push({
      x: spot.x, y: spot.y, angle: G.rng() * Math.PI * 2,
      speed: 28 + G.rng() * 20, state: 'walk',
      color: shirts[i % shirts.length], shirt: shirts[i % shirts.length],
      dest, wait: 0,
    });
  }
}

// ---------------------------------------------------------------------------
// Boot (browser only)
// ---------------------------------------------------------------------------

function boot() {
  const params = new URLSearchParams(window.location.search);
  const shotName = params.get('shot');
  const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
  const seed = Number.isInteger(seedParam) ? seedParam : 20261123;

  const canvas = document.getElementById('game');
  const status = document.getElementById('status');
  const ctx = canvas.getContext('2d');
  const view = { scale: 1 };

  let G = buildGame(seed);
  G.hasSave = Save.hasSave();

  // --- input ---------------------------------------------------------------
  // input.js owns the listeners when it provides them; main.js keeps its own
  // key/mouse edge state as well so the game works even with a minimal input.js.
  let input = null;
  try {
    input = typeof InputMod.createInput === 'function' ? InputMod.createInput(canvas) : null;
  } catch {
    input = null;
  }
  if (!input || typeof input !== 'object') input = {};
  if (!(input.keys instanceof Set)) input.keys = new Set();
  if (!(input.justPressed instanceof Set)) input.justPressed = new Set();
  G.input = input;
  const keys = input.keys;
  const justPressed = input.justPressed;

  function announce(message) {
    if (status) status.textContent = message;
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.min(window.innerWidth / LOGICAL_W, window.innerHeight / LOGICAL_H);
    const cssW = Math.max(320, Math.floor(LOGICAL_W * scale));
    const cssH = Math.max(180, Math.floor(LOGICAL_H * scale));
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.style.position = 'fixed';
    canvas.style.left = '50%';
    canvas.style.top = '50%';
    canvas.style.transform = 'translate(-50%, -50%)';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    view.scale = canvas.width / LOGICAL_W;
  }

  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (LOGICAL_W / Math.max(1, rect.width)),
      y: (clientY - rect.top) * (LOGICAL_H / Math.max(1, rect.height)),
    };
  }

  window.addEventListener('keydown', (event) => {
    keys.add(event.code);
    if (!event.repeat) justPressed.add(event.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
    // First gesture unlocks audio.
    G.audio.init();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('pointermove', (event) => {
    const p = toLogical(event.clientX, event.clientY);
    G.mouse.x = p.x;
    G.mouse.y = p.y;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const p = toLogical(event.clientX, event.clientY);
    G.mouse.x = p.x;
    G.mouse.y = p.y;
    G.mouse.down = true;
    G.audio.init();
  });
  window.addEventListener('pointerup', () => { G.mouse.down = false; });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.screen === 'playing') {
      G.screen = 'paused';
      G.menuIndex = 0;
      announce('Paused.');
    }
  });
  resize();

  // --- flow helpers ----------------------------------------------------------

  function newGame() {
    G = buildGame(seed);
    G.input = input;
    G.hasSave = Save.hasSave();
    G.screen = 'playing';
    G.audio.init();
    G.audio.music(true);
    Missions.startMission(G, 0);
    announce('Playing. Mission 1: First Delivery.');
  }

  function continueGame() {
    const data = Save.loadGame();
    if (!data) return;
    G = buildGame(seed);
    G.input = input;
    G.hasSave = true;
    applySave(G, data);
    G.screen = 'playing';
    G.audio.init();
    G.audio.music(true);
    announce('Continuing your game.');
  }

  function applySave(G, data) {
    if (typeof data.money === 'number') G.player.money = data.money;
    if (typeof data.health === 'number') G.player.health = data.health;
    if (typeof data.armor === 'number') G.player.armor = data.armor;
    if (data.player && typeof data.player.x === 'number') G.player.x = data.player.x;
    if (data.player && typeof data.player.y === 'number') G.player.y = data.player.y;
    if (data.owned) G.player.owned = { ...G.player.owned, ...data.owned };
    if (data.ammo) G.player.ammo = { ...G.player.ammo, ...data.ammo };
    if (Array.isArray(data.packagesTaken) && Array.isArray(G.city.packages)) {
      for (const i of data.packagesTaken) {
        if (G.city.packages[i]) G.city.packages[i].taken = true;
      }
    }
    if (data.stats) G.stats = { ...G.stats, ...data.stats };
    if (typeof data.clock === 'number') G.clock = data.clock;
    if (typeof data.day === 'number') G.day = data.day;
    const idx = typeof data.missionIndex === 'number' ? data.missionIndex : 0;
    G.mission = {
      index: Math.min(idx, Missions.MISSIONS.length - 1),
      stage: 0, status: 'idle', objective: '', target: null, data: { nextIn: 1 },
    };
  }

  function respawn() {
    const hospital = (G.city.landmarks && G.city.landmarks.hospital) || { x: G.player.x, y: G.player.y };
    G.player.money = Math.max(0, G.player.money - 200);
    G.player.health = 100;
    G.player.armor = 0;
    G.player.x = hospital.x;
    G.player.y = hospital.y;
    G.player.onFoot = true;
    G.player.car = null;
    G.player.dead = false;
    G.wanted = 0;
    G.heat = 0;
    G.cops = [];
    G.screen = 'playing';
    HUD.notify(G, 'You wake up at Meridian General Hospital. -$200');
    announce('Back on your feet.');
  }

  function gameOver(reason) {
    if (G.mission && G.mission.status === 'active') Missions.failMission(G, 'You went down — the mission is blown.');
    G.gameoverReason = reason;
    G.screen = 'gameover';
    G.audio.music(false);
    G.audio.siren(false);
    announce(reason === 'busted' ? 'Busted.' : 'Wasted.');
  }

  // --- interaction (E key) -----------------------------------------------------

  function nearestCar(maxD) {
    let best = null;
    let bestD = maxD;
    for (const car of G.cars) {
      const d = dist(G.player.x, G.player.y, car.x, car.y);
      if (d < bestD) { best = car; bestD = d; }
    }
    return best;
  }

  function nearLandmark(key, radius) {
    const lm = G.city.landmarks ? G.city.landmarks[key] : null;
    if (!lm) return false;
    return dist(G.player.x, G.player.y, lm.x, lm.y) < radius;
  }

  function fallbackEnterCar(car) {
    if (car.driver === 'npc') {
      // The driver bails out and becomes a pedestrian.
      G.peds.push({
        x: car.x + 20, y: car.y + 20, angle: 0, speed: 40, state: 'flee',
        color: '#c06a8e', shirt: '#c06a8e', dest: null, wait: 0,
      });
      car.driver = null;
    }
    G.player.car = car;
    G.player.onFoot = false;
    car.parked = false;
    car.driver = 'player';
  }

  function interact() {
    const p = G.player;
    if (!p.onFoot) {
      // Get out of the car.
      if (typeof Vehicles.exitCar === 'function') Vehicles.exitCar(G);
      else { p.onFoot = true; p.car = null; }
      return;
    }
    // Shops first (they are places, not cars).
    if (nearLandmark('sprayShop', 150)) { Economy.repairAtSpray(G); return; }
    if (nearLandmark('safehouse', 120)) {
      if (Save.saveGame(G)) HUD.notify(G, 'Game saved at the safehouse.');
      else HUD.notify(G, 'Could not save (storage unavailable).');
      if (G.wanted > 0) {
        G.wanted = Math.max(0, G.wanted - 1);
        HUD.notify(G, 'You changed clothes — wanted level down 1 star.');
      }
      return;
    }
    if (nearLandmark('gunShop', 150) || nearLandmark('dealer', 160)) {
      HUD.notify(G, 'Press 1 / 2 / 3 to buy here (see the shop list).');
      return;
    }
    // Then cars, then taxi offers.
    const car = nearestCar(70);
    if (car) {
      if (typeof Vehicles.tryEnterCar === 'function') {
        if (!Vehicles.tryEnterCar(G)) fallbackEnterCar(car);
      } else {
        fallbackEnterCar(car);
      }
      return;
    }
    Economy.tryOfferTaxi(G);
  }

  /** Shop hint shown once when the player walks into a shop's radius. */
  function shopHint() {
    let hint = '';
    if (nearLandmark('gunShop', 150)) hint = 'gunShop';
    else if (nearLandmark('dealer', 160)) hint = 'dealer';
    else if (nearLandmark('sprayShop', 150)) hint = 'sprayShop';
    else if (nearLandmark('safehouse', 120)) hint = 'safehouse';
    if (hint && hint !== G._nearShop) {
      G._nearShop = hint;
      if (hint === 'gunShop') HUD.notify(G, 'Ironworks — press 1 Pistol $150, 2 SMG $600, 3 Shotgun $450');
      else if (hint === 'dealer') HUD.notify(G, 'Car dealer — press 1 Sedan, 2 Meridian GT, 3 Van, 4 Bike to buy');
      else if (hint === 'sprayShop') HUD.notify(G, 'Spray & Go — press E: repair $100, clear heat $150');
      else if (hint === 'safehouse') HUD.notify(G, 'Safehouse — press E to save and lay low');
    } else if (!hint) {
      G._nearShop = '';
    }
  }

  /** Number keys: buy at shops, otherwise switch weapons. */
  function numberKey(code) {
    const p = G.player;
    const n = Number(code.slice(-1));
    if (nearLandmark('gunShop', 150)) {
      const names = ['pistol', 'smg', 'shotgun'];
      if (names[n - 1]) Economy.buyWeapon(G, names[n - 1]);
      return;
    }
    if (nearLandmark('dealer', 160)) {
      const models = Object.values(CFG.CAR_MODELS || {}).map((m) => m.name);
      if (models.length < 4) models.push('City Sedan', 'Meridian GT', 'Cargo Van', 'Street Bike');
      if (models[n - 1]) Economy.buyCar(G, models[n - 1]);
      return;
    }
    const names = ['pistol', 'smg', 'shotgun'];
    const name = names[n - 1];
    if (name && p.owned && p.owned[name]) {
      p.weapon = name;
      HUD.notify(G, `${name.charAt(0).toUpperCase() + name.slice(1)} equipped.`);
    }
  }

  // --- per-frame input actions (edge-triggered, once per frame) ----------------

  function handleActions() {
    // Title screen.
    if (G.screen === 'title') {
      if (justPressed.has('ArrowUp') || justPressed.has('KeyW')) {
        G.menuIndex = (G.menuIndex + 2) % 3;
        G.audio.uiClick();
      } else if (justPressed.has('ArrowDown') || justPressed.has('KeyS')) {
        G.menuIndex = (G.menuIndex + 1) % 3;
        G.audio.uiClick();
      } else if (justPressed.has('Enter') || justPressed.has('Space')) {
        if (G.showHelp) { G.showHelp = false; return; }
        if (G.menuIndex === 0) newGame();
        else if (G.menuIndex === 1 && Save.hasSave()) continueGame();
        else if (G.menuIndex === 2) G.showHelp = true;
      }
      return;
    }

    // Paused.
    if (G.screen === 'paused') {
      if (justPressed.has('ArrowUp') || justPressed.has('KeyW')) {
        G.menuIndex = (G.menuIndex + 3) % 4;
      } else if (justPressed.has('ArrowDown') || justPressed.has('KeyS')) {
        G.menuIndex = (G.menuIndex + 1) % 4;
      } else if (justPressed.has('Escape') || justPressed.has('KeyP')) {
        G.screen = 'playing';
        announce('Playing.');
      } else if (justPressed.has('Enter') || justPressed.has('Space')) {
        if (G.menuIndex === 0) { G.screen = 'playing'; announce('Playing.'); }
        else if (G.menuIndex === 1) {
          if (Save.saveGame(G)) HUD.notify(G, 'Game saved.');
          else HUD.notify(G, 'Could not save (storage unavailable).');
        } else if (G.menuIndex === 2) {
          if (G.mission && Missions.MISSIONS[G.mission.index]) {
            Missions.startMission(G, G.mission.index);
            G.screen = 'playing';
          }
        } else if (G.menuIndex === 3) {
          G = buildGame(seed);
          G.input = input;
          G.hasSave = Save.hasSave();
          G.screen = 'title';
          G.audio.music(false);
        }
      }
      return;
    }

    // Game over / ending.
    if (G.screen === 'gameover') {
      if (justPressed.has('Enter') || justPressed.has('Space')) respawn();
      return;
    }
    if (G.screen === 'ending') {
      if (justPressed.has('Enter') || justPressed.has('Space')) {
        G = buildGame(seed);
        G.input = input;
        G.hasSave = Save.hasSave();
        G.screen = 'title';
        G.audio.music(false);
      }
      return;
    }

    // Playing.
    if (justPressed.has('Escape') || justPressed.has('KeyP')) {
      G.screen = 'paused';
      G.menuIndex = 0;
      announce('Paused.');
      return;
    }
    if (justPressed.has('KeyM')) {
      G.showBigMap = !G.showBigMap;
      G.audio.uiClick();
    }
    if (justPressed.has('KeyH')) G.audio.horn();
    // Mission retry beats dialog dismiss: retrying re-briefs the mission.
    if ((justPressed.has('Enter') || justPressed.has('Space'))
      && G.mission && G.mission.status === 'failed') {
      Missions.startMission(G, G.mission.index);
      G.screen = 'playing';
      return;
    }
    if ((justPressed.has('Enter') || justPressed.has('Space')) && G.dialog) {
      G.dialog = null;
      return;
    }
    if (justPressed.has('KeyE')) interact();
    if (justPressed.has('KeyR')) callMod(Combat, 'reloadWeapon', G);
    if (justPressed.has('Digit1')) numberKey('Digit1');
    if (justPressed.has('Digit2')) numberKey('Digit2');
    if (justPressed.has('Digit3')) numberKey('Digit3');
    if (justPressed.has('Digit4')) numberKey('Digit4');
    shopHint();
  }

  // --- simulation --------------------------------------------------------------

  function stepPlaying(dt) {
    // (2) Player on foot or driving.
    if (G.player.onFoot) callMod(Entities, 'updatePlayerOnFoot', G, dt);
    else callMod(Vehicles, 'updatePlayerCar', G, dt);
    // (3) Traffic.
    callMod(Vehicles, 'updateTraffic', G, dt);
    // (4) Pedestrians.
    callMod(Entities, 'updatePeds', G, dt);
    // (5) Police + wanted.
    callMod(Police, 'updatePolice', G, dt);
    callMod(Police, 'updateWanted', G, dt);
    // (6) Bullets + gang. Fire while the mouse is held (combat owns the rules).
    if (G.mouse.down) callMod(Combat, 'tryFire', G);
    callMod(Combat, 'updateBullets', G, dt);
    callMod(Combat, 'updateGang', G, dt);
    // (7) Missions.
    Missions.updateMissions(G, dt);
    // (8) Side activities.
    Economy.updateTaxi(G, dt);
    Economy.updateRampage(G, dt);
    Economy.collectPackage(G);
    Economy.updateStuntJumps(G, dt);

    // (9) Clock: 144 game-seconds per real second (~10 min per game day).
    G.clock += dt * G.timeScale;
    if (G.clock >= 86400) {
      G.clock -= 86400;
      G.day += 1;
      HUD.notify(G, `Day ${G.day} in Port Meridian.`);
    }
    // Occasional rain, 30–90 s at a time.
    G.rainTimer -= dt;
    if (G.rainTimer <= 0) {
      if (G.rain > 0) {
        G.rain = 0;
        G.weather = 'clear';
        G.rainTimer = 120 + G.rng() * 240;
      } else if (G.rng() < 0.3) {
        G.rain = 30 + G.rng() * 60;
        G.weather = 'rain';
        G.rainTimer = G.rain;
        HUD.notify(G, 'Rain rolling in over the harbor.');
      } else {
        G.rainTimer = 60 + G.rng() * 120;
      }
    }
    if (G.rain > 0) G.rain -= dt;

    // (10) Camera follows the player, clamped to the world; mouse world coords.
    const tx = clamp(G.player.x - LOGICAL_W / 2, 0, Math.max(0, WORLD_W - LOGICAL_W));
    const ty = clamp(G.player.y - LOGICAL_H / 2, 0, Math.max(0, WORLD_H - LOGICAL_H));
    G.camera.x = tx;
    G.camera.y = ty;
    G.mouse.wx = G.mouse.x + G.camera.x;
    G.mouse.wy = G.mouse.y + G.camera.y;

    // Audio follows the action.
    const speed01 = !G.player.onFoot && G.player.car
      ? Math.abs(G.player.car.speed || 0) / ((G.player.car.model && G.player.car.model.maxSpeed) || 400)
      : 0;
    G.audio.engine(speed01);
    const copNear = G.wanted > 0 && G.cops.some((c) => dist(c.x, c.y, G.player.x, G.player.y) < 600);
    G.audio.siren(copNear);

    // Decay screen shake; age particles.
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 3);
    for (let i = G.particles.length - 1; i >= 0; i -= 1) {
      const pt = G.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) G.particles.splice(i, 1);
    }

    // Death / arrest.
    if (G.player.health <= 0 && !G.player.dead) {
      G.player.dead = true;
      gameOver('wasted');
    } else if (G.busted) {
      G.busted = false;
      gameOver('busted');
    }

    // Autosave every 30 s, and whenever a mission is completed.
    G.autosaveT += dt;
    if (G.stats.missionsDone > G._prevMissionsDone) {
      G._prevMissionsDone = G.stats.missionsDone;
      Save.saveGame(G);
    } else if (G.autosaveT >= AUTOSAVE_EVERY) {
      G.autosaveT = 0;
      Save.saveGame(G);
    }
  }

  /** The title screen keeps the city breathing behind the menu. */
  function stepAmbient(dt) {
    callMod(Vehicles, 'updateTraffic', G, dt);
    callMod(Entities, 'updatePeds', G, dt);
    const t = (G.clock += dt);
    G.camera.x = clamp(WORLD_W / 2 - LOGICAL_W / 2 + Math.sin(t * 0.05) * 220, 0, WORLD_W - LOGICAL_W);
    G.camera.y = clamp(WORLD_H / 2 - LOGICAL_H / 2 + Math.cos(t * 0.04) * 140, 0, WORLD_H - LOGICAL_H);
  }

  // --- rendering ---------------------------------------------------------------

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
    if (G.shake > 0) {
      ctx.translate((G.rng() - 0.5) * G.shake * 14, (G.rng() - 0.5) * G.shake * 14);
    }
    if (typeof Render.drawGame === 'function') {
      Render.drawGame(G, ctx);
    } else {
      ctx.fillStyle = '#e5534b';
      ctx.font = '24px system-ui, sans-serif';
      ctx.fillText('render.js: drawGame(G, ctx) is missing.', 40, 360);
    }
    ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
    if (G.screen === 'playing') {
      HUD.drawHUD(G, ctx);
    } else {
      HUD.drawMenus(G, ctx);
    }
  }

  // --- ?shot= staging ------------------------------------------------------------

  /** Fallback staging when shots.js has no stageShot (extra names for the spec shots). */
  function stageShotFallback(name, G) {
    const downtown = { x: WORLD_W / 2, y: WORLD_H / 2 };
    if (name === 'start') {
      G.screen = 'title';
      return;
    }
    G.screen = 'playing';
    if (name === 'night') {
      G.clock = 22 * 3600;
      G.player.x = 3000;
      G.player.y = 2200;
    } else if (name === 'chase' || name === 'end') {
      G.clock = 18 * 3600 + 1800;
      G.wanted = 3;
      G.heat = 100;
      G.player.x = downtown.x;
      G.player.y = downtown.y;
      for (let i = 0; i < 3; i += 1) {
        const spot = G.city.randomRoadPoint(G.rng);
        const car = Economy.makeCar(G, Economy.findModel('Police Cruiser'), spot.x, spot.y, 0);
        car.siren = true;
        car.parked = false;
        car.driver = 'cop';
        G.cars.push(car);
        G.cops.push({ x: spot.x, y: spot.y, angle: 0, speed: 0, state: 'chase', car, onFoot: false, health: 100 });
      }
    } else if (name === 'mission') {
      G.clock = 12 * 3600;
      Missions.startMission(G, 2);
    } else {
      // 'play' / 'downtown': dusk drive downtown, mission 1 running.
      G.clock = 18 * 3600;
      Missions.startMission(G, 0);
    }
    // Put the player in a car for the driving shots.
    if (name !== 'mission') {
      const car = Economy.makeCar(G, Economy.findModel('City Sedan'), G.player.x + 40, G.player.y, 0);
      car.parked = false;
      car.driver = 'player';
      G.cars.push(car);
      G.player.car = car;
      G.player.onFoot = false;
    }
    G.camera.x = clamp(G.player.x - LOGICAL_W / 2, 0, WORLD_W - LOGICAL_W);
    G.camera.y = clamp(G.player.y - LOGICAL_H / 2, 0, WORLD_H - LOGICAL_H);
  }

  function runShot(name) {
    if (typeof Shots.stageShot === 'function') {
      try { Shots.stageShot(name, G); } catch { stageShotFallback(name, G); }
    } else {
      stageShotFallback(name, G);
    }
    for (let i = 0; i < SHOT_STEPS; i += 1) {
      if (G.screen === 'playing') stepPlaying(STEP);
      else stepAmbient(STEP);
    }
    render();
    window.__shotReady = true;
  }

  // --- main loop -----------------------------------------------------------------

  function runGame() {
    let accumulator = 0;
    let last = performance.now();
    announce('Port Meridian. Press Enter to start.');
    G.audio.music(false);

    function frame(nowMs) {
      requestAnimationFrame(frame);
      accumulator += Math.min((nowMs - last) / 1000, MAX_FRAME);
      last = nowMs;
      handleActions();
      if (G.screen === 'playing') {
        while (accumulator >= STEP && G.screen === 'playing') {
          stepPlaying(STEP);
          accumulator -= STEP;
        }
      } else if (G.screen === 'title') {
        while (accumulator >= STEP && G.screen === 'title') {
          stepAmbient(STEP);
          accumulator -= STEP;
        }
      } else {
        accumulator = 0;
      }
      render();
      justPressed.clear();
    }
    requestAnimationFrame(frame);
  }

  if (shotName) runShot(shotName);
  else runGame();
}

// Browser only: under Node this import is a safe no-op (the parse check).
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  boot();
}
