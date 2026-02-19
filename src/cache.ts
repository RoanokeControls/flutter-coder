// Simple in-memory TTL cache for API responses

interface CacheEntry<T> {
  readonly data: T;
  readonly expiresAt: number;
}

export class TTLCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  makeKey(tool: string, params: Record<string, unknown>): string {
    const sorted = Object.keys(params)
      .sort()
      .map((k) => `${k}=${String(params[k])}`)
      .join("&");
    return `${tool}:${sorted}`;
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

// Shared cache instance
export const cache = new TTLCache();

// TTL constants
export const TTL_API = 5 * 60 * 1000;      // 5 minutes for live API data
export const TTL_DOCS = 60 * 60 * 1000;     // 1 hour for documentation pages
