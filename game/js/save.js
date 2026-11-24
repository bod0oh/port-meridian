export class SaveManager {
    constructor() {
        this.key = 'port_meridian_save_v1';
    }

    save(data) {
        try {
            localStorage.setItem(this.key, JSON.stringify(data));
            return true;
        } catch (e) {
            return false;
        }
    }

    load() {
        try {
            const raw = localStorage.getItem(this.key);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    clear() {
        try {
            localStorage.removeItem(this.key);
        } catch (e) {}
    }
}

export const saveManager = new SaveManager();
