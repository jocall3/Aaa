/**
 * @file This file defines the port for the account repository, outlining the contract
 * for data persistence operations related to the Account aggregate in a Domain-Driven,
 * Event-Sourced architecture.
 * @author Elite AI Implementation Team
 * @version 1.0.0
 */

import { Account } from '../../domain/entities/account.entity';

/**
 * Represents the repository for managing Account aggregates.
 * As part of the Hexagonal Architecture, this interface is an output port, defining
 * how the application core communicates with persistence mechanisms.
 * In an Event Sourced system, this port is responsible for loading an aggregate's
 * state from its history of events and for persisting new state changes by
 * appending new events to the event store.
 *
 * @interface IAccountRepository
 * @see {@link Account} - The domain entity this repository manages.
 */
export interface IAccountRepository {
  /**
   * Finds an Account aggregate by its unique identifier.
   * This method retrieves the full history of events for the given accountId
   * from the event store and rehydrates the Account aggregate to its current state.
   *
   * @public
   * @param {string} accountId - The unique identifier of the account to find.
   * @returns {Promise<Account | null>} A promise that resolves to the rehydrated Account aggregate,
   * or null if no event stream is found for the given ID.
   * @throws {Error} Throws an error if there is a problem accessing the data store or rehydrating the aggregate.
   */
  findById(accountId: string): Promise<Account | null>;

  /**
   * Persists the state changes of an Account aggregate.
   * This method retrieves the uncommitted events from the Account aggregate root
   * and appends them to the corresponding event stream in the event store.
   * It should ensure optimistic concurrency control by checking the aggregate's version.
   *
   * @public
   * @param {Account} account - The Account aggregate instance with uncommitted events.
   * @returns {Promise<void>} A promise that resolves when the events have been successfully persisted.
   * @throws {Error} Throws a concurrency exception or other persistence-related errors.
   */
  save(account: Account): Promise<void>;
}
