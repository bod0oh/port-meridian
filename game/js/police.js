import { CONFIG } from './config.js';
import { Police } from './entities.js';
import { Vehicle } from './vehicles.js';
import { SeededRandom } from './random.js';
import { audio } from './audio.js';

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export class WantedSystem {
  constructor(player, city) {
    this.player = player;
    this.city = city;
    this.heat = 0;
    this.wantedLevel = 0;
    this.police = [];
    this.cruisers = [];
    this.roadblocks = [];
    this.timeSinceCrime = 0;
    this.sirenTimer = 0;
    this.rng = new SeededRandom(4242);
    this.sprayCostBase = 100;
    this.syncPlayer();
  }

  syncPlayer() {
    if (this.player) {
      this.player.wantedLevel = this.wantedLevel;
    }
  }

  computeLevel(h) {
    if (h >= 85) return 5;
    if (h >= 70) return 4;
    if (h >= 55) return 3;
    if (h >= 40) return 2;
    if (h >= 20) return 1;
    return 0;
  }

  addHeat(amount) {
    this.heat = clamp(this.heat + amount, 0, 100);
    this.wantedLevel = this.computeLevel(this.heat);
    this.timeSinceCrime = 0;
    this.syncPlayer();
  }

  clearWanted() {
    this.heat = 0;
    this.wantedLevel = 0;
    this.police = [];
    this.cruisers = [];
    this.roadblocks = [];
    this.timeSinceCrime = 0;
    this.syncPlayer();
  }

  update(dt, vehicles) {
    // 1. Time since crime / heat decay
    if (this.wantedLevel > 0) {
      this.timeSinceCrime += dt;
      if (this.timeSinceCrime > 10) {
        this.heat = clamp(this.heat - dt * 2, 0, 100);
        this.wantedLevel = this.computeLevel(this.heat);
        this.syncPlayer();
        if (this.wantedLevel === 0) {
          this.police = [];
          this.cruisers = [];
          this.roadblocks = [];
        }
      }
    }

    // Remove entities farther than 1500 px from player
    const maxDistSq = 1500 * 1500;
    this.police = this.police.filter(p => {
      const dx = p.x - this.player.x;
      const dy = p.y - this.player.y;
      return (dx * dx + dy * dy) <= maxDistSq;
    });
    this.cruisers = this.cruisers.filter(c => {
      const dx = c.x - this.player.x;
      const dy = c.y - this.player.y;
      return (dx * dx + dy * dy) <= maxDistSq;
    });
    this.roadblocks = this.roadblocks.filter(r => {
      const dx = r.x - this.player.x;
      const dy = r.y - this.player.y;
      return (dx * dx + dy * dy) <= maxDistSq;
    });

    // 2. Desired counts & spawning
    const desiredOnFoot = this.wantedLevel;
    const desiredCruisers = this.wantedLevel >= 2 ? this.wantedLevel : 0;

    while (this.police.length < desiredOnFoot) {
      const spawnPos = this.findRoadSpawnNearPlayer();
      if (spawnPos) {
        this.police.push(new Police(spawnPos.x, spawnPos.y));
      } else {
        break;
      }
    }

    while (this.cruisers.length < desiredCruisers) {
      const spawnPos = this.findRoadSpawnNearPlayer();
      if (spawnPos) {
        this.cruisers.push(new Vehicle(spawnPos.x, spawnPos.y, 'POLICE'));
      } else {
        break;
      }
    }

    // 3. Update on-foot police and siren audio
    const hasPolice = this.police.length > 0 || this.cruisers.length > 0;
    if (hasPolice) {
      this.sirenTimer += dt;
      if (this.sirenTimer >= 1.0) {
        this.sirenTimer = 0;
        if (audio && typeof audio.playSiren === 'function') {
          audio.playSiren();
        }
      }
    }

    for (const p of this.police) {
      if (typeof p.update === 'function') {
        p.update(this.player, this.city);
      }
    }

    // 4. Steer cruisers toward player and check collision/damage
    for (const c of this.cruisers) {
      c.angle = Math.atan2(this.player.y - c.y, this.player.x - c.x);
      c.speed = (c.maxSpeed || 8) * 0.8;

      let nx = c.x + Math.cos(c.angle) * c.speed;
      let ny = c.y + Math.sin(c.angle) * c.speed;

      if (this.city.isSolid && this.city.isSolid(nx, ny)) {
        c.speed = -c.speed * 0.5;
        nx = c.x + Math.cos(c.angle) * c.speed;
        ny = c.y + Math.sin(c.angle) * c.speed;
      }
      c.x = nx;
      c.y = ny;

      const pdx = this.player.x - c.x;
      const pdy = this.player.y - c.y;
      if (Math.sqrt(pdx * pdx + pdy * pdy) < 40) {
        if (this.player.currentVehicle) {
          this.player.currentVehicle.health -= 0.5;
        } else {
          this.player.health -= 0.5;
        }
      }
    }

    // 5. Roadblocks
    const desiredRoadblocks = this.wantedLevel >= 3 ? this.wantedLevel - 2 : 0;
    while (this.roadblocks.length < desiredRoadblocks) {
      const fAngle = this.player.angle || 0;
      const rx = this.player.x + Math.cos(fAngle) * 500;
      const ry = this.player.y + Math.sin(fAngle) * 500;
      const tx = Math.floor(rx / 32);
      const ty = Math.floor(ry / 32);
      let rPosX = rx;
      let rPosY = ry;
      if (this.city.getTile && this.city.getTile(tx, ty) === 0) {
        rPosX = tx * 32 + 16;
        rPosY = ty * 32 + 16;
      }
      this.roadblocks.push({ x: rPosX, y: rPosY, angle: fAngle });
    }

    for (const rb of this.roadblocks) {
      if (this.player.currentVehicle) {
        const v = this.player.currentVehicle;
        const rdx = v.x - rb.x;
        const rdy = v.y - rb.y;
        if (Math.sqrt(rdx * rdx + rdy * rdy) < 40) {
          v.speed = -v.speed * 0.3;
          v.health -= 10;
        }
      }
    }
  }

  findRoadSpawnNearPlayer() {
    const minDist = 300;
    const maxDist = 600;
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const dist = this.rng.range(minDist, maxDist);
      const x = this.player.x + Math.cos(angle) * dist;
      const y = this.player.y + Math.sin(angle) * dist;
      const tx = Math.floor(x / 32);
      const ty = Math.floor(y / 32);
      if (this.city.getTile && this.city.getTile(tx, ty) === 0) {
        return { x, y };
      }
    }
    const angle = this.rng.range(0, Math.PI * 2);
    const dist = 400;
    return {
      x: this.player.x + Math.cos(angle) * dist,
      y: this.player.y + Math.sin(angle) * dist
    };
  }

  trySprayAndGo() {
    if (!this.city.spawnPoints || !this.city.spawnPoints.sprayShop) return false;
    const shop = this.city.spawnPoints.sprayShop;
    const dx = this.player.x - shop.x;
    const dy = this.player.y - shop.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const cost = this.sprayCostBase + this.wantedLevel * 100;
    if (dist <= 120 && this.player.money >= cost) {
      this.player.money -= cost;
      this.clearWanted();
      if (audio && typeof audio.playClick === 'function') {
        audio.playClick();
      }
      return true;
    }
    return false;
  }

  draw(ctx, camera) {
    for (const rb of this.roadblocks) {
      ctx.save();
      ctx.translate(rb.x - (camera ? camera.x : 0), rb.y - (camera ? camera.y : 0));
      ctx.rotate(rb.angle);

      const width = 70;
      const height = 14;
      ctx.translate(-width / 2, -height / 2);

      const stripeWidth = 10;
      for (let sx = 0; sx < width; sx += stripeWidth) {
        ctx.fillStyle = (Math.floor(sx / stripeWidth) % 2 === 0) ? '#facc15' : '#111827';
        ctx.fillRect(sx, 0, stripeWidth, height);
      }

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, width, height);

      // Cones
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(-8, height / 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(width + 8, height / 2, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }
}
