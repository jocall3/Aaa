/**
 * @file Defines the port for the user repository, abstracting data persistence
 * logic for the User aggregate from the application's core domain.
 * @version 2.0.0
 * @since 1.0.0
 * @author Elite AI Implementation Team
 *
 * @see {@link ../../domain/model/user.aggregate.ts} for the User aggregate definition.
 * @see {@link ../../infrastructure/persistence/postgres/user.adapter.ts} for a concrete implementation.
 */

import { UserAggregate } from '../../domain/model/user.aggregate';
// Assuming the new generic repository port and custom errors are created in shared libs as per architectural directives.
import { GenericRepository } from '../../../../../libs/core/persistence/generic.repository.port';
import { DomainError, TransientInfrastructureError } from '../../../../../libs/error-framework';

/**
 * @interface IUserRepository
 * @description Represents the contract for a user repository, extending the generic repository pattern.
 * This is a port in the Hexagonal Architecture, allowing the domain layer to remain independent of
 * the data persistence technology. It defines standard and user-specific operations that can be
 * performed on User aggregates.
 * @extends {GenericRepository<UserAggregate>}
 */
export interface IUserRepository extends GenericRepository<UserAggregate> {
  /**
   * @public
   * @async
   * @description Finds a User aggregate by its unique identifier.
   *
   * @param {string} id - The unique identifier of the user.
   * @returns {Promise<UserAggregate | null>} A promise that resolves to the UserAggregate
   * if found, or null otherwise.
   *
   * @throws {TransientInfrastructureError} If there is a temporary issue with the data store.
   *
   * @example
   * ```typescript
   * try {
   *   const user = await userRepository.findById('a1b2c3d4-e5f6-7890-1234-567890abcdef');
   *   if (user) {
   *     console.log(user.email);
   *   }
   * } catch (error) {
   *   // Handle infrastructure errors
   * }
   * ```
   */
  findById(id: string): Promise<UserAggregate | null>;

  /**
   * @public
   * @async
   * @description Finds a user aggregate by their email address. Email is a unique identifier for a user.
   *
   * @param {string} email - The email address of the user.
   * @returns {Promise<UserAggregate | null>} A promise that resolves to the UserAggregate
   * if found, or null otherwise.
   *
   * @throws {TransientInfrastructureError} If there is a temporary issue with the data store.
   *
   * @example
   * ```typescript
   * const user = await userRepository.findByEmail('jane.doe@example.com');
   * if (user) {
   *   console.log(user.id);
   * }
   * ```
   */
  findByEmail(email: string): Promise<UserAggregate | null>;

  /**
   * @public
   * @async
   * @description Persists a new user aggregate or updates an existing one in the data store.
   * The implementation should handle both creation and update logic.
   *
   * @param {UserAggregate} user - The user aggregate to save.
   * @returns {Promise<void>} A promise that resolves when the save operation is complete.
   *
   * @throws {DomainError} If a business rule is violated during persistence (e.g., optimistic locking, unique constraint).
   * @throws {TransientInfrastructureError} If there is a temporary issue with the data store.
   *
   * @example
   * ```typescript
   * await userRepository.save(newUserAggregate);
   * ```
   */
  save(user: UserAggregate): Promise<void>;

  /**
   * @public
   * @async
   * @description Deletes a user aggregate from the data store by its unique identifier.
   *
   * @param {string} id - The unique identifier of the user to be deleted.
   * @returns {Promise<void>} A promise that resolves when the delete operation is complete.
   *
   * @throws {TransientInfrastructureError} If there is a temporary issue with the data store.
   *
   * @example
   * ```typescript
   * await userRepository.delete('a1b2c3d4-e5f6-7890-1234-567890abcdef');
   * ```
   */
  delete(id: string): Promise<void>;
}
