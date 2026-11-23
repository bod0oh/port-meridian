// Police & wanted system for PORT MERIDIAN — Open World Crime.
// Wanted 0-5 stars driven by heat (0-100); patrol cars + foot cops chase,
// arrest, and set roadblocks at high wanted levels.
import { CAR_MODELS, WANTED_THRESHOLDS, PRICES } from './config.js';

const VIEW_W = 1280, VIEW_H = 720;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const rnd = (G) => (typeof G.rng === 'function' ? G.rng() : Math.random());
const normAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const notify = (G, text) => G.notifications.push({ text, ttl: 4 });

function wantedFor(heat) {
  let w = 0;
  for (let i = 0; i < WANTED_THRESHOLDS.length; i += 1) if (heat >= (WANTED_THRESHOLDS[i] ?? 0)) w = i;
  return w;
}

function policeModel() {
  if (Array.isArray(CAR_MODELS)) {
    return CAR_MODELS.find((m) => /police|interceptor|cruiser/i.test(m.name)) || CAR_MODELS[CAR_MODELS.length - 1];
  }
  return CAR_MODELS.police || CAR_MODELS.Interceptor
    || Object.values(CAR_MODELS).find((m) => /police|interceptor/i.test(`${m.name || ''} ${m.id || ''}`))
    || Object.values(CAR_MODELS)[0];
}

function hurtPlayer(G, amount) {
  const p = G.player;
  if (p.armor > 0) { const ab = Math.min(p.armor, amount); p.armor -= ab; amount -= ab; }
  p.health -= amount; p.hurtT = 0.5;
}

function roadPoint(G) {
  if (G.city && typeof G.city.randomRoadPoint === 'function') {
    return G.city.randomRoadPoint(typeof G.rng === 'function' ? G.rng : Math.random);
  }
  return { x: 200 + rnd(G) * 3440, y: 200 + rnd(G) * 3440 };
}

// Road point just off the viewport edge, so cops arrive instead of popping in.
function edgeRoadPoint(G) {
  const cam = G.camera || { x: G.player.x - VIEW_W / 2, y: G.player.y - VIEW_H / 2 };
  let pt = roadPoint(G);
  for (let i = 0; i < 10; i += 1) {
    pt = roadPoint(G);
    const off = pt.x < cam.x - 40 || pt.x > cam.x + VIEW_W + 40 || pt.y < cam.y - 40 || pt.y > cam.y + VIEW_H + 40;
    if (off && dist(pt.x, pt.y, G.player.x, G.player.y) < 1600) return pt;
  }
  return pt;
}

function removeCop(G, cop) {
  const i = G.cops.indexOf(cop);
  if (i >= 0) G.cops.splice(i, 1);
  if (cop.car) { const j = G.cars.indexOf(cop.car); if (j >= 0) G.cars.splice(j, 1); }
}

function makeCopCar(G, x, y, angle) {
  const car = {
    id: `cop-${Math.floor(rnd(G) * 1e9)}`, x, y, angle: angle || 0, speed: 0,
    model: policeModel(), hp: 100, driver: 'police', parked: false,
    smoke: 0, siren: true, npcDest: null, waitT: 0,
  };
  G.cars.push(car);
  return car;
}

function spawnCarCop(G, x, y) {
  const pt = x === undefined ? edgeRoadPoint(G) : { x, y };
  const car = makeCopCar(G, pt.x, pt.y, rnd(G) * Math.PI * 2);
  const cop = { x: pt.x, y: pt.y, angle: car.angle, speed: 0, state: 'chase', car, onFoot: false, health: 100, arrestT: 0, ramT: 0, blockT: 0 };
  G.cops.push(cop);
  return cop;
}

function spawnFootCop(G) {
  const pt = edgeRoadPoint(G);
  const cop = { x: pt.x, y: pt.y, angle: 0, speed: 0, state: 'chase', car: null, onFoot: true, health: 100, arrestT: 0, ramT: 0, blockT: 0 };
  G.cops.push(cop);
  return cop;
}

/** Raise heat (0-100); wanted stars follow WANTED_THRESHOLDS. Notifies on a rise. */
export function addHeat(G, amount, reason) {
  G.heat = clamp((G.heat || 0) + amount, 0, 100);
  const w = wantedFor(G.heat);
  if (w > (G.wanted || 0)) {
    G.wanted = w;
    notify(G, 'Wanted level increased!');
    if (G.audio && typeof G.audio.siren === 'function') G.audio.siren(true);
  } else G.wanted = w;
}

/** Heat cools off only while no cop is within 500px; wanted 0 despawns all cops. */
export function updateWanted(G, dt) {
  const p = G.player;
  const near = G.cops.some((c) => dist(c.x, c.y, p.x, p.y) < 500);
  if (!near) G.heat = clamp((G.heat || 0) - 2 * dt, 0, 100);
  const w = wantedFor(G.heat);
  if (w > (G.wanted || 0)) notify(G, 'Wanted level increased!');
  G.wanted = w;
  if (G.wanted === 0 && G.cops.length) {
    for (const cop of [...G.cops]) removeCop(G, cop);
    if (G.audio && typeof G.audio.siren === 'function') G.audio.siren(false);
  }
}

/** Spawn n cops: patrol cars while below the wanted*2 car quota, else foot cops. */
export function spawnPolice(G, n) {
  for (let i = 0; i < n; i += 1) {
    const cars = G.cops.filter((c) => !c.onFoot).length;
    if (cars < Math.max(0, (G.wanted || 0) * 2)) spawnCarCop(G);
    else spawnFootCop(G);
  }
}

