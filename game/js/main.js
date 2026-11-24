import { CONFIG, WEAPONS, VEHICLE_TYPES, ZONES, MISSIONS } from './config.js';
import { City } from './city.js';
import { Player, Pedestrian, Police } from './entities.js';
import { Vehicle } from './vehicles.js';
import { Projectile } from './combat.js';
import { audio } from './audio.js';
import { saveManager } from './save.js';
import { SeededRandom } from './random.js';
import { InputManager } from './input.js';
import { Renderer } from './render.js';
import { WantedSystem } from './police.js';
import { MissionManager } from './missions.js';
import { Economy } from './economy.js';
import { HUD } from './hud.js';
import { setupShot } from './shots.js';

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function dist(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.city = new City();
    this.rng = new SeededRandom(20261124);

    const spawnP = this.city.spawnPoints && this.city.spawnPoints.player ? this.city.spawnPoints.player : { x: 100, y: 100 };
    this.player = new Player(spawnP.x, spawnP.y);
    this.input = new InputManager();
    this.renderer = new Renderer(canvas);
    this.hud = new HUD(canvas);
    this.wanted = new WantedSystem(this.player, this.city);
    this.missions = new MissionManager(this.player, this.city, this.wanted);
    this.economy = new Economy(this.player, this.city);

    this.camera = { x: 0, y: 0 };
    this.vehicles = [];
    this.pedestrians = [];
    this.projectiles = [];
    this.gameState = 'menu'; // 'menu' | 'playing' | 'paused' | 'gameover' | 'complete'
    this.elapsed = 0;
    this.frame = 0;
    this.shake = 0;
    this.fireCooldown = 0;
    this.notification = '';
    this.notificationTimer = 0;
    this.lastMissionIndex = 0;

    // Spawn 12 traffic vehicles
    const vehicleTypes = ['SEDAN', 'SPORT', 'VAN'];
    for (let i = 0; i < 12; i++) {
      const pt = this.randomRoadPoint();
      const vType = this.rng.choice(vehicleTypes);
      const veh = new Vehicle(pt.x, pt.y, vType);
      this.vehicles.push(veh);
    }

    // Spawn 24 pedestrians
    for (let i = 0; i < 24; i++) {
      const pt = this.randomSidewalkPoint();
      this.pedestrians.push(new Pedestrian(pt.x, pt.y));
    }

    this.missions.startMission();
    window.__shotReady = false;

    // ?shot= hook support
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (shot) {
      const seed = parseInt(params.get('seed') || '1', 10);
      setupShot(this, shot, seed);
      this.gameState = 'playing';
    }
  }

  randomRoadPoint() {
    const roadTiles = [];
    for (let ty = 0; ty < this.city.height; ty++) {
      for (let tx = 0; tx < this.city.width; tx++) {
        if (this.city.grid[ty][tx] === 0) {
          roadTiles.push({ tx, ty });
        }
      }
    }
    if (roadTiles.length === 0) return { x: 60 * 32, y: 60 * 32 };
    const t = this.rng.choice(roadTiles);
    return { x: (t.tx + 0.5) * 32, y: (t.ty + 0.5) * 32 };
  }

  randomSidewalkPoint() {
    const sideTiles = [];
    for (let ty = 0; ty < this.city.height; ty++) {
      for (let tx = 0; tx < this.city.width; tx++) {
        if (this.city.grid[ty][tx] === 1) {
          sideTiles.push({ tx, ty });
        }
      }
    }
    if (sideTiles.length === 0) return { x: 60 * 32, y: 60 * 32 };
    const t = this.rng.choice(sideTiles);
    return { x: (t.tx + 0.5) * 32, y: (t.ty + 0.5) * 32 };
  }

  start() {
    let lastTime = performance.now();
    let accumulator = 0;
    const timestep = 1 / 60;

    const loop = (currentTime) => {
      requestAnimationFrame(loop);

      const dt = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      this.input.update(this.camera);

      if (this.input.pressed && Object.keys(this.input.pressed).length > 0) {
        audio.init();
      }

      if (this.input.isPressed('Enter')) {
        audio.init();
        if (this.gameState === 'menu') {
          this.loadGame();
          this.gameState = 'playing';
        } else if (this.gameState === 'gameover' || this.gameState === 'complete') {
          location.reload();
        }
      }

      if (this.input.isPressed('Escape')) {
        audio.playClick();
        if (this.gameState === 'playing') {
          this.gameState = 'paused';
        } else if (this.gameState === 'paused') {
          this.gameState = 'playing';
        }
      }

      if (this.input.isPressed('KeyM')) {
        audio.muted = !audio.muted;
      }

      if (this.gameState === 'playing') {
        accumulator += Math.min(dt, 0.2);
        let steps = 0;
        while (accumulator >= timestep && steps < 5) {
          this.update(timestep);
          accumulator -= timestep;
          steps++;
        }
      }

      this.render();
      this.frame++;

      if (this.frame === 1) {
        window.__shotReady = true;
      }

      this.input.endFrame();
    };

    requestAnimationFrame(loop);
  }

  update(dt) {
    this.elapsed += dt;
    this.timeOfDay = (this.elapsed % CONFIG.DAY_DURATION) / CONFIG.DAY_DURATION;
    this.rain = Math.sin(this.elapsed * 0.05) > 0.7;
    this.fireCooldown -= dt;
    this.shake = Math.max(0, this.shake - dt * 20);

    // Player aim
    if (!this.player.currentVehicle) {
      this.player.angle = Math.atan2(this.input.mouse.worldY - this.player.y, this.input.mouse.worldX - this.player.x);
    }

    // Enter/exit car (KeyE)
    if (this.input.isPressed('KeyE')) {
      audio.playClick();
      if (this.player.currentVehicle) {
        const v = this.player.currentVehicle;
        v.isPlayerInside = false;
        v.driver = null;
        this.player.x = v.x + 40 * Math.cos(v.angle + Math.PI / 2);
        this.player.y = v.y + 40 * Math.sin(v.angle + Math.PI / 2);
        this.player.currentVehicle = null;
      } else {
        let nearestV = null;
        let minD = 60;
        for (const v of this.vehicles) {
          const d = dist(this.player.x, this.player.y, v.x, v.y);
          if (d < minD) {
            minD = d;
            nearestV = v;
          }
        }
        if (nearestV) {
          this.player.currentVehicle = nearestV;
          nearestV.isPlayerInside = true;
          nearestV.driver = this.player;
          this.wanted.addHeat(5);
        }
      }
    }

    // Movement
    if (this.player.currentVehicle) {
      const v = this.player.currentVehicle;
      v.update(this.input.keys, this.city);
      this.player.x = v.x;
      this.player.y = v.y;
      this.player.angle = v.angle;
    } else {
      this.player.update(this.input.keys, this.city);
    }

    // Weapon switching (Digit1 - Digit4)
    const weaponKeys = ['fists', 'pistol', 'smg', 'shotgun'];
    const weaponNames = ['FISTS', 'PISTOL', 'SMG', 'SHOTGUN'];
    const weaponsShop = this.city.spawnPoints && this.city.spawnPoints.weaponsShop;
    const nearWeaponsShop = weaponsShop ? dist(this.player.x, this.player.y, weaponsShop.x, weaponsShop.y) < 120 : false;

    for (let i = 0; i < 4; i++) {
      const digitKey = `Digit${i + 1}`;
      const keyKey = `Key${i + 1}`;
      if (this.input.isPressed(digitKey) || this.input.isPressed(keyKey)) {
        const wKey = weaponKeys[i];
        const wName = weaponNames[i];
        if (nearWeaponsShop && i > 0 && (!this.player.inventory || !this.player.inventory.includes(wKey))) {
          this.economy.buyWeapon(wKey);
        } else {
          if (i === 0 || (this.player.inventory && this.player.inventory.includes(wKey))) {
            this.player.currentWeaponKey = wKey;
          }
        }
      }
    }

    // Shooting / Melee
    if (this.input.mouse.down && this.fireCooldown <= 0 && !this.player.currentVehicle) {
      const curKey = this.player.currentWeaponKey || 'pistol';
      if (curKey === 'fists') {
        const targets = [...this.pedestrians, ...(this.wanted.police || []), ...(this.missions.enemies || [])];
        let nearest = null;
        let minDist = 50;
        for (const t of targets) {
          const d = dist(this.player.x, this.player.y, t.x, t.y);
          if (d < minDist) {
            minDist = d;
            nearest = t;
          }
        }
        if (nearest) {
          nearest.health -= 15;
          audio.playClick();
          if (nearest.health <= 0) {
            this.removeTarget(nearest);
            this.economy.onKill();
            this.wanted.addHeat(5);
          }
        }
        this.fireCooldown = 0.4;
      } else {
        const ammoCount = this.player.ammo && this.player.ammo[curKey] !== undefined ? this.player.ammo[curKey] : 999;
        if (ammoCount > 0) {
          if (this.player.ammo && this.player.ammo[curKey] !== undefined) {
            this.player.ammo[curKey]--;
          }
          const p = new Projectile(this.player.x, this.player.y, this.player.angle, curKey);
          this.projectiles.push(p);
          const weaponDef = WEAPONS[curKey.toUpperCase()] || { fireRate: 200 };
          this.fireCooldown = (weaponDef.fireRate || 200) / 1000;
          audio.playShoot();
          this.wanted.addHeat(2);
        } else {
          audio.playClick();
        }
      }
    }

    // Projectiles update & collision
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.update(this.city);
      if (!proj.active) {
        this.projectiles.splice(i, 1);
        continue;
      }

      const allTargets = [
        ...this.pedestrians,
        ...(this.wanted.police || []),
        ...(this.missions.enemies || []),
        ...(this.wanted.cruisers || []),
        ...this.vehicles.filter(v => v !== this.player.currentVehicle)
      ];

      for (const t of allTargets) {
        if (dist(proj.x, proj.y, t.x, t.y) < 22) {
          const dmg = (proj.weapon && proj.weapon.damage) || 25;
          t.health -= dmg;
          proj.active = false;

          if (t.health <= 0) {
            if (this.vehicles.includes(t) || (this.wanted.cruisers && this.wanted.cruisers.includes(t))) {
              audio.playExplosion();
              this.shake = 10;
              this.wanted.addHeat(10);
              if (t === this.player.currentVehicle) {
                this.player.currentVehicle = null;
                this.player.health -= 20;
              }
              this.removeVehicle(t);
            } else {
              this.removeTarget(t);
              this.economy.onKill();
              this.wanted.addHeat(5);
            }
          }
          break;
        }
      }
      if (!proj.active) {
        this.projectiles.splice(i, 1);
      }
    }

    // Traffic update
    for (const v of this.vehicles) {
      if (v === this.player.currentVehicle) continue;
      if (!v.waypoint || dist(v.x, v.y, v.waypoint.x, v.waypoint.y) < 80 || this.city.isSolid(v.x, v.y)) {
        v.waypoint = this.randomRoadPoint();
      }
      const targetAngle = Math.atan2(v.waypoint.y - v.y, v.waypoint.x - v.x);
      v.angle = targetAngle;
      const maxSpd = v.maxSpeed || (v.type && v.type.speed) || 4;
      v.speed = maxSpd * 0.5;
      v.x += Math.cos(v.angle) * v.speed;
      v.y += Math.sin(v.angle) * v.speed;
      if (this.city.isSolid(v.x, v.y)) {
        v.x -= Math.cos(v.angle) * v.speed * 2;
        v.y -= Math.sin(v.angle) * v.speed * 2;
        v.waypoint = this.randomRoadPoint();
      }
    }

    // Pedestrians update
    for (let i = this.pedestrians.length - 1; i >= 0; i--) {
      const ped = this.pedestrians[i];
      if (ped.health <= 0) {
        this.pedestrians.splice(i, 1);
        const pt = this.randomSidewalkPoint();
        this.pedestrians.push(new Pedestrian(pt.x, pt.y));
      } else {
        ped.update(this.city);
      }
    }

    // Systems
    this.wanted.update(dt, this.vehicles);
    this.missions.update(dt);
    this.economy.update(dt, this.vehicles);

    if (this.missions.targetVehicle && !this.vehicles.includes(this.missions.targetVehicle)) {
      this.vehicles.push(this.missions.targetVehicle);
    }

    if (this.missions.notification) {
      this.notification = this.missions.notification;
      this.notificationTimer = 3;
      this.missions.notification = '';
    } else if (this.economy.notification) {
      this.notification = this.economy.notification;
      this.notificationTimer = 3;
      this.economy.notification = '';
    }

    if (this.notificationTimer > 0) {
      this.notificationTimer -= dt;
      if (this.notificationTimer <= 0) {
        this.notification = '';
      }
    }

    // Interact (KeyF)
    const sprayShop = this.city.spawnPoints && this.city.spawnPoints.sprayShop;
    const safehouse = this.city.spawnPoints && this.city.spawnPoints.safehouse;
    const dSpray = sprayShop ? dist(this.player.x, this.player.y, sprayShop.x, sprayShop.y) : 9999;
    const dWeap = weaponsShop ? dist(this.player.x, this.player.y, weaponsShop.x, weaponsShop.y) : 9999;
    const dSafe = safehouse ? dist(this.player.x, this.player.y, safehouse.x, safehouse.y) : 9999;

    if (this.input.isPressed('KeyF')) {
      audio.playClick();
      if (dSpray < 120 && this.wanted.wantedLevel > 0) {
        this.wanted.trySprayAndGo();
      } else if (dWeap < 120) {
        if (this.player.currentVehicle) {
          this.economy.repairVehicle(this.player.currentVehicle);
        } else {
          this.economy.buyArmor();
        }
      } else if (dSafe < 120) {
        this.saveGame();
        this.notification = 'Game saved';
        this.notificationTimer = 3;
      }
    }

    // Camera
    const viewW = this.canvas.width;
    const viewH = this.canvas.height;
    this.camera.x = clamp(this.player.x - viewW / 2, 0, this.city.width * this.city.tileSize - viewW);
    this.camera.y = clamp(this.player.y - viewH / 2, 0, this.city.height * this.city.tileSize - viewH);

    // Game state checks
    if (this.player.health <= 0) {
      this.gameState = 'gameover';
    }
    if (this.missions.allComplete) {
      this.gameState = 'complete';
    }
    if (this.missions.currentIndex !== this.lastMissionIndex) {
      this.lastMissionIndex = this.missions.currentIndex;
      this.saveGame();
    }
  }

  removeTarget(t) {
    const idxP = this.pedestrians.indexOf(t);
    if (idxP !== -1) {
      this.pedestrians.splice(idxP, 1);
      const pt = this.randomSidewalkPoint();
      this.pedestrians.push(new Pedestrian(pt.x, pt.y));
      return;
    }
    const idxPol = this.wanted.police ? this.wanted.police.indexOf(t) : -1;
    if (idxPol !== -1) {
      this.wanted.police.splice(idxPol, 1);
      return;
    }
    const idxE = this.missions.enemies ? this.missions.enemies.indexOf(t) : -1;
    if (idxE !== -1) {
      this.missions.enemies.splice(idxE, 1);
      return;
    }
  }

  removeVehicle(v) {
    const idx1 = this.vehicles.indexOf(v);
    if (idx1 !== -1) this.vehicles.splice(idx1, 1);
    const idx2 = this.wanted.cruisers ? this.wanted.cruisers.indexOf(v) : -1;
    if (idx2 !== -1) this.wanted.cruisers.splice(idx2, 1);
  }

  saveGame() {
    saveManager.save({
      player: {
        x: this.player.x,
        y: this.player.y,
        health: this.player.health,
        armor: this.player.armor,
        money: this.player.money,
        inventory: this.player.inventory,
        currentWeaponKey: this.player.currentWeaponKey,
        ammo: this.player.ammo
      },
      missions: {
        currentIndex: this.missions.currentIndex
      },
      economy: {
        packagesCollected: this.economy.packages ? this.economy.packages.filter(p => p.collected).length : 0
      },
      elapsed: this.elapsed
    });
  }

  loadGame() {
    const data = saveManager.load();
    if (data) {
      if (data.player) {
        this.player.x = data.player.x ?? this.player.x;
        this.player.y = data.player.y ?? this.player.y;
        this.player.health = data.player.health ?? this.player.health;
        this.player.armor = data.player.armor ?? data.player.armor;
        this.player.money = data.player.money ?? data.player.money;
        this.player.inventory = data.player.inventory ?? this.player.inventory;
        this.player.currentWeaponKey = data.player.currentWeaponKey ?? this.player.currentWeaponKey;
        this.player.ammo = data.player.ammo ?? data.player.ammo;
      }
      if (data.missions && typeof data.missions.currentIndex === 'number') {
        this.missions.currentIndex = data.missions.currentIndex;
        this.missions.startMission();
        this.lastMissionIndex = this.missions.currentIndex;
      }
      if (data.economy && typeof data.economy.packagesCollected === 'number' && this.economy.packages) {
        for (let i = 0; i < data.economy.packagesCollected && i < this.economy.packages.length; i++) {
          this.economy.packages[i].collected = true;
        }
      }
      if (typeof data.elapsed === 'number') {
        this.elapsed = data.elapsed;
      }
    }
  }

  render() {
    const state = {
      city: this.city,
      player: this.player,
      vehicles: [...this.vehicles, ...(this.wanted.cruisers || [])],
      pedestrians: this.pedestrians,
      police: [...(this.wanted.police || []), ...(this.missions.enemies || [])],
      projectiles: this.projectiles,
      camera: this.camera,
      timeOfDay: this.timeOfDay,
      rain: this.rain,
      frame: this.frame,
      shake: this.shake
    };

    this.renderer.render(state);

    if (this.renderer.ctx && typeof this.wanted.draw === 'function') {
      this.wanted.draw(this.renderer.ctx, this.camera);
    }

    let currentHint = this.notification;
    if (!currentHint && this.gameState === 'playing') {
      const sprayShop = this.city.spawnPoints && this.city.spawnPoints.sprayShop;
      const weaponsShop = this.city.spawnPoints && this.city.spawnPoints.weaponsShop;
      const safehouse = this.city.spawnPoints && this.city.spawnPoints.safehouse;

      const dSpray = sprayShop ? dist(this.player.x, this.player.y, sprayShop.x, sprayShop.y) : 9999;
      const dWeap = weaponsShop ? dist(this.player.x, this.player.y, weaponsShop.x, weaponsShop.y) : 9999;
      const dSafe = safehouse ? dist(this.player.x, this.player.y, safehouse.x, safehouse.y) : 9999;

      if (dSpray < 120 && this.wanted.wantedLevel > 0) {
        currentHint = 'Press F — Spray & Go ($200)';
      } else if (dWeap < 120) {
        if (this.player.currentVehicle) {
          currentHint = 'Press F — Repair vehicle ($100)';
        } else {
          currentHint = 'Press F — Buy armor ($150)';
        }
      } else if (dSafe < 120) {
        currentHint = 'Press F — Save game';
      }
    }

    const hudState = {
      player: this.player,
      city: this.city,
      vehicles: this.vehicles,
      police: this.wanted.police,
      missionManager: this.missions,
      economy: this.economy,
      wantedLevel: this.wanted.wantedLevel,
      gameState: this.gameState,
      notification: currentHint,
      camera: this.camera,
      frame: this.frame,
      timeOfDay: this.timeOfDay
    };

    this.hud.draw(hudState);
  }
}

function boot() {
  const canvas = document.getElementById('game');
  if (canvas) {
    const game = new Game(canvas);
    window.__game = game;
    game.start();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
