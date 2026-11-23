// The city of Port Meridian, generated deterministically from a seeded random
// function: the same seed always builds the same streets, blocks and landmarks.
// Grid values: 0 road, 1 building, 2 water, 3 sidewalk/park, 4 sand, 5 plaza.
// Roads are 2 tiles wide, every 8 tiles; buildings never cover a road.
import { CITY_H, CITY_W, DEFAULT_ZONE, TILE, ZONES } from './config.js';
import { randInt, randPick } from './random.js';

export const GRID_ROAD = 0;
export const GRID_BUILDING = 1;
export const GRID_WATER = 2;
export const GRID_SIDEWALK = 3;
export const GRID_SAND = 4;
export const GRID_PLAZA = 5;

/** A road runs where the tile index is 0 or 1 inside each 8-tile strip. */
export function isRoadTile(tx, ty) {
  return tx % 8 < 2 || ty % 8 < 2;
}

/** Water is the harbour strip on the west edge and the sea on the south edge. */
export function isWaterTile(tx, ty) {
  return tx < 6 || ty > 114;
}

/** Beach sand: the southern shore above the sea. */
function isSandTile(tx, ty) {
  return ty >= 104 && ty <= 113;
}

/** Zone name for a tile. Downtown wins the shared x=76 edge with Neon Row. */
export function zoneNameAtTile(tx, ty) {
  if (ty <= 23) return 'North Hills';
  if (tx >= 44 && tx <= 76 && ty >= 36 && ty <= 64) return 'Downtown';
  if (tx >= 0 && tx <= 23 && ty >= 40 && ty <= 80) return 'Old Harbor';
  if (tx >= 76 && tx <= 119 && ty >= 36 && ty <= 64) return 'Neon Row';
  if (ty >= 104) return 'Sunset Beach';
  return DEFAULT_ZONE;
}

/** Landmark tiles: block corners (tile % 8 == 2), so each sits on a sidewalk beside a road. */
const LANDMARK_TILES = {
  safehouse: { tx: 18, ty: 10 },
  sprayShop: { tx: 50, ty: 66 },
  gunShop: { tx: 90, ty: 66 },
  dealer: { tx: 82, ty: 58 },
  hospital: { tx: 34, ty: 34 },
  bank: { tx: 58, ty: 50 },
  warehouse: { tx: 18, ty: 50 },
  taxiStand: { tx: 66, ty: 42 },
};

const BUILDING_STYLE = {
  tower: { colors: ['#5a6b84', '#4d5f78', '#66788f'], roofs: ['#2c3542', '#333d4b'], h: [40, 64] },
  house: { colors: ['#a9805e', '#8a6f5c', '#b59a7a', '#7d8a6a'], roofs: ['#5e3d2b', '#4a3226'], h: [8, 14] },
  warehouse: { colors: ['#7a5a44', '#6b4f3a', '#857052'], roofs: ['#3d2f24', '#463728'], h: [12, 18] },
  shop: { colors: ['#9a6a8a', '#6a8a9a', '#a08a5a', '#7a9a6a'], roofs: ['#3a2f3d', '#2f3d3a'], h: [10, 16] },
  office: { colors: ['#5a6a7a', '#6a7a8a', '#4f6070'], roofs: ['#2f3a44', '#38424e'], h: [24, 40] },
  hotel: { colors: ['#a08a6a', '#8a7a9a', '#9a8a7a'], roofs: ['#463d2e', '#3d3446'], h: [30, 48] },
};

function buildingKindForZone(zone, rng) {
  if (zone === 'Downtown') return randPick(rng, ['tower', 'tower', 'office', 'hotel']);
  if (zone === 'North Hills') return 'house';
  if (zone === 'Old Harbor') return 'warehouse';
  if (zone === 'Neon Row') return randPick(rng, ['shop', 'shop', 'hotel']);
  return randPick(rng, ['house', 'house', 'shop', 'office']);
}

