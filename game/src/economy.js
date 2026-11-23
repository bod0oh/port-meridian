// Money, side activities and shops for PORT MERIDIAN.
// Only imports config; everything it touches goes through the shared game state G, so it
// never needs vehicles.js, police.js or hud.js (no circular imports).
import * as CFG from './config.js';

const TILE = CFG.TILE ?? 32;
const PRICES = CFG.PRICES || {};

// --- fallbacks when config is incomplete -------------------------------------
const FALLBACK_WEAPONS = {
  pistol: { name: 'Pistol', price: 150, ammo: 24 },
  smg: { name: 'SMG', price: 600, ammo: 60 },
  shotgun: { name: 'Shotgun', price: 450, ammo: 12 },
};
const FALLBACK_MODELS = [
  { name: 'City Sedan', color: '#5a7d9a', len: 52, wid: 24, maxSpeed: 420, accel: 280, brake: 480, handling: 2.4, price: 500 },
  { name: 'Meridian GT', color: '#c0392b', len: 56, wid: 26, maxSpeed: 560, accel: 340, brake: 520, handling: 2.8, price: 5000 },
  { name: 'Cargo Van', color: '#7a6a4f', len: 62, wid: 28, maxSpeed: 360, accel: 220, brake: 420, handling: 2.0, price: 1200 },
  { name: 'Street Bike', color: '#2e8b57', len: 40, wid: 14, maxSpeed: 500, accel: 380, brake: 460, handling: 3.2, price: 900 },
];
const PAINTS = ['#c0392b', '#2e6fb0', '#e8c15a', '#2e8b57', '#7a4a9a', '#d0d0d0', '#222222'];

// --- small helpers -------------------------------------------------------------

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Push a notification into G (same shape hud.js reads). */
function pushNote(G, text) {
  if (!G.notifications) G.notifications = [];
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  G.notifications.push({ text, t: now });
  if (G.notifications.length > 5) G.notifications.splice(0, G.notifications.length - 5);
}

function playSound(G, name) {
  if (G.audio && typeof G.audio[name] === 'function') {
    try { G.audio[name](); } catch { /* audio is best-effort */ }
  }
}

function landmark(G, key) {
  const lm = G.city && G.city.landmarks ? G.city.landmarks[key] : null;
  if (lm && typeof lm.x === 'number') return { x: lm.x, y: lm.y };
  return null;
}

function nearLandmark(G, key, radius) {
  const lm = landmark(G, key);
  if (!lm) return false;
  return dist(G.player.x, G.player.y, lm.x, lm.y) < radius;
}

function roadPointNear(G, x, y, minDist, maxDist) {
  const city = G.city;
  const worldW = (CFG.CITY_W ?? 120) * TILE;
  const worldH = (CFG.CITY_H ?? 120) * TILE;
  if (!city || typeof city.randomRoadPoint !== 'function') {
    return { x: clamp(x + minDist, 0, worldW), y: clamp(y, 0, worldH) };
  }
  let point = city.randomRoadPoint(G.rng);
  for (let i = 0; i < 80; i += 1) {
    const p = city.randomRoadPoint(G.rng);
    const d = dist(x, y, p.x, p.y);
    if (d >= minDist && d <= maxDist) return p;
    point = p;
  }
  return point;
}

/** Look a weapon up by key in WEAPONS (array or map), with a safe fallback. */
export function weaponDef(name) {
  const W = CFG.WEAPONS;
  if (Array.isArray(W)) {
    return W.find((w) => w && (w.id === name || w.name === name)) || FALLBACK_WEAPONS[name] || null;
  }
  if (W && typeof W === 'object') {
    return W[name] || FALLBACK_WEAPONS[name] || null;
  }
  return FALLBACK_WEAPONS[name] || null;
}

/** Look a car model up by name in CAR_MODELS (array or map), with a safe fallback. */
export function findModel(name) {
  const M = CFG.CAR_MODELS;
  if (Array.isArray(M)) {
    return M.find((m) => m && m.name === name) || FALLBACK_MODELS.find((m) => m.name === name) || FALLBACK_MODELS[0];
  }
  if (M && typeof M === 'object') {
    return M[name] || Object.values(M).find((m) => m && m.name === name) || FALLBACK_MODELS[0];
  }
  return FALLBACK_MODELS.find((m) => m.name === name) || FALLBACK_MODELS[0];
}

/** Build a car literal in exactly the shared Car shape. */
export function makeCar(G, model, x, y, angle) {
  return {
    id: `car-${Math.floor(G.rng() * 1e9)}`,
    x, y, angle: angle || 0, speed: 0,
    model, hp: 100, driver: null, parked: true, smoke: 0, siren: false,
  };
}

// --- money ---------------------------------------------------------------------

/** Add (or subtract) money; positive income also counts toward stats and notifies. */
export function addMoney(G, n, reason) {
  G.player.money += n;
  if (n > 0) G.stats.moneyEarned += n;
  if (reason) {
    pushNote(G, n >= 0 ? `+$${n} — ${reason}` : `-$${-n} — ${reason}`);
  }
}

