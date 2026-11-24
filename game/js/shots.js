import { Vehicle } from './vehicles.js';
import { Police } from './entities.js';
import { SeededRandom } from './random.js';

function roadPointInZone(game, zoneName, rng) {
  const grid = game.city.grid;
  const roadTiles = [];
  if (grid && grid.length) {
    for (let ty = 0; ty < grid.length; ty++) {
      for (let tx = 0; tx < grid[ty].length; tx++) {
        if (grid[ty][tx] === 0) {
          if (game.city.getZoneName(tx, ty) === zoneName) {
            roadTiles.push({ tx, ty });
          }
        }
      }
    }
  }
  if (roadTiles.length > 0) {
    const t = rng.choice(roadTiles);
    return { x: (t.tx + 0.5) * 32, y: (t.ty + 0.5) * 32 };
  }
  return { x: game.city.spawnPoints.player.x, y: game.city.spawnPoints.player.y };
}

export function setupShot(game, shotName, seed) {
  const rng = new SeededRandom(seed);

  if (shotName === 'downtown-drive') {
    game.elapsed = 300;
    game.rain = false;
    const pt = roadPointInZone(game, 'Downtown', rng);
    const car = new Vehicle(pt.x, pt.y, 'SEDAN');
    game.vehicles.push(car);
    game.player.x = pt.x;
    game.player.y = pt.y;
    game.player.currentVehicle = car;
    car.isPlayerInside = true;
    car.driver = game.player;
    car.angle = 0;
    car.speed = 3;
    if (game.wanted && typeof game.wanted.clearWanted === 'function') {
      game.wanted.clearWanted();
    }
  } else if (shotName === 'police-chase') {
    game.elapsed = 210;
    game.rain = false;
    const pt = roadPointInZone(game, 'Downtown', rng);
    const car = new Vehicle(pt.x, pt.y, 'SPORT');
    game.vehicles.push(car);
    game.player.x = pt.x;
    game.player.y = pt.y;
    game.player.currentVehicle = car;
    car.isPlayerInside = true;
    car.driver = game.player;
    car.angle = 0;
    car.speed = 5;
    if (game.wanted) {
      game.wanted.addHeat(55);
      for (let i = 0; i < 3; i++) {
        const dist = rng.range(150, 300);
        const angle = rng.range(0, Math.PI * 2);
        const cx = pt.x + Math.cos(angle) * dist;
        const cy = pt.y + Math.sin(angle) * dist;
        const cruiser = new Vehicle(cx, cy, 'POLICE');
        game.vehicles.push(cruiser);
        if (game.wanted.cruisers) {
          game.wanted.cruisers.push(cruiser);
        }
      }
      for (let i = 0; i < 2; i++) {
        const dist = rng.range(100, 200);
        const angle = rng.range(0, Math.PI * 2);
        const px2 = pt.x + Math.cos(angle) * dist;
        const py2 = pt.y + Math.sin(angle) * dist;
        const cop = new Police(px2, py2);
        if (game.wanted.police) {
          game.wanted.police.push(cop);
        }
      }
    }
  } else if (shotName === 'mission') {
    game.elapsed = 300;
    game.rain = false;
    if (game.missions) {
      game.missions.currentIndex = 1;
      game.missions.startMission();
      if (game.missions.targetPos) {
        game.player.x = game.missions.targetPos.x + 80;
        game.player.y = game.missions.targetPos.y + 40;
      }
    }
    game.player.currentVehicle = null;
    if (game.wanted && typeof game.wanted.clearWanted === 'function') {
      game.wanted.clearWanted();
    }
  } else if (shotName === 'night-city') {
    game.elapsed = 570;
    game.rain = true;
    const pt = roadPointInZone(game, 'Neon Row', rng);
    const car = new Vehicle(pt.x, pt.y, 'SEDAN');
    game.vehicles.push(car);
    game.player.x = pt.x;
    game.player.y = pt.y;
    game.player.currentVehicle = car;
    car.isPlayerInside = true;
    car.driver = game.player;
    car.angle = 0;
    car.speed = 2.5;
    if (game.wanted && typeof game.wanted.clearWanted === 'function') {
      game.wanted.clearWanted();
    }
  }

  game.gameState = 'playing';
}
