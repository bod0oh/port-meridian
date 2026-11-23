// Cars: traffic AI, player driving, steal / exit / damage. Imports config only.
import { CAR_MODELS } from './config.js';

const TARGET_TRAFFIC = 14;
const DESPAWN_R = 900;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function notify(G, text) {
  if (!G.notifications) G.notifications = [];
  G.notifications.push({ text, ttl: 4 });
  if (G.notifications.length > 5) G.notifications.shift();
}
function burst(G, x, y, color, n, spd = 160, life = 0.7, size = 3) {
  for (let i = 0; i < n; i += 1) {
    G.particles.push({
      x, y, vx: (G.rng() - 0.5) * spd, vy: (G.rng() - 0.5) * spd,
      life: life * (0.5 + G.rng() * 0.5), color, size,
    });
  }
}
function modelByName(name) {
  if (typeof name === 'string' && CAR_MODELS[name]) return CAR_MODELS[name];
  return Object.values(CAR_MODELS).find((m) => m.name === name) || CAR_MODELS.sedan;
}
function blocked(G, x, y) {
  if (x < 16 || y < 16 || x > 3840 - 16 || y > 3840 - 16) return true;
  return G.city.isBlockedPx ? G.city.isBlockedPx(x, y) : false;
}

export function createCar(G, modelName, x, y, angle, driver) {
  G.nextCarId = (G.nextCarId || 0) + 1;
  return {
    id: `car-${G.nextCarId}`, x, y, angle: angle || 0, speed: 0,
    model: modelByName(modelName), hp: 100, driver: driver || null,
    parked: !driver, smoke: 0, siren: false, npcDest: null, waitT: 0, turnT: 0,
  };
}

export function spawnTraffic(G) {
  const cx = G.camera.x + 640;
  const cy = G.camera.y + 360;
  // Despawn NPC cars far from the camera (never the player's car).
  G.cars = G.cars.filter((c) => c === G.player.car || dist(c.x, c.y, cx, cy) < DESPAWN_R);
  let npc = 0;
  for (const c of G.cars) if (c.driver === 'npc') npc += 1;
  for (let i = npc; i < TARGET_TRAFFIC; i += 1) {
    // Spawn just off a viewport edge, snapped to a road.
    const edge = Math.floor(G.rng() * 4);
    let x = cx; let y = cy;
    if (edge === 0) { x = cx - 700 + G.rng() * 1400; y = cy - 420; }
    else if (edge === 1) { x = cx - 700 + G.rng() * 1400; y = cy + 420; }
    else if (edge === 2) { x = cx - 700; y = cy - 380 + G.rng() * 760; }
    else { x = cx + 700; y = cy - 380 + G.rng() * 760; }
    const spot = G.city.nearestRoadPx ? G.city.nearestRoadPx(x, y) : { x, y };
    const models = Object.values(CAR_MODELS);
    const model = models[Math.floor(G.rng() * models.length)];
    const car = createCar(G, model.name, spot.x, spot.y, Math.floor(G.rng() * 4) * Math.PI / 2, 'npc');
    car.speed = 60 + G.rng() * 120;
    car.parked = false;
    G.cars.push(car);
  }
}

export function updateTraffic(G, dt) {
  spawnTraffic(G);
  const cars = G.cars;
  for (const car of cars) {
    if (car.driver !== 'npc' || car.parked) continue;
    car.turnT -= dt;
    // Random turn at intersections: snap to a road axis.
    if (car.turnT <= 0) {
      car.turnT = 2 + G.rng() * 4;
      if (G.rng() < 0.4) car.angle = Math.floor(G.rng() * 4) * Math.PI / 2;
    }
    // Stop if a car is ahead within 70 px.
    let blockedAhead = false;
    for (const o of cars) {
      if (o === car) continue;
      const dx = o.x - car.x; const dy = o.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 70 && d > 1 && (dx * Math.cos(car.angle) + dy * Math.sin(car.angle)) / d > 0.7) {
        blockedAhead = true; break;
      }
    }
    const target = blockedAhead ? 0 : 60 + (car.cruise || 90);
    car.speed += Math.sign(target - car.speed) * 140 * dt;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (blocked(G, nx, ny)) {
      // Hit a building: turn away, take damage.
      car.angle += Math.PI / 2;
      car.speed *= -0.3;
      damageCar(G, car, 5);
      burst(G, car.x, car.y, '#cccccc', 6, 100, 0.5, 2);
    } else { car.x = nx; car.y = ny; }
    // Soft separation between cars.
    for (const o of cars) {
      if (o === car) continue;
      const d = dist(car.x, car.y, o.x, o.y);
      if (d > 0.1 && d < 34) {
        const push = (34 - d) / 2;
        const a = Math.atan2(car.y - o.y, car.x - o.x);
        car.x += Math.cos(a) * push; car.y += Math.sin(a) * push;
      }
    }
  }
  G.cars = G.cars.filter((c) => c.hp > -20 || c === G.player.car);
}

