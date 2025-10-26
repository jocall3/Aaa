/**
 * @file redis.adapter.ts
 * @description This file contains the Redis adapter for the ICache port.
 * It provides a concrete implementation for interacting with a Redis cache,
 * fulfilling the "Establish a Multi-Layer Caching Strategy" architectural directive.
 *
 * @see /docs/adr/ADR-012-caching-strategy.md
 * @module caching-client/RedisCacheAdapter
 */

import { Redis } from 'ioredis';
import { ICache, Cacheable } from '../ports/icache.port';

/**
 * @interface RedisCacheAdapterOptions
 * @description Configuration options for the RedisCacheAdapter.
 * Allows for dependency injection of an existing ioredis client.
 * @property {Redis} client - An instance of an ioredis client.
 */
export interface RedisCacheAdapterOptions {
  client: Redis;
}

/**
 * @class RedisCacheAdapter
 * @implements {ICache}
 * @description An adapter that implements the `ICache` port using Redis as the underlying
 * caching mechanism. This class handles serialization/deserialization of objects
 * and manages time-to-live (TTL) for cache entries.
 *
 * It is a core component of the shared `caching-client` library, designed to be
 * used by BFFs and microservices for distributed caching.
 *
 * @example
 * ```typescript
 * import Redis from 'ioredis';
 * import { RedisCacheAdapter } from './redis.adapter';
 *
 * const redisClient = new Redis({ host: 'localhost', port: 6379 });
 * const cache = new RedisCacheAdapter({ client: redisClient });
 *
 * async function exampleUsage() {
 *   const user = { id: '123', name: 'John Doe' };
 *   await cache.set('user:123', user, 3600); // Cache for 1 hour
 *   const cachedUser = await cache.get<{ id: string; name: string }>('user:123');
 *   console.log(cachedUser);
 *   await cache.delete('user:123');
 * }
 * ```
 */
export class RedisCacheAdapter implements ICache {
  /**
   * @private
   * @readonly
   * @property {Redis} redisClient - The underlying ioredis client instance.
   */
  private readonly redisClient: Redis;

  /**
   * @constructor
   * @param {RedisCacheAdapterOptions} options - The configuration options for the adapter.
   * @throws {Error} If a Redis client instance is not provided.
   */
  constructor(options: RedisCacheAdapterOptions) {
    if (!options.client) {
      throw new Error('RedisCacheAdapter requires an ioredis client instance.');
    }
    this.redisClient = options.client;
  }

  /**
   * Retrieves an item from the cache by its key.
   *
   * @public
   * @async
   * @template T The expected type of the cached item. Must be a JSON-serializable object.
   * @param {string} key - The unique identifier for the cache entry.
   * @returns {Promise<T | null>} A promise that resolves to the deserialized cached item,
   * or `null` if the item is not found or an error occurs during parsing.
   * @throws {Error} Rethrows errors from the Redis client, except for parsing errors which are logged.
   *
   * @example
   * ```typescript
   * const user = await cache.get<UserDto>('user:profile:123');
   * if (user) {
   *   // Use the cached user data
   * }
   * ```
   */
  public async get<T extends Cacheable>(key: string): Promise<T | null> {
    const value = await this.redisClient.get(key);

    if (value === null || value === undefined) {
      return null;
    }

    try {
      // Assuming all cached objects are stored as JSON strings.
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`[RedisCacheAdapter] Failed to parse cached value for key "${key}". Value: "${value}". Error:`, error);
      // Corrupt data in cache, treat as a cache miss and delete the key.
      await this.delete(key).catch(delError =>
        console.error(`[RedisCacheAdapter] Failed to delete corrupt cache entry for key "${key}". Error:`, delError)
      );
      return null;
    }
  }

  /**
   * Stores an item in the cache with an optional time-to-live (TTL).
   *
   * @public
   * @async
   * @template T The type of the item to be cached. Must be a JSON-serializable object.
   * @param {string} key - The unique identifier for the cache entry.
   * @param {T} value - The item to store in the cache.
   * @param {number} [ttlSeconds] - The time-to-live for the cache entry in seconds. If not provided,
   * the item will be stored without an expiration.
   * @returns {Promise<void>} A promise that resolves when the item has been successfully stored.
   * @throws {Error} Throws an error if the value cannot be serialized or if the Redis client fails.
   *
   * @example
   * ```typescript
   * await cache.set('session:xyz', { userId: '123' }, 3600); // 1 hour TTL
   * ```
   */
  public async set<T extends Cacheable>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serializedValue = JSON.stringify(value);

    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      await this.redisClient.set(key, serializedValue, 'EX', ttlSeconds);
    } else {
      await this.redisClient.set(key, serializedValue);
    }
  }

  /**
   * Deletes an item from the cache by its key.
   *
   * @public
   * @async
   * @param {string} key - The unique identifier for the cache entry to delete.
   * @returns {Promise<void>} A promise that resolves when the item has been deleted.
   * The promise does not reject if the key does not exist.
   * @throws {Error} Rethrows errors from the Redis client.
   *
   * @example
   * ```typescript
   * await cache.delete('user:profile:123');
   * ```
   */
  public async delete(key: string): Promise<void> {
    await this.redisClient.del(key);
  }
}
