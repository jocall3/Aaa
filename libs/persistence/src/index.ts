/**
 * @fileoverview This file is the main entry point for the shared Persistence library.
 * @description In accordance with the "Mandate a Universal Error Handling Framework and Generic Repository Pattern"
 * architectural directive, this library provides a set of universal interfaces and base classes for creating
 * technology-agnostic data persistence layers.
 *
 * It introduces a generic, multi-layered pattern to decouple domain logic from persistence concerns.
 * Key exports include:
 * - `IDomainEvent`: A base interface for domain events.
 * - `Entity`: A base class for domain entities, providing identity and equality comparison.
 * - `AggregateRoot`: A base class for aggregate roots, extending `Entity` with domain event management.
 * - `IGenericDataMapper`: An interface for mapping between domain models and persistence models.
 * - `IGenericRepository`: A generic repository interface defining standard data access methods.
 * - `PaginationOptions` & `PaginatedResult`: Types for handling paginated queries.
 *
 * All exports are fully documented with TSDoc to comply with the 100% docs-as-code policy.
 * @version 1.0.0
 * @author Elite AI Implementation Team
 */

// --- CORE DOMAIN TYPES ---

/**
 * @interface IDomainEvent
 * @description Represents an event that occurred in the domain. Domain events are a core
 * part of a Domain-Driven Design approach with Event Sourcing.
 */
export interface IDomainEvent {
  /**
   * The timestamp when the event occurred.
   * @readonly
   * @type {Date}
   */
  readonly occurredAt: Date;

  /**
   * The unique identifier of the aggregate that this event belongs to.
   * @readonly
   * @type {string}
   */
  readonly aggregateId: string;
}

/**
 * @abstract
 * @class Entity
 * @description Base class for all domain entities. An entity is an object that is not defined by its
 * attributes, but rather by a thread of continuity and its identity.
 * @template T - The type of the entity's properties.
 *
 * @example
 * ```ts
 * interface UserProps {
 *   email: string;
 *   name: string;
 * }
 * class User extends Entity<UserProps> {
 *   // ... implementation
 * }
 * ```
 */
export abstract class Entity<T> {
  /**
   * The unique identifier for the entity. A real implementation would use a UUID library.
   * @protected
   * @readonly
   */
  protected readonly _id: string;

  /**
   * The properties of the entity.
   * @public
   * @readonly
   */
  public readonly props: T;