export function createCity(random) {
  const W = CITY_W;
  const H = CITY_H;
  const PX = W * TILE;
  const grid = new Uint8Array(W * H);
  const idx = (tx, ty) => ty * W + tx;

  // Base pass: water beats road beats sand; everything else starts as sidewalk.
  for (let ty = 0; ty < H; ty += 1) {
    for (let tx = 0; tx < W; tx += 1) {
      if (isWaterTile(tx, ty)) grid[idx(tx, ty)] = GRID_WATER;
      else if (isRoadTile(tx, ty)) grid[idx(tx, ty)] = GRID_ROAD;
      else if (isSandTile(tx, ty)) grid[idx(tx, ty)] = GRID_SAND;
      else grid[idx(tx, ty)] = GRID_SIDEWALK;
    }
  }

  // Landmark blocks keep no building, so every landmark stays reachable on foot.
  const landmarkBlocks = new Set();
  for (const tile of Object.values(LANDMARK_TILES)) {
    landmarkBlocks.add(`${Math.floor(tile.tx / 8)},${Math.floor(tile.ty / 8)}`);
  }

  const buildings = [];
  const parks = [];
  const plazas = [];
  const roadTiles = [];
  for (let ty = 0; ty < H; ty += 1) {
    for (let tx = 0; tx < W; tx += 1) {
      if (grid[idx(tx, ty)] === GRID_ROAD) roadTiles.push({ tx, ty });
    }
  }

  // One building (or park / plaza) per 6x6 block between the roads.
  for (let by = 0; by < 15; by += 1) {
    for (let bx = 0; bx < 15; bx += 1) {
      const ox = bx * 8 + 2; // block origin tile (roads are tiles 0-1 of each strip)
      const oy = by * 8 + 2;
      if (bx === 0) continue; // west strip is harbour water
      if (oy >= 104) continue; // beach and sea: no buildings
      if (landmarkBlocks.has(`${bx},${by}`)) continue;
      const zone = zoneNameAtTile(ox + 3, oy + 3);
      const rect = { x: ox * TILE, y: oy * TILE, w: 6 * TILE, h: 6 * TILE };
      const roll = random();
      if (roll < 0.07 && zone !== 'Downtown' && zone !== 'Old Harbor') {
        parks.push(rect); // stays sidewalk/grass in the grid
        continue;
      }
      if (zone === 'Downtown' && roll < 0.22) {
        plazas.push(rect);
        for (let ty = oy; ty < oy + 6; ty += 1) {
          for (let tx = ox; tx < ox + 6; tx += 1) grid[idx(tx, ty)] = GRID_PLAZA;
        }
        continue;
      }
      const kind = buildingKindForZone(zone, random);
      const style = BUILDING_STYLE[kind];
      // Margins of at least one tile keep the building off roads and corners.
      const mL = TILE + Math.floor(random() * 24);
      const mR = TILE + Math.floor(random() * 24);
      const mT = TILE + Math.floor(random() * 24);
      const mB = TILE + Math.floor(random() * 24);
      const b = {
        x: rect.x + mL,
        y: rect.y + mT,
        w: rect.w - mL - mR,
        h: rect.h - mT - mB,
        zone,
        kind,
        color: randPick(random, style.colors),
        roof: randPick(random, style.roofs),
        h: randInt(random, style.h[0], style.h[1]),
        seed: Math.floor(random() * 1000000000),
      };
      buildings.push(b);
      const tx0 = Math.floor(b.x / TILE);
      const tx1 = Math.floor((b.x + b.w - 1) / TILE);
      const ty0 = Math.floor(b.y / TILE);
      const ty1 = Math.floor((b.y + b.h - 1) / TILE);
      for (let ty = ty0; ty <= ty1; ty += 1) {
        for (let tx = tx0; tx <= tx1; tx += 1) grid[idx(tx, ty)] = GRID_BUILDING;
      }
    }
  }

  // Piers jutting west from the harbour shore into the water; walkable planks.
  const docks = [
    { x: 48, y: 46 * TILE, w: 176, h: 2 * TILE },
    { x: 48, y: 58 * TILE, w: 176, h: 2 * TILE },
    { x: 48, y: 70 * TILE, w: 176, h: 2 * TILE },
  ];
  for (const dock of docks) {
    const tx0 = Math.floor(dock.x / TILE);
    const tx1 = Math.floor((dock.x + dock.w - 1) / TILE);
    const ty0 = Math.floor(dock.y / TILE);
    const ty1 = Math.floor((dock.y + dock.h - 1) / TILE);
    for (let ty = ty0; ty <= ty1; ty += 1) {
      for (let tx = tx0; tx <= tx1; tx += 1) grid[idx(tx, ty)] = GRID_SIDEWALK;
    }
  }

  const landmarks = {};
  for (const [key, tile] of Object.entries(LANDMARK_TILES)) {
    landmarks[key] = { x: tile.tx * TILE + TILE / 2, y: tile.ty * TILE + TILE / 2 };
  }

  // 20 hidden packages on sidewalk tiles, never inside a building or on a road.
  const packages = [];
  let guard = 0;
  while (packages.length < 20 && guard < 4000) {
    guard += 1;
    const tx = randInt(random, 0, W - 1);
    const ty = randInt(random, 0, H - 1);
    if (grid[idx(tx, ty)] !== GRID_SIDEWALK) continue;
    let nearLandmark = false;
    for (const tile of Object.values(LANDMARK_TILES)) {
      if (Math.abs(tile.tx - tx) <= 2 && Math.abs(tile.ty - ty) <= 2) { nearLandmark = true; break; }
    }
    if (nearLandmark) continue;
    packages.push({ x: tx * TILE + TILE / 2 + randInt(random, -8, 8), y: ty * TILE + TILE / 2 + randInt(random, -8, 8), taken: false });
  }

  // 6 stunt ramps on road tiles, angled along the road they sit on.
  const ramps = [];
  for (let i = 0; i < 6 && roadTiles.length > 0; i += 1) {
    const tile = randPick(random, roadTiles);
    const vertical = tile.tx % 8 < 2 && tile.ty % 8 >= 2;
    const angle = vertical ? randPick(random, [Math.PI / 2, -Math.PI / 2]) : randPick(random, [0, Math.PI]);
    ramps.push({ x: tile.tx * TILE + TILE / 2, y: tile.ty * TILE + TILE / 2, angle });
  }

  function tileAt(x, y) {
    return {
      tx: Math.max(0, Math.min(W - 1, Math.floor(x / TILE))),
      ty: Math.max(0, Math.min(H - 1, Math.floor(y / TILE))),
    };
  }

  function tileValue(x, y) {
    if (x < 0 || y < 0 || x >= PX || y >= PX) return -1;
    return grid[idx(Math.floor(x / TILE), Math.floor(y / TILE))];
  }

  /** Nearest road tile centre to a pixel point, searching outward in rings. */
  function nearestRoadPx(x, y) {
    const start = tileAt(x, y);
    for (let r = 0; r <= 120; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = start.tx + dx;
          const ty = start.ty + dy;
          if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
          if (grid[idx(tx, ty)] === GRID_ROAD) return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
        }
      }
    }
    return { x: start.tx * TILE + TILE / 2, y: start.ty * TILE + TILE / 2 };
  }

  const city = {
    TILE,
    W,
    H,
    PX,
    grid,
    buildings,
    zones: ZONES.map((z) => ({ ...z })),
    landmarks,
    packages,
    ramps,
    parks,
    plazas,
    docks,
    roadTiles,
    tileAt,
    isRoadPx(x, y) { return tileValue(x, y) === GRID_ROAD; },
    isWaterPx(x, y) { return tileValue(x, y) === GRID_WATER; },
    /** Buildings and water block movement; out of bounds blocks too. */
    isBlockedPx(x, y) {
      const v = tileValue(x, y);
      return v === -1 || v === GRID_BUILDING || v === GRID_WATER;
    },
    zoneAtPx(x, y) {
      const t = tileAt(x, y);
      return zoneNameAtTile(t.tx, t.ty);
    },
    nearestRoadPx,
    /** A random road tile centre. Pass the run's rng, or the city's own is used. */
    randomRoadPoint(rng) {
      const pick = rng || random;
      const tile = roadTiles[Math.floor(pick() * roadTiles.length)];
      return { x: tile.tx * TILE + TILE / 2, y: tile.ty * TILE + TILE / 2 };
    },
  };
  return city;
}
