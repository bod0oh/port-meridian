// Drawing only: the game state and a canvas context in, pixels out.
// drawGame paints just the tiles and buildings inside the camera viewport, so a
// frame stays cheap at 60 FPS. HUD, menus and dialogs live in hud.js, not here.
import { CITY_H, CITY_W, FONT, PALETTE, TILE, VIEW } from './config.js';
import { GRID_BUILDING, GRID_PLAZA, GRID_ROAD, GRID_SAND, GRID_SIDEWALK, GRID_WATER } from './city.js';

const NEON_SIGNS = ['NEON', 'CLUB VOLT', 'PIER 9', 'HOTEL LUX', 'BAR 88', 'DISCO 7'];

const LANDMARK_LABELS = {
  safehouse: { text: 'SAFEHOUSE', color: '#39d353' },
  sprayShop: { text: 'SPRAY & GO', color: '#ff8c1a' },
  gunShop: { text: 'IRONWORKS', color: '#c8cdd4' },
  dealer: { text: 'DEALER', color: '#b678e8' },
  hospital: { text: 'HOSPITAL', color: '#ffffff' },
  bank: { text: 'BANK', color: '#f2c230' },
  warehouse: { text: 'WAREHOUSE', color: '#c98a4a' },
  taxiStand: { text: 'TAXI', color: '#ffe600' },
};

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/** 0 by day, up to 0.55 deep at night; dusk/dawn fade over one hour each side. */
export function nightAlpha(clock) {
  const hour = ((clock / 3600) % 24 + 24) % 24;
  if (hour < 5 || hour >= 20) return 0.55;
  if (hour < 7) return 0.55 * ((7 - hour) / 2);
  if (hour < 18) return 0;
  if (hour < 20) return 0.55 * ((hour - 18) / 2);
  return 0.55;
}

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** World point -> viewport point. */
export function worldToScreen(G, x, y) {
  const cam = G.camera || { x: 0, y: 0 };
  return { x: x - cam.x, y: y - cam.y };
}

/** Viewport point -> world point. */
export function screenToWorld(G, x, y) {
  const cam = G.camera || { x: 0, y: 0 };
  return { x: x + cam.x, y: y + cam.y };
}

