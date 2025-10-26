/**
 * @file in-memory.adapter.ts
 * @description Implements an in-memory cache adapter, conforming to the ICache port.
 * This adapter is designed for local development and testing environments where a
 * distributed cache like Redis is not available or necessary. It simulates TTL
 * functionality using timestamps.
 * @see {ICache}
 * @author Elite AI Implementation Team
 * @version 1.0.0
 */

import { ICache } from '../ports/cache.port';

/**
 * @interface CacheEntry
 * @description An internal interface to wrap cached values with expiration metadata.
 * @template T The type of the cached data.
 * @internal
 */
interface CacheEntry<T> {
  /**
   * The cached data.
   */
  value: T;
  /**
   * The Unix timestamp (in milliseconds) when the cache entry expires.
   * If null, the entry does not expire.
   */
  expiresAt: number | null;
}

/**
 * @class InMemoryCacheAdapter
 * @implements {ICache}
 * @description
 * A concrete implementation of the `ICache` port that uses a simple in-memory `Map`
 * for storage. It is intended for use in development and automated testing environments
 * to provide a fast, dependency-free caching layer that mimics the behavior of a
 * production cache like Redis, including support for Time-To-Live (TTL).
 *
 * All operations are wrapped in Promises to maintain signature compatibility with
 * network-based cache adapters, even though the underlying operations are synchronous.
 */
export class InMemoryCacheAdapter implements ICache {
  /**
   * The underlying storage for the cache.
   * @private
   * @type {Map<string, CacheEntry<any>>}
   */
  private readonly cache: Map<string, CacheEntry<any>> = new Map();

  /**
   * Checks if a given cache entry has expired.
   * @private
   * @param {CacheEntry<any>} entry - The cache entry to check.
   * @returns {boolean} `true` if the entry has expired, otherwise `false`.
   */
  private isExpired(entry: CacheEntry<any>): boolean {
    return entry.expiresAt !== null && entry.expiresAt <= Date.now();
  }

  /**
   * Retrieves a value from the in-memory cache by its key.
   *
   * @override
   * @template T The expected type of the cached value.
   * @param {string} key The unique key for the cache entry.
   * @returns {Promise<T | null>} A promise that resolves to the cached value if found and not expired, otherwise `null`.
   * @example
   * const user = await inMemoryCache.get<UserDto>('user:profile:123');
   * if (user) {
   *   // Cache hit
   * } else {
   *   // Cache miss
   * }
   */
  public async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      return null; // Cache miss
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key); // Evict expired entry
      return null; // Treat as a cache miss
    }

    return entry.value as T;
  }

  /**
   * Stores a value in the in-memory cache with an optional Time-To-Live (TTL).
   *
   * @override
   * @template T The type of the value being stored.
   * @param {string} key The unique key for the cache entry.
   * @param {T} value The value to store. Must be serializable if used interchangeably with distributed caches.
   * @param {number} [ttl] The Time-To-Live in seconds. If not provided, the entry will not expire.
   * @returns {Promise<void>} A promise that resolves when the value has been set.
   * @example
   * // Store a user object for 1 hour (3600 seconds)
   * await inMemoryCache.set('user:profile:123', userDto, 3600);
   *
   * // Store a value that does not expire
   * await inMemoryCache.set('config:feature-flags', flags);
   */
  public async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const expiresAt = ttl ? Date.now() + ttl * 1000 : null;
    const entry: CacheEntry<T> = { value, expiresAt };
    this.cache.set(key, entry);
  }

  /**
   * Deletes a value from the in-memory cache by its key.
   *
   * @override
   * @param {string} key The unique key of the cache entry to delete.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the entry was found and deleted, otherwise `false`.
   * @example
   * const wasDeleted = await inMemoryCache.delete('user:profile:123');
   * console.log(wasDeleted ? 'User cache cleared.' : 'User cache was not present.');
   */
  public async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  /**
   * Clears all entries from the in-memory cache.
   * This is particularly useful for resetting state between tests.
   *
   * @override
   * @returns {Promise<void>} A promise that resolves when the cache is cleared.
   * @example
   * // In a Jest test teardown
   * afterEach(async () => {
   *   await inMemoryCache.clear();
   * });
   */
  public async clear(): Promise<void> {
    this.cache.clear();
  }
}
