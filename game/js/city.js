import { CONFIG, ZONES } from './config.js';
import { SeededRandom } from './random.js';

export class City {
  constructor() {
    this.width = CONFIG.MAP_WIDTH;
    this.height = CONFIG.MAP_HEIGHT;
    this.tileSize = CONFIG.TILE_SIZE;
    this.grid = [];
    this.buildings = [];
    this.spawnPoints = {
      player: { x: 60 * 32, y: 60 * 32 },
      safehouse: { x: 58 * 32, y: 58 * 32 },
      weaponsShop: { x: 50 * 32, y: 52 * 32 },
      sprayShop: { x: 70 * 32, y: 68 * 32 }
    };
    this.generate();
  }

  generate() {
    const rng = new SeededRandom(999);
    this.grid = [];
    this.buildings = [];

    for (let y = 0; y < this.height; y++) {
      const row = [];
      for (let x = 0; x < this.width; x++) {
        let tile = 2; // Default building

        if (x < 4 || x >= this.width - 4 || y < 4 || y >= this.height - 4) {
          tile = 3; // Water
        } else if (
          x % 20 === 0 ||
          x % 20 === 1 ||
          y % 20 === 0 ||
          y % 20 === 1
        ) {
          tile = 0; // Road
        } else if (
          x % 20 === 2 ||
          x % 20 === 19 ||
          y % 20 === 2 ||
          y % 20 === 19
        ) {
          tile = 1; // Sidewalk
        } else if (x > 40 && x < 60 && y > 40 && y < 60) {
          tile = 4; // Park
        } else {
          tile = 2; // Building
          if (x % 4 === 0 && y % 4 === 0) {
            this.buildings.push({
              x: x * this.tileSize,
              y: y * this.tileSize,
              w: 3 * this.tileSize,
              h: 3 * this.tileSize,
              zone: this.getZoneName(x, y),
              height: rng.int(2, 6)
            });
          }
        }
        row.push(tile);
      }
      this.grid.push(row);
    }
  }

  getZoneName(x, y) {
    if (x < 50 && y < 50) return ZONES.DOWNTOWN.name;
    if (x >= 50 && y < 50) return ZONES.OLD_HARBOR.name;
    if (x < 50 && y >= 50) return ZONES.NEON_ROW.name;
    if (x >= 50 && y >= 70) return ZONES.SUNSET_BEACH.name;
    return ZONES.NORTH_HILLS.name;
  }

  getTile(x, y) {
    const tx = Math.floor(x / this.tileSize);
    const ty = Math.floor(y / this.tileSize);
    if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) {
      return 3;
    }
    return this.grid[ty][tx];
  }

  isSolid(x, y) {
    const t = this.getTile(x, y);
    return t === 2 || t === 3;
  }
}