function drawGround(G, ctx, cam, night) {
  const city = G.city;
  const tx0 = Math.max(0, Math.floor(cam.x / TILE));
  const ty0 = Math.max(0, Math.floor(cam.y / TILE));
  const tx1 = Math.min(CITY_W - 1, Math.ceil((cam.x + VIEW.width) / TILE));
  const ty1 = Math.min(CITY_H - 1, Math.ceil((cam.y + VIEW.height) / TILE));
  const waveTick = Math.floor((G.clock || 0) / 2);
  for (let ty = ty0; ty <= ty1; ty += 1) {
    for (let tx = tx0; tx <= tx1; tx += 1) {
      const v = city.grid[ty * CITY_W + tx];
      const px = tx * TILE;
      const py = ty * TILE;
      if (v === GRID_ROAD) ctx.fillStyle = PALETTE.asphalt;
      else if (v === GRID_BUILDING) ctx.fillStyle = PALETTE.sidewalkDark;
      else if (v === GRID_WATER) ctx.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.water : PALETTE.waterDeep;
      else if (v === GRID_SAND) ctx.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.sand : PALETTE.sandDark;
      else if (v === GRID_PLAZA) ctx.fillStyle = PALETTE.plaza;
      else ctx.fillStyle = ((tx + ty) % 2 === 0) ? PALETTE.sidewalk : PALETTE.sidewalkDark;
      ctx.fillRect(px, py, TILE, TILE);
      if (v === GRID_WATER && (tx * 7 + ty * 13 + waveTick) % 6 === 0) {
        ctx.fillStyle = PALETTE.waterLight;
        ctx.fillRect(px + 6, py + 14, 20, 3);
      }
    }
  }

  // Dashed centre lines down every road strip (yellow) — one line per strip, not per tile.
  ctx.strokeStyle = PALETTE.roadLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([20, 26]);
  ctx.beginPath();
  for (let k = 0; k < 15; k += 1) {
    const vx = (k * 8 + 1) * TILE + TILE / 2;
    if (vx >= cam.x - TILE && vx <= cam.x + VIEW.width + TILE) {
      ctx.moveTo(vx, cam.y - TILE);
      ctx.lineTo(vx, cam.y + VIEW.height + TILE);
    }
    const hy = (k * 8 + 1) * TILE + TILE / 2;
    if (hy >= cam.y - TILE && hy <= cam.y + VIEW.height + TILE) {
      ctx.moveTo(cam.x - TILE, hy);
      ctx.lineTo(cam.x + VIEW.width + TILE, hy);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawParksAndDocks(G, ctx, cam) {
  const city = G.city;
  for (let i = 0; i < city.parks.length; i += 1) {
    const p = city.parks[i];
    if (p.x + p.w < cam.x || p.x > cam.x + VIEW.width || p.y + p.h < cam.y || p.y > cam.y + VIEW.height) continue;
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    // Three trees at fixed spots inside the park, keyed by the park index.
    for (let t = 0; t < 3; t += 1) {
      const hx = (i * 37 + t * 61) % 120 + 36;
      const hy = (i * 53 + t * 89) % 120 + 36;
      ctx.fillStyle = PALETTE.grassLight;
      circle(ctx, p.x + hx, p.y + hy, 14);
      ctx.fillStyle = PALETTE.grass;
      circle(ctx, p.x + hx, p.y + hy, 9);
    }
  }
  for (let i = 0; i < city.docks.length; i += 1) {
    const d = city.docks[i];
    if (d.x + d.w < cam.x || d.x > cam.x + VIEW.width || d.y + d.h < cam.y || d.y > cam.y + VIEW.height) continue;
    ctx.fillStyle = PALETTE.dock;
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.fillStyle = PALETTE.dockDark;
    for (let x = d.x + 22; x < d.x + d.w; x += 32) ctx.fillRect(x, d.y, 3, d.h);
  }
}

function drawBuildings(G, ctx, cam, night) {
  const city = G.city;
  const lit = night > 0.25;
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    if (b.x + b.w < cam.x || b.x > cam.x + VIEW.width || b.y + b.h < cam.y || b.y > cam.y + VIEW.height) continue;
    // Soft offset shadow, then body, then a darker roof inset.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    // Windows in a small grid; at night some glow warm yellow.
    const cols = Math.floor((b.w - 16) / 16);
    const rows = Math.floor((b.h - 16) / 16);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const on = lit && ((b.seed + c * 7 + r * 13) % 5 < 2);
        ctx.fillStyle = on ? '#ffd97a' : 'rgba(20,28,40,0.55)';
        ctx.fillRect(b.x + 10 + c * 16, b.y + 10 + r * 16, 9, 11);
      }
    }
  }
}

function drawLandmarks(G, ctx, cam) {
  const city = G.city;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const key of Object.keys(LANDMARK_LABELS)) {
    const lm = city.landmarks[key];
    if (!lm) continue;
    if (lm.x < cam.x - 80 || lm.x > cam.x + VIEW.width + 80 || lm.y < cam.y - 40 || lm.y > cam.y + VIEW.height + 40) continue;
    const label = LANDMARK_LABELS[key];
    ctx.fillStyle = label.color;
    ctx.fillRect(lm.x - 9, lm.y - 9, 18, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(lm.x - 9, lm.y - 9, 18, 4);
    ctx.font = `bold 11px ${FONT}`;
    const w = ctx.measureText(label.text).width + 12;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(lm.x - w / 2, lm.y - 28, w, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label.text, lm.x, lm.y - 20);
  }
}

