/**
 * @file generic.mapper.ts
 * @description This file defines the generic data mapper interface and an optional abstract base class
 * as mandated by the persistence architecture. It provides a contract for mapping between domain models
 * and persistence models.
 * @author Elite AI Implementation Team
 * @version 1.0.0
 */

/**
 * @interface GenericDataMapper
 * @template Domain The domain entity or aggregate root type.
 * @template Persistence The persistence entity or document type (e.g., TypeORM entity, Mongoose schema).
 * @description A generic interface that defines the contract for mapping between domain models and persistence models.
 * This is a crucial part of the multi-layered persistence pattern, ensuring a clean separation between
 * the application's core domain logic and the infrastructure-specific data representations. Each aggregate
 * will have a concrete implementation of this mapper.
 *
 * @see /docs/adr/ADR-008-generic-repository-and-data-mapper-pattern.md
 */
export interface GenericDataMapper<Domain, Persistence> {
  /**
   * Maps a persistence model object to a domain model object.
   * This method is responsible for reconstituting a domain entity from its persisted state,
   * including any value objects or complex types.
   *
   * @param {Persistence} persistenceObject - The raw persistence object retrieved from the database.
   * @returns {Domain} The fully constituted domain model object.
   * @throws {Error} May throw a mapping error if the persistence object is invalid or cannot be mapped.
   * @example
   * ```ts
   * // In a concrete implementation for a User aggregate:
   * const userMapper = new UserMapper();
   * const userEntity: UserPersistenceEntity = // from database;
   * const userDomainObject: UserAggregate = userMapper.toDomain(userEntity);
   * ```
   */
  toDomain(persistenceObject: Persistence): Domain;

  /**
   * Maps a domain model object to a persistence model object.
   * This method is responsible for deconstructing a domain entity into a flat or structured
   * object that can be understood by the persistence layer (e.g., an ORM or a document database client).
   *
   * @param {Domain} domainObject - The domain model object to be persisted.
   * @returns {Persistence} The persistence model object ready to be saved to the database.
   * @example
   * ```ts
   * // In a concrete implementation for a User aggregate:
   * const userMapper = new UserMapper();
   * const userDomainObject: UserAggregate = // from domain logic;
   * const userEntity: UserPersistenceEntity = userMapper.toPersistence(userDomainObject);
   * // userEntity can now be passed to TypeORM's repository.save()
   * ```
   */
  toPersistence(domainObject: Domain): Persistence;

  /**
   * Maps an array of persistence model objects to an array of domain model objects.
   * Provides a convenient way to handle bulk mapping operations.
   *
   * @param {Persistence[]} persistenceObjects - An array of raw persistence objects.
   * @returns {Domain[]} An array of fully constituted domain model objects.
   */
  bulkToDomain(persistenceObjects: Persistence[]): Domain[];

  /**
   * Maps an array of domain model objects to an array of persistence model objects.
   * Provides a convenient way to handle bulk mapping operations.
   *
   * @param {Domain[]} domainObjects - An array of domain model objects.
   * @returns {Persistence[]} An array of persistence model objects.
   */
  bulkToPersistence(domainObjects: Domain[]): Persistence[];
}

/**
 * @abstract
 * @class AbstractDataMapper
 * @template Domain The domain entity or aggregate root type.
 * @template Persistence The persistence entity or document type.
 * @description Provides a base implementation for `GenericDataMapper` that includes default
 * implementations for the bulk mapping methods. Concrete mapper classes can extend this
 * abstract class to reduce boilerplate code, only needing to implement the single-entity
 * `toDomain` and `toPersistence` methods.
 */
export abstract class AbstractDataMapper<Domain, Persistence>
  implements GenericDataMapper<Domain, Persistence>
{
  /**
   * @abstract
   * @inheritdoc
   */
  public abstract toDomain(persistenceObject: Persistence): Domain;

  /**
   * @abstract
   * @inheritdoc
   */
  public abstract toPersistence(domainObject: Domain): Persistence;

  /**
   * @inheritdoc
   * @description Default implementation that iterates over the array and calls `toDomain` for each item.
   * This can be overridden in concrete classes for performance-critical scenarios.
   */
  public bulkToDomain(persistenceObjects: Persistence[]): Domain[] {
    return persistenceObjects.map(item => this.toDomain(item));
  }

  /**
   * @inheritdoc
   * @description Default implementation that iterates over the array and calls `toPersistence` for each item.
   * This can be overridden in concrete classes for performance-critical scenarios.
   */
  public bulkToPersistence(domainObjects: Domain[]): Persistence[] {
    return domainObjects.map(item => this.toPersistence(item));
  }
}
