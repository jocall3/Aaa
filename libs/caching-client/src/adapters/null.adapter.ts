/**
 * @file null.adapter.ts
 * @description This file contains the NullCacheAdapter, which is a no-op implementation
 * of the ICache port. It is used to disable caching in environments where it is not needed,
 * such as in testing or certain development scenarios, without changing the application logic.
 *
 * @author Elite AI Implementation Team
 * @version 1.0.0
 */

import { ICache } from '../ports/cache.port';

/**
 * @class NullCacheAdapter
 * @implements {ICache}
 * @description A cache adapter that performs no caching operations.
 * All methods are implemented as no-ops, effectively creating a cache-less
 * path for data retrieval. This follows the Null Object pattern and is useful
 * for disabling caching without conditional logic in the application code.
 *
 * @example
 * ```typescript
 * // In a test environment setup
 * const cacheClient = new NullCacheAdapter();
 * const myService = new MyService(cacheClient); // MyService depends on ICache
 *
 * // All cache calls within MyService will now do nothing.
 * ```
 */
export class NullCacheAdapter implements ICache {
  /**
   * @method get
   * @description Simulates a cache miss by always returning null.
   * @template T The expected type of the item, though it will never be returned.
   * @param {string} key The key of the item to retrieve (ignored).
   * @returns {Promise<T | null>} A promise that always resolves to `null`.
   * @example
   * const value = await nullCache.get('some-key');
   * // value is always null
   */
  public async get<T>(key: string): Promise<T | null> {
    // In a null cache, every get is a cache miss.
    return Promise.resolve(null);
  }

  /**
   * @method set
   * @description A no-op method that simulates storing an item but does nothing.
   * @template T The type of the item.
   * @param {string} key The key of the item to set (ignored).
   * @param {T} value The value to store (ignored).
   * @param {number} [ttl] The time-to-live (ignored).
   * @returns {Promise<void>} A promise that resolves immediately.
   */
  public async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // Do nothing. This is the core of the Null Object pattern for the cache.
    return Promise.resolve();
  }

  /**
   * @method del
   * @description A no-op method that simulates deleting an item but does nothing.
   * @param {string} key The key of the item to delete (ignored).
   * @returns {Promise<void>} A promise that resolves immediately.
   */
  public async del(key: string): Promise<void> {
    // Do nothing.
    return Promise.resolve();
  }

  /**
   * @method wrap
   * @description A no-op wrapper that does not cache. It always executes the
   * supplied function to fetch the data directly, bypassing any caching logic.
   * @template T The expected type of the item.
   * @param {string} key The cache key (ignored).
   * @param {() => Promise<T>} fn The function to execute to get the fresh data.
   * @param {number} [ttl] The time-to-live (ignored).
   * @returns {Promise<T>} The result of executing the function `fn`.
   */
  public async wrap<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
    // Always execute the function, never cache.
    return fn();
  }

  /**
   * @method connect
   * @description A no-op method to satisfy the ICache interface.
   * @returns {Promise<void>} A promise that resolves immediately.
   */
  public async connect(): Promise<void> {
    // No connection is needed for a null cache.
    return Promise.resolve();
  }

  /**
   * @method disconnect
   * @description A no-op method to satisfy the ICache interface.
   * @returns {Promise<void>} A promise that resolves immediately.
   */
  public async disconnect(): Promise<void> {
    // No disconnection is needed for a null cache.
    return Promise.resolve();
  }
}
