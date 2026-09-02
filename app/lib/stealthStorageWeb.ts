import {
  setStealthStorageBackend,
  type StealthStorageLike,
} from '../../shared/mobile-stealth-v1/stealthStorage';

const localStorageBackend: StealthStorageLike = {
  async getItem(key) {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  },
  async removeItem(key) {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  },
};

let installed = false;

/** Install once on client before any stealth storage / Safe Send action. */
export function ensureStealthWebStorage(): void {
  if (installed || typeof window === 'undefined') return;
  setStealthStorageBackend(localStorageBackend);
  installed = true;
}
