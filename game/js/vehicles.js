import { VEHICLE_TYPES } from './config.js';

export class Vehicle {
    constructor(x, y, typeKey = 'SEDAN') {
        this.x = x;
        this.y = y;
        this.typeKey = typeKey;
        this.type = VEHICLE_TYPES[typeKey] || VEHICLE_TYPES.SEDAN;
        this.angle = 0;
        this.speed = 0;
        this.maxSpeed = this.type.speed;
        this.accel = this.type.accel;
        this.handling = this.type.handling;
        this.health = this.type.health;
        this.maxHealth = this.type.health;
        this.driver = null;
        this.isPlayerInside = false;
        this.color = this.type.color;
        this.width = 28;
        this.length = 50;
    }

    update(keys, city) {
        if (this.isPlayerInside) {
            if (keys['KeyW'] || keys['ArrowUp']) {
                this.speed = Math.min(this.maxSpeed, this.speed + this.accel);
            } else if (keys['KeyS'] || keys['ArrowDown']) {
                this.speed = Math.max(-this.maxSpeed / 2, this.speed - this.accel);
            } else {
                this.speed *= 0.96;
            }

            if (Math.abs(this.speed) > 0.2) {
                const steerFactor = this.handling * (this.speed / this.maxSpeed);
                if (keys['KeyA'] || keys['ArrowLeft']) {
                    this.angle -= steerFactor;
                }
                if (keys['KeyD'] || keys['ArrowRight']) {
                    this.angle += steerFactor;
                }
            }
        } else {
            this.speed *= 0.9;
        }

        const nx = this.x + Math.cos(this.angle) * this.speed;
        const ny = this.y + Math.sin(this.angle) * this.speed;

        if (!city.isSolid(nx, ny)) {
            this.x = nx;
            this.y = ny;
        } else {
            this.speed = -this.speed * 0.5;
            this.health -= 5;
        }
    }

    draw(ctx, camera) {
        ctx.save();
        ctx.translate(this.x - camera.x, this.y - camera.y);
        ctx.rotate(this.angle);

        // Car body
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.length / 2, -this.width / 2, this.length, this.width);

        // Windshield
        ctx.fillStyle = '#111';
        ctx.fillRect(-5, -this.width / 2 + 4, 14, this.width - 8);

        // Headlights
        ctx.fillStyle = '#ff0';
        ctx.fillRect(this.length / 2 - 4, -this.width / 2 + 2, 4, 6);
        ctx.fillRect(this.length / 2 - 4, this.width / 2 - 8, 4, 6);

        ctx.restore();
    }
}
