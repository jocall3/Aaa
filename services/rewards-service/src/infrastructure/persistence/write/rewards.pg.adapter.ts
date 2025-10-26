import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { RewardsWriteRepository } from '../../../domain/ports/rewards.write.repository';
import { RewardsAccount } from '../../../domain/aggregates/rewards-account.aggregate';
import { DomainEvent } from '../../../domain/events/domain-event.base';
import { ConcurrencyException } from '../../../../shared/infrastructure/persistence/concurrency.exception';

// Placeholders for actual event classes. These would be imported from the domain layer.
import { RewardsAccountCreatedEvent } from '../../../domain/events/rewards-account-created.event';
import { PointsAddedEvent } from '../../../domain/events/points-added.event';
import { PointsRedeemedEvent } from '../../../domain/events/points-redeemed.event';
import { TierChangedEvent } from '../../../domain/events/tier-changed.event';

/**
 * A map of event type names to their respective classes for deserialization.
 * This is crucial for reconstructing aggregate state from the event store.
 * @internal
 */
const eventTypeToClassMap: { [key: string]: any } = {
  [RewardsAccountCreatedEvent.name]: RewardsAccountCreatedEvent,
  [PointsAddedEvent.name]: PointsAddedEvent,
  [PointsRedeemedEvent.name]: PointsRedeemedEvent,
  [TierChangedEvent.name]: TierChangedEvent,
};

/**
 * @class RewardsPgAdapter
 * @classdesc This class is the PostgreSQL adapter for the write-side of the rewards service.
 * It implements the RewardsWriteRepository port, providing a concrete implementation
 * for persisting and retrieving event-sourced aggregates to and from a PostgreSQL database.
 * This adheres to the Hexagonal Architecture pattern, isolating domain logic from
 * persistence concerns. It also implements optimistic concurrency control.
 *
 * @implements {RewardsWriteRepository}
 */
@Injectable()
export class RewardsPgAdapter implements RewardsWriteRepository {
  private readonly AGGREGATE_TYPE = 'RewardsAccount';
  private readonly EVENTS_TABLE = 'rewards_events';

  /**
   * Constructs the RewardsPgAdapter.
   * @param {Pool} pool - The PostgreSQL connection pool, injected via dependency injection.
   */
  constructor(@Inject('PG_POOL') private readonly pool: Pool) {}

  /**
   * Persists the state changes of a RewardsAccount aggregate to the event store.
   * It retrieves uncommitted events from the aggregate, checks for optimistic concurrency,
   * and saves the events within a single database transaction.
   * @param {RewardsAccount} account - The RewardsAccount aggregate instance with uncommitted changes.
   * @returns {Promise<void>} A promise that resolves when the events have been successfully saved.
   * @throws {ConcurrencyException} If the aggregate version in the database does not match the expected version.
   * @throws {Error} If any other database error occurs.
   */
  public async save(account: RewardsAccount): Promise<void> {
    const events = account.getUncommittedEvents();
    if (events.length === 0) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const currentVersion = await this.getAggregateVersion(client, account.id);
      if (currentVersion !== account.version) {
        throw new ConcurrencyException(
          `Optimistic concurrency check failed for aggregate ${account.id}. Expected version ${account.version}, but found ${currentVersion}.`,
        );
      }

      let version = account.version;
      for (const event of events) {
        version++;
        const query = `
          INSERT INTO ${this.EVENTS_TABLE} (aggregate_id, aggregate_type, event_type, version, payload)
          VALUES ($1, $2, $3, $4, $5)
        `;
        const values = [
          account.id,
          this.AGGREGATE_TYPE,
          event.constructor.name,
          version,
          event, // pg driver will serialize the object to JSON
        ];
        await client.query(query, values);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves a RewardsAccount aggregate by its ID.
   * It fetches all historical domain events for the given ID from the event store,
   * reconstitutes the aggregate to its current state by applying these events in order,
   * and returns the instance.
   * @param {string} id - The unique identifier of the RewardsAccount aggregate.
   * @returns {Promise<RewardsAccount | null>} A promise that resolves with the reconstituted
   * aggregate instance, or null if no events are found for the ID.
   */
  public async findById(id: string): Promise<RewardsAccount | null> {
    const events = await this.getEventsForAggregate(id);
    if (events.length === 0) {
      return null;
    }

    const account = new RewardsAccount();
    account.loadFromHistory(events);

    return account;
  }

  /**
   * Fetches the current version of an aggregate from the database.
   * The version is determined by the highest version number among its stored events.
   * @private
   * @param {PoolClient} client - The active database client.
   * @param {string} aggregateId - The ID of the aggregate.
   * @returns {Promise<number>} The latest version of the aggregate, or 0 if it does not exist.
   */
  private async getAggregateVersion(
    client: PoolClient,
    aggregateId: string,
  ): Promise<number> {
    const query = `
      SELECT MAX(version) as current_version FROM ${this.EVENTS_TABLE} WHERE aggregate_id = $1
    `;
    const result = await client.query(query, [aggregateId]);
    return result.rows[0]?.current_version || 0;
  }

  /**
   * Retrieves all domain events for a specific aggregate, ordered by version.
   * @private
   * @param {string} aggregateId - The ID of the aggregate.
   * @returns {Promise<DomainEvent[]>} An ordered array of domain events.
   */
  private async getEventsForAggregate(aggregateId: string): Promise<DomainEvent[]> {
    const query = `
      SELECT event_type, payload FROM ${this.EVENTS_TABLE} WHERE aggregate_id = $1 ORDER BY version ASC
    `;
    const result = await this.pool.query(query, [aggregateId]);

    return result.rows.map(this.deserializeEvent);
  }

  /**
   * Deserializes a database row into a corresponding DomainEvent object.
   * It uses a map to look up the correct event class based on the `event_type` string.
   * @private
   * @param {any} row - The database row containing `event_type` and `payload`.
   * @returns {DomainEvent} The instantiated domain event object.
   * @throws {Error} If the event type is unknown.
   */
  private deserializeEvent(row: { event_type: string; payload: any }): DomainEvent {
    const EventClass = eventTypeToClassMap[row.event_type];
    if (!EventClass) {
      throw new Error(`Unknown event type encountered: ${row.event_type}`);
    }
    // This assumes event classes have a default constructor and their properties
    // can be populated from the plain payload object.
    return Object.assign(new EventClass(), row.payload) as DomainEvent;
  }
}