  /**
   * Creates an instance of an entity.
   * @param {T} props - The properties of the entity.
   * @param {string} [id] - The unique identifier. If not provided, a new one will be generated.
   */
  protected constructor(props: T, id?: string) {
    // In a real implementation, a robust UUID library like `uuid` would be used.
    // This is a placeholder to avoid a direct dependency in this base library.
    this._id = id ?? `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.props = props;
  }

  /**
   * Gets the entity's unique identifier.
   * @returns {string} The ID of the entity.
   */
  get id(): string {
    return this._id;
  }

  /**
   * Checks if two entities are the same by comparing their IDs.
   * @param {Entity<T>} [object] - The entity to compare against.
   * @returns {boolean} `true` if the entities are the same, otherwise `false`.
   */
  public equals(object?: Entity<T>): boolean {
    if (object == null || object == undefined) {
      return false;
    }

    if (this === object) {
      return true;
    }

    if (!(object instanceof Entity)) {
      return false;
    }

    return this._id === object._id;
  }
}

/**
 * @abstract
 * @class AggregateRoot
 * @extends Entity
 * @description An aggregate root is a special kind of entity that ensures the consistency
 * of changes within the aggregate by acting as the single entry point for modifications.
 * It manages a list of domain events that represent state changes.
 * @template T - The type of the aggregate's properties.
 */
export abstract class AggregateRoot<T> extends Entity<T> {
  private readonly _domainEvents: IDomainEvent[] = [];

  /**
   * Gets the list of uncommitted domain events.
   * @returns {IDomainEvent[]} An array of domain events.
   */
  get domainEvents(): IDomainEvent[] {
    return this._domainEvents;
  }

  /**
   * Adds a domain event to the aggregate's list of uncommitted events.
   * @param {IDomainEvent} domainEvent - The domain event to add.
   * @protected
   */
  protected addDomainEvent(domainEvent: IDomainEvent): void {
    this._domainEvents.push(domainEvent);
    // In a real system, you might also log the event for tracing/debugging.
  }

  /**
   * Clears all uncommitted domain events from the aggregate.
   * This should be called by the repository after the events have been successfully persisted and published.
   * @public
   */
  public clearEvents(): void {
    this._domainEvents.length = 0;
  }
}

// --- PERSISTENCE INTERFACES ---

/**
 * @interface IGenericDataMapper
 * @description Defines the contract for mapping data between a domain model and a persistence model.
 * This is a crucial component of the multi-layered persistence pattern, ensuring the domain
 * layer remains independent of the database schema.
 * @template DomainEntity - The domain entity or aggregate root.
 * @template PersistenceModel - The data structure used for persistence (e.g., a database row, a document).
 *
 * @example
 * ```ts
 * class UserMapper implements IGenericDataMapper<User, UserPersistenceModel> {
 *   toDomain(persistence: UserPersistenceModel): User {
 *     // ... mapping logic ...
 *   }
 *   toPersistence(domain: User): UserPersistenceModel {
 *     // ... mapping logic ...
 *   }
 * }
 * ```
 */
export interface IGenericDataMapper<DomainEntity, PersistenceModel> {
  /**
   * Maps a persistence model to a domain entity.
   * @param {PersistenceModel} persistence - The persistence model object.
   * @returns {DomainEntity} The corresponding domain entity.
   * @throws {Error} If mapping fails due to invalid data.
   */
  toDomain(persistence: PersistenceModel): DomainEntity;

  /**
   * Maps a domain entity to a persistence model.
   * @param {DomainEntity} domain - The domain entity.
   * @returns {PersistenceModel} The corresponding persistence model object.
   */
  toPersistence(domain: DomainEntity): PersistenceModel;
}

/**
 * @type PaginationOptions
 * @description Defines standard options for paginating query results.
 */
export type PaginationOptions = {
  /**
   * The number of items to return per page. Must be a positive integer.
   * @type {number}
   */
  limit: number;

  /**
   * The number of items to skip. Must be a non-negative integer.
   * @type {number}
   */
  offset: number;
};

/**
 * @type PaginatedResult
 * @description Represents a paginated list of results.
 * @template T - The type of the items in the result set.
 */
export type PaginatedResult<T> = {
  /**
   * An array of items for the current page.
   * @type {T[]}
   */
  items: T[];

  /**
   * The total number of items across all pages.
   * @type {number}
   */
  total: number;

  /**
   * The limit used for this page.
   * @type {number}
   */
  limit: number;

  /**
   * The offset used for this page.
   * @type {number}
   */
  offset: number;
};

/**
 * @interface IGenericRepository
 * @description Defines a generic, technology-agnostic contract for data access operations
 * on an aggregate root. This interface serves as a port in the Hexagonal Architecture,
 * abstracting the core application from the details of the persistence layer.
 * @template T - The type of the aggregate root this repository manages. Must extend AggregateRoot.
 */
export interface IGenericRepository<T extends AggregateRoot<any>> {
  /**
   * Checks if an aggregate with the given ID exists.
   * @param {string} id - The unique identifier of the aggregate.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the aggregate exists, otherwise `false`.
   * @throws {TransientInfrastructureError} If there is a temporary issue with the data store.
   */
  exists(id: string): Promise<boolean>;

  /**
   * Finds an aggregate by its unique identifier.
   * @param {string} id - The unique identifier of the aggregate.
   * @returns {Promise<T | null>} A promise that resolves to the aggregate instance or null if not found.
   * @throws {TransientInfrastructureError} If there is a temporary issue with the data store.
   */
  findById(id: string): Promise<T | null>;

  /**
   * Retrieves all aggregates, with optional pagination.
   * @param {PaginationOptions} [pagination] - Optional pagination parameters.
   * @returns {Promise<PaginatedResult<T>>} A promise that resolves to a paginated result of aggregates.
   * @throws {TransientInfrastructureError} If there is a temporary issue with the data store.
   */
  findAll(pagination?: PaginationOptions): Promise<PaginatedResult<T>>;

  /**
   * Persists an aggregate to the data store. Implementations should handle
   * both creation of new aggregates and updates to existing ones (i.e., an upsert operation).
   * @param {T} aggregate - The aggregate instance to save.
   * @returns {Promise<void>} A promise that resolves when the operation is complete.
   * @throws {DomainError} If a business rule is violated during persistence (e.g., unique constraint).
   * @throws {TransientInfrastructureError} If there is a temporary issue with the data store.
   */
  save(aggregate: T): Promise<void>;

  /**
   * Deletes an aggregate from the data store.
   * @param {string} id - The unique identifier of the aggregate to delete.
   * @returns {Promise<void>} A promise that resolves when the operation is complete.
   * @throws {NotFoundError} If the aggregate to delete is not found.
   * @throws {TransientInfrastructureError} If there is a temporary issue with the data store.
   */
  delete(id: string): Promise<void>;
}