// --- taxi ----------------------------------------------------------------------

/** Start a fare with the given pedestrian: they leave the sidewalk, a destination is picked. */
export function startTaxiFare(G, ped) {
  const dest = roadPointNear(G, ped.x, ped.y, 500, 1200);
  const fare = 30 + Math.floor(G.rng() * 51);
  const d = dist(ped.x, ped.y, dest.x, dest.y);
  const idx = G.peds.indexOf(ped);
  if (idx >= 0) G.peds.splice(idx, 1);
  G.taxi = {
    active: true, passenger: ped, dest,
    fare, timer: d / 260 + 25, missionFare: false, lastResult: null,
  };
  pushNote(G, `Passenger aboard — fare $${fare}. Follow the yellow marker!`);
  playSound(G, 'pickup');
}

/**
 * Offer a ride: called by main.js when the player presses E near a pedestrian on foot
 * with no fare running and no story mission active. Returns true when a fare starts.
 */
export function tryOfferTaxi(G) {
  if (!G.player.onFoot) return false;
  if (G.taxi && G.taxi.active) return false;
  if (G.mission && G.mission.status === 'active') return false;
  let best = null;
  let bestD = 60;
  for (const ped of G.peds) {
    if (ped.state === 'taxi') continue;
    const d = dist(G.player.x, G.player.y, ped.x, ped.y);
    if (d < bestD) { best = ped; bestD = d; }
  }
  if (!best) return false;
  startTaxiFare(G, best);
  return true;
}

/** Tick an active fare: countdown, pay out on arrival, lose the passenger if too slow. */
export function updateTaxi(G, dt) {
  const t = G.taxi;
  if (!t || !t.active) return;
  t.timer -= dt;
  if (t.timer <= 0) {
    t.active = false;
    t.passenger = null;
    t.lastResult = 'timeout';
    pushNote(G, 'Too slow — the passenger got out and walked away.');
    return;
  }
  if (t.dest && dist(G.player.x, G.player.y, t.dest.x, t.dest.y) < 60) {
    addMoney(G, t.fare, 'Taxi fare');
    t.active = false;
    t.passenger = null;
    t.dest = null;
    t.lastResult = 'paid';
    playSound(G, 'pickup');
  }
}

// --- rampage -------------------------------------------------------------------

function totalCarHp(G) {
  let sum = 0;
  for (const car of G.cars) sum += Math.max(0, car.hp || 0);
  return sum;
}

/**
 * Rampage: stand near the Old Harbor warehouse to start 60 seconds of chaos.
 * Score comes from things other systems already count — kills, shots fired and car
 * damage — so this module needs no hooks into combat or vehicles.
 * Target 1500 points pays $300.
 */
export function updateRampage(G, dt) {
  const r = G.rampage;
  if (!r) return;
  if (r.cooldown > 0) r.cooldown -= dt;
  const p = G.player;

  if (!r.active) {
    const wh = landmark(G, 'warehouse');
    if (wh && r.cooldown <= 0 && dist(p.x, p.y, wh.x, wh.y) < 140) {
      r.active = true;
      r.timer = 60;
      r.score = 0;
      r.target = 1500;
      r._kills = G.stats.kills;
      r._shots = G.stats.shotsFired;
      r._carHp = totalCarHp(G);
      pushNote(G, 'RAMPAGE! Cause chaos — 1500 points in 60 seconds!');
      playSound(G, 'uiClick');
    }
    return;
  }

  r.timer -= dt;
  // Kills +150, shots +5, car damage +2 per hp lost, fast driving +20/s.
  const newKills = G.stats.kills - (r._kills || 0);
  if (newKills > 0) r.score += newKills * 150;
  r._kills = G.stats.kills;
  const newShots = G.stats.shotsFired - (r._shots || 0);
  if (newShots > 0) r.score += newShots * 5;
  r._shots = G.stats.shotsFired;
  const hp = totalCarHp(G);
  const dmg = (r._carHp || 0) - hp;
  if (dmg > 0) r.score += dmg * 2;
  r._carHp = hp;
  if (!p.onFoot && p.car && Math.abs(p.car.speed || 0) > 250) r.score += dt * 20;

  if (r.timer <= 0) {
    r.active = false;
    r.cooldown = 60;
    if (r.score >= r.target) {
      addMoney(G, 300, 'Rampage bonus');
      pushNote(G, `RAMPAGE COMPLETE! ${Math.floor(r.score)} points — +$300`);
      playSound(G, 'missionDone');
    } else {
      pushNote(G, `Rampage over — ${Math.floor(r.score)}/${r.target} points. Try again!`);
    }
  }
}

// --- hidden packages -----------------------------------------------------------

/** Pick up a nearby hidden package: +$50 each, 20 in the city. */
export function collectPackage(G) {
  const city = G.city;
  if (!city || !Array.isArray(city.packages)) return;
  const p = G.player;
  for (let i = 0; i < city.packages.length; i += 1) {
    const pkg = city.packages[i];
    if (pkg.taken) continue;
    if (dist(p.x, p.y, pkg.x, pkg.y) < 40) {
      pkg.taken = true;
      G.stats.packages += 1;
      addMoney(G, PRICES.packageReward ?? 50, 'Hidden package');
      pushNote(G, `Hidden package found! (${G.stats.packages}/20)`);
      playSound(G, 'pickup');
    }
  }
}