function drawSkidsAndPackages(G, ctx, cam) {
  const skids = G.skids || [];
  ctx.strokeStyle = 'rgba(10,10,12,0.55)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i < skids.length; i += 1) {
    const s = skids[i];
    if (s.x1 !== undefined) {
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    } else {
      const len = s.length || 22;
      const a = s.angle || 0;
      ctx.moveTo(s.x - Math.cos(a) * len / 2, s.y - Math.sin(a) * len / 2);
      ctx.lineTo(s.x + Math.cos(a) * len / 2, s.y + Math.sin(a) * len / 2);
    }
  }
  ctx.stroke();
  const pkgs = (G.city && G.city.packages) || [];
  const pulse = 0.6 + 0.4 * Math.sin((G.clock || 0) * 3);
  for (let i = 0; i < pkgs.length; i += 1) {
    const p = pkgs[i];
    if (p.taken) continue;
    if (p.x < cam.x - 20 || p.x > cam.x + VIEW.width + 20 || p.y < cam.y - 20 || p.y > cam.y + VIEW.height + 20) continue;
    ctx.fillStyle = `rgba(242,201,76,${0.25 * pulse})`;
    circle(ctx, p.x, p.y, 16);
    ctx.fillStyle = '#f2c94c';
    ctx.fillRect(p.x - 7, p.y - 7, 14, 14);
    ctx.fillStyle = '#8a6d1f';
    ctx.fillRect(p.x - 7, p.y - 1, 14, 2);
  }
  // Stunt ramps: a small striped wedge on the road.
  const ramps = (G.city && G.city.ramps) || [];
  for (let i = 0; i < ramps.length; i += 1) {
    const r = ramps[i];
    if (r.x < cam.x - 30 || r.x > cam.x + VIEW.width + 30 || r.y < cam.y - 30 || r.y > cam.y + VIEW.height + 30) continue;
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.angle);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-14, -10, 28, 20);
    ctx.fillStyle = '#d9382b';
    ctx.fillRect(-14, -10, 28, 6);
    ctx.restore();
  }
}

function drawMissionMarker(G, ctx) {
  const mission = G.mission;
  if (!mission || !mission.target || mission.status !== 'active') return;
  const t = mission.target;
  const bob = Math.sin((G.clock || 0) * 3) * 6;
  ctx.strokeStyle = '#ffe600';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(t.x, t.y, 22 + Math.sin((G.clock || 0) * 3) * 4, 0, Math.PI * 2);
  ctx.stroke();
  // Floating arrow above the target.
  ctx.fillStyle = '#ffe600';
  ctx.beginPath();
  ctx.moveTo(t.x, t.y - 34 + bob);
  ctx.lineTo(t.x - 10, t.y - 52 + bob);
  ctx.lineTo(t.x + 10, t.y - 52 + bob);
  ctx.closePath();
  ctx.fill();
}

function drawCar(G, ctx, car, night) {
  const m = car.model || {};
  const len = m.len || 72;
  const wid = m.wid || 34;
  const color = m.color || '#888888';
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle || 0);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(3, 5, len / 2, wid / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  rr(ctx, -len / 2, -wid / 2, len, wid, 8);
  ctx.fill();
  // Windshield and rear window.
  ctx.fillStyle = 'rgba(18,26,38,0.85)';
  ctx.fillRect(len * 0.12, -wid / 2 + 4, len * 0.2, wid - 8);
  ctx.fillRect(-len * 0.32, -wid / 2 + 4, len * 0.14, wid - 8);
  if (car.driver === 'police' || m.id === 'police') {
    // White doors and a flashing light bar.
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-len * 0.08, -wid / 2, len * 0.16, wid);
    const flash = Math.floor((G.clock || 0) * 4) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2d2d' : '#2d5bff';
    ctx.fillRect(-6, -wid / 2 - 2, 12, 6);
    ctx.fillStyle = flash ? '#2d5bff' : '#ff2d2d';
    ctx.fillRect(-6, wid / 2 - 4, 12, 6);
  }
  if (m.id === 'taxi') {
    ctx.fillStyle = '#111111';
    ctx.fillRect(-8, -wid / 2 - 3, 16, 6);
  }
  // Headlights (bright at night) and tail lights.
  ctx.fillStyle = night > 0.25 ? '#fff6c8' : '#e8e0b0';
  circle(ctx, len / 2 - 2, -wid / 2 + 7, 3);
  circle(ctx, len / 2 - 2, wid / 2 - 7, 3);
  ctx.fillStyle = '#ff2d2d';
  circle(ctx, -len / 2 + 2, -wid / 2 + 7, 3);
  circle(ctx, -len / 2 + 2, wid / 2 - 7, 3);
  ctx.restore();
  // Headlight glow pool on the road at night.
  if (night > 0.25 && !car.parked) {
    const fx = car.x + Math.cos(car.angle || 0) * (len / 2 + 26);
    const fy = car.y + Math.sin(car.angle || 0) * (len / 2 + 26);
    ctx.fillStyle = 'rgba(255,246,200,0.10)';
    circle(ctx, fx, fy, 30);
  }
}

