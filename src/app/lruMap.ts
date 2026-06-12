// A Map bounded to a fixed capacity with least-recently-used eviction. Both
// get and set refresh an entry's recency, so entries the caller keeps touching
// survive while stale ones fall off. Backs the workbench's expensive-build
// caches (assembled preview kits, generated sheet plans).

// V excludes null and undefined: get uses undefined as its miss sentinel, so a
// stored undefined would be invisible to the recency refresh.
export class LruMap<K, V extends NonNullable<unknown>> {
  private readonly entries = new Map<K, V>();

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(`LruMap: capacity must be a positive integer, got ${capacity}`);
    }
  }

  get(key: K): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) {
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    for (const oldestKey of this.entries.keys()) {
      if (this.entries.size <= this.capacity) {
        break;
      }
      this.entries.delete(oldestKey);
    }
  }
}
