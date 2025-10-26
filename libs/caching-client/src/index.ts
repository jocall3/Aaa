/**
 * @fileoverview This file is the main entry point for the Caching Client library.
 * @description In accordance with the "Establish a Multi-Layer Caching Strategy" architectural directive,
 * this library provides a universal, abstracted interface for interacting with various caching backends.
 * It defines a generic `ICache` port and exports concrete adapters for Redis, in-memory, and null
 * caching, allowing services to decouple their caching logic from the underlying implementation.
 *
 * Every exported member is fully documented with TSDoc to comply with the 100% docs-as-code mandate.
 *
 * @see /docs/adr/ADR-012-multi-layer-caching-strategy.md
 * @version 1.0.0
 * @module caching-client
 */

// --- Cache Port (Interface) ---

/**
 * @interface ICache
 * @description Defines the abstract port for a generic key-value cache.
 * This interface is the core of the caching abstraction library, providing a uniform contract
 * that all cache adapters must implement. It supports generic types for keys and values,
 * basic CRUD operations, and time-to-live (TTL) settings.
 *
 * @template K - The type of the cache key (defaults to string).
 * @template V - The type of the cache value (defaults to unknown).
 */
export interface ICache<K = string, V = unknown> {
  /**
   * Retrieves a value from the cache by its key.
   *
   * @public
   * @async
   * @param {K} key - The key of the item to retrieve.
   * @returns {Promise<V | null>} A promise that resolves to the cached value if found, otherwise null.
   * @throws {Error} May throw an error if the underlying cache store fails.
   *
   * @example
   * ```typescript
   * const user = await cache.get('user:123');
   * if (user) {
   *   console.log('Cache hit:', user);
   * } else {
   *   console.log('Cache miss.');
   * }
   * ```
   */
  get(key: K): Promise<V | null>;

  /**
   * Stores a value in the cache with a specified key and an optional Time-To-Live (TTL).
   *
   * @public
   * @async
   * @param {K} key - The key under which to store the value.
   * @param {V} value - The value to store.
   * @param {number} [ttlSeconds] - Optional. The time-to-live for the cached item in seconds.
   * If not provided, the cache's default TTL may be used, or the item may persist indefinitely.
   * @returns {Promise<void>} A promise that resolves when the value has been successfully stored.
   * @throws {Error} May throw an error if the underlying cache store fails.
   *
   * @example
   * ```typescript
   * await cache.set('user:123', { id: '123', name: 'Jane Doe' }, 3600); // Cache for 1 hour
   * ```
   */
  set(key: K, value: V, ttlSeconds?: number): Promise<void>;

  /**
   * Deletes a value from the cache by its key.
   *
   * @public
   * @async
   * @param {K} key - The key of the item to delete.
   * @returns {Promise<void>} A promise that resolves when the item has been successfully deleted.
   * @throws {Error} May throw an error if the underlying cache store fails.
   *
   * @example
   * ```typescript
   * await cache.delete('user:123');
   * ```
   */
  delete(key: K): Promise<void>;

  /**
   * Checks if a key exists in the cache.
   *
   * @public
   * @async
   * @param {K} key - The key to check for existence.
   * @returns {Promise<boolean>} A promise that resolves to true if the key exists, otherwise false.
   * @throws {Error} May throw an error if the underlying cache store fails.
   *
   * @example
   * ```typescript
   * const exists = await cache.has('user:123');
   * ```
   */
  has(key: K): Promise<boolean>;

  /**
   * Clears the entire cache, removing all entries.
   * Note: This can be a destructive operation and should be used with caution,
   * especially in a distributed environment.
   *
   * @public
   * @async
   * @returns {Promise<void>} A promise that resolves when the cache has been cleared.
   * @throws {Error} May throw an error if the underlying cache store fails.
   *
   * @example
   * ```typescript
   * await cache.clear();
   * ```
   */
  clear(): Promise<void>;
}

// --- Cache Adapters (Implementations) ---

/**
 * @class NullCacheAdapter
 * @implements {ICache}
 * @description A no-operation cache adapter. All methods are implemented as empty,
 * immediately resolving promises. This adapter is useful for disabling caching in
 * testing environments or for development scenarios where caching is not desired,
 * without needing to add conditional logic throughout the application.
 *
 * @template K - The type of the cache key.
 * @template V - The type of the cache value.
 */
export class NullCacheAdapter<K = string, V = unknown> implements ICache<K, V> {
  /** @inheritdoc */
  public async get(_key: K): Promise<V | null> {
    return null;
  }

