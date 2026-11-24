import { WEAPONS } from './config.js';
import { audio } from './audio.js';

export class Projectile {
    constructor(x, y, angle, weaponKey) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.weapon = WEAPONS[(weaponKey || 'PISTOL').toUpperCase()] || WEAPONS.PISTOL;
        this.speed = 15;
        this.distance = 0;
        this.maxDistance = this.weapon.range;
        this.active = true;
    }

    update(city) {
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
        this.distance += this.speed;

        if (this.distance >= this.maxDistance || city.isSolid(this.x, this.y)) {
            this.active = false;
        }
    }

    draw(ctx, camera) {
        ctx.save();
        ctx.translate(this.x - camera.x, this.y - camera.y);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();
    }
}
