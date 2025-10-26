/**
 * @file This file defines the UserMapper class, responsible for converting data between the
 * User domain aggregate and the PostgreSQL persistence entity.
 * @author Elite AI Implementation Team
 * @version 1.0.0
 * @see {@link ../../../domain/model/user.aggregate.ts} for the UserAggregate definition.
 * @see {@link ./user.entity.ts} for the UserEntity definition (inferred).
 */

import { UserAggregate, UserStatus } from '../../../domain/model/user.aggregate';
import { UserEntity } from './user.entity';
import { RoleEntity } from './role.entity';

// Note: The 'GenericDataMapper' interface is part of a wider architectural directive.
// This implementation aligns with that pattern.
// import { GenericDataMapper } from 'libs/ports/persistence/generic-data.mapper';

/**
 * @class UserMapper
 * @description A static class providing methods to map between the User domain aggregate
 * and the User persistence entity. This is a crucial component for abstracting the
 * domain layer from persistence concerns, as per the Hexagonal Architecture and
 * Generic Repository Pattern directives.
 */
export class UserMapper /* implements GenericDataMapper<UserAggregate, UserEntity> */ {
  /**
   * @static
   * @method toDomain
   * @description Maps a `UserEntity` object from the persistence layer back to a `UserAggregate` domain object.
   *
   * @param {UserEntity} entity The persistence entity to map from.
   * @returns {UserAggregate} A fully reconstituted UserAggregate instance.
   * @throws {Error} if the provided entity is null or undefined.
   *
   * @example
   * ```ts
   * const userEntity = await userRepository.findOne({ where: { id: '...' } });
   * const userAggregate = UserMapper.toDomain(userEntity);
   * ```
   *
   * @architectural-note This method performs a state-based reconstruction of an event-sourced aggregate.
   * This is a compromise to work with a state-oriented ORM like TypeORM in the current adapter. A pure
   * event-sourcing implementation would use a factory method on the aggregate (e.g., `UserAggregate.fromHistory()`)
   * to replay events from an event store. This mapper bypasses the aggregate's private constructor to set state directly.
   */
  public static toDomain(entity: UserEntity): UserAggregate {
    if (!entity) {
      // In a real implementation, this would throw a custom error from the shared error-framework.
      throw new Error('Cannot map a null or undefined UserEntity to domain.');
    }

    // Bypass the private constructor to reconstruct the aggregate from its persisted state.
    const aggregate = Object.create(UserAggregate.prototype);

    // Manually assign private properties from the entity to the aggregate instance.
    (aggregate as any)._id = entity.id;
    (aggregate as any)._email = entity.email;
    (aggregate as any)._passwordHash = entity.passwordHash;
    (aggregate as any)._firstName = entity.firstName;
    (aggregate as any)._lastName = entity.lastName;
    (aggregate as any)._status = entity.status as UserStatus;
    (aggregate as any)._roles = new Set(entity.roles?.map(role => role.name) || []);
    (aggregate as any)._createdAt = entity.createdAt;
    (aggregate as any)._updatedAt = entity.updatedAt;

    // Map the persistence version to the aggregate's internal version.
    // The aggregate's internal version is event-based and starts at -1.
    // TypeORM's @VersionColumn starts at 1. This mapping is imperfect but necessary.
    // An aggregate loaded from state should have a version reflecting its persisted state.
    (aggregate as any)._version = entity.version;

    // An aggregate reconstructed from state has no new events to commit.
    aggregate.markEventsAsCommitted();

    return aggregate as UserAggregate;
  }

  /**
   * @static
   * @method toPersistence
   * @description Maps a `UserAggregate` domain object to a `UserEntity` persistence object.
   *
   * @param {UserAggregate} aggregate The domain aggregate to map from.
   * @returns {UserEntity} A persistence entity ready to be saved by a repository.
   * @throws {Error} if the provided aggregate is null or undefined.
   *
   * @example
   * ```ts
   * const userAggregate = await UserAggregate.register(...);
   * const userEntity = UserMapper.toPersistence(userAggregate);
   * await userRepository.save(userEntity);
   * ```
   */
  public static toPersistence(aggregate: UserAggregate): UserEntity {
    if (!aggregate) {
      // In a real implementation, this would throw a custom error from the shared error-framework.
      throw new Error('Cannot map a null or undefined UserAggregate to persistence.');
    }

    const entity = new UserEntity();

    // Access public properties via getters
    entity.id = aggregate.id;
    entity.email = aggregate.email;
    entity.firstName = aggregate.firstName;
    entity.lastName = aggregate.lastName;
    entity.status = aggregate.status;
    entity.version = aggregate.version;

    // Access private properties without getters via type-casting.
    // This is necessary because the aggregate encapsulates this state.
    entity.passwordHash = (aggregate as any)._passwordHash;
    entity.createdAt = (aggregate as any)._createdAt;
    entity.updatedAt = (aggregate as any)._updatedAt;

    // Map roles: convert string[] from aggregate to RoleEntity[] for persistence.
    // This assumes that the underlying ORM can handle relations based on this structure.
    entity.roles = aggregate.roles.map(roleName => {
      const roleEntity = new RoleEntity();
      roleEntity.name = roleName;
      return roleEntity;
    });

    return entity;
  }
}
