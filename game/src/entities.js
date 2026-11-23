// Player on foot + pedestrians. Only imports: none (uses G.city / G.input).
const WALK_SPEED = 170;
const RUN_SPEED = 300;
const PICKUP_R = 28;
const SHIRTS = ['#e8c15a', '#5a7d9a', '#c06a8e', '#6a9a5a', '#9a6a3a', '#7a6a9a'];

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function notify(G, text) {
  if (!G.notifications) G.notifications = [];
  G.notifications.push({ text, ttl: 4 });
  if (G.notifications.length > 5) G.notifications.shift();
}
function blood(G, x, y, n = 10) {
  for (let i = 0; i < n; i += 1) {
    G.particles.push({
      x, y, vx: (G.rng() - 0.5) * 160, vy: (G.rng() - 0.5) * 160,
      life: 0.7, color: '#a01818', size: 3,
    });
  }
}
function blocked(G, x, y) {
  if (x < 16 || y < 16 || x > 3840 - 16 || y > 3840 - 16) return true;
  return G.city.isBlockedPx ? G.city.isBlockedPx(x, y) : false;
}
// Axis-separated move so the player slides along walls.
function tryMove(G, p, dx, dy) {
  const r = 12;
  if (dx !== 0 && !blocked(G, p.x + dx + Math.sign(dx) * r, p.y - r)
    && !blocked(G, p.x + dx + Math.sign(dx) * r, p.y + r)) p.x += dx;
  if (dy !== 0 && !blocked(G, p.x - r, p.y + dy + Math.sign(dy) * r)
    && !blocked(G, p.x + r, p.y + dy + Math.sign(dy) * r)) p.y += dy;
}

export function createPlayer(G) {
  const sh = G && G.city && G.city.landmarks ? G.city.landmarks.safehouse : null;
  const x = sh ? sh.x + 48 : 1920;
  const y = sh ? sh.y + 48 : 1920;
  return {
    x, y, angle: 0, health: 100, armor: 0, money: 200,
    onFoot: true, car: null, weapon: 'fist',
    ammo: { pistol: 24, smg: 0, shotgun: 0 },
    owned: { pistol: true, smg: false, shotgun: false },
    speed: 0, dead: false, hurtT: 0,
  };
}

export function updatePlayerOnFoot(G, dt) {
  const p = G.player;
  if (!p || p.dead) return;
  if (p.hurtT > 0) p.hurtT -= dt;
  const inp = G.input;
  let ax = 0; let ay = 0;
  if (inp && typeof inp.axis === 'function') { const a = inp.axis(); ax = a.x; ay = a.y; }
  else if (inp && inp.keys) {
    if (inp.keys.has('KeyA') || inp.keys.has('ArrowLeft')) ax -= 1;
    if (inp.keys.has('KeyD') || inp.keys.has('ArrowRight')) ax += 1;
    if (inp.keys.has('KeyW') || inp.keys.has('ArrowUp')) ay -= 1;
    if (inp.keys.has('KeyS') || inp.keys.has('ArrowDown')) ay += 1;
  }
  const run = inp && inp.keys && (inp.keys.has('ShiftLeft') || inp.keys.has('ShiftRight'));
  const speed = run ? RUN_SPEED : WALK_SPEED;
  p.speed = (ax !== 0 || ay !== 0) ? speed : 0;
  if (ax !== 0 || ay !== 0) p.angle = Math.atan2(ay, ax);
  tryMove(G, p, ax * speed * dt, ay * speed * dt);

  // Pickups: world pickups + hidden city packages.
  for (const pk of G.pickups || []) {
    if (pk.taken) continue;
    if (dist(p.x, p.y, pk.x, pk.y) >= PICKUP_R) continue;
    pk.taken = true;
    if (pk.kind === 'health') { p.health = Math.min(100, p.health + 30); notify(G, 'Health +30'); }
    else if (pk.kind === 'armor') { p.armor = Math.min(100, p.armor + 50); notify(G, 'Armor +50'); }
    else if (pk.kind === 'money') { p.money += pk.amount || 25; notify(G, `+$${pk.amount || 25}`); }
    else if (pk.kind === 'package') takePackage(G);
    G.audio && G.audio.pickup && G.audio.pickup();
  }
  if (G.city.packages) {
    for (const pk of G.city.packages) {
      if (pk.taken) continue;
      if (dist(p.x, p.y, pk.x, pk.y) < PICKUP_R) { pk.taken = true; takePackage(G); G.audio && G.audio.pickup && G.audio.pickup(); }
    }
  }
  if (G.pickups) G.pickups = G.pickups.filter((pk) => !pk.taken);
}