function drawPed(ctx, ped, night) {
  if (ped.state === 'dead') {
    ctx.fillStyle = 'rgba(120,20,20,0.5)';
    circle(ctx, ped.x, ped.y, 10);
    ctx.fillStyle = '#5a5a5a';
    ctx.beginPath();
    ctx.ellipse(ped.x, ped.y, 11, 6, ped.angle || 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  circle(ctx, ped.x + 1, ped.y + 2, 8);
  ctx.fillStyle = ped.shirt || ped.color || '#7a8a9a';
  circle(ctx, ped.x, ped.y, 8);
  ctx.fillStyle = PALETTE.skin;
  circle(ctx, ped.x, ped.y, 4);
}

function drawPlayer(G, ctx, night) {
  const p = G.player;
  if (!p || p.dead) return;
  if (!p.onFoot) return; // the driver sits inside the car, already drawn
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  circle(ctx, p.x + 1, p.y + 2, 13);
  ctx.fillStyle = PALETTE.player;
  circle(ctx, p.x, p.y, 12);
  ctx.fillStyle = PALETTE.skin;
  circle(ctx, p.x, p.y, 5);
  // Facing tick and, when armed, the gun barrel.
  const a = p.angle || 0;
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18);
  ctx.stroke();
  if (p.weapon && p.weapon !== 'fist') {
    ctx.strokeStyle = '#1c1e22';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(a) * 10, p.y + Math.sin(a) * 10);
    ctx.lineTo(p.x + Math.cos(a) * 24, p.y + Math.sin(a) * 24);
    ctx.stroke();
  }
}

function drawEntities(G, ctx, cam, night) {
  const cars = G.cars || [];
  for (let i = 0; i < cars.length; i += 1) {
    const c = cars[i];
    if (c.x < cam.x - 80 || c.x > cam.x + VIEW.width + 80 || c.y < cam.y - 80 || c.y > cam.y + VIEW.height + 80) continue;
    drawCar(G, ctx, c, night);
  }
  const peds = G.peds || [];
  for (let i = 0; i < peds.length; i += 1) {
    const p = peds[i];
    if (p.x < cam.x - 20 || p.x > cam.x + VIEW.width + 20 || p.y < cam.y - 20 || p.y > cam.y + VIEW.height + 20) continue;
    drawPed(ctx, p, night);
  }
  const cops = G.cops || [];
  for (let i = 0; i < cops.length; i += 1) {
    const c = cops[i];
    if (c.onFoot === false && c.car) continue; // driving: the police car is drawn above
    if (c.x < cam.x - 20 || c.x > cam.x + VIEW.width + 20 || c.y < cam.y - 20 || c.y > cam.y + VIEW.height + 20) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    circle(ctx, c.x + 1, c.y + 2, 9);
    ctx.fillStyle = '#27408b';
    circle(ctx, c.x, c.y, 9);
    ctx.fillStyle = '#ffd97a';
    circle(ctx, c.x, c.y, 3);
  }
  drawPlayer(G, ctx, night);

  // Bullets: short bright streaks along their flight angle.
  const bullets = G.bullets || [];
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < bullets.length; i += 1) {
    const b = bullets[i];
    const a = b.angle || 0;
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + Math.cos(a) * 14, b.y + Math.sin(a) * 14);
  }
  ctx.stroke();

  // Particles: smoke, sparks and blood fade with their remaining life.
  const parts = G.particles || [];
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    const life = p.maxLife ? clamp(p.life / p.maxLife, 0, 1) : 1;
    ctx.globalAlpha = life;
    ctx.fillStyle = p.color || '#888888';
    circle(ctx, p.x, p.y, p.size || 3);
  }
  ctx.globalAlpha = 1;
}

