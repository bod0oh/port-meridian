// HUD, minimap, menus and dialogs for PORT MERIDIAN.
// Drawing only: reads G and paints pixels. Imports config only.
// Logical playfield is 1280x720 (main.js sets the canvas transform before calling these).
import * as CFG from './config.js';

const W = (CFG.FIELD && CFG.FIELD.width) || 1280;
const H = (CFG.FIELD && CFG.FIELD.height) || 720;
const TILE = CFG.TILE ?? 32;
const WORLD_W = (CFG.CITY_W ?? 120) * TILE;
const WORLD_H = (CFG.CITY_H ?? 120) * TILE;

const PAL = CFG.PALETTE || {};
const C = {
  text: PAL.text || '#eef1f5',
  muted: PAL.muted || '#8b93a3',
  panel: PAL.panel || 'rgba(20, 24, 34, 0.88)',
  gold: PAL.coin || '#f2c94c',
  red: '#e5534b',
  blue: '#4fc3f7',
  green: '#43d17c',
  white: '#ffffff',
  dark: 'rgba(0, 0, 0, 0.55)',
};
const FONT = CFG.FONT || 'system-ui, -apple-system, "Segoe UI", sans-serif';

const NOTIFY_MS = 4000;
const DIALOG_MS = 5000;

// --- shared helpers ------------------------------------------------------------

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function text(ctx, value, x, y, size, color, align, baseline) {
  ctx.font = `${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = baseline || 'alphabetic';
  ctx.fillText(value, x, y);
}

function bar(ctx, x, y, w, h, frac, fill, bg) {
  ctx.fillStyle = bg || 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, h);
}

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function wrapText(ctx, str, maxWidth) {
  const words = String(str).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// --- notifications & dialogs (also used by other modules' local copies) --------

export function notify(G, message) {
  if (!G.notifications) G.notifications = [];
  G.notifications.push({ text: message, t: now() });
  if (G.notifications.length > 5) G.notifications.splice(0, G.notifications.length - 5);
}

export function showDialog(G, name, message) {
  G.dialog = { name, text: message, until: now() + DIALOG_MS };
}

// --- minimap -------------------------------------------------------------------

// The road layout never changes, so the base layer is rendered once per city into an
// offscreen canvas by sampling city.isRoadPx / isWaterPx, then blitted every frame.
let miniBase = null;
let miniBaseCity = null;

function buildMiniBase(G) {
  if (miniBaseCity === G.city && miniBase) return miniBase;
  const mw = 200;
  const mh = 140;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!canvas) return null;
  canvas.width = mw;
  canvas.height = mh;
  const c = canvas.getContext('2d');
  c.fillStyle = '#10141c';
  c.fillRect(0, 0, mw, mh);
  const city = G.city;
  const stepX = Math.max(1, Math.floor(WORLD_W / mw));
  const stepY = Math.max(1, Math.floor(WORLD_H / mh));
  for (let py = 0; py < mh; py += 1) {
    for (let px = 0; px < mw; px += 1) {
      const wx = (px / mw) * WORLD_W;
      const wy = (py / mh) * WORLD_H;
      if (city && typeof city.isWaterPx === 'function' && city.isWaterPx(wx, wy)) {
        c.fillStyle = '#17324a';
        c.fillRect(px, py, 1, 1);
      } else if (city && typeof city.isRoadPx === 'function' && city.isRoadPx(wx, wy)) {
        c.fillStyle = '#4a5262';
        c.fillRect(px, py, 1, 1);
      }
    }
  }
  // Keep the sampling cheap: the loop above already visits every pixel once.
  void stepX; void stepY;
  miniBase = canvas;
  miniBaseCity = G.city;
  return miniBase;
}

function dot(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw the map markers (player, mission, cops, safehouse, cars) at a given scale. */
function drawMapMarkers(G, ctx, ox, oy, scale) {
  const toX = (wx) => ox + (wx / WORLD_W) * 200 * scale;
  const toY = (wy) => oy + (wy / WORLD_H) * 140 * scale;
  const lm = G.city && G.city.landmarks ? G.city.landmarks : {};
  if (lm.safehouse) dot(ctx, toX(lm.safehouse.x), toY(lm.safehouse.y), 3 * scale, C.green);
  for (const car of G.cars) {
    if (car === G.player.car) continue;
    dot(ctx, toX(car.x), toY(car.y), 1.5 * scale, '#9aa3b2');
  }
  // Cops blink blue/red so a chase reads at a glance.
  const blink = Math.floor(now() / 350) % 2 === 0;
  for (const cop of G.cops) {
    dot(ctx, toX(cop.x), toY(cop.y), 3 * scale, blink ? '#3b82f6' : C.red);
  }
  if (G.mission && G.mission.status === 'active' && G.mission.target) {
    const pulse = 3 + Math.sin(now() / 200) * 1.2;
    dot(ctx, toX(G.mission.target.x), toY(G.mission.target.y), pulse * scale, C.gold);
  } else if (G.taxi && G.taxi.active && G.taxi.dest) {
    dot(ctx, toX(G.taxi.dest.x), toY(G.taxi.dest.y), 3 * scale, C.gold);
  }
  dot(ctx, toX(G.player.x), toY(G.player.y), 3.5 * scale, C.white);
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(toX(G.player.x), toY(G.player.y), 5.5 * scale, 0, Math.PI * 2);
  ctx.stroke();
}

// --- HUD -----------------------------------------------------------------------

function drawTopLeft(G, ctx) {
  const p = G.player;
  const x = 16;
  const y = 16;
  // Health (red) + armor (blue), then cash.
  bar(ctx, x, y, 200, 14, (p.health || 0) / 100, C.red);
  text(ctx, 'HP', x + 206, y + 12, 12, C.text, 'left');
  bar(ctx, x, y + 20, 200, 9, (p.armor || 0) / 100, C.blue);
  text(ctx, 'ARMOR', x + 206, y + 28, 12, C.text, 'left');
  text(ctx, `$${Math.floor(p.money || 0).toLocaleString('en-US')}`, x, y + 52, 24, C.gold, 'left');
}

function drawTopRight(G, ctx) {
  const wanted = Math.max(0, Math.min(5, G.wanted || 0));
  const x = W - 16;
  let y = 30;
  // Wanted stars: filled gold, empty grey.
  ctx.font = `22px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  let stars = '';
  for (let i = 0; i < 5; i += 1) stars += i < wanted ? '★' : '☆';
  ctx.fillStyle = wanted > 0 ? C.gold : '#5a6270';
  ctx.fillText(stars, x, y);
  // Game clock, day and weather.
  const clock = G.clock || 0;
  const hh = String(Math.floor(clock / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor(clock / 60) % 60).padStart(2, '0');
  y += 26;
  text(ctx, `${hh}:${mm}`, x, y, 20, C.text, 'right');
  y += 22;
  const weather = G.rain > 0 ? 'Rain' : (G.weather ? String(G.weather).charAt(0).toUpperCase() + String(G.weather).slice(1) : 'Clear');
  text(ctx, `Day ${G.day || 1}  •  ${weather}`, x, y, 14, C.muted, 'right');
}

function drawBottomLeft(G, ctx) {
  const p = G.player;
  const weaponNames = { fist: 'Fists', pistol: 'Pistol', smg: 'SMG', shotgun: 'Shotgun' };
  const name = weaponNames[p.weapon] || p.weapon || 'Fists';
  const ammo = p.weapon === 'fist' ? '—' : String((p.ammo && p.ammo[p.weapon]) || 0);
  const x = 16;
  const y = H - 42;
  text(ctx, name.toUpperCase(), x, y - 18, 16, C.text, 'left');
  text(ctx, `AMMO ${ammo}`, x, y, 14, C.muted, 'left');
  // Owned weapon slots 1/2/3.
  const slots = ['pistol', 'smg', 'shotgun'];
  for (let i = 0; i < slots.length; i += 1) {
    const owned = p.owned && p.owned[slots[i]];
    const sx = x + i * 34;
    ctx.fillStyle = p.weapon === slots[i] ? C.gold : 'rgba(0,0,0,0.6)';
    ctx.fillRect(sx, y + 8, 28, 18);
    text(ctx, String(i + 1), sx + 14, y + 22, 12, owned ? C.text : C.muted, 'center');
  }
}

function drawMinimap(G, ctx) {
  const mw = 200;
  const mh = 140;
  const x = W - mw - 16;
  const y = H - mh - 16;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 4, y - 4, mw + 8, mh + 8);
  const base = buildMiniBase(G);
  if (base) ctx.drawImage(base, x, y, mw, mh);
  else {
    ctx.fillStyle = '#10141c';
    ctx.fillRect(x, y, mw, mh);
  }
  drawMapMarkers(G, ctx, x, y, 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 4, y - 4, mw + 8, mh + 8);
  // Current zone name under the map.
  let zone = '';
  if (G.city && typeof G.city.zoneAtPx === 'function') {
    zone = G.city.zoneAtPx(G.player.x, G.player.y) || '';
  }
  if (zone) text(ctx, zone, x + mw / 2, y + mh + 20, 14, C.text, 'center');
}

