import { WEAPONS, VEHICLE_TYPES } from './config.js';
import { Vehicle } from './vehicles.js';
import { SeededRandom } from './random.js';
import { audio } from './audio.js';

export class Economy {
  constructor(player, city) {
    this.player = player;
    this.city = city;
    this.rng = new SeededRandom(31337);
    this.notification = '';
    this.packages = [];
    this.ramps = [];
    this.fare = null;
    this.killTimes = [];
    this.time = 0;

    // Initialize 20 hidden packages on sidewalk tiles (code 1)
    while (this.packages.length < 20) {
      const tx = Math.floor(this.rng.range(0, city.width));
      const ty = Math.floor(this.rng.range(0, city.height));
      let isSidewalk = false;
      if (city.grid && city.grid[ty] && city.grid[ty][tx] === 1) {
        isSidewalk = true;
      } else if (typeof city.getTile === 'function') {
        const x = (tx + 0.5) * 32;
        const y = (ty + 0.5) * 32;
        if (city.getTile(x, y) === 1) {
          isSidewalk = true;
        }
      }
      if (isSidewalk) {
        const x = (tx + 0.5) * 32;
        const y = (ty + 0.5) * 32;
        if (!this.packages.some(p => p.x === x && p.y === y)) {
          this.packages.push({ x, y, collected: false });
        }
      }
    }

    // Initialize 6 stunt ramps on road tiles (code 0)
    while (this.ramps.length < 6) {
      const tx = Math.floor(this.rng.range(0, city.width));
      const ty = Math.floor(this.rng.range(0, city.height));
      let isRoad = false;
      if (city.grid && city.grid[ty] && city.grid[ty][tx] === 0) {
        isRoad = true;
      } else if (typeof city.getTile === 'function') {
        const x = (tx + 0.5) * 32;
        const y = (ty + 0.5) * 32;
        if (city.getTile(x, y) === 0) {
          isRoad = true;
        }
      }
      if (isRoad) {
        const x = (tx + 0.5) * 32;
        const y = (ty + 0.5) * 32;
        if (!this.ramps.some(r => r.x === x && r.y === y)) {
          this.ramps.push({ x, y, lastUsed: -999 });
        }
      }
    }
  }

  randomRoadPoint() {
    let tx = 0, ty = 0;
    let found = false;
    let attempts = 0;
    while (!found && attempts < 1000) {
      attempts++;
      tx = Math.floor(this.rng.range(0, this.city.width));
      ty = Math.floor(this.rng.range(0, this.city.height));
      if (this.city.grid && this.city.grid[ty] && this.city.grid[ty][tx] === 0) {
        found = true;
      } else if (typeof this.city.getTile === 'function') {
        const x = (tx + 0.5) * 32;
        const y = (ty + 0.5) * 32;
        if (this.city.getTile(x, y) === 0) {
          found = true;
        }
      }
    }
    return { x: (tx + 0.5) * 32, y: (ty + 0.5) * 32 };
  }

