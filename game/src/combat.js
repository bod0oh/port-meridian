// Combat for PORT MERIDIAN — Open World Crime.
// Fists + pistol/SMG/shotgun (mouse aim), reloads, bullets, gang AI,
// and damage helpers for peds, cops and gang members.
import { WEAPONS, WANTED_THRESHOLDS } from './config.js';

const FIRE_RATE = { pistol: 0.28, smg: 0.09, shotgun: 0.85 };
const MAG_SIZE = { pistol: 12, smg: 30, shotgun: 6 };
const DMG = { pistol: 25, smg: 14, shotgun: 40 };
const BULLET_SPEED = 900;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const rnd = (G) => (typeof G.rng === 'function' ? G.rng() : Math.random());
const notify = (G, text) => G.notifications.push({ text, ttl: 4 });

const wdef = (w) => WEAPONS[w] || {};
const magSize = (w) => wdef(w).magSize ?? MAG_SIZE[w] ?? 12;
// Config fireRate is shots per second -> cooldown is its reciprocal.
const fireRate = (w) => { const r = wdef(w).fireRate; return r ? 1 / r : (FIRE_RATE[w] ?? 0.3); };
const reloadTime = (w) => wdef(w).reloadTime ?? 1.0;
const bulletSpeed = (w) => wdef(w).bulletSpeed ?? BULLET_SPEED;
const pellets = (w) => wdef(w).pellets ?? (w === 'shotgun' ? 5 : 1);
const dmg = (w) => wdef(w).damage ?? DMG[w] ?? 10;

function wantedFor(heat) {
  let w = 0;
  for (let i = 0; i < WANTED_THRESHOLDS.length; i += 1) if (heat >= (WANTED_THRESHOLDS[i] ?? 0)) w = i;
  return w;
}
// Combat raises heat directly (police.js owns addHeat; this module must not import it).
function addHeatLocal(G, amount) {
  G.heat = clamp((G.heat || 0) + amount, 0, 100);
  const w = wantedFor(G.heat);
  if (w > (G.wanted || 0)) { G.wanted = w; notify(G, 'Wanted level increased!'); }
  else G.wanted = w;
}

function hurtPlayer(G, amount) {
  const p = G.player;
  if (p.armor > 0) { const ab = Math.min(p.armor, amount); p.armor -= ab; amount -= ab; }
  p.health -= amount; p.hurtT = 0.5; G.shake = Math.max(G.shake || 0, 0.25);
}

function sparks(G, x, y, color, n) {
  for (let i = 0; i < n; i += 1) {
    const a = rnd(G) * Math.PI * 2, s = 60 + rnd(G) * 160;
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3, maxLife: 0.3, color, size: 2 + rnd(G) * 2, kind: 'spark' });
  }
}

// Loaded rounds per weapon; reserve stays in player.ammo (shown by the HUD).
function ensureMag(G) {
  const p = G.player;
  p.mag = p.mag || {};
  const w = p.weapon;
  if (p.mag[w] === undefined) {
    const take = Math.min(magSize(w), p.ammo[w] || 0);
    p.mag[w] = take; p.ammo[w] = (p.ammo[w] || 0) - take;
  }
  return p.mag[w];
}

function meleeHit(G, aim) {
  const p = G.player;
  let best = null, bd = 46;
  const consider = (t, r) => {
    const d = dist(p.x, p.y, t.x, t.y);
    if (d < bd && Math.abs(Math.atan2(t.y - p.y, t.x - p.x) - aim) < 1.2) { best = t; bd = d; }
  };
  for (const ped of G.peds) if (ped.state !== 'dead') consider(ped, 14);
  for (const cop of G.cops) consider(cop, 16);
  for (const g of G.gang) if (g.health > 0) consider(g, 16);
  if (!best) return;
  sparks(G, best.x, best.y, '#e8b04b', 4);
  if (G.gang.includes(best)) damageGang(G, best, 15, 'player');
  else if (G.cops.includes(best)) damageCop(G, best, 15, 'player');
  else damagePed(G, best, 15, 'player');
}

