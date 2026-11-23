// Save / load for PORT MERIDIAN, via localStorage.
// Standalone: touches no game state beyond the plain data it is given.
// SAVE_KEY lives in config.js so save and game code can never drift apart.
import { SAVE_KEY } from './config.js';

export { SAVE_KEY };

function storage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    return null;
  }
  return null;
}

/**
 * Serialize the durable parts of G. Returns true when the save landed.
 * Shape: { money, health, armor, missionIndex, player:{x,y}, owned, ammo,
 *           packagesTaken:[indices], stats, clock, day, savedAt }
 */
export function saveGame(G) {
  const store = storage();
  if (!store) return false;
  const city = G.city || {};
  const packagesTaken = [];
  if (Array.isArray(city.packages)) {
    for (let i = 0; i < city.packages.length; i += 1) {
      if (city.packages[i].taken) packagesTaken.push(i);
    }
  }
  const data = {
    money: G.player.money,
    health: G.player.health,
    armor: G.player.armor,
    missionIndex: G.mission ? G.mission.index : 0,
    player: { x: G.player.x, y: G.player.y },
    owned: { ...(G.player.owned || {}) },
    ammo: { ...(G.player.ammo || {}) },
    packagesTaken,
    stats: { ...(G.stats || {}) },
    clock: G.clock,
    day: G.day,
    savedAt: Date.now(),
  };
  try {
    store.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    // Storage full or disabled (private windows): the game keeps running unsaved.
    return false;
  }
}

/** Read the save back, or null when there is none / it is unreadable. Never throws. */
export function loadGame() {
  const store = storage();
  if (!store) return null;
  let raw = null;
  try {
    raw = store.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

/** True when a readable save exists. */
export function hasSave() {
  return loadGame() !== null;
}

/** Delete the save (New Game after finishing, or a manual reset). */
export function clearSave() {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do — the key is already gone or storage is off.
  }
}
