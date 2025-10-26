/**
 * @file Defines the port for the user repository, abstracting data persistence
 * logic for user entities from the application's core domain.
 * @version 1.0.0
 * @since 1.0.0
 * @see {@link ../../domain/entities/user.entity.ts} for the User entity definition.
 * @see {@link ../../infrastructure/adapters/database/repositories/typeorm-user.repository.ts} for a concrete implementation.
 */

import { User } from '../../domain/entities/user.entity';

/**
 * @interface IUserRepository
 * @description Represents the contract for a user repository. This is a port in
 * the Hexagonal Architecture, allowing the domain layer to remain independent of
 * the data persistence technology. It defines the standard operations that can be
 * performed on User entities.
 */
export interface IUserRepository {
  /**
   * @public
   * @async
   * @description Finds a user by their unique identifier.
   * @param {string} id - The unique identifier of the user.
   * @returns {Promise<User | null>} A promise that resolves to the User entity
   * if found, or null otherwise.
   */
  findById(id: string): Promise<User | null>;

  /**
   * @public
   * @async
   * @description Finds a user by their email address. Email is expected to be a
   * unique identifier for a user within the system.
   * @param {string} email - The email address of the user.
   * @returns {Promise<User | null>} A promise that resolves to the User entity
   * if found, or null otherwise.
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * @public
   * @async
   * @description Persists a new user or updates an existing one in the data store.
   * The implementation should handle both creation and update logic (upsert).
   * @param {User} user - The user entity to save.
   * @returns {Promise<void>} A promise that resolves when the save operation is complete.
   */
  save(user: User): Promise<void>;

  /**
   * @public
   * @async
   * @description Deletes a user from the data store by their unique identifier.
   * @param {string} id - The unique identifier of the user to be deleted.
   * @returns {Promise<void>} A promise that resolves when the delete operation is complete.
   */
  delete(id: string): Promise<void>;
}