/** Fire the equipped weapon toward the mouse (called while mouse is held). */
export function fireWeapon(G) {
  const p = G.player;
  if (!p || p.dead || (p.reloadT || 0) > 0 || (p.fireT || 0) > 0) return;
  const w = p.weapon || 'fist';
  const aim = Math.atan2((G.mouse.wy ?? p.y) - p.y, (G.mouse.wx ?? p.x) - p.x);
  p.angle = aim;
  if (w === 'fist') {
    p.fireT = 0.4; p.meleeT = 0.4;
    sparks(G, p.x + Math.cos(aim) * 30, p.y + Math.sin(aim) * 30, '#e8b04b', 3);
    meleeHit(G, aim);
    return;
  }
  const mag = ensureMag(G);
  if (mag <= 0) {
    if ((p.ammo[w] || 0) > 0) reloadWeapon(G); // auto-reload when the mag is dry
    return;
  }
  p.mag[w] -= 1;
  p.fireT = fireRate(w);
  G.stats.shotsFired = (G.stats.shotsFired || 0) + 1;
  const speed = bulletSpeed(w);
  const life = (wdef(w).range ?? 990) / speed;
  for (let i = 0; i < pellets(w); i += 1) {
    const spread = w === 'shotgun' ? (rnd(G) - 0.5) * 0.36 : (rnd(G) - 0.5) * 0.02;
    const a = aim + spread;
    G.bullets.push({
      x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life, damage: dmg(w), from: 'player',
    });
  }
  sparks(G, p.x + Math.cos(aim) * 24, p.y + Math.sin(aim) * 24, '#ffd76a', 3);
  if (G.audio && typeof G.audio.shot === 'function') G.audio.shot();
}
export const tryFire = fireWeapon; // main.js calls tryFire while the mouse is held

/** Start a reload: moves reserve ammo (player.ammo) into the mag over 1s. */
export function reloadWeapon(G) {
  const p = G.player;
  if (!p || p.dead || !p.weapon || p.weapon === 'fist' || (p.reloadT || 0) > 0) return;
  const w = p.weapon;
  if (ensureMag(G) >= magSize(w)) return;
  if ((p.ammo[w] || 0) <= 0) { notify(G, 'No ammo — buy more at Ironworks.'); return; }
  p.reloadT = reloadTime(w); p._reloadWeapon = w;
}

function tickPlayerTimers(G, dt) {
  const p = G.player;
  if ((p.fireT || 0) > 0) p.fireT = Math.max(0, p.fireT - dt);
  if ((p.meleeT || 0) > 0) p.meleeT = Math.max(0, p.meleeT - dt);
  if ((p.reloadT || 0) > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      p.reloadT = 0;
      const w = p._reloadWeapon;
      if (w && w === p.weapon) {
        const take = Math.min(magSize(w) - (p.mag[w] || 0), p.ammo[w] || 0);
        p.mag[w] = (p.mag[w] || 0) + take; p.ammo[w] -= take;
      }
      p._reloadWeapon = null;
    }
  }
}