function chaseCar(G, cop, dt) {
  const car = cop.car, p = G.player;
  const tx = !p.onFoot && p.car ? p.car.x : p.x;
  const ty = !p.onFoot && p.car ? p.car.y : p.y;
  const want = Math.atan2(ty - car.y, tx - car.x);
  car.angle += clamp(normAngle(want - car.angle), -2.8 * dt, 2.8 * dt);
  const target = (car.model.maxSpeed || 500) * 0.85;
  car.speed += clamp(target - car.speed, -(car.model.brake || 480) * dt, (car.model.accel || 300) * dt);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  if (G.city.isBlockedPx(nx, ny)) { car.speed *= 0.4; car.angle += 0.6 * dt; }
  else { car.x = nx; car.y = ny; }
  cop.x = car.x; cop.y = car.y; cop.angle = car.angle; cop.speed = car.speed;
  // Ram the player's car (or the player on foot): damage + shake.
  cop.ramT = (cop.ramT || 0) - dt;
  const body = !p.onFoot && p.car ? p.car : p;
  const rr = !p.onFoot && p.car ? 48 : 26;
  if (cop.ramT <= 0 && dist(car.x, car.y, body.x, body.y) < rr) {
    cop.ramT = 0.9; G.shake = Math.max(G.shake || 0, 0.6);
    if (!p.onFoot && p.car) { p.car.hp = Math.max(0, (p.car.hp || 100) - 8); p.car.smoke = Math.min(1, (p.car.smoke || 0) + 0.2); }
    else hurtPlayer(G, 8);
    if (G.audio && typeof G.audio.crash === 'function') G.audio.crash();
  }
}

function chaseFoot(G, cop, dt) {
  const p = G.player, speed = 150;
  const want = Math.atan2(p.y - cop.y, p.x - cop.x);
  cop.angle = want;
  const nx = cop.x + Math.cos(want) * speed * dt;
  const ny = cop.y + Math.sin(want) * speed * dt;
  if (!G.city.isBlockedPx(nx, cop.y)) cop.x = nx;
  if (!G.city.isBlockedPx(cop.x, ny)) cop.y = ny;
  cop.speed = speed;
  // Arrest: within 40px of the player on foot for 2s straight.
  if (p.onFoot && dist(cop.x, cop.y, p.x, p.y) < 40) {
    cop.arrestT = (cop.arrestT || 0) + dt;
    if (cop.arrestT >= 2) { G.screen = 'gameover'; G.busted = true; }
  } else cop.arrestT = 0;
}

function roadblock(G) {
  const p = G.player;
  const dir = !p.onFoot && p.car ? p.car.angle : p.angle;
  const cx = p.x + Math.cos(dir) * 300, cy = p.y + Math.sin(dir) * 300;
  const px = Math.cos(dir + Math.PI / 2), py = Math.sin(dir + Math.PI / 2);
  for (const s of [-45, 45]) {
    const spot = G.city.nearestRoadPx ? G.city.nearestRoadPx(cx + px * s, cy + py * s) : { x: cx + px * s, y: cy + py * s };
    const car = makeCopCar(G, spot.x, spot.y, dir + Math.PI / 2);
    car.parked = true; car.speed = 0;
    G.cops.push({ x: spot.x, y: spot.y, angle: car.angle, speed: 0, state: 'chase', car, onFoot: false, health: 100, arrestT: 0, ramT: 0, blockT: 8 });
  }
  notify(G, 'Roadblock ahead!');
}

/** Keep patrol numbers at wanted*2 cars + wanted foot cops; drive the chase. */
export function updatePolice(G, dt) {
  if (!G.player || G.player.dead) return;
  const wanted = G.wanted || 0;
  if (G.audio && typeof G.audio.siren === 'function') G.audio.siren(wanted > 0);
  if (wanted > 0) {
    const cars = G.cops.filter((c) => !c.onFoot).length;
    const feet = G.cops.filter((c) => c.onFoot).length;
    if (cars < wanted * 2) spawnPolice(G, wanted * 2 - cars);
    if (feet < wanted) spawnPolice(G, wanted - feet);
  }
  if (wanted >= 4) {
    G._roadblockT = (G._roadblockT ?? 0) - dt;
    if (G._roadblockT <= 0) { G._roadblockT = 20; roadblock(G); }
  }
  for (const cop of [...G.cops]) {
    if (dist(cop.x, cop.y, G.player.x, G.player.y) > 2000) { removeCop(G, cop); continue; }
    if (cop.blockT > 0) { cop.blockT -= dt; continue; } // hold the roadblock
    if (cop.car) { cop.car.siren = true; chaseCar(G, cop, dt); }
    else chaseFoot(G, cop, dt);
  }
}

/** Pay at Spray & Go: clear wanted + heat, repair the player's car. */
export function clearWantedAtSpray(G) {
  const shop = G.city.landmarks && G.city.landmarks.sprayShop;
  if (!shop) return false;
  if (dist(G.player.x, G.player.y, shop.x, shop.y) > 150) return false;
  const cost = PRICES.spray ?? PRICES.clearWanted ?? 150;
  if ((G.player.money || 0) < cost) { notify(G, 'Not enough cash for a respray.'); return false; }
  G.player.money -= cost;
  G.wanted = 0; G.heat = 0;
  if (G.player.car) { G.player.car.hp = 100; G.player.car.smoke = 0; }
  for (const cop of [...G.cops]) removeCop(G, cop);
  if (G.audio && typeof G.audio.siren === 'function') G.audio.siren(false);
  notify(G, 'Respray complete — wanted cleared, car repaired.');
  return true;
}
