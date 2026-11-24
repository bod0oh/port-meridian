import { CONFIG, WEAPONS } from './config.js';

export class HUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  draw(state) {
    const {
      gameState = 'playing',
      frame = 0
    } = state;

    this.ctx.save();

    if (gameState === 'menu') {
      this.drawMenu(frame);
    } else if (gameState === 'paused') {
      this.drawPaused();
    } else if (gameState === 'gameover') {
      this.drawGameOver(state);
    } else if (gameState === 'complete') {
      this.drawComplete(state);
    } else {
      this.drawInGame(state);
    }

    this.ctx.restore();
  }

  drawInGame(state) {
    const {
      player,
      city,
      vehicles = [],
      police = [],
      missionManager,
      economy,
      wantedLevel = 0,
      notification = '',
      frame = 0,
      timeOfDay = 0.5
    } = state;

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // --- TOP-LEFT: Health & Armor Bars ---
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';

    // HP Bar
    ctx.fillStyle = '#ffffff';
    ctx.fillText('HP', 20, 25);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(60, 12, 200, 18);
    const hpRatio = player ? Math.max(0, Math.min(1, player.health / (player.maxHealth || 100))) : 0;
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(60, 12, 200 * hpRatio, 18);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(60, 12, 200, 18);

    // Armor Bar
    ctx.fillStyle = '#ffffff';
    ctx.fillText('ARMOR', 15, 53);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(60, 38, 200, 18);
    const maxArmor = player && player.maxArmor ? player.maxArmor : 100;
    const armorRatio = player ? Math.max(0, Math.min(1, (player.armor || 0) / maxArmor)) : 0;
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(60, 38, 200 * armorRatio, 18);
    ctx.strokeRect(60, 38, 200, 18);


    // --- TOP-RIGHT: Money & Wanted Level ---
    ctx.textAlign = 'right';
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#22c55e';
    ctx.fillText('$' + (player ? (player.money || 0) : 0), width - 20, 30);

    // Wanted Stars
    const maxWanted = CONFIG.MAX_WANTED_LEVEL || 5;
    let starX = width - 20;
    const starY = 55;
    ctx.font = '18px monospace';
    for (let i = maxWanted - 1; i >= 0; i--) {
      ctx.fillStyle = (i < wantedLevel) ? '#facc15' : '#475569';
      ctx.fillText('★', starX, starY);
      starX -= 22;
    }


    // --- TOP-CENTER: Mission & Time / Packages ---
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#ffffff';

    if (missionManager) {
      if (missionManager.allComplete) {
        ctx.fillText('All missions complete!', width / 2, 25);
      } else {
        const currentMission = typeof missionManager.getCurrentMission === 'function' ? missionManager.getCurrentMission() : null;
        if (currentMission) {
          ctx.fillText(currentMission.title || '', width / 2, 25);
          ctx.font = '14px monospace';
          ctx.fillStyle = '#cbd5e1';
          ctx.fillText(typeof missionManager.getObjectiveText === 'function' ? missionManager.getObjectiveText() : '', width / 2, 45);
        }
      }
    }

    // Time of day text
    const isDay = timeOfDay >= 0.25 && timeOfDay <= 0.75;
    ctx.font = '12px monospace';
    ctx.fillStyle = '#fef08a';
    ctx.fillText(isDay ? 'DAY' : 'NIGHT', width / 2, 70);

    // Packages count above minimap
    if (economy && typeof economy.getPackagesRemaining === 'function') {
      const remaining = economy.getPackagesRemaining();
      const collectedCount = 20 - remaining;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`Packages: ${collectedCount}/20`, 20, height - 190);
    }


    // --- BOTTOM-LEFT: Minimap ---
    const mapSize = 170;
    const mapX = 20;
    const mapY = height - mapSize - 20;

    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(mapX, mapY, mapSize, mapSize);

    ctx.beginPath();
    ctx.rect(mapX, mapY, mapSize, mapSize);
    ctx.clip();

    ctx.fillStyle = '#0c4a6e';
    ctx.fillRect(mapX, mapY, mapSize, mapSize);

    if (city && city.grid && Array.isArray(city.grid)) {
      const grid = city.grid;
      const rows = grid.length;
      const cols = grid[0].length;
      const tileW = mapSize / cols;
      const tileH = mapSize / rows;

      const tileColors = {
        0: '#1f2937', // road
        1: '#475569', // sidewalk
        2: '#64748b', // building
        3: '#0c4a6e', // water
        4: '#166534'  // park
      };

      for (let r = 0; r < rows; r++) {
        const row = grid[r];
        if (!row) continue;
        for (let c = 0; c < cols; c++) {
          const tCode = row[c];
          ctx.fillStyle = tileColors[tCode] || '#1f2937';
          ctx.fillRect(mapX + c * tileW, mapY + r * tileH, tileW + 0.5, tileH + 0.5);
        }
      }

      const worldW = cols * (city.tileSize || 32);
      const worldH = rows * (city.tileSize || 32);
      const toMapX = (wx) => mapX + (wx / worldW) * mapSize;
      const toMapY = (wy) => mapY + (wy / worldH) * mapSize;

      // Vehicles (white 2 px dots)
      if (Array.isArray(vehicles)) {
        ctx.fillStyle = '#ffffff';
        for (let v of vehicles) {
          const vx = toMapX(v.x);
          const vy = toMapY(v.y);
          ctx.fillRect(vx - 1, vy - 1, 2, 2);
        }
      }

      // Police (red dots)
      if (Array.isArray(police)) {
        ctx.fillStyle = '#ef4444';
        for (let p of police) {
          const px = toMapX(p.x);
          const py = toMapY(p.y);
          ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
        }
      }

      // Taxi fare target (green dot)
      if (economy && typeof economy.getFareTarget === 'function') {
        const fareTarget = economy.getFareTarget();
        if (fareTarget) {
          ctx.fillStyle = '#22c55e';
          const fx = toMapX(fareTarget.x);
          const fy = toMapY(fareTarget.y);
          ctx.beginPath();
          ctx.arc(fx, fy, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Mission target (yellow, pulsing radius)
      if (missionManager && missionManager.targetPos) {
        const tp = missionManager.targetPos;
        const tx = toMapX(tp.x);
        const ty = toMapY(tp.y);
        const pulseR = 3 + Math.sin(frame * 0.1) * 1.5;
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(tx, ty, pulseR, 0, Math.PI * 2);
        ctx.fill();
      }

      // Player (cyan dot / triangle facing angle)
      if (player) {
        const px = toMapX(player.x);
        const py = toMapY(player.y);
        ctx.fillStyle = '#06b6d4';
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(player.angle || 0);
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(-4, -3);
        ctx.lineTo(-4, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.restore(); // restore minimap clip


    // --- BOTTOM-RIGHT: Weapon Slots ---
    if (player && Array.isArray(player.inventory)) {
      const inv = player.inventory;
      const boxW = 90;
      const boxH = 34;
      const gap = 6;
      let startX = width - (inv.length * (boxW + gap));
      const startY = height - boxH - 20;

      for (let i = 0; i < inv.length; i++) {
        const wId = inv[i];
        const bx = startX + i * (boxW + gap);
        const by = startY;
        const isCurrent = (wId === player.currentWeaponKey);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.fillRect(bx, by, boxW, boxH);

        ctx.strokeStyle = isCurrent ? '#facc15' : '#475569';
        ctx.lineWidth = isCurrent ? 2 : 1;
        ctx.strokeRect(bx, by, boxW, boxH);

        const wDef = WEAPONS[wId.toUpperCase()] || { name: wId };
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = isCurrent ? '#facc15' : '#ffffff';
        ctx.fillText(wDef.name || wId, bx + boxW / 2, by + 13);

        ctx.font = '10px monospace';
        ctx.fillStyle = '#94a3b8';
        const ammoVal = (wId === 'fists') ? '∞' : (player.ammo && player.ammo[wId] !== undefined ? player.ammo[wId] : '0');
        ctx.fillText(`Ammo: ${ammoVal}`, bx + boxW / 2, by + 27);
      }
    }


    // --- CENTER: Notification ---
    if (notification && notification.length > 0) {
      ctx.save();
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(notification, width / 2, height * 0.4);
      ctx.fillText(notification, width / 2, height * 0.4);
      ctx.restore();
    }
  }

  drawMenu(frame) {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.fillStyle = 'rgba(3, 7, 18, 0.92)';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';

    ctx.font = 'bold 64px monospace';
    ctx.fillStyle = '#06b6d4';
    ctx.fillText('PORT MERIDIAN', width / 2, height / 2 - 140);

    ctx.font = '24px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Open World Crime', width / 2, height / 2 - 90);

    ctx.font = '16px monospace';
    ctx.fillStyle = '#e2e8f0';
    const controls = [
      'WASD / Arrows — Move & Drive',
      'Shift — Sprint',
      'E — Enter / Exit car',
      'Mouse — Aim, Click — Shoot',
      '1-4 — Weapons',
      'Esc — Pause',
      'M — Mute'
    ];

    let startY = height / 2 - 30;
    for (let c of controls) {
      ctx.fillText(c, width / 2, startY);
      startY += 24;
    }

    if (Math.floor(frame / 30) % 2 === 0) {
      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = '#facc15';
      ctx.fillText('Press ENTER to start', width / 2, height / 2 + 150);
    }
  }

  drawPaused() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.fillStyle = 'rgba(3, 7, 18, 0.85)';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.font = 'bold 48px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('PAUSED', width / 2, height / 2 - 40);

    ctx.font = '18px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('Esc — Resume', width / 2, height / 2 + 10);
    ctx.fillText('R — Restart', width / 2, height / 2 + 45);
  }

  drawGameOver(state) {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.fillStyle = 'rgba(69, 10, 10, 0.88)';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.font = 'bold 64px monospace';
    ctx.fillStyle = '#ef4444';
    ctx.fillText('WASTED', width / 2, height / 2 - 80);

    const player = state.player || {};
    const missionManager = state.missionManager;
    const money = player.money || 0;
    const missionsDone = missionManager ? (missionManager.currentIndex || 0) : 0;

    ctx.font = '20px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Money: $${money}`, width / 2, height / 2 - 10);
    ctx.fillText(`Missions completed: ${missionsDone}/6`, width / 2, height / 2 + 25);

    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#facc15';
    ctx.fillText('Press ENTER to restart', width / 2, height / 2 + 90);
  }

  drawComplete(state) {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.fillStyle = 'rgba(3, 7, 18, 0.92)';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.font = 'bold 48px monospace';
    ctx.fillStyle = '#facc15';
    ctx.fillText('STORY COMPLETE', width / 2, height / 2 - 80);

    ctx.font = '20px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('You finished all 6 missions!', width / 2, height / 2 - 25);

    const player = state.player || {};
    const money = player.money || 0;
    ctx.fillText(`Money: $${money}`, width / 2, height / 2 + 15);

    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#22c55e';
    ctx.fillText('Press ENTER to play again', width / 2, height / 2 + 80);
  }
}