function hasLOS(G, ax, ay, bx, by) {
  for (const t of [0.25, 0.5, 0.75]) {
    if (G.city.isBlockedPx(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

function damageGang(G, g, amount, from) {
  if (!g || g.health <= 0) return;
  g.health -= amount;
  sparks(G, g.x, g.y, '#c0392b', 5);
  if (g.health <= 0) {
    g.health = 0; g.alive = false;
    if (from === 'player') G.stats.kills = (G.stats.kills || 0) + 1;
    if (rnd(G) < 0.5) G.pickups.push({ x: g.x, y: g.y, kind: 'money', amount: 20 + Math.floor(rnd(G) * 40), taken: false });
  }
}

/** Damage a civilian ped; killing one in front of the player raises heat. */
export function damagePed(G, ped, amount, from) {
  if (!ped || ped.state === 'dead') return;
  ped.health = (ped.health ?? 50) - amount;
  ped.state = 'flee';
  sparks(G, ped.x, ped.y, '#c0392b', 5);
  if (ped.health <= 0) {
    ped.health = 0; ped.state = 'dead'; ped.speed = 0;
    if (from === 'player') {
      G.stats.kills = (G.stats.kills || 0) + 1;
      addHeatLocal(G, 10);
    }
  }
}

/** Damage a cop; killing one raises heat by 20 and removes them (+ their car). */
export function damageCop(G, cop, amount, from) {
  if (!cop || cop.health <= 0) return;
  cop.health -= amount;
  sparks(G, cop.x, cop.y, '#c0392b', 5);
  if (cop.health <= 0) {
    cop.health = 0;
    const i = G.cops.indexOf(cop);
    if (i >= 0) G.cops.splice(i, 1);
    if (cop.car) { const j = G.cars.indexOf(cop.car); if (j >= 0) G.cars.splice(j, 1); }
    if (from === 'player') {
      G.stats.kills = (G.stats.kills || 0) + 1;
      addHeatLocal(G, 20);
      notify(G, 'Officer down!');
    }
  }
}

/** Move bullets, resolve wall / ped / cop / gang / player hits. */
export function updateBullets(G, dt) {
  tickPlayerTimers(G, dt);
  for (let i = G.bullets.length - 1; i >= 0; i -= 1) {
    const b = G.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0) { G.bullets.splice(i, 1); continue; }
    if (G.city.isBlockedPx(b.x, b.y)) { sparks(G, b.x, b.y, '#ffd76a', 3); G.bullets.splice(i, 1); continue; }
    if (b.from === 'enemy') {
      const p = G.player;
      const body = !p.onFoot && p.car ? p.car : p;
      const r = !p.onFoot && p.car ? 30 : 16;
      if (dist(b.x, b.y, body.x, body.y) < r) {
        if (!p.onFoot && p.car) { p.car.hp = Math.max(0, (p.car.hp || 100) - b.damage); G.shake = Math.max(G.shake || 0, 0.3); }
        else hurtPlayer(G, b.damage);
        sparks(G, b.x, b.y, '#e5534b', 4);
        G.bullets.splice(i, 1);
      }
      continue;
    }
    let hit = false;
    for (const g of [...G.gang]) {
      if (g.health > 0 && dist(b.x, b.y, g.x, g.y) < 16) { damageGang(G, g, b.damage, b.from); hit = true; break; }
    }
    if (!hit) for (const cop of [...G.cops]) {
      if (dist(b.x, b.y, cop.x, cop.y) < 16) { damageCop(G, cop, b.damage, b.from); hit = true; break; }
    }
    if (!hit) for (const ped of G.peds) {
      if (ped.state !== 'dead' && dist(b.x, b.y, ped.x, ped.y) < 14) { damagePed(G, ped, b.damage, b.from); hit = true; break; }
    }
    if (hit) G.bullets.splice(i, 1);
  }
  G.gang = (G.gang || []).filter((g) => g.health > 0 && g.alive !== false);
}

/** Spawn n Rust Vipers gang members at (x, y). */
export function spawnGang(G, x, y, n) {
  for (let i = 0; i < n; i += 1) {
    G.gang.push({
      x: x + (rnd(G) - 0.5) * 60, y: y + (rnd(G) - 0.5) * 60,
      angle: rnd(G) * Math.PI * 2, health: 60, weapon: 'pistol',
      state: 'idle', shootT: rnd(G) * 0.5,
      alive: true, name: 'Rust Viper', color: '#8e2f26', shirt: '#8e2f26', speed: 0,
    });
  }
}

function gangMove(G, g, angle, speed, dt) {
  const nx = g.x + Math.cos(angle) * speed * dt;
  const ny = g.y + Math.sin(angle) * speed * dt;
  if (!G.city.isBlockedPx(nx, g.y)) g.x = nx;
  if (!G.city.isBlockedPx(g.x, ny)) g.y = ny;
}

/** Gang AI: close in under 600px, shoot under 400px with line of sight, flee under 25 HP. */
export function updateGang(G, dt) {
  const p = G.player;
  for (const g of [...(G.gang || [])]) {
    if (g.health <= 0 || g.alive === false) continue;
    const d = dist(g.x, g.y, p.x, p.y);
    if (d > 600) { g.state = 'idle'; continue; }
    g.angle = Math.atan2(p.y - g.y, p.x - g.x);
    if (g.health < 25) {
      g.state = 'flee';
      gangMove(G, g, Math.atan2(g.y - p.y, g.x - p.x), 150, dt);
      continue;
    }
    if (d > 150) { g.state = 'chase'; gangMove(G, g, g.angle, 120, dt); }
    else g.state = 'combat';
    if (d < 400 && hasLOS(G, g.x, g.y, p.x, p.y)) {
      g.shootT -= dt;
      if (g.shootT <= 0) {
        g.shootT = 1.2;
        const a = g.angle + (rnd(G) - 0.5) * 0.12;
        G.bullets.push({
          x: g.x + Math.cos(a) * 22, y: g.y + Math.sin(a) * 22,
          vx: Math.cos(a) * 700, vy: Math.sin(a) * 700,
          life: 1.2, damage: 10, from: 'enemy',
        });
        sparks(G, g.x + Math.cos(a) * 24, g.y + Math.sin(a) * 24, '#ffd76a', 2);
        if (G.audio && typeof G.audio.shot === 'function') G.audio.shot();
      }
    }
  }
  G.gang = (G.gang || []).filter((g) => g.health > 0 && g.alive !== false);
}
