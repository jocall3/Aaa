/**
 * @file account.pg.adapter.ts
 * @description This file contains the PostgreSQL adapter for the Account aggregate's write repository,
 * refactored to use the Universal Generic Repository Pattern. It implements the IAccountRepository
 * port and provides the event sourcing persistence logic for the Account aggregate.
 *
 * @see /docs/adr/ADR-005-generic-repository-pattern.md
 * @author Elite AI Implementation Team
 * @version 2.0.0
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';

import { IAccountRepository } from '../../../application/ports/account.repository';
import { Account } from '../../../domain/model/account.aggregate';
import {
  AccountClosedEvent,
  AccountCreatedEvent,
  AccountFrozenEvent,
  AccountUnfrozenEvent,
  FundsDepositedEvent,
  FundsWithdrawnEvent,
  IDomainEvent,
} from '../../../domain/events';

// Assumed shared library imports for the generic repository pattern
import { IGenericDataMapper } from '../../../../../../libs/persistence/generic.mapper';
import { PostgresEventSourcedRepository } from '../../../../../../libs/persistence/pg/postgres-event-sourced.repository';
import { EventPersistenceModel } from '../../../../../../libs/persistence/event-persistence.model';
import { NotFoundError } from '../../../../../../libs/error-framework';
import { PG_CONNECTION } from '../../database.constants';

/**
 * A map of event type names to their corresponding class constructors.
 * This is crucial for deserializing events from the database back into
 * concrete, typed event objects with their methods.
 * @internal
 */
const eventTypeToClassMap: { [key: string]: new (...args: any[]) => IDomainEvent } = {
  AccountCreatedEvent: AccountCreatedEvent,
  FundsDepositedEvent: FundsDepositedEvent,
  FundsWithdrawnEvent: FundsWithdrawnEvent,
  AccountFrozenEvent: AccountFrozenEvent,
  AccountUnfrozenEvent: AccountUnfrozenEvent,
  AccountClosedEvent: AccountClosedEvent,
};

/**
 * @class AccountDataMapper
 * @implements {IGenericDataMapper<Account, EventPersistenceModel>}
 * @description Provides the logic for mapping the `Account` aggregate to and from its
 * persistence model (a stream of events). This is a vital component of the generic
 * repository pattern, isolating mapping logic from both the repository and the database adapter.
 *
 * @see {@link IGenericDataMapper}
 * @see {@link Account}
 * @see {@link EventPersistenceModel}
 * @example
 * const mapper = new AccountDataMapper();
 * const eventStream = mapper.toPersistence(accountAggregate);
 * const reconstitutedAccount = mapper.toDomain(eventStream);
 */
@Injectable()
export class AccountDataMapper
  implements IGenericDataMapper<Account, EventPersistenceModel>
{
  private readonly logger = new Logger(AccountDataMapper.name);

  /**
   * Maps an array of persistence-level event models to a domain-level `Account` aggregate.
   * This process, known as rehydration, involves deserializing each event and applying it
   * to a new aggregate instance to reconstruct its current state.
   *
   * @public
   * @param {EventPersistenceModel[]} persistenceObjects - An ordered array of events retrieved from the event store.
   * @returns {Account} A fully reconstituted `Account` aggregate instance.
   * @throws {Error} If an unknown event type is encountered during deserialization.
   * @example
   * const history = [{ event_type: 'AccountCreatedEvent', payload: {...}, aggregate_id: 'uuid' }];
   * const account = mapper.toDomain(history);
   */
  public toDomain(persistenceObjects: EventPersistenceModel[]): Account {
    if (!persistenceObjects || persistenceObjects.length === 0) {
      // This should ideally not be reached if called from a repository that handles not-found cases.
      throw new Error(
        'Cannot reconstitute Account aggregate from an empty or null event stream.',
      );
    }

    const aggregateId = persistenceObjects[0].aggregate_id;

    const history: IDomainEvent[] = persistenceObjects.map(dbRow => {
      const EventClass = eventTypeToClassMap[dbRow.event_type];
      if (!EventClass) {
        this.logger.error(
          `Unknown event type encountered during deserialization: ${dbRow.event_type}`,
        );
        // Throwing a specific, cataloged error would be better in a full implementation.
        throw new Error(`Unknown event type: ${dbRow.event_type}`);
      }
      // Re-instantiate the event class to ensure methods and correct prototype are available.
      // Assumes event constructors follow a consistent pattern: (aggregateId, payload)
      return new EventClass(dbRow.aggregate_id, dbRow.payload);
    });

    return Account.loadFromHistory(aggregateId, history);
  }

  /**
   * Maps a domain-level `Account` aggregate to an array of persistence-level event models.
   * This is used to prepare the aggregate's uncommitted events for saving to the event store.
   *
   * @public
   * @param {Account} domainObject - The `Account` aggregate instance containing uncommitted events.
   * @returns {EventPersistenceModel[]} An array of event models ready to be inserted into the database.
   * @example
   * const newEvents = mapper.toPersistence(accountWithChanges);
   * // newEvents can now be saved to the database.
   */
  public toPersistence(domainObject: Account): EventPersistenceModel[] {
    return domainObject.uncommittedEvents.map((event, index) => ({
      aggregate_id: domainObject.id,
      aggregate_type: 'Account',
      event_type: event.eventType,
      payload: event.payload,
      // The generic repository will use this as the starting point for the new version number.
      // This property is not on the EventPersistenceModel but is used by the generic repo.
      // A better approach would be to have toPersistence return a tuple: [events, expectedVersion]
      version: domainObject.getVersion() + index + 1,
    }));
  }
}

