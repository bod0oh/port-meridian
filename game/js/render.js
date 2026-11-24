import { CONFIG, ZONES } from './config.js';

function shadeColor(color, percent) {
  if (!color || typeof color !== 'string' || color === '#') return '#64748b';
  const num = parseInt(color.replace('#', ''), 16);
  if (isNaN(num)) return '#64748b';
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function pseudoHash(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    });
  }

  render(state) {
    const { city, player, vehicles = [], pedestrians = [], police = [], projectiles = [], camera = { x: 0, y: 0 }, timeOfDay = 0.5, rain = false, frame = 0, shake = 0 } = state;
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // 1. Clear canvas
    ctx.clearRect(0, 0, width, height);

    ctx.save();

    // 2. Apply shake
    if (shake > 0) {
      const shakeX = Math.sin(frame * 1.7) * shake;
      const shakeY = Math.cos(frame * 2.3) * shake;
      ctx.translate(shakeX, shakeY);
    }

    const tileSize = CONFIG.TILE_SIZE;
    const startTx = Math.max(0, Math.floor(camera.x / tileSize));
    const endTx = Math.min(city.width - 1, Math.ceil((camera.x + width) / tileSize));
    const startTy = Math.max(0, Math.floor(camera.y / tileSize));
    const endTy = Math.min(city.height - 1, Math.ceil((camera.y + height) / tileSize));

    // 3. Draw tiles inside viewport
    for (let ty = startTy; ty <= endTy; ty++) {
      for (let tx = startTx; tx <= endTx; tx++) {
        const code = city.grid && city.grid[ty] && city.grid[ty][tx] !== undefined ? city.grid[ty][tx] : 0;
        const screenX = tx * tileSize - camera.x;
        const screenY = ty * tileSize - camera.y;

        if (code === 0) {
          // Road
          ctx.fillStyle = '#1f2937';
          ctx.fillRect(screenX, screenY, tileSize, tileSize);
          // Centre line on every 4th road tile
          if ((tx + ty) % 4 === 0) {
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(screenX + tileSize / 2 - 2, screenY + tileSize / 4, 4, tileSize / 2);
          }
        } else if (code === 1) {
          // Sidewalk
          ctx.fillStyle = '#475569';
          ctx.fillRect(screenX, screenY, tileSize, tileSize);
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1;
          ctx.strokeRect(screenX + 0.5, screenY + 0.5, tileSize - 1, tileSize - 1);
        } else if (code === 2) {
          // Building tile base
          ctx.fillStyle = '#334155';
          ctx.fillRect(screenX, screenY, tileSize, tileSize);
        } else if (code === 3) {
          // Water
          ctx.fillStyle = '#0c4a6e';
          ctx.fillRect(screenX, screenY, tileSize, tileSize);
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 1;
          ctx.beginPath();
          const waveOffset = Math.sin(frame * 0.05 + tx * 0.5) * 3;
          ctx.moveTo(screenX + 4, screenY + tileSize / 2 + waveOffset);
          ctx.lineTo(screenX + tileSize - 4, screenY + tileSize / 2 + waveOffset);
          ctx.stroke();
        } else if (code === 4) {
          // Park
          ctx.fillStyle = '#166534';
          ctx.fillRect(screenX, screenY, tileSize, tileSize);
          ctx.fillStyle = '#15803d';
          ctx.fillRect(screenX + 8, screenY + 8, 4, 4);
          ctx.fillRect(screenX + 20, screenY + 18, 4, 4);
        }
      }
    }

    // Calculate time of day / darkness alpha
    const distFromNoon = Math.abs(timeOfDay - 0.5);
    const darknessAlpha = Math.min(0.55, distFromNoon * 1.1);
    const isNight = darknessAlpha > 0.25;

    // 4. Draw buildings from city.buildings
    if (city.buildings && Array.isArray(city.buildings)) {
      for (const b of city.buildings) {
        if (b.x + b.w < camera.x || b.x > camera.x + width || b.y + b.h < camera.y || b.y > camera.y + height) {
          continue;
        }

        const sx = b.x - camera.x;
        const sy = b.y - camera.y;

        let zoneColor = '#64748b';
        if (ZONES) {
          for (const key in ZONES) {
            const z = ZONES[key];
            if (z && z.name === b.zone) {
              zoneColor = z.color;
              break;
            }
          }
        }

        const baseColor = shadeColor(zoneColor, -30);
        const roofColor = shadeColor(zoneColor, 15);

        // Building body
        ctx.fillStyle = zoneColor;
        ctx.fillRect(sx, sy, b.w, b.h);

        // Darker at base
        ctx.fillStyle = baseColor;
        ctx.fillRect(sx, sy + b.h - Math.min(10, b.h * 0.3), b.w, Math.min(10, b.h * 0.3));

        // Lighter roof edge
        ctx.strokeStyle = roofColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 1, sy + 1, b.w - 2, b.h - 2);

        // Lit windows at night
        if (isNight) {
          ctx.fillStyle = '#fde047';
          const windowSize = 4;
          const spacingX = 12;
          const spacingY = 12;
          for (let wx = sx + 8; wx < sx + b.w - 6; wx += spacingX) {
            for (let wy = sy + 8; wy < sy + b.h - 12; wy += spacingY) {
              const hash = pseudoHash(wx * 3.14 + wy * 2.71 + b.x);
              if (hash > 0.4) {
                ctx.fillRect(wx, wy, windowSize, windowSize);
              }
            }
          }
        }
      }
    }

    // 5. Draw entities
    if (pedestrians && Array.isArray(pedestrians)) {
      for (const ped of pedestrians) {
        if (typeof ped.draw === 'function') {
          ped.draw(ctx, camera);
        }
      }
    }

    if (vehicles && Array.isArray(vehicles)) {
      for (const veh of vehicles) {
        if (typeof veh.draw === 'function') {
          veh.draw(ctx, camera);
        }
      }
    }

    if (police && Array.isArray(police)) {
      for (const cop of police) {
        if (typeof cop.draw === 'function') {
          cop.draw(ctx, camera);
        }
      }
    }

    if (projectiles && Array.isArray(projectiles)) {
      for (const proj of projectiles) {
        if (typeof proj.draw === 'function') {
          proj.draw(ctx, camera);
        }
      }
    }

    if (player && typeof player.draw === 'function') {
      player.draw(ctx, camera);
    }

    // 6. Day/night overlay
    if (darknessAlpha > 0) {
      ctx.fillStyle = `rgba(2, 6, 23, ${darknessAlpha})`;
      ctx.fillRect(0, 0, width, height);
    }

    // 7. Rain
    if (rain) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 80; i++) {
        const rx = (pseudoHash(i * 13.37 + frame * 0.1) * (width + 200)) - 100;
        const ry = (pseudoHash(i * 7.19 + frame * 0.3) * (height + 200)) - 100;
        const length = 15 + pseudoHash(i * 3.1) * 15;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 5, ry + length);
        ctx.stroke();
      }
    }

    // 8. Neon Row glow
    if (isNight && city.buildings && Array.isArray(city.buildings)) {
      ctx.save();
      ctx.fillStyle = 'rgba(236, 72, 153, 0.3)';
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
      ctx.lineWidth = 2;
      for (const b of city.buildings) {
        if (b.zone === 'Neon Row') {
          if (b.x + b.w < camera.x || b.x > camera.x + width || b.y + b.h < camera.y || b.y > camera.y + height) {
            continue;
          }
          const sx = b.x - camera.x;
          const sy = b.y - camera.y;
          ctx.fillRect(sx + 2, sy + 2, b.w - 4, 6);
          ctx.strokeRect(sx + 2, sy + 2, b.w - 4, 6);
        }
      }
      ctx.restore();
    }

    ctx.restore();
  }
}