function drawNightLights(G, ctx, cam, night) {
  if (night <= 0.2) return;
  // Street lamps at road intersections: a warm glow pool.
  const tx0 = Math.max(0, Math.floor(cam.x / TILE));
  const ty0 = Math.max(0, Math.floor(cam.y / TILE));
  const tx1 = Math.min(CITY_W - 1, Math.ceil((cam.x + VIEW.width) / TILE));
  const ty1 = Math.min(CITY_H - 1, Math.ceil((cam.y + VIEW.height) / TILE));
  for (let ty = ty0; ty <= ty1; ty += 1) {
    if (ty % 8 !== 0) continue;
    for (let tx = tx0; tx <= tx1; tx += 1) {
      if (tx % 8 !== 0) continue;
      const lx = tx * TILE;
      const ly = ty * TILE;
      ctx.fillStyle = `rgba(255,214,130,${0.10 * night})`;
      circle(ctx, lx, ly, 30);
      ctx.fillStyle = '#ffd682';
      circle(ctx, lx, ly, 3);
    }
  }
  // Neon Row: glowing signs on the shop and hotel fronts.
  const city = G.city;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 13px ${FONT}`;
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    if (b.zone !== 'Neon Row') continue;
    if (b.x + b.w < cam.x || b.x > cam.x + VIEW.width || b.y + b.h < cam.y || b.y > cam.y + VIEW.height) continue;
    const color = PALETTE.neon[(b.seed + i) % PALETTE.neon.length];
    const sign = NEON_SIGNS[(b.seed + i) % NEON_SIGNS.length];
    const w = ctx.measureText(sign).width + 14;
    const sx = b.x + b.w / 2 - w / 2;
    const sy = b.y + b.h - 4;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.25 * night;
    ctx.fillRect(sx - 4, sy - 11, w + 8, 22);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(sx, sy - 9, w, 18);
    ctx.fillStyle = color;
    ctx.fillText(sign, b.x + b.w / 2, sy + 1);
  }
}

function drawRain(G, ctx, night) {
  const rain = G.rain || 0;
  if (rain <= 0) return;
  const count = Math.floor(rain * 140);
  const t = G.clock || 0;
  ctx.strokeStyle = `rgba(180,200,220,${0.3 * rain})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < count; i += 1) {
    const x = ((i * 97.3 + t * 300) % (VIEW.width + 40) + VIEW.width + 40) % (VIEW.width + 40) - 20;
    const y = ((i * 57.7 + t * 900) % (VIEW.height + 40) + VIEW.height + 40) % (VIEW.height + 40) - 20;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 6, y + 18);
  }
  ctx.stroke();
  // Wet roads catch a little extra light.
  ctx.fillStyle = `rgba(200,220,255,${0.04 * rain})`;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
}

/** Paint one frame of the world. Assumes ctx is already set to the 1280x720 logical space. */
export function drawGame(G, ctx) {
  const cam = G.camera || { x: 0, y: 0 };
  const clock = G.clock === undefined ? 28800 : G.clock;
  const night = nightAlpha(clock);
  const hour = ((clock / 3600) % 24 + 24) % 24;
  const shake = G.shake || 0;
  const sx = shake ? (Math.random() - 0.5) * shake : 0;
  const sy = shake ? (Math.random() - 0.5) * shake : 0;

  ctx.save();
  ctx.translate(-cam.x + sx, -cam.y + sy);
  drawGround(G, ctx, cam, night);
  drawParksAndDocks(G, ctx, cam);
  drawSkidsAndPackages(G, ctx, cam);
  drawBuildings(G, ctx, cam, night);
  drawLandmarks(G, ctx, cam);
  drawMissionMarker(G, ctx);
  drawEntities(G, ctx, cam, night);
  drawNightLights(G, ctx, cam, night);
  ctx.restore();

  // Day/night overlay and dusk tint, in screen space.
  if (night > 0) {
    ctx.fillStyle = `rgba(8,10,40,${night.toFixed(3)})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  if (hour >= 17 && hour < 19) {
    ctx.fillStyle = 'rgba(255,120,60,0.06)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  drawRain(G, ctx, night);
}