export function updatePlayerCar(G, dt) {
  const p = G.player;
  const car = p.car;
  if (!car) { p.onFoot = true; return; }
  const keys = (G.input && G.input.keys) || new Set();
  const m = car.model || {};
  const maxSpeed = m.maxSpeed || 420;
  const accel = m.accel || 280;
  const brake = m.brake || 480;
  const handling = m.handling || 2.4;
  const stalled = car.hp <= 0;
  const handbrake = keys.has('Space');

  if (!stalled) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) car.speed += accel * dt;
    if (keys.has('KeyS') || keys.has('ArrowDown')) {
      car.speed -= (car.speed > 0 ? brake : accel * 0.6) * dt;
    }
    if (handbrake) car.speed -= Math.sign(car.speed) * 500 * dt;
  }
  // Drag + rolling resistance.
  car.speed -= car.speed * 0.4 * dt;
  if (Math.abs(car.speed) < 4 && !keys.has('KeyW')) car.speed = 0;
  car.speed = Math.max(-maxSpeed * 0.45, Math.min(maxSpeed, car.speed));

  // Steering: stronger at speed, looser + drift on handbrake.
  const steer = ((keys.has('KeyA') || keys.has('ArrowLeft')) ? -1 : 0)
    + ((keys.has('KeyD') || keys.has('ArrowRight')) ? 1 : 0);
  const grip = handbrake ? 0.35 : 1;
  car.angle += steer * handling * Math.min(1, Math.abs(car.speed) / 160) * dt * Math.sign(car.speed || 1) * grip;

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const r = 14;
  if (blocked(G, nx + Math.cos(car.angle) * 20, ny + Math.sin(car.angle) * 20)
    || blocked(G, nx, ny)) {
    // Crash into a building.
    if (Math.abs(car.speed) > 120) {
      damageCar(G, car, Math.min(25, Math.abs(car.speed) / 18));
      burst(G, car.x, car.y, '#ffcc66', 8, 200, 0.5, 3);
      G.shake = Math.min(12, (G.shake || 0) + 6);
      G.audio && G.audio.crash && G.audio.crash();
    }
    car.speed *= -0.25;
  } else {
    car.x = nx; car.y = ny;
    // Crash into other cars.
    for (const o of G.cars) {
      if (o === car) continue;
      if (dist(car.x, car.y, o.x, o.y) < 36 && Math.abs(car.speed) > 80) {
        damageCar(G, car, 8); damageCar(G, o, 8);
        G.shake = Math.min(12, (G.shake || 0) + 5);
        G.audio && G.audio.crash && G.audio.crash();
        car.speed *= 0.4;
      }
    }
  }
  // Handbrake drift: skid marks + smoke.
  if (handbrake && Math.abs(car.speed) > 100) {
    G.skids.push({ x: car.x, y: car.y, angle: car.angle, life: 2.5 });
    if (G.skids.length > 300) G.skids.shift();
    if (G.rng() < 0.5) burst(G, car.x, car.y, '#bbbbbb', 1, 40, 0.6, 3);
  }
  // Heavy smoke when badly damaged.
  if (car.hp <= 30 && car.hp > 0) {
    car.smoke = 1;
    if (G.rng() < 0.4) burst(G, car.x, car.y, '#555555', 1, 30, 1, 4);
  } else car.smoke = 0;
  p.x = car.x; p.y = car.y; p.angle = car.angle; p.speed = car.speed;
}

export function tryEnterCar(G) {
  const p = G.player;
  if (!p.onFoot) return false;
  let best = null; let bd = 48;
  for (const c of G.cars) {
    if (c === p.car) continue;
    const d = dist(p.x, p.y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best || best.hp <= 0) return false;
  const wasNpc = best.driver === 'npc';
  const wasParked = best.parked && !best.driver;
  if (wasNpc) {
    // Driver bails out and flees on foot.
    G.peds.push({
      x: best.x + 20, y: best.y + 20, angle: 0, speed: 40, state: 'flee',
      color: '#c06a8e', shirt: '#c06a8e', dest: null, wait: 0,
    });
  }
  // A cop nearby sees the theft.
  for (const cop of G.cops || []) {
    if (dist(p.x, p.y, cop.x, cop.y) < 500) { G.heat = Math.min(100, G.heat + 15); break; }
  }
  best.driver = 'player';
  best.parked = false;
  p.car = best;
  p.onFoot = false;
  if (wasNpc || wasParked) G.stats.carsStolen += 1;
  return true;
}

export function exitCar(G) {
  const p = G.player;
  const car = p.car;
  if (!car) { p.onFoot = true; return; }
  const side = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(side) * 30;
  p.y = car.y + Math.sin(side) * 30;
  p.angle = car.angle;
  p.speed = 0;
  car.driver = null;
  car.speed = 0;
  p.car = null;
  p.onFoot = true;
}

export function damageCar(G, car, amount) {
  if (!car || car.hp <= -20) return;
  car.hp -= amount;
  if (car.hp <= 30 && car.hp > 0) car.smoke = 1;
  if (car.hp <= 0 && car.driver === 'player') {
    car.speed = 0;
    notify(G, 'Your car broke down!');
  }
  if (car.hp <= -20) {
    // Explosion.
    burst(G, car.x, car.y, '#ff7a1a', 22, 320, 0.9, 5);
    burst(G, car.x, car.y, '#ffcc66', 14, 220, 0.6, 4);
    burst(G, car.x, car.y, '#333333', 10, 90, 1.4, 6);
    G.shake = Math.min(16, (G.shake || 0) + 10);
    G.audio && G.audio.crash && G.audio.crash();
    if (car.driver === 'player') {
      G.player.car = null;
      G.player.onFoot = true;
      G.player.x = car.x; G.player.y = car.y;
    }
    G.cars = G.cars.filter((c) => c !== car);
  }
}
