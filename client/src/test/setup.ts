import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Node 26's built-in localStorage global shadows jsdom's and is unusable
// without --localstorage-file, so give tests a plain in-memory Storage.
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}
for (const name of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(window, name, { value: new MemoryStorage(), configurable: true });
  Object.defineProperty(globalThis, name, { value: window[name], configurable: true });
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

// jsdom lacks matchMedia (ThemeContext) and ResizeObserver (Recharts).
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