  update(dt, vehicles) {
    this.time += dt;

    // 1. Hidden packages
    for (const pkg of this.packages) {
      if (!pkg.collected) {
        const dx = this.player.x - pkg.x;
        const dy = this.player.y - pkg.y;
        if (dx * dx + dy * dy <= 40 * 40) {
          pkg.collected = true;
          this.player.money += 100;
          this.notification = 'Hidden package found! +$100';
          audio.playPickup();
        }
      }
    }

    // 2. Taxi fare system
    if (this.player.currentVehicle && !this.fare) {
      const pickup = this.randomRoadPoint();
      let dest = this.randomRoadPoint();
      let attempts = 0;
      while (attempts < 20) {
        attempts++;
        const zonePickup = typeof this.city.getZoneName === 'function' ? this.city.getZoneName(Math.floor(pickup.x / 32), Math.floor(pickup.y / 32)) : '';
        const zoneDest = typeof this.city.getZoneName === 'function' ? this.city.getZoneName(Math.floor(dest.x / 32), Math.floor(dest.y / 32)) : '';
        if (zonePickup !== zoneDest) break;
        dest = this.randomRoadPoint();
      }
      this.fare = { pickup, dest, hasPassenger: false, reward: 100 };
    }

    if (this.fare) {
      if (!this.fare.hasPassenger) {
        const dx = this.player.x - this.fare.pickup.x;
        const dy = this.player.y - this.fare.pickup.y;
        if (dx * dx + dy * dy <= 50 * 50) {
          this.fare.hasPassenger = true;
          this.notification = 'Passenger picked up — drive to the marker';
        }
      } else {
        const dx = this.player.x - this.fare.dest.x;
        const dy = this.player.y - this.fare.dest.y;
        if (dx * dx + dy * dy <= 50 * 50) {
          this.player.money += this.fare.reward;
          this.notification = 'Fare complete! +$' + this.fare.reward;
          audio.playPickup();
          this.fare = null;
        }
      }
    }

    // 3. Stunt jumps
    if (this.player.currentVehicle) {
      const vehSpeed = Math.abs(this.player.currentVehicle.speed || 0);
      if (vehSpeed > 5) {
        for (const ramp of this.ramps) {
          const dx = this.player.x - ramp.x;
          const dy = this.player.y - ramp.y;
          if (dx * dx + dy * dy <= 40 * 40) {
            if (this.time - ramp.lastUsed > 60) {
              ramp.lastUsed = this.time;
              this.player.money += 200;
              this.notification = 'Stunt jump! +$200';
              audio.playPickup();
            }
          }
        }
      }
    }

    // 4. Rampage bonus
    this.killTimes = this.killTimes.filter(t => this.time - t <= 10);
    if (this.killTimes.length >= 3) {
      this.player.money += 150;
      this.notification = 'Rampage bonus! +$150';
      this.killTimes = [];
    }
  }

  onKill() {
    this.killTimes.push(this.time);
  }

  getFareTarget() {
    if (!this.fare) return null;
    return this.fare.hasPassenger ? this.fare.dest : this.fare.pickup;
  }

  getPackagesRemaining() {
    return this.packages.filter(p => !p.collected).length;
  }

  buyWeapon(weaponKey) {
    const weapon = WEAPONS[weaponKey];
    if (!weapon || !weapon.price) return false;
    if (!this.player.inventory) this.player.inventory = [];
    if (this.player.inventory.includes(weapon.id)) return false;
    if (this.player.money < weapon.price) return false;
    this.player.money -= weapon.price;
    this.player.inventory.push(weapon.id);
    if (!this.player.ammo) this.player.ammo = {};
    this.player.ammo[weapon.id] = weapon.ammo || 100;
    audio.playClick();
    this.notification = weapon.name + ' purchased!';
    return true;
  }

  buyArmor() {
    const maxArmor = this.player.maxArmor || 100;
    if (this.player.money >= 150 && this.player.armor < maxArmor) {
      this.player.money -= 150;
      this.player.armor = Math.min(maxArmor, this.player.armor + 50);
      audio.playClick();
      this.notification = 'Armor purchased!';
      return true;
    }
    return false;
  }

  repairVehicle(vehicle) {
    if (!vehicle) return false;
    const maxH = vehicle.maxHealth || 100;
    const h = vehicle.health || 0;
    if (h >= maxH) return false;
    const cost = Math.ceil((maxH - h) * 0.5);
    if (this.player.money < cost) return false;
    this.player.money -= cost;
    vehicle.health = maxH;
    audio.playClick();
    this.notification = 'Vehicle repaired!';
    return true;
  }

  buyVehicle(typeKey) {
    const prices = { SPORT: 5000, VAN: 2500, SEDAN: 1500 };
    const price = prices[typeKey] || (VEHICLE_TYPES[typeKey] && VEHICLE_TYPES[typeKey].price) || 2000;
    if (this.player.money < price) return null;
    this.player.money -= price;
    audio.playClick();
    this.notification = typeKey + ' purchased!';
    return new Vehicle(this.player.x + 60, this.player.y, typeKey);
  }
}
