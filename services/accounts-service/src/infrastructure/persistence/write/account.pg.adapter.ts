/**
 * @file account.pg.adapter.ts
 * @description This file contains the PostgreSQL adapter for the Account aggregate's write repository.
 * It implements the IAccountWriteRepository port and provides the event sourcing persistence logic
 * for the Account aggregate using a PostgreSQL database as the event store.
 * This adapter is a key component of the infrastructure layer in a Hexagonal Architecture.
 */

import { Pool, PoolClient } from 'pg';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { IAccountWriteRepository } from '../../../domain/repositories/account.write.repository';
import { Account } from '../../../domain/aggregates/account.aggregate';
import { BaseEvent } from '../../../../../../libs/core/domain/base.event';
import { PG_CONNECTION } from '../../../../../../libs/core/infrastructure/persistence/pg.connection';
import { ConcurrencyException } from '../../../../../../libs/core/domain/errors/concurrency.exception';
import { AccountOpenedEvent } from '../../../domain/events/account-opened.event';
import { FundsDepositedEvent } from '../../../domain/events/funds-deposited.event';
import { FundsWithdrawnEvent } from '../../../domain/events/funds-withdrawn.event';
import { AccountClosedEvent } from '../../../domain/events/account-closed.event';

/**
 * A map of event type names to their corresponding class constructors.
 * This is used for deserializing events from the database.
 */
const eventNameClassMap: { [key: string]: new (...args: any[]) => BaseEvent } = {
  AccountOpenedEvent,
  FundsDepositedEvent,
  FundsWithdrawnEvent,
  AccountClosedEvent,
};

/**
 * @class AccountPgAdapter
 * @implements {IAccountWriteRepository}
 * @description PostgreSQL adapter for the Account write repository.
 * Handles persistence of Account events to an event store table.
 */
@Injectable()
export class AccountPgAdapter implements IAccountWriteRepository {
  private readonly logger = new Logger(AccountPgAdapter.name);
  private readonly aggregateType = 'Account';

  /**
   * Creates an instance of AccountPgAdapter.
   * @param {Pool} pool The PostgreSQL connection pool, injected via DI.
   */
  constructor(@Inject(PG_CONNECTION) private readonly pool: Pool) {}

  /**
   * Deserializes a database row into a domain event instance.
   * @private
   * @param {any} dbRow The raw database row from the 'events' table.
   * @returns {BaseEvent} An instance of a specific domain event class.
   * @throws {Error} If the event type is unknown.
   */
  private deserializeEvent(dbRow: any): BaseEvent {
    const { event_type: eventType, event_data: eventData } = dbRow;
    const EventClass = eventNameClassMap[eventType];
    if (!EventClass) {
      this.logger.error(`Unknown event type encountered: ${eventType}`);
      throw new Error(`Unknown event type: ${eventType}`);
    }
    // Re-instantiate the event class to ensure methods are available
    const event = Object.assign(new EventClass(), eventData);
    return event;
  }

  /**
   * Finds an Account aggregate by its ID by loading and replaying its event stream.
   * @param {string} accountId The unique identifier of the account aggregate.
   * @returns {Promise<Account | null>} The reconstituted Account aggregate, or null if not found.
   */
  public async findById(accountId: string): Promise<Account | null> {
    this.logger.log(`Finding event stream for Account with ID: ${accountId}`);
    const client = await this.pool.connect();
    try {
      const res = await client.query(
        `SELECT event_type, event_data, version
         FROM events
         WHERE aggregate_id = $1 AND aggregate_type = $2
         ORDER BY version ASC`,
        [accountId, this.aggregateType],
      );

      if (res.rows.length === 0) {
        this.logger.warn(`No events found for Account with ID: ${accountId}`);
        return null;
      }

      const history = res.rows.map(this.deserializeEvent.bind(this));

      const account = new Account(accountId);
      account.loadFromHistory(history);

      this.logger.log(`Reconstituted Account ${accountId} to version ${account.getVersion()}`);
      return account;
    } catch (error) {
      this.logger.error(
        `Error finding Account by ID ${accountId}: ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Saves an Account aggregate by persisting its uncommitted events to the event store.
   * This operation is atomic and uses optimistic concurrency control.
   * @param {Account} account The Account aggregate instance with uncommitted events.
   * @returns {Promise<void>}
   * @throws {ConcurrencyException} If a concurrent modification is detected.
   */
  public async save(account: Account): Promise<void> {
    const uncommittedEvents = account.getUncommittedEvents();
    if (uncommittedEvents.length === 0) {
      return; // No changes to save
    }

    this.logger.log(
      `Saving ${uncommittedEvents.length} events for Account ${account.getId()}`,
    );
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (const event of uncommittedEvents) {
        const query = `
          INSERT INTO events (aggregate_id, aggregate_type, event_type, event_data, version)
          VALUES ($1, $2, $3, $4, $5)
        `;

        await client.query(query, [
          account.getId(),
          this.aggregateType,
          event.constructor.name,
          event, // node-postgres driver automatically serializes the object to JSON
          event.version,
        ]);
      }

      await client.query('COMMIT');
      account.clearUncommittedEvents();
      this.logger.log(
        `Successfully saved events for Account ${account.getId()}. New version: ${account.getVersion()}`,
      );
    } catch (err) {
      await client.query('ROLLBACK');
      // PostgreSQL error code for unique_violation
      if (err.code === '23505') {
        this.logger.warn(
          `Concurrency conflict while saving Account ${account.getId()}.`,
        );
        throw new ConcurrencyException(
          `Concurrency conflict on aggregate ${this.aggregateType} with ID ${account.getId()}`,
        );
      }
      this.logger.error(
        `Error saving events for Account ${account.getId()}: ${err.message}`,
        err.stack,
      );
      throw err;
    } finally {
      client.release();
    }
  }
}
