// Input: keyboard + mouse. One-shot actions are consumed by takeActions().
export const ACTION_INTERACT = 1;
export const ACTION_RELOAD = 2;
export const ACTION_PAUSE = 4;
export const ACTION_CONFIRM = 8;
export const ACTION_HORN = 16;
export const ACTION_MAP = 32;
export const ACTION_W1 = 64;
export const ACTION_W2 = 128;
export const ACTION_W3 = 256;

const ONE_SHOT = {
  KeyE: ACTION_INTERACT, KeyR: ACTION_RELOAD, Escape: ACTION_PAUSE,
  KeyP: ACTION_PAUSE, Enter: ACTION_CONFIRM, KeyH: ACTION_HORN,
  KeyM: ACTION_MAP, Digit1: ACTION_W1, Digit2: ACTION_W2, Digit3: ACTION_W3,
};

export function createInput(canvas) {
  const keys = new Set();
  const justPressed = new Set();
  const mouse = { x: 0, y: 0, wx: 0, wy: 0, down: false };

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    justPressed.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function reset() { keys.clear(); justPressed.clear(); mouse.down = false; }
  function onMouseMove(e) {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  }
  function onMouseDown(e) { if (e.button === 0) { mouse.down = true; onMouseMove(e); } }
  function onMouseUp() { mouse.down = false; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', reset);
  if (canvas) {
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function axis() {
    let x = 0; let y = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y };
  }

  function takeActions() {
    let flags = 0;
    for (const code of justPressed) flags |= ONE_SHOT[code] || 0;
    justPressed.clear();
    return flags;
  }

  return {
    keys, justPressed, mouse, axis, takeActions,
    setWorld(x, y) { mouse.wx = x; mouse.wy = y; },
    reset,
  };
}
