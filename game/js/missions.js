import { MISSIONS } from './config.js';
import { Police } from './entities.js';
import { Vehicle } from './vehicles.js';
import { SeededRandom } from './random.js';
import { audio } from './audio.js';

export class MissionManager {
  constructor(player, city, wantedSystem) {
    this.player = player;
    this.city = city;
    this.wantedSystem = wantedSystem;
    this.currentIndex = 0;
    this.stage = 0;
    this.stageTimer = 0;
    this.progress = 0;
    this.targetPos = null;
    this.targetVehicle = null;
    this.enemies = [];
    this.notification = '';
    this.allComplete = false;
    this.rng = new SeededRandom(777);

    this.startMission();
  }

  getCurrentMission() {
    if (this.allComplete) return null;
    return MISSIONS[this.currentIndex] || null;
  }

  getObjectiveText() {
    if (this.allComplete) return '';
    const m = MISSIONS[this.currentIndex];
    if (!m) return '';

    switch (this.currentIndex) {
      case 0:
        return 'Deliver the package to Old Harbor';
      case 1:
        return this.stage === 0 
          ? `Pick up passenger (${this.progress + 1}/3)` 
          : `Deliver passenger (${this.progress + 1}/3)`;
      case 2:
        return this.player.currentVehicle === this.targetVehicle
          ? 'Drive the sport car to the Safehouse'
          : 'Find and enter the sport car in Neon Row';
      case 3:
        return `Lose the police (${Math.max(0, Math.ceil(15 - this.stageTimer))}s remaining)`;
      case 4:
        return `Eliminate gang members (${this.progress}/5 defeated)`;
      case 5:
        if (this.stage === 0) return 'Reach the bank in Downtown';
        if (this.stage === 1) return `Hold position at bank (${Math.max(0, Math.ceil(10 - this.stageTimer))}s)`;
        return 'Escape to the safe zone in North Hills';
      default:
        return m.title;
    }
  }

  startMission() {
    if (this.currentIndex >= MISSIONS.length) {
      this.allComplete = true;
      this.targetPos = null;
      return;
    }

    const m = MISSIONS[this.currentIndex];
    this.stage = 0;
    this.stageTimer = 0;
    this.progress = 0;
    this.targetVehicle = null;
    this.enemies = [];

    switch (this.currentIndex) {
      case 0:
        this.targetPos = this.findRoadInZone(m.targetZone);
        break;
      case 1:
        this.targetPos = this.findRoadInZone(m.targetZone);
        break;
      case 2: {
        const pos = this.findRoadInZone(m.targetZone);
        // Note: game loop adds targetVehicle to the world vehicles
        this.targetVehicle = new Vehicle(pos.x, pos.y, 'SPORT');
        this.targetPos = { x: pos.x, y: pos.y };
        break;
      }
      case 3:
        this.wantedSystem.addHeat(55);
        this.targetPos = this.findRoadInZone(m.targetZone);
        break;
      case 4: {
        const pos = this.findRoadInZone(m.targetZone);
        const boss = new Police(pos.x, pos.y);
        boss.health = 300;
        boss.speed = 2.6;
        boss.color = '#dc2626';
        this.enemies.push(boss);

        for (let i = 0; i < 4; i++) {
          const angle = (i / 4) * Math.PI * 2;
          const ex = pos.x + Math.cos(angle) * 45;
          const ey = pos.y + Math.sin(angle) * 45;
          const thug = new Police(ex, ey);
          thug.color = '#f97316';
          this.enemies.push(thug);
        }
        this.targetPos = { x: pos.x, y: pos.y };
        break;
      }
      case 5:
        this.targetPos = this.findRoadInZone(m.targetZone);
        break;
      default:
        this.targetPos = this.findRoadInZone(m.targetZone);
        break;
    }
  }

