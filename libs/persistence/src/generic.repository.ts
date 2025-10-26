/**
 * @file generic.repository.ts
 * @description Defines generic interfaces for the persistence layer, including
 * a generic repository and a generic data mapper. This aligns with the
 * "Mandate a Universal Error Handling Framework and Generic Repository Pattern"
 * architectural directive.
 *
 * @version 1.0.0
 * @author Elite AI Implementation Team
 * @license MIT
 */

/**
 * Represents the unique identifier for an aggregate root or entity.
 * It can be a string (like a UUID) or a number (like a database sequence).
 *
 * @public
 * @type {TEntityId}
 */
export type TEntityId = string | number;

/**
 * @interface GenericRepository<T, K extends TEntityId>
 * @template T - The type of the domain aggregate or entity that this repository manages.
 * @template K - The type of the entity's unique identifier.
 *
 * @description
 * This interface defines the standard contract for a data persistence repository,
 * serving as a foundational 'Port' in a Hexagonal Architecture. It abstracts the
 * core CRUD (Create, Read, Update, Delete) operations away from the application's
 * business logic, allowing for interchangeable persistence implementations (Adapters).
 *
 * All methods operate on domain models (`T`), and it is the responsibility of concrete
 * adapter implementations to handle the mapping between domain models and persistence
 * models using a `GenericDataMapper`.
 *
 * @example
 * ```typescript
 * // In application/ports/account.repository.ts
 * import { GenericRepository } from '@libs/persistence';
 * import { AccountAggregate } from '../../domain/aggregates/account.aggregate';
 *
 * export interface IAccountRepository extends GenericRepository<AccountAggregate, string> {
 *   // Custom repository methods for Account can be added here
 *   findByOwnerId(ownerId: string): Promise<AccountAggregate[]>;
 * }
 * ```
 *
 * @see ADR-005: Mandate a Universal Error Handling Framework and Generic Repository Pattern.
 */
export interface GenericRepository<T, K extends TEntityId> {
  /**
   * Finds a single entity by its unique identifier.
   *
   * @public
   * @async
   * @param {K} id - The unique identifier of the entity to retrieve.
   * @returns {Promise<T | null>} A promise that resolves to the found entity or `null` if no entity is found with the given ID.
   * @throws {TransientInfrastructureError} If there is a temporary issue with the data store connection.
   * @throws {Error} For other unexpected persistence errors.
   */
  findById(id: K): Promise<T | null>;

  /**
   * Retrieves all entities of type `T`.
   * Note: For large datasets, this method should be used with caution. Consider adding
   * pagination-specific methods to concrete repository interfaces if needed.
   *
   * @public
   * @async
   * @returns {Promise<T[]>} A promise that resolves to an array of all found entities.
   * @throws {TransientInfrastructureError} If there is a temporary issue with the data store connection.
   */
  findAll(): Promise<T[]>;

  /**
   * Persists a new entity or updates an existing one in the data store.
   * This method typically performs an "upsert" operation. The implementation
   * should determine whether to perform an INSERT or an UPDATE based on the
   * entity's state (e.g., presence of an ID or version).
   *
   * @public
   * @async
   * @param {T} entity - The entity to save.
   * @returns {Promise<void>} A promise that resolves when the save operation is complete.
   * @throws {ValidationError} If the entity fails validation before persistence.
   * @throws {DomainError} If a business rule is violated during the persistence attempt (e.g., optimistic concurrency lock).
   * @throws {TransientInfrastructureError} If there is a temporary issue with the data store connection.
   */
  save(entity: T): Promise<void>;

  /**
   * Deletes an entity from the data store by its unique identifier.
   *
   * @public
   * @async
   * @param {K} id - The unique identifier of the entity to delete.
   * @returns {Promise<void>} A promise that resolves when the delete operation is complete.
   * @throws {NotFoundError} If no entity is found with the given ID to delete.
   * @throws {TransientInfrastructureError} If there is a temporary issue with the data store connection.
   */
  delete(id: K): Promise<void>;

  /**
   * Checks if an entity with the given ID exists.
   *
   * @public
   * @async
   * @param {K} id - The unique identifier of the entity to check.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the entity exists, otherwise `false`.
   * @throws {TransientInfrastructureError} If there is a temporary issue with the data store connection.
   */
  exists(id: K): Promise<boolean>;
}

/**
 * @interface GenericDataMapper<Domain, Persistence>
 * @template Domain - The type of the domain model (e.g., an Aggregate).
 * @template Persistence - The type of the persistence model (e.g., a TypeORM entity or a raw database row object).
 *
 * @description
 * Defines the contract for a data mapper, which is responsible for converting data
 * between the application's domain layer and the persistence layer. This separation
 * of concerns is a core tenet of Domain-Driven Design and Hexagonal Architecture,
 * preventing persistence-specific details from leaking into the domain logic.
 *
 * @example
 * ```typescript
 * // In infrastructure/persistence/mappers/account.mapper.ts
 * import { GenericDataMapper } from '@libs/persistence';
 * import { AccountAggregate } from '../../../domain/aggregates/account.aggregate';
 * import { AccountEntity } from '../entities/account.entity';
 *
 * export class AccountMapper implements GenericDataMapper<AccountAggregate, AccountEntity> {
 *   toDomain(entity: AccountEntity): AccountAggregate {
 *     // ... mapping logic from AccountEntity to AccountAggregate
 *   }
 *   toPersistence(domain: AccountAggregate): AccountEntity {
 *     // ... mapping logic from AccountAggregate to AccountEntity
 *   }
 * }
 * ```
 * @see ADR-005: Mandate a Universal Error Handling Framework and Generic Repository Pattern.
 */
export interface GenericDataMapper<Domain, Persistence> {
  /**
   * Maps a persistence model object to a domain model object.
   * This is used when retrieving data from the database.
   *
   * @public
   * @param {Persistence} entity - The persistence layer object.
   * @returns {Domain} The corresponding domain layer object.
   */
  toDomain(entity: Persistence): Domain;

  /**
   * Maps a domain model object to a persistence model object.
   * This is used when saving data to the database.
   *
   * @public
   * @param {Domain} domainModel - The domain layer object.
   * @returns {Persistence} The corresponding persistence layer object.
   */
  toPersistence(domainModel: Domain): Persistence;
}
