// A small seeded random number generator (mulberry32): the same seed gives the same game,
// which is what makes the city layout and the screenshot scenes repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [a, b). */
export function randRange(rng, a, b) {
  return a + rng() * (b - a);
}

/** An integer in [a, b] (both ends inclusive). */
export function randInt(rng, a, b) {
  return a + Math.floor(rng() * (b - a + 1));
}

/** One element of `arr`, picked uniformly. */
export function randPick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