  update(dt) {
    if (this.allComplete) return;

    const m = MISSIONS[this.currentIndex];
    if (!m) return;

    const p = this.player;

    switch (this.currentIndex) {
      case 0: {
        if (this.targetPos) {
          const dist = Math.hypot(p.x - this.targetPos.x, p.y - this.targetPos.y);
          if (dist < 60) {
            this.completeMission(m);
          }
        }
        break;
      }
      case 1: {
        if (this.targetPos) {
          const dist = Math.hypot(p.x - this.targetPos.x, p.y - this.targetPos.y);
          if (dist < 50) {
            audio.playPickup();
            if (this.stage === 0) {
              this.stage = 1;
              this.targetPos = this.findRoadInZone(m.targetZone);
            } else {
              this.progress++;
              if (this.progress >= 3) {
                this.completeMission(m);
              } else {
                this.stage = 0;
                this.targetPos = this.findRoadInZone(m.targetZone);
              }
            }
          }
        }
        break;
      }
      case 2: {
        if (this.targetVehicle) {
          if (p.currentVehicle === this.targetVehicle) {
            if (this.city.spawnPoints && this.city.spawnPoints.safehouse) {
              this.targetPos = {
                x: this.city.spawnPoints.safehouse.x,
                y: this.city.spawnPoints.safehouse.y
              };
            }
            const dist = Math.hypot(p.x - this.targetPos.x, p.y - this.targetPos.y);
            if (dist < 80) {
              this.completeMission(m);
            }
          } else {
            this.targetPos = { x: this.targetVehicle.x, y: this.targetVehicle.y };
          }
        }
        break;
      }
      case 3: {
        this.stageTimer += dt;
        if (this.wantedSystem.wantedLevel === 0 && this.stageTimer >= 15) {
          this.completeMission(m);
        }
        break;
      }
      case 4: {
        this.enemies = this.enemies.filter(e => e.health > 0);
        this.progress = 5 - this.enemies.length;
        if (this.enemies.length === 0) {
          this.completeMission(m);
        }
        break;
      }
      case 5: {
        if (this.stage === 0) {
          if (this.targetPos) {
            const dist = Math.hypot(p.x - this.targetPos.x, p.y - this.targetPos.y);
            if (dist < 60) {
              audio.playPickup();
              this.stage = 1;
              this.stageTimer = 0;
            }
          }
        } else if (this.stage === 1) {
          if (this.targetPos) {
            const dist = Math.hypot(p.x - this.targetPos.x, p.y - this.targetPos.y);
            if (dist <= 120) {
              this.stageTimer += dt;
              if (this.stageTimer >= 10) {
                this.wantedSystem.addHeat(100);
                this.targetPos = this.findRoadInZone('North Hills');
                this.stage = 2;
              }
            }
          }
        } else if (this.stage === 2) {
          if (this.targetPos) {
            const dist = Math.hypot(p.x - this.targetPos.x, p.y - this.targetPos.y);
            if (dist < 80) {
              this.completeMission(m);
            }
          }
        }
        break;
      }
    }
  }

  completeMission(m) {
    this.player.money += m.reward;
    this.notification = `Mission complete: ${m.title} +$${m.reward}`;
    audio.playPickup();
    this.currentIndex++;
    if (this.currentIndex >= MISSIONS.length) {
      this.allComplete = true;
      this.targetPos = null;
    } else {
      this.startMission();
    }
  }

  findRoadInZone(zoneName) {
    const w = this.city.width || 120;
    const h = this.city.height || 120;
    const roadTiles = [];

    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const zone = this.city.getZoneName ? this.city.getZoneName(tx, ty) : '';
        if (zone === zoneName) {
          let isRoad = false;
          if (this.city.grid) {
            const code = Array.isArray(this.city.grid[0])
              ? this.city.grid[ty][tx]
              : this.city.grid[ty * w + tx];
            if (code === 0) isRoad = true;
          }
          if (isRoad) {
            roadTiles.push({ tx, ty });
          }
        }
      }
    }

    if (roadTiles.length > 0) {
      const idx = this.rng.int(0, roadTiles.length - 1);
      const t = roadTiles[idx];
      return {
        x: (t.tx + 0.5) * (this.city.tileSize || 32),
        y: (t.ty + 0.5) * (this.city.tileSize || 32)
      };
    }

    // Fallback
    if (this.city.spawnPoints && this.city.spawnPoints.player) {
      return { x: this.city.spawnPoints.player.x, y: this.city.spawnPoints.player.y };
    }
    return { x: 1920, y: 1920 };
  }
}
