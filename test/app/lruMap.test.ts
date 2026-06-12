import { describe, expect, test } from "bun:test";
import { LruMap } from "@/app/lruMap";

describe("LruMap", () => {
  test("misses return undefined and hits return the stored value", () => {
    const cache = new LruMap<string, number>(2);
    expect(cache.get("a")).toBeUndefined();
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
  });

  test("evicts the least recently used entry beyond capacity", () => {
    const cache = new LruMap<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  test("a get refreshes recency, so the read entry survives the next eviction", () => {
    const cache = new LruMap<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
  });

  test("a set on an existing key updates the value and refreshes recency", () => {
    const cache = new LruMap<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10);
    cache.set("c", 3);
    expect(cache.get("a")).toBe(10);
    expect(cache.get("b")).toBeUndefined();
  });

  test("rejects a non-positive or fractional capacity", () => {
    expect(() => new LruMap<string, number>(0)).toThrow("LruMap");
    expect(() => new LruMap<string, number>(1.5)).toThrow("LruMap");
  });
});
