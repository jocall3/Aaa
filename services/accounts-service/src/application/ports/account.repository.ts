/**
 * @file account.repository.ts
 * @description This file defines the port for the account repository, outlining the contract
 * for data persistence operations related to the Account aggregate in a Domain-Driven,
 * Event-Sourced architecture. It adheres to the new Generic Repository Pattern.
 * @author Elite AI Implementation Team
 * @version 2.0.0
 */

import { AccountAggregate } from '../../domain/model/account.aggregate';
// import { ConcurrencyError, TransientInfrastructureError } from '@libs/error-framework'; // Assuming shared error library

// NOTE: In a complete architecture, this generic interface would reside in a shared library (e.g., @libs/ddd-core).
/**
 * @interface IGenericRepository
 * @template T - The type of the Aggregate Root.
 * @description A generic repository interface for managing aggregate roots, as per the architectural
 * directives. It defines the standard contract for persistence operations, abstracting the
 * underlying data storage mechanism from the application's core logic.
 *
 * @method findById - Retrieves an aggregate by its unique identifier.
 * @method save - Persists the state changes of an aggregate.
 */
export interface IGenericRepository<T> {
  /**
   * Finds an aggregate root by its unique identifier.
   * For event-sourced aggregates, this involves retrieving the event stream
   * and rehydrating the aggregate to its current state.
   *
   * @param {string} id - The unique identifier of the aggregate to find.
   * @returns {Promise<T | null>} A promise that resolves to the rehydrated aggregate,
   * or null if no event stream is found for the given ID.
   * @throws {TransientInfrastructureError} If there is a temporary problem with the data store.
   */
  findById(id: string): Promise<T | null>;

  /**
   * Persists the state changes of an aggregate root.
   * For event-sourced aggregates, this retrieves the uncommitted events from the
   * aggregate and appends them to the event store, ensuring optimistic concurrency control.
   *
   * @param {T} aggregate - The aggregate instance with uncommitted events.
   * @returns {Promise<void>} A promise that resolves when the events have been successfully persisted.
   * @throws {ConcurrencyError} If an optimistic concurrency check fails during persistence.
   * @throws {TransientInfrastructureError} If there is a temporary problem with the data store.
   */
  save(aggregate: T): Promise<void>;
}

/**
 * @interface IAccountRepository
 * @extends IGenericRepository<AccountAggregate>
 * @description Represents the specialized repository port for managing Account aggregates.
 * It inherits the standard persistence methods from `IGenericRepository` and can be
 * extended with account-specific query methods if needed (though queries should typically
 * use a separate read repository in CQRS).
 *
 * As part of the Hexagonal Architecture, this is an output port, defining how the
 * application core communicates with persistence mechanisms for the Account aggregate.
 *
 * @see {@link AccountAggregate} - The domain aggregate this repository manages.
 * @see {@link IGenericRepository} - The generic interface it extends.
 * @example
 * ```typescript
 * // In an application service or command handler:
 * const account = await accountRepository.findById('some-account-id');
 * if (account) {
 *   account.deposit(100);
 *   await accountRepository.save(account);
 * }
 * ```
 */
export interface IAccountRepository extends IGenericRepository<AccountAggregate> {
  // Currently, no account-specific methods are needed for the write repository.
  // findById and save are sufficient for event-sourced aggregate management.
  // Account-specific queries would be part of a separate IAccountReadRepository port.
}
