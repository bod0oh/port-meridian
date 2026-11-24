import { WEAPONS } from './config.js';

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.angle = 0;
    this.speed = 2.8;
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 50;
    this.maxArmor = 100;
    this.money = 500;
    this.wantedLevel = 0;
    this.currentVehicle = null;
    this.inventory = ['fists', 'pistol'];
    this.currentWeaponKey = 'pistol';
    this.ammo = { pistol: 100, smg: 0, shotgun: 0 };
  }

  update(keys, city) {
    if (this.currentVehicle) return;

    let dx = 0;
    let dy = 0;

    if (keys['KeyW'] || keys['ArrowUp'] || keys.w || keys.up) dy -= 1;
    if (keys['KeyS'] || keys['ArrowDown'] || keys.s || keys.down) dy += 1;
    if (keys['KeyA'] || keys['ArrowLeft'] || keys.a || keys.left) dx -= 1;
    if (keys['KeyD'] || keys['ArrowRight'] || keys.d || keys.right) dx += 1;

    if (dx !== 0 && dy !== 0) {
      dx *= 0.7071;
      dy *= 0.7071;
    }

    const isSprinting = keys['ShiftLeft'] || keys['ShiftRight'] || keys.shift;
    const currentSpeed = this.speed * (isSprinting ? 1.6 : 1);

    if (dx !== 0 || dy !== 0) {
      this.angle = Math.atan2(dy, dx);
    }

    const nx = this.x + dx * currentSpeed;
    const ny = this.y + dy * currentSpeed;

    if (!city.isSolid(nx, this.y)) this.x = nx;
    if (!city.isSolid(this.x, ny)) this.y = ny;
  }

  draw(ctx, camera) {
    if (this.currentVehicle) return;
    ctx.save();
    ctx.translate(this.x - camera.x, this.y - camera.y);
    ctx.rotate(this.angle);
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.closePath();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, -3, 10, 6);
    ctx.restore();
  }
}

export class Pedestrian {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 1.2;
    this.vy = (Math.random() - 0.5) * 1.2;
    this.health = 30;
    this.color = '#cbd5e1';
  }

  update(city) {
    const nx = this.x + this.vx;
    const ny = this.y + this.vy;
    if (city.isSolid(nx, ny)) {
      this.vx = -this.vx;
      this.vy = -this.vy;
    } else {
      this.x = nx;
      this.y = ny;
    }
  }

  draw(ctx, camera) {
    ctx.save();
    ctx.translate(this.x - camera.x, this.y - camera.y);
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.closePath();
    ctx.restore();
  }
}

export class Police {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.speed = 3.2;
    this.health = 80;
    this.color = '#3b82f6';
  }

  update(player, city) {
    const angle = Math.atan2(player.y - this.y, player.x - this.x);
    this.angle = angle;
    const nx = this.x + Math.cos(angle) * this.speed;
    const ny = this.y + Math.sin(angle) * this.speed;
    if (!city.isSolid(nx, this.y)) this.x = nx;
    if (!city.isSolid(this.x, ny)) this.y = ny;
  }

  draw(ctx, camera) {
    ctx.save();
    ctx.translate(this.x - camera.x, this.y - camera.y);
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.closePath();

    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-3, -15, 6, 4);
    ctx.restore();
  }
}