// --- stunt jumps ---------------------------------------------------------------

/** Bonus for flying over a ramp at speed: +$100, once per ramp per 30 seconds. */
export function updateStuntJumps(G, dt) {
  const city = G.city;
  if (!city || !Array.isArray(city.ramps)) return;
  const p = G.player;
  for (const ramp of city.ramps) {
    if (ramp.cd > 0) ramp.cd -= dt;
  }
  if (p.onFoot || !p.car) return;
  const maxSpeed = (p.car.model && p.car.model.maxSpeed) || 400;
  if (Math.abs(p.car.speed || 0) < 0.8 * maxSpeed) return;
  for (const ramp of city.ramps) {
    if ((ramp.cd || 0) > 0) continue;
    if (dist(p.car.x, p.car.y, ramp.x, ramp.y) < 60) {
      ramp.cd = 30;
      addMoney(G, 100, 'Stunt jump');
      pushNote(G, 'STUNT JUMP +$100');
      playSound(G, 'pickup');
      // A burst of dust so the jump reads on screen.
      for (let i = 0; i < 8; i += 1) {
        G.particles.push({
          x: p.car.x, y: p.car.y,
          vx: (G.rng() - 0.5) * 120, vy: (G.rng() - 0.5) * 120,
          life: 0.6, color: '#ffd54a', size: 3,
        });
      }
    }
  }
}

// --- shops ---------------------------------------------------------------------

/** Buy a weapon (or top up its ammo) at Ironworks. Prices come from WEAPONS. */
export function buyWeapon(G, name) {
  const def = weaponDef(name);
  if (!def) return false;
  if (!nearLandmark(G, 'gunShop', 150)) {
    pushNote(G, 'Go to Ironworks to buy weapons.');
    return false;
  }
  const price = def.price ?? (FALLBACK_WEAPONS[name] ? FALLBACK_WEAPONS[name].price : 150);
  if (G.player.money < price) {
    pushNote(G, `Not enough cash — ${def.name || name} costs $${price}.`);
    return false;
  }
  G.player.money -= price;
  G.player.owned[name] = true;
  const rounds = def.ammo ?? def.rounds ?? def.magSize ?? 24;
  G.player.ammo[name] = (G.player.ammo[name] || 0) + rounds;
  G.player.weapon = name;
  pushNote(G, `Bought ${def.name || name} (+${rounds} ammo) — $${price}`);
  playSound(G, 'pickup');
  return true;
}

/** Buy a car at the dealer: it spawns parked next to the showroom. */
export function buyCar(G, modelName) {
  const model = findModel(modelName);
  if (!model) return false;
  if (!nearLandmark(G, 'dealer', 160)) {
    pushNote(G, 'Go to the car dealer to buy a car.');
    return false;
  }
  const price = model.price ?? 500;
  if (G.player.money < price) {
    pushNote(G, `Not enough cash — the ${model.name} costs $${price}.`);
    return false;
  }
  const dealer = landmark(G, 'dealer');
  G.player.money -= price;
  const car = makeCar(G, model, dealer.x + 70, dealer.y + 40, 0);
  car.parked = true;
  G.cars.push(car);
  pushNote(G, `You bought the ${model.name} — $${price}. It is parked by the dealer.`);
  playSound(G, 'missionDone');
  return true;
}

/**
 * Spray & Go: repair the current car ($100) and clear the wanted level ($150).
 * Wanted is cleared directly here — no import of police.js, per the shared contract.
 */
export function repairAtSpray(G) {
  if (!nearLandmark(G, 'sprayShop', 150)) {
    pushNote(G, 'Go to Spray & Go for repairs.');
    return false;
  }
  const repairCost = PRICES.repair ?? 100;
  const clearCost = PRICES.clearWanted ?? 150;
  const car = G.player.car;
  const needsRepair = car && car.hp < 100;
  const needsClear = G.wanted > 0;
  if (!needsRepair && !needsClear) {
    pushNote(G, 'Spray & Go: car is clean and so are you. No charge.');
    return true;
  }
  const total = (needsRepair ? repairCost : 0) + (needsClear ? clearCost : 0);
  if (G.player.money < total) {
    pushNote(G, `Not enough cash — Spray & Go wants $${total}.`);
    return false;
  }
  G.player.money -= total;
  if (needsRepair) {
    car.hp = 100;
    car.smoke = 0;
  }
  if (needsClear) {
    G.wanted = 0;
    G.heat = 0;
  }
  // Fresh paint, on the house.
  if (car) car.paint = PAINTS[Math.floor(G.rng() * PAINTS.length)];
  const parts = [];
  if (needsRepair) parts.push('repaired');
  if (needsClear) parts.push('heat cleared');
  pushNote(G, `Spray & Go: car ${parts.join(' + ')} — $${total}`);
  playSound(G, 'pickup');
  return true;
}
