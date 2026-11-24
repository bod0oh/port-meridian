export class InputManager {
    constructor() {
        this.keys = {};
        this.pressed = {};
        this.mouse = { x: 0, y: 0, down: false, worldX: 0, worldY: 0 };

        this._onKeyDown = (e) => {
            if (e.repeat) return;
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
                e.preventDefault();
            }
            if (!this.keys[e.code]) {
                this.pressed[e.code] = true;
            }
            this.keys[e.code] = true;
        };

        this._onKeyUp = (e) => {
            this.keys[e.code] = false;
        };

        this._onMouseMove = (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        };

        this._onMouseDown = (e) => {
            if (e.button === 0) {
                this.mouse.down = true;
                this.mouse.x = e.clientX;
                this.mouse.y = e.clientY;
            }
        };

        this._onMouseUp = (e) => {
            if (e.button === 0) {
                this.mouse.down = false;
                this.mouse.x = e.clientX;
                this.mouse.y = e.clientY;
            }
        };

        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('mousemove', this._onMouseMove);
        window.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mouseup', this._onMouseUp);
    }

    isPressed(code) {
        return !!this.pressed[code];
    }

    update(camera) {
        if (camera) {
            this.mouse.worldX = this.mouse.x + camera.x;
            this.mouse.worldY = this.mouse.y + camera.y;
        }
    }

    endFrame() {
        for (const code in this.pressed) {
            this.pressed[code] = false;
        }
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('mousedown', this._onMouseDown);
        window.removeEventListener('mouseup', this._onMouseUp);
    }
}
