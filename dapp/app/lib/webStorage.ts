export async function saveJson<T>(key: string, value: T): Promise<void> {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export async function loadJson<T>(key: string, fallback: T): Promise<T> {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function removeItem(key: string): Promise<void> {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
}