/**
 * @class AccountPgAdapter
 * @implements {IAccountRepository}
 * @description This is the concrete PostgreSQL implementation of the `IAccountRepository` port.
 * It leverages a generic, event-sourced repository (`PostgresEventSourcedRepository`)
 * and a domain-specific `AccountDataMapper` to handle persistence, fully abstracting
 * the event sourcing mechanism from the application layer.
 *
 * @see {@link IAccountRepository}
 * @see {@link PostgresEventSourcedRepository}
 * @see {@link AccountDataMapper}
 */
@Injectable()
export class AccountPgAdapter implements IAccountRepository {
  private readonly logger = new Logger(AccountPgAdapter.name);
  private readonly genericRepository: PostgresEventSourcedRepository<Account>;

  /**
   * @constructor
   * @param {Pool} pool - The injected PostgreSQL connection pool.
   * @param {AccountDataMapper} mapper - The injected mapper for the Account aggregate.
   */
  constructor(
    @Inject(PG_CONNECTION) private readonly pool: Pool,
    private readonly mapper: AccountDataMapper,
  ) {
    this.genericRepository = new PostgresEventSourcedRepository<Account>(
      this.pool,
      this.mapper,
      'Account', // aggregateType
    );
  }

  /**
   * Finds an Account aggregate by its unique identifier by retrieving and replaying its event stream.
   *
   * @public
   * @async
   * @param {string} id - The unique identifier of the account aggregate.
   * @returns {Promise<Account>}
   * @throws {NotFoundError} If no event stream is found for the given ID.
   * @throws {TransientInfrastructureError} For underlying database issues.
   * @throws {ConcurrencyError} For optimistic locking failures on save.
   * @example
   * const account = await accountRepository.findById('some-uuid');
   */
  public async findById(id: string): Promise<Account> {
    this.logger.log(`Attempting to find Account with ID: ${id}`);
    const account = await this.genericRepository.findById(id);
    if (!account) {
      throw new NotFoundError(`Account with ID ${id} not found.`);
    }
    return account;
  }

  /**
   * Persists the state changes of an Account aggregate by appending its uncommitted events
   * to the event store in an atomic transaction.
   *
   * @public
   * @async
   * @param {Account} account - The Account aggregate instance with uncommitted events.
   * @returns {Promise<void>}
   * @throws {ConcurrencyError} If a concurrent modification is detected (optimistic locking failure).
   * @throws {TransientInfrastructureError} For underlying database issues.
   * @example
   * account.deposit(100);
   * await accountRepository.save(account);
   */
  public async save(account: Account): Promise<void> {
    this.logger.log(
      `Attempting to save ${account.uncommittedEvents.length} event(s) for Account ${account.id}`,
    );
    await this.genericRepository.save(account);
    this.logger.log(`Successfully saved events for Account ${account.id}.`);
    // The generic repository is responsible for calling `markEventsAsCommitted` on the aggregate.
  }
}
