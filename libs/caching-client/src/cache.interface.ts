/**
 * @file cache.interface.ts
 * @description Defines the abstract port for all caching implementations within the platform.
 * This interface is a core component of the "Establish a Multi-Layer Caching Strategy" architectural directive,
 * providing a universal contract for interacting with different caching mechanisms
 * like Redis, in-memory caches, or a null cache for testing.
 *
 * @see /docs/adr/ADR-012-multi-layer-caching-strategy.md
 * @module CachingClient/ICache
 */

/**
 * @interface ICache
 * @description Represents the public contract (port) for a generic, key-value cache.
 * All caching adapters (e.g., Redis, In-Memory) must implement this interface,
 * allowing the application's core logic to remain decoupled from the specific
 * caching technology being used.
 */
export interface ICache {
  /**
   * Retrieves a value from the cache by its key.
   *
   * @public
   * @async
   * @template T The expected type of the cached value.
   * @param {string} key - The unique key identifying the item in the cache.
   * @returns {Promise<T | null>} A promise that resolves to the cached value if found and successfully deserialized, or `null` if the key does not exist.
   * @throws {Error} May throw an error if there is an issue connecting to the cache store or during deserialization.
   *
   * @example
   * ```typescript
   * const user = await cache.get<UserDto>('user:123');
   * if (user) {
   *   console.log(user.name);
   * }
   * ```
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Retrieves a value from the cache. If the key does not exist, it executes the
   * provided factory function, stores the result in the cache, and returns it.
   * This helps prevent race conditions and simplifies the cache-aside pattern.
   *
   * @public
   * @async
   * @template T The expected type of the value.
   * @param {string} key - The unique key for the item.
   * @param {() => Promise<T>} factory - An async function that produces the value to be cached if it's not already present.
   * @param {number} [ttl] - Optional. The TTL in seconds to use if the item is newly set in the cache.
   * @returns {Promise<T>} A promise that resolves to the value (either from cache or the factory).
   * @throws {Error} Throws if the factory function throws an error or if there is a cache connection issue.
   *
   * @example
   * ```typescript
   * const user = await cache.getOrSet(
   *   'user:123',
   *   () => fetchUserFromDatabase('123'),
   *   300 // 5 minutes TTL
   * );
   * ```
   */
  getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T>;

  /**
   * Stores a value in the cache under a specific key, with an optional Time-To-Live (TTL).
   *
   * @public
   * @async
   * @template T The type of the value to be cached.
   * @param {string} key - The unique key under which to store the value.
   * @param {T} value - The value to be stored. The value will be serialized before storage.
   * @param {number} [ttl] - Optional. The Time-To-Live for the cache entry in seconds. If not provided, the cache's default TTL may be used.
   * @returns {Promise<void>} A promise that resolves when the value has been successfully stored.
   * @throws {Error} May throw an error if serialization fails or if there is an issue connecting to the cache store.
   *
   * @example
   * ```typescript
   * const userDto = { id: '123', name: 'Jane Doe' };
   * // Store user for 5 minutes (300 seconds)
   * await cache.set('user:123', userDto, 300);
   * ```
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Deletes a value from the cache by its key.
   * This is the primary primitive for cache invalidation.
   *
   * @public
   * @async
   * @param {string} key - The unique key of the item to delete.
   * @returns {Promise<void>} A promise that resolves when the item has been successfully deleted.
   * @throws {Error} May throw an error if there is an issue connecting to the cache store.
   *
   * @example
   * ```typescript
   * // Invalidate user cache on update
   * await cache.delete('user:123');
   * ```
   */
  delete(key: string): Promise<void>;

  /**
   * Checks if a key exists in the cache without retrieving its value.
   *
   * @public
   * @async
   * @param {string} key - The unique key to check for existence.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the key exists, and `false` otherwise.
   * @throws {Error} May throw an error if there is an issue connecting to the cache store.
   *
   * @example
   * ```typescript
   * if (await cache.has('user:123')) {
   *   // Key exists, maybe perform an action without fetching the data
   * }
   * ```
   */
  has(key: string): Promise<boolean>;

  /**
   * Clears all entries from the cache.
   * This is a destructive operation and should be used with caution, primarily in
   * testing or specific reset scenarios.
   *
   * @public
   * @async
   * @returns {Promise<void>} A promise that resolves when the cache has been cleared.
   * @throws {Error} May throw an error if there is an issue connecting to the cache store.
   *
   * @example
   * ```typescript
   * // During test setup or teardown
   * await cache.clear();
   * ```
   */
  clear(): Promise<void>;
}