function takePackage(G) {
  G.stats.packages += 1;
  G.player.money += 50;
  G.stats.moneyEarned += 50;
  notify(G, `Hidden package found! +$50 (${G.stats.packages}/20)`);
}

function scared(G, ped) {
  for (const b of G.bullets || []) if (dist(ped.x, ped.y, b.x, b.y) < 220) return true;
  for (const c of G.cars || []) {
    if (c.driver === 'player' || Math.abs(c.speed || 0) > 150) {
      if (dist(ped.x, ped.y, c.x, c.y) < 150) return true;
    }
  }
  return false;
}

export function updatePeds(G, dt) {
  for (const ped of G.peds || []) {
    if (ped.state === 'dead') { ped.deadT = (ped.deadT || 0) + dt; continue; }
    // Run over by a fast car.
    for (const c of G.cars || []) {
      if (Math.abs(c.speed || 0) > 150 && dist(ped.x, ped.y, c.x, c.y) < 22) {
        killPed(G, ped); break;
      }
    }
    if (ped.state === 'dead') continue;
    // Shot.
    for (let i = (G.bullets || []).length - 1; i >= 0; i -= 1) {
      const b = G.bullets[i];
      if (b.from === 'player' && dist(ped.x, ped.y, b.x, b.y) < 14) {
        G.bullets.splice(i, 1); killPed(G, ped); break;
      }
    }
    if (ped.state === 'dead') continue;
    if (ped.state !== 'flee' && scared(G, ped)) { ped.state = 'flee'; ped.wait = 0; }
    const speed = ped.state === 'flee' ? (ped.speed || 40) * 2.6 : (ped.speed || 40);
    if (ped.wait > 0) { ped.wait -= dt; continue; }
    if (!ped.dest || dist(ped.x, ped.y, ped.dest.x, ped.dest.y) < 24) {
      if (ped.state === 'flee') { ped.state = 'walk'; }
      ped.dest = G.city.randomRoadPoint(G.rng);
      ped.wait = 0.5 + G.rng() * 2;
      continue;
    }
    const a = Math.atan2(ped.dest.y - ped.y, ped.dest.x - ped.x);
    ped.angle = a;
    const nx = ped.x + Math.cos(a) * speed * dt;
    const ny = ped.y + Math.sin(a) * speed * dt;
    if (!G.city.isBlockedPx || !G.city.isBlockedPx(nx, ny)) { ped.x = nx; ped.y = ny; }
    else ped.dest = G.city.randomRoadPoint(G.rng);
  }
  // Corpses fade after 10 s.
  if (G.peds) G.peds = G.peds.filter((p) => p.state !== 'dead' || (p.deadT || 0) < 10);
}

function killPed(G, ped) {
  ped.state = 'dead';
  ped.deadT = 0;
  blood(G, ped.x, ped.y);
  G.stats.kills += 1;
}

export function spawnPeds(G, n) {
  const cx = G.camera.x + 640;
  const cy = G.camera.y + 360;
  for (let i = 0; i < n; i += 1) {
    const spot = G.city.nearestRoadPx
      ? G.city.nearestRoadPx(cx + (G.rng() - 0.5) * 1100, cy + (G.rng() - 0.5) * 650)
      : G.city.randomRoadPoint(G.rng);
    const shirt = SHIRTS[Math.floor(G.rng() * SHIRTS.length)];
    G.peds.push({
      x: spot.x, y: spot.y, angle: G.rng() * Math.PI * 2,
      speed: 28 + G.rng() * 20, state: 'walk', color: shirt, shirt,
      dest: G.city.randomRoadPoint(G.rng), wait: 0,
    });
  }
}

export function nearestPed(G, x, y, r) {
  let best = null; let bd = r;
  for (const ped of G.peds || []) {
    if (ped.state === 'dead') continue;
    const d = dist(x, y, ped.x, ped.y);
    if (d < bd) { bd = d; best = ped; }
  }
  return best;
}
