/** Lightweight pub/sub so swap tab can nudge ecosystem to reload trade-book state. */
const listeners = new Set<() => void>();

export function subscribeEcosystemRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyEcosystemRefresh(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}