  /** @inheritdoc */
  public async set(_key: K, _value: V, _ttlSeconds?: number): Promise<void> {
    return;
  }

  /** @inheritdoc */
  public async delete(_key: K): Promise<void> {
    return;
  }

  /** @inheritdoc */
  public async has(_key: K): Promise<boolean> {
    return false;
  }

  /** @inheritdoc */
  public async clear(): Promise<void> {
    return;
  }
}

/**
 * @class InMemoryCacheAdapter
 * @implements {ICache}
 * @description A simple, in-memory cache implementation using a Map.
 * This adapter is suitable for local development, unit testing, or scenarios
 * where a lightweight, non-persistent cache is sufficient. It supports TTL
 * by storing expiration timestamps alongside the values.
 *
 * @template K - The type of the cache key.
 * @template V - The type of the cache value.
 */
export class InMemoryCacheAdapter<K = string, V = unknown> implements ICache<K, V> {
  private readonly cache = new Map<K, { value: V; expiresAt: number | null }>();

  /**
   * @private
   * @method isExpired
   * @description Checks if a cached item has expired.
   * @param {object} item - The cache item object containing value and expiresAt.
   * @returns {boolean} True if the item has expired, otherwise false.
   */
  private isExpired(item: { expiresAt: number | null }): boolean {
    return item.expiresAt !== null && item.expiresAt < Date.now();
  }

  /** @inheritdoc */
  public async get(key: K): Promise<V | null> {
    const item = this.cache.get(key);
    if (!item) {
      return null;
    }

    if (this.isExpired(item)) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  /** @inheritdoc */
  public async set(key: K, value: V, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.cache.set(key, { value, expiresAt });
  }

  /** @inheritdoc */
  public async delete(key: K): Promise<void> {
    this.cache.delete(key);
  }

  /** @inheritdoc */
  public async has(key: K): Promise<boolean> {
    const item = this.cache.get(key);
    if (!item) {
      return false;
    }

    if (this.isExpired(item)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /** @inheritdoc */
  public async clear(): Promise<void> {
    this.cache.clear();
  }
}

/**
 * @interface RedisClient
 * @description Defines the minimal interface for a Redis client that the RedisCacheAdapter expects.
 * This allows for dependency inversion, making the adapter compatible with different Redis
 * client libraries (e.g., `ioredis`, `node-redis`) as long as they conform to this contract.
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<unknown>;
  del(key: string): Promise<unknown>;
  exists(key: string): Promise<number>;
  flushall(): Promise<unknown>;
}

/**
 * @class RedisCacheAdapter
 * @implements {ICache}
 * @description A cache adapter that uses a Redis client for distributed caching.
 * It serializes values to JSON strings before storing them and deserializes them upon retrieval.
 * This adapter is intended for production environments where a shared, persistent, and scalable
 * cache is required.
 *
 * @template K - The type of the cache key (must be serializable to a string).
 * @template V - The type of the cache value (must be JSON-serializable).
 */
export class RedisCacheAdapter<K extends string = string, V = unknown> implements ICache<K, V> {
  /**
   * @constructor
   * @param {RedisClient} redisClient - An instance of a Redis client that conforms to the `RedisClient` interface.
   */
  constructor(private readonly redisClient: RedisClient) {}

  /** @inheritdoc */
  public async get(key: K): Promise<V | null> {
    const value = await this.redisClient.get(key);
    if (value === null) {
      return null;
    }
    try {
      return JSON.parse(value) as V;
    } catch (error) {
      console.error(`Failed to parse cached value for key "${key}":`, error);
      // In case of parsing error, treat it as a cache miss and potentially delete the corrupt data.
      await this.delete(key);
      return null;
    }
  }

  /** @inheritdoc */
  public async set(key: K, value: V, ttlSeconds?: number): Promise<void> {
    const stringValue = JSON.stringify(value);
    if (ttlSeconds) {
      await this.redisClient.set(key, stringValue, 'EX', ttlSeconds);
    } else {
      await this.redisClient.set(key, stringValue);
    }
  }

  /** @inheritdoc */
  public async delete(key: K): Promise<void> {
    await this.redisClient.del(key);
  }

  /** @inheritdoc */
  public async has(key: K): Promise<boolean> {
    const result = await this.redisClient.exists(key);
    return result === 1;
  }

  /** @inheritdoc */
  public async clear(): Promise<void> {
    await this.redisClient.flushall();
  }
}