function drawObjective(G, ctx) {
  const m = G.mission;
  if (!m || m.status !== 'active' || !m.objective) return;
  let line = m.objective;
  if (m.target && G.player) {
    const metres = Math.round(dist(G.player.x, G.player.y, m.target.x, m.target.y) / TILE);
    line += `  —  ${metres}m`;
  }
  ctx.font = `16px ${FONT}`;
  const w = ctx.measureText(line).width + 28;
  const x = (W - w) / 2;
  ctx.fillStyle = C.dark;
  ctx.fillRect(x, 10, w, 30);
  ctx.fillStyle = C.gold;
  ctx.fillRect(x, 10, 4, 30);
  text(ctx, line, x + 16, 31, 16, C.text, 'left');
  // Rampage timer doubles as a top-centre readout while it runs.
  if (G.rampage && G.rampage.active) {
    const r = G.rampage;
    const rl = `RAMPAGE ${Math.floor(r.score)}/${r.target} — ${Math.ceil(r.timer)}s`;
    text(ctx, rl, W / 2, 62, 16, C.red, 'center');
  }
}

function drawNotifications(G, ctx) {
  if (!G.notifications || G.notifications.length === 0) return;
  const t = now();
  let y = H / 2 - 60;
  ctx.font = `15px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (let i = G.notifications.length - 1; i >= 0; i -= 1) {
    const n = G.notifications[i];
    const age = (t - n.t) / 1000;
    if (age > 4) {
      G.notifications.splice(i, 1);
      continue;
    }
    const alpha = age > 3 ? Math.max(0, 1 - (age - 3)) : 1;
    ctx.globalAlpha = alpha;
    const w = Math.min(W - 24, ctx.measureText(n.text).width + 20);
    const x = W - w - 12;
    ctx.fillStyle = C.dark;
    ctx.fillRect(x, y, w, 26);
    ctx.fillStyle = C.text;
    ctx.fillText(n.text, x + 10, y + 18);
    y += 32;
  }
  ctx.globalAlpha = 1;
}

function drawDialog(G, ctx) {
  const d = G.dialog;
  if (!d) return;
  if (now() > d.until) {
    G.dialog = null;
    return;
  }
  const w = 640;
  const x = (W - w) / 2;
  ctx.font = `16px ${FONT}`;
  const lines = wrapText(ctx, d.text, w - 40);
  const h = 34 + lines.length * 22 + 26;
  const y = H - h - 24;
  ctx.fillStyle = C.panel;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  text(ctx, d.name || '', x + 20, y + 26, 16, C.gold, 'left');
  for (let i = 0; i < lines.length; i += 1) {
    text(ctx, lines[i], x + 20, y + 52 + i * 22, 16, C.text, 'left');
  }
  text(ctx, 'Press Enter to continue', x + w - 20, y + h - 10, 12, C.muted, 'right');
}

function drawBigMap(G, ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, W, H);
  const scale = 3.2;
  const mw = 200 * scale;
  const mh = 140 * scale;
  const x = (W - mw) / 2;
  const y = (H - mh) / 2 - 10;
  const base = buildMiniBase(G);
  if (base) ctx.drawImage(base, x, y, mw, mh);
  drawMapMarkers(G, ctx, x, y, scale);
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, mw, mh);
  text(ctx, 'PORT MERIDIAN — press M to close', W / 2, y + mh + 28, 16, C.text, 'center');
  let zone = '';
  if (G.city && typeof G.city.zoneAtPx === 'function') {
    zone = G.city.zoneAtPx(G.player.x, G.player.y) || '';
  }
  if (zone) text(ctx, `You are in ${zone}`, W / 2, y + mh + 52, 14, C.muted, 'center');
}

/** Paint the whole in-game HUD in screen coordinates. */
export function drawHUD(G, ctx) {
  drawTopLeft(G, ctx);
  drawTopRight(G, ctx);
  drawBottomLeft(G, ctx);
  drawMinimap(G, ctx);
  drawObjective(G, ctx);
  drawNotifications(G, ctx);
  drawDialog(G, ctx);
  if (G.showBigMap) drawBigMap(G, ctx);
}

// --- menus ---------------------------------------------------------------------

function drawPanel(ctx, title, lines, prompt, highlight) {
  const w = 620;
  const lineH = 30;
  const h = 150 + lines.length * lineH + 70;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  ctx.fillStyle = C.panel;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  text(ctx, title, W / 2, y + 64, 40, C.text, 'center');
  for (let i = 0; i < lines.length; i += 1) {
    const isHi = highlight === i;
    text(ctx, lines[i], W / 2, y + 118 + i * lineH, 20, isHi ? C.gold : C.muted, 'center');
  }
  if (prompt) text(ctx, prompt, W / 2, y + h - 28, 16, C.gold, 'center');
}

function drawTitle(G, ctx) {
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, W, H);
  // Simple skyline silhouette for flavour.
  ctx.fillStyle = '#141a26';
  const buildings = [60, 120, 90, 150, 80, 130, 100, 70, 140, 95];
  let bx = 0;
  for (const bh of buildings) {
    ctx.fillRect(bx, H - bh - 90, 128, bh + 90);
    bx += 128;
  }
  ctx.fillStyle = '#1d2637';
  ctx.fillRect(0, H - 90, W, 90);
  text(ctx, 'PORT MERIDIAN', W / 2, 170, 64, C.gold, 'center');
  text(ctx, 'An open-world crime story', W / 2, 210, 22, C.muted, 'center');
  const items = ['New Game', 'Continue', 'How to Play'];
  for (let i = 0; i < items.length; i += 1) {
    const y = 300 + i * 44;
    const selected = G.menuIndex === i;
    if (selected) {
      ctx.fillStyle = 'rgba(242, 201, 76, 0.15)';
      ctx.fillRect(W / 2 - 180, y - 28, 360, 38);
    }
    const grey = i === 1 && !G.hasSave;
    text(ctx, (selected ? '▶ ' : '   ') + items[i], W / 2, y, 24, grey ? '#4a5262' : (selected ? C.gold : C.text), 'center');
  }
  text(ctx, 'WASD drive & walk  •  E enter car / interact  •  Mouse aim, Click shoot  •  R reload  •  1/2/3 weapons', W / 2, 480, 15, C.muted, 'center');
  text(ctx, 'Space handbrake  •  Shift run  •  H horn  •  M big map  •  Esc pause', W / 2, 506, 15, C.muted, 'center');
  text(ctx, 'Arrows + Enter to choose', W / 2, 560, 15, C.gold, 'center');

  if (G.showHelp) {
    const lines = [
      'Jax "Reverb" Cole is back in Port Meridian.',
      'Follow the yellow marker to run missions for Rosa and Mara.',
      'Earn cash from missions, taxi fares, rampages and hidden packages.',
      'Spend it at Ironworks (guns), Spray & Go (repairs, clear heat)',
      'and the car dealer. Stay out of sight when the stars are out.',
      'Reach the safehouse to lay low. Good luck, kid.',
    ];
    drawPanel(ctx, 'HOW TO PLAY', lines, 'Press Enter to close');
  }
}

function drawPaused(G, ctx) {
  drawPanel(ctx, 'PAUSED', ['Resume', 'Save Game', 'Restart Mission', 'Quit to Title'], 'Arrows + Enter to choose', G.menuIndex);
}

function drawGameOver(G, ctx) {
  const busted = G.gameoverReason === 'busted';
  drawPanel(
    ctx,
    busted ? 'BUSTED' : 'WASTED',
    [
      busted ? 'The Meridian PD finally caught up with you.' : 'You blacked out on the streets of Port Meridian.',
      'You wake up at Meridian General Hospital.',
      'Hospital bill: -$200',
    ],
    'Press Enter to get back on your feet',
  );
}

function drawEnding(G, ctx) {
  const s = G.stats || {};
  const lines = [
    'The vault is empty, the bridge is behind you,',
    'and Port Meridian is yours, Jax.',
    '',
    `Missions completed: ${s.missionsDone || 0} / 6`,
    `Money earned: $${Math.floor(s.moneyEarned || 0).toLocaleString('en-US')}`,
    `Cars stolen: ${s.carsStolen || 0}    •    Hidden packages: ${s.packages || 0} / 20`,
    `Takedowns: ${s.kills || 0}    •    Shots fired: ${s.shotsFired || 0}`,
    '',
    'Thanks for playing PORT MERIDIAN.',
  ];
  drawPanel(ctx, 'THE BIG ONE — COMPLETE', lines, 'Press Enter to return to the title screen');
}

/** Paint the full-screen menu for the current screen state. */
export function drawMenus(G, ctx) {
  switch (G.screen) {
    case 'title':
      drawTitle(G, ctx);
      break;
    case 'paused':
      drawPaused(G, ctx);
      break;
    case 'gameover':
      drawGameOver(G, ctx);
      break;
    case 'ending':
      drawEnding(G, ctx);
      break;
    default:
      break;
  }
}
