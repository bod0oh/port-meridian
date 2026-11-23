// Missions & story for PORT MERIDIAN — Open World Crime.
// Six missions in order, each a list of small stages. This module only imports config and
// random; everything it touches in the world goes through the shared game state G, so it never
// needs vehicles.js, police.js or combat.js (no circular imports).
// All in-game text is English. All names are original.
import * as CFG from './config.js';
import { createRandom } from './random.js';

const TILE = CFG.TILE ?? 32;
const WORLD_W = (CFG.CITY_W ?? 120) * TILE;
const WORLD_H = (CFG.CITY_H ?? 120) * TILE;

// How close (px) the player must be to a marker for a stage to count as reached.
const REACH_DIST = 60;
const PICKUP_DIST = 55;

/** The six story missions. `target` is a fixed {x, y} or 'dynamic' (resolved at runtime). */
export const MISSIONS = [
  {
    id: 'm1',
    name: 'First Delivery',
    briefing:
      'Rosa: "Jax, welcome back to the streets. Pick up the package at the safehouse, then drive it to the Old Harbor warehouse. Keep it simple — and keep it moving."',
    reward: 300,
    stages: [
      { objective: 'Pick up the package at the safehouse', type: 'goto', target: 'dynamic', text: 'Walk to the green marker at your safehouse.' },
      { objective: 'Drive the package to the Old Harbor warehouse', type: 'driveTo', target: 'dynamic', text: 'Get in a car and follow the yellow marker to the warehouse.' },
    ],
  },
  {
    id: 'm2',
    name: 'Cab Fever',
    briefing:
      'Vic: "My drivers are all sick, kid. Take the cab, pick up three fares and get them where they need to go — on time. Tips are good if you hurry."',
    reward: 450,
    stages: [
      { objective: 'Pick up fare 1 of 3', type: 'pickup', target: 'dynamic', text: 'Drive to the waiting passenger.' },
      { objective: 'Drop off fare 1 of 3', type: 'deliver', target: 'dynamic', text: 'Take the passenger to the yellow marker.' },
      { objective: 'Pick up fare 2 of 3', type: 'pickup', target: 'dynamic', text: 'Drive to the waiting passenger.' },
      { objective: 'Drop off fare 2 of 3', type: 'deliver', target: 'dynamic', text: 'Take the passenger to the yellow marker.' },
      { objective: 'Pick up fare 3 of 3', type: 'pickup', target: 'dynamic', text: 'Drive to the waiting passenger.' },
      { objective: 'Drop off fare 3 of 3', type: 'deliver', target: 'dynamic', text: 'Take the passenger to the yellow marker.' },
    ],
  },
  {
    id: 'm3',
    name: 'Hot Wheels',
    briefing:
      'Rosa: "A Meridian GT is parked up in Neon Row, keys in it, owner nowhere. Bring it to the warehouse in one piece — and Jax, if the cops see you in it, the deal is dead."',
    reward: 800,
    stages: [
      { objective: 'Steal the Meridian GT in Neon Row', type: 'steal', target: 'dynamic', text: 'Find the red sports car in Neon Row and get in.' },
      { objective: 'Deliver the Meridian GT to the warehouse — stay clean', type: 'driveTo', target: 'dynamic', text: 'No wanted stars when you arrive, or the deal is off.' },
    ],
  },
  {
    id: 'm4',
    name: 'Getaway',
    briefing:
      'Mara: "You stirred the nest, Jax. Three stars and every cop in Meridian is looking for you. Lose them and get back to the safehouse — that is the only place they will not look."',
    reward: 500,
    stages: [
      { objective: 'Lose the cops and reach the safehouse', type: 'escape', target: 'dynamic', text: 'Reach the green marker at the safehouse.' },
    ],
  },
  {
    id: 'm5',
    name: 'Turf War',
    briefing:
      'Mara: "The Rust Vipers think the harbor is theirs. Six of them are holding the warehouse. Go in loud, Jax — and come back."',
    reward: 1000,
    stages: [
      { objective: 'Go to the harbor warehouse', type: 'goto', target: 'dynamic', text: 'Head for the warehouse in Old Harbor.' },
      { objective: 'Take down all 6 Rust Vipers', type: 'combat', target: 'dynamic', text: 'Clear the warehouse. Watch your health.' },
    ],
  },
  {
    id: 'm6',
    name: 'The Big One',
    briefing:
      'Rosa: "Meridian Bank. One vault, one night, one way out — north across the bridge. The whole city will be on you. Do this, Jax, and you own Port Meridian."',
    reward: 5000,
    stages: [
      { objective: 'Break into the Meridian Bank vault', type: 'deliver', target: 'dynamic', text: 'Reach the bank and hold position to crack the vault.' },
      { objective: 'Escape north across the bridge — wanted level 5', type: 'escape', target: 'dynamic', text: 'Run for the north bridge. Do not stop.' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Small helpers (local copies only — this module must not import other game modules)
// ---------------------------------------------------------------------------

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Push a notification into G without importing hud.js (same shape hud.js reads). */
function pushNote(G, text) {
  if (!G.notifications) G.notifications = [];
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  G.notifications.push({ text, t: now });
  if (G.notifications.length > 5) G.notifications.splice(0, G.notifications.length - 5);
}

function showDialog(G, name, text) {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  G.dialog = { name, text, until: now + 8000 };
}

function playSound(G, name) {
  if (G.audio && typeof G.audio[name] === 'function') {
    try { G.audio[name](); } catch { /* audio is best-effort */ }
  }
}

/** Find a car model by name in CAR_MODELS (array or map), with a safe fallback. */
function findModel(G, name) {
  const models = CFG.CAR_MODELS;
  let found = null;
  if (Array.isArray(models)) {
    found = models.find((m) => m && (m.name === name || (m.id && m.id === name))) || null;
  } else if (models && typeof models === 'object') {
    found = models[name] || Object.values(models).find((m) => m && m.name === name) || null;
  }
  if (found) return found;
  // Fallback model so a mission car always exists even if config is incomplete.
  return { name, color: '#c0392b', len: 56, wid: 26, maxSpeed: 520, accel: 320, brake: 500, handling: 2.6, price: 5000 };
}

/** Build a car literal in exactly the shared Car shape and put it in the world. */
function spawnCar(G, model, x, y, angle) {
  const car = {
    id: `car-${Math.floor(G.rng() * 1e9)}`,
    x, y, angle: angle || 0, speed: 0,
    model, hp: 100, driver: null, parked: true, smoke: 0, siren: false,
  };
  G.cars.push(car);
  return car;
}

/** A road point inside the named zone (retries), falling back to any road point. */
function roadPointInZone(G, zone, tries) {
  const city = G.city;
  if (!city || typeof city.randomRoadPoint !== 'function') {
    return { x: WORLD_W / 2, y: WORLD_H / 2 };
  }
  let point = city.randomRoadPoint(G.rng);
  for (let i = 0; i < (tries || 60); i += 1) {
    const p = city.randomRoadPoint(G.rng);
    if (typeof city.zoneAtPx === 'function' && city.zoneAtPx(p.x, p.y) === zone) return p;
    point = p;
  }
  return point;
}

/** A road point at least `minDist` and at most `maxDist` px from (x, y). */
function roadPointNear(G, x, y, minDist, maxDist) {
  const city = G.city;
  if (!city || typeof city.randomRoadPoint !== 'function') {
    return { x: clamp(x + minDist, 0, WORLD_W), y: clamp(y, 0, WORLD_H) };
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

function landmark(G, key) {
  const lm = G.city && G.city.landmarks ? G.city.landmarks[key] : null;
  if (lm && typeof lm.x === 'number') return { x: lm.x, y: lm.y };
  return null;
}

// ---------------------------------------------------------------------------
// Stage targets
// ---------------------------------------------------------------------------

/**
 * Resolve the world position a stage points at. Called when a stage starts, so the
 * marker follows whatever the city actually generated (landmarks, zones, spawned cars).
 */
function resolveStageTarget(G, def, stageIndex) {
  const stage = def.stages[stageIndex];
  if (stage.target && typeof stage.target === 'object') return { x: stage.target.x, y: stage.target.y };
  const p = G.player;
  switch (def.id) {
    case 'm1':
      return stageIndex === 0
        ? landmark(G, 'safehouse') || { x: p.x, y: p.y }
        : landmark(G, 'warehouse') || roadPointInZone(G, 'Old Harbor');
    case 'm2': {
      // Pickup stages: a waiting passenger on a nearby road. Deliver stages use the
      // destination stored in mission.data when the fare started.
      if (stage.type === 'pickup') return roadPointNear(G, p.x, p.y, 300, 900);
      return (G.mission.data && G.mission.data.dest) || roadPointNear(G, p.x, p.y, 500, 1200);
    }
    case 'm3':
      if (stageIndex === 0) {
        const car = G.mission.data && G.mission.data.targetCar;
        return car ? { x: car.x, y: car.y } : roadPointInZone(G, 'Neon Row');
      }
      return landmark(G, 'warehouse') || roadPointInZone(G, 'Old Harbor');
    case 'm4':
      return landmark(G, 'safehouse') || { x: p.x, y: p.y };
    case 'm5':
      return landmark(G, 'warehouse') || roadPointInZone(G, 'Old Harbor');
    case 'm6':
      if (stageIndex === 0) return landmark(G, 'bank') || roadPointInZone(G, 'Downtown');
      return roadPointInZone(G, 'North Hills');
    default:
      return { x: p.x, y: p.y };
  }
}

// ---------------------------------------------------------------------------
// Spawning for stages that need actors in the world
// ---------------------------------------------------------------------------

/** Spawn a waiting pedestrian at a point (ped literal in the shared Ped shape). */
function spawnWaitingPed(G, x, y) {
  const ped = {
    x, y, angle: 0, speed: 0, state: 'wait', color: '#e8c15a',
    shirt: '#e8c15a', dest: null, wait: 999,
  };
  G.peds.push(ped);
  return ped;
}

/** Spawn the gang squad for the Turf War stage around the warehouse. */
function spawnVipers(G, centre) {
  const rng = createRandom(Math.floor(G.rng() * 4294967296));
  G.gang = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const r = 60 + rng() * 120;
    G.gang.push({
      x: clamp(centre.x + Math.cos(a) * r, 0, WORLD_W),
      y: clamp(centre.y + Math.sin(a) * r, 0, WORLD_H),
      angle: a, speed: 0, state: 'combat', color: '#8e2f26', shirt: '#8e2f26',
      dest: null, wait: 0, health: 100, alive: true, weapon: 'pistol', name: 'Rust Viper',
    });
  }
  pushNote(G, 'Rust Vipers spotted — 6 hostiles at the warehouse!');
}

/** Park the Meridian GT for Hot Wheels in Neon Row. */
function spawnTargetCar(G) {
  const spot = roadPointInZone(G, 'Neon Row');
  const model = findModel(G, 'Meridian GT');
  const car = spawnCar(G, model, spot.x, spot.y, Math.PI / 2);
  car.missionCar = true;
  car.parked = true;
  return car;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start (or restart) mission `index`. Sets G.mission, resolves the first stage target,
 * spawns whatever the mission needs, and shows the briefing dialog.
 */
export function startMission(G, index) {
  const def = MISSIONS[index];
  if (!def) return;
  G.mission = {
    index, stage: 0, status: 'active',
    objective: def.stages[0].objective, target: null, data: {},
  };
  const data = G.mission.data;

  if (def.id === 'm3') {
    data.targetCar = spawnTargetCar(G);
  } else if (def.id === 'm4') {
    // The getaway starts hot: three stars and two patrol cars closing in.
    G.wanted = 3;
    G.heat = 100;
    for (let i = 0; i < 2; i += 1) {
      const spot = roadPointNear(G, G.player.x, G.player.y, 350, 500);
      const cop = spawnCar(G, findModel(G, 'Police Cruiser'), spot.x, spot.y, 0);
      cop.siren = true;
      cop.parked = false;
      cop.driver = 'cop';
      G.cops.push({
        x: spot.x, y: spot.y, angle: 0, speed: 0,
        state: 'chase', car: cop, onFoot: false, health: 100,
      });
    }
  } else if (def.id === 'm6') {
    G.wanted = 0;
    G.heat = 0;
  }

  // Resolve the first stage target (may spawn a waiting passenger for Cab Fever).
  if (def.id === 'm2') {
    const target = resolveStageTarget(G, def, 0);
    G.mission.target = target;
    data.passengerPed = spawnWaitingPed(G, target.x, target.y);
  } else {
    G.mission.target = resolveStageTarget(G, def, 0);
  }
  data.faresDone = 0;
  showDialog(G, def.name, def.briefing);
  pushNote(G, `Mission started: ${def.name}`);
  playSound(G, 'uiClick');
}

/** Move to the next stage, or finish the mission when the stages run out. */
function advanceStage(G) {
  const def = MISSIONS[G.mission.index];
  const next = G.mission.stage + 1;
  if (next >= def.stages.length) {
    completeMission(G);
    return;
  }
  G.mission.stage = next;
  const stage = def.stages[next];
  G.mission.objective = stage.objective;

  if (def.id === 'm2' && stage.type === 'pickup') {
    const target = resolveStageTarget(G, def, next);
    G.mission.target = target;
    G.mission.data.passengerPed = spawnWaitingPed(G, target.x, target.y);
  } else if (def.id === 'm5' && stage.type === 'combat') {
    const centre = G.mission.target || landmark(G, 'warehouse') || { x: G.player.x, y: G.player.y };
    spawnVipers(G, centre);
    G.mission.data.spawned = true;
    G.mission.target = { x: centre.x, y: centre.y };
  } else if (def.id === 'm6' && stage.type === 'escape') {
    // The alarm is tripped: full five-star heat for the run north.
    G.wanted = 5;
    G.heat = 100;
    G.mission.target = resolveStageTarget(G, def, next);
    pushNote(G, 'ALARM! Wanted level 5 — run for the north bridge!');
  } else {
    G.mission.target = resolveStageTarget(G, def, next);
  }
  pushNote(G, stage.objective);
}

/**
 * Per-step mission logic: checks whether the current stage is done (marker reached,
 * passenger delivered, target car stolen, gang wiped out, vault cracked) and advances
 * the mission. Also runs the auto-start countdown between missions.
 */
export function updateMissions(G, dt) {
  const m = G.mission;
  if (!m) return;

  // Between missions: count down, then brief the next one automatically.
  if (m.status === 'idle') {
    if (m.data && typeof m.data.nextIn === 'number') {
      m.data.nextIn -= dt;
      if (m.data.nextIn <= 0) {
        if (m.index < MISSIONS.length) startMission(G, m.index);
        else m.data.nextIn = 0;
      }
    }
    return;
  }
  if (m.status !== 'active') return;

  const def = MISSIONS[m.index];
  if (!def) return;
  const stage = def.stages[m.stage];
  if (!stage) return;
  const p = G.player;

  switch (stage.type) {
    case 'goto':
    case 'driveTo':
    case 'deliver': {
      if (def.id === 'm6' && m.stage === 0) {
        // The Big One, stage 1: hold position at the bank to crack the vault.
        if (m.target && dist(p.x, p.y, m.target.x, m.target.y) < REACH_DIST) {
          m.data.vaultT = (m.data.vaultT || 0) + dt;
          if (Math.floor(m.data.vaultT) !== Math.floor(m.data.vaultT - dt)) {
            pushNote(G, `Cracking the vault… ${Math.ceil(5 - m.data.vaultT)}s`);
          }
          if (m.data.vaultT >= 5) advanceStage(G);
        } else {
          m.data.vaultT = 0;
        }
        break;
      }
      if (m.target && dist(p.x, p.y, m.target.x, m.target.y) < REACH_DIST) {
        if (def.id === 'm3' && m.stage === 1 && G.wanted > 0) {
          failMission(G, 'The cops made the car — the deal is off!');
          break;
        }
        advanceStage(G);
      }
      break;
    }
    case 'escape': {
      if (m.target && dist(p.x, p.y, m.target.x, m.target.y) < REACH_DIST) {
        // Safe at last: the heat dies down.
        G.wanted = 0;
        G.heat = 0;
        advanceStage(G);
      }
      break;
    }
    case 'pickup': {
      const ped = m.data.passengerPed;
      if (ped && dist(p.x, p.y, ped.x, ped.y) < PICKUP_DIST) {
        // Passenger gets in: hand the fare to the taxi system (economy.js drives it).
        const idx = G.peds.indexOf(ped);
        if (idx >= 0) G.peds.splice(idx, 1);
        const dest = roadPointNear(G, ped.x, ped.y, 500, 1200);
        const fare = 30 + Math.floor(G.rng() * 51);
        const d = dist(ped.x, ped.y, dest.x, dest.y);
        G.taxi = {
          active: true, passenger: ped, dest,
          fare, timer: d / 260 + 25, missionFare: true, lastResult: null,
        };
        m.data.dest = dest;
        m.data.fareActive = true;
        m.data.farePaid = false;
        pushNote(G, `Passenger aboard — fare $${fare}. Follow the yellow marker!`);
        playSound(G, 'pickup');
        advanceStage(G);
      }
      break;
    }
    case 'steal': {
      const car = m.data.targetCar;
      if (car && car.hp <= 0) {
        failMission(G, 'The Meridian GT is wrecked — the deal is dead.');
        break;
      }
      // Done once the player is driving the target car.
      if (!p.onFoot && p.car && (p.car.missionCar || p.car === car)) {
        G.stats.carsStolen += 1;
        pushNote(G, 'Got the GT — now get it to the warehouse, clean.');
        advanceStage(G);
      } else if (car) {
        // Keep the marker glued to the car in case it gets moved.
        m.target = { x: car.x, y: car.y };
      }
      break;
    }
    case 'combat': {
      if (!m.data.spawned) break;
      const alive = (G.gang || []).filter((g) => g.alive !== false && g.health > 0).length;
      if (alive === 0) {
        pushNote(G, 'Warehouse clear — the harbor is yours.');
        advanceStage(G);
      }
      break;
    }
    default:
      break;
  }

  // Cab Fever deliver stages: the taxi system reports the outcome in G.taxi.
  if (def.id === 'm2' && stage.type === 'deliver' && m.data.fareActive) {
    if (!G.taxi || !G.taxi.active) {
      const paid = G.taxi && G.taxi.lastResult === 'paid';
      m.data.fareActive = false;
      if (paid) {
        m.data.faresDone = (m.data.faresDone || 0) + 1;
        pushNote(G, `Fare delivered (${m.data.faresDone}/3).`);
        advanceStage(G);
      } else {
        failMission(G, 'You lost the passenger — Vic is not happy.');
      }
    }
  }
}

/** Pay out, count the win, and queue the next mission (or roll the ending). */
export function completeMission(G) {
  const def = MISSIONS[G.mission.index];
  if (!def) return;
  G.player.money += def.reward;
  G.stats.moneyEarned += def.reward;
  G.stats.missionsDone += 1;
  if (G.taxi) { G.taxi.active = false; G.taxi.passenger = null; }
  pushNote(G, `Mission complete: ${def.name}  +$${def.reward}`);
  playSound(G, 'missionDone');

  if (G.mission.index >= MISSIONS.length - 1) {
    G.mission.status = 'done';
    G.screen = 'ending';
    return;
  }
  // Next mission briefs itself after a short breather.
  G.mission = {
    index: G.mission.index + 1, stage: 0, status: 'idle',
    objective: 'Next mission incoming…', target: null, data: { nextIn: 3 },
  };
}

/**
 * Mark the mission failed and show the retry dialog. main.js restarts it when the
 * player presses Enter while status is 'failed'.
 */
export function failMission(G, reason) {
  if (!G.mission || G.mission.status !== 'active') return;
  G.mission.status = 'failed';
  if (G.taxi) { G.taxi.active = false; G.taxi.passenger = null; }
  showDialog(G, 'Mission Failed', `${reason || 'Mission failed.'} Press Enter to retry.`);
  pushNote(G, 'Mission failed.');
  playSound(G, 'crash');
}

/** The active objective line for the HUD (objective + distance in metres). */
export function missionObjective(G) {
  const m = G.mission;
  if (!m || m.status !== 'active') return '';
  let text = m.objective || '';
  if (m.target && G.player) {
    const metres = Math.round(dist(G.player.x, G.player.y, m.target.x, m.target.y) / TILE);
    text += ` — ${metres}m`;
  }
  return text;
}
