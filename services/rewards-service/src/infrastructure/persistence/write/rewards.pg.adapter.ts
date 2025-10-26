/**
 * @file This file contains the PostgreSQL adapter for the Rewards aggregate's write repository.
 * @description It implements the `IRewardsRepository` port and provides the event sourcing persistence logic
 * for the `RewardsAccountAggregate` using a PostgreSQL database as the event store. This adapter is a key
 * component of the infrastructure layer in a Hexagonal Architecture, refactored to use the Data Mapper pattern
 * to decouple domain events from the persistence schema.
 * @module infrastructure/persistence/RewardsPgAdapter
 * @implements {IRewardsRepository}
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { ConcurrencyException, InfrastructureError } from '../../../../../../libs/error-framework'; // Fictional path to shared library
import { IRewardsRepository } from '../../../application/ports/rewards.repository';
import {
  PointsAddedEvent,
  PointsRedeemedEvent,
  RewardsAccountClosedEvent,
  RewardsAccountCreatedEvent,
  RewardsAccountAggregate,
  TierChangedEvent,
} from '../../../domain/model/rewards.aggregate';
import { IDomainEvent } from '../../../../../../libs/common/src/domain/domain-event.interface'; // Fictional path to shared library

/**
 * @interface PersistenceEvent
 * @description Represents the shape of an event as it is stored in the `event_store` table.
 */
interface PersistenceEvent {
  aggregate_id: string;
  aggregate_type: string;
  event_type: string;
  payload: object;
  version: number;
  metadata: object;
}

// A map of event type names to their respective classes for deserialization.
// This is crucial for reconstructing aggregate state from the event store.
const eventTypeToClassMap: Record<string, new (...args: any[]) => IDomainEvent> = {
  RewardsAccountCreatedEvent: RewardsAccountCreatedEvent,
  PointsAddedEvent: PointsAddedEvent,
  PointsRedeemedEvent: PointsRedeemedEvent,
  TierChangedEvent: TierChangedEvent,
  RewardsAccountClosedEvent: RewardsAccountClosedEvent,
};

/**
 * @interface GenericDataMapper
 * @description Defines the contract for a Data Mapper, a key part of the new generic repository pattern.
 * It isolates the domain layer from persistence details by handling the transformation between
 * domain models and persistence models.
 * @template Domain - The domain model type.
 * @template Persistence - The persistence model type.
 */
interface GenericDataMapper<Domain, Persistence> {
  /**
   * @method toDomain
   * @description Maps a persistence model to a domain model.
   * @param {Persistence} persistence The persistence model object.
   * @returns {Domain} The corresponding domain model object.
   */
  toDomain(persistence: Persistence): Domain;

  /**
   * @method toPersistence
   * @description Maps a domain model to a persistence model.
   * @param {Domain} domain The domain model object.
   * @returns {Persistence} The corresponding persistence model object.
   */
  toPersistence(domain: Domain): Persistence;
}

/**
 * @class RewardsEventMapper
 * @description A Data Mapper for `RewardsAccount` domain events. It handles the serialization
 * and deserialization of events between the domain and the PostgreSQL persistence layer.
 * @implements {GenericDataMapper<IDomainEvent, PersistenceEvent>}
 */
@Injectable()
class RewardsEventMapper implements GenericDataMapper<IDomainEvent, PersistenceEvent> {
  private readonly logger = new Logger(RewardsEventMapper.name);

  /**
   * Maps a raw persistence event object from the database to a rich domain event object.
   *
   * @param {PersistenceEvent} persistenceEvent The raw event data from the `event_store` table.
   * @returns {IDomainEvent} An instance of a concrete DomainEvent class.
   * @throws {InfrastructureError} If the event type from the database is unknown.
   */
  public toDomain(persistenceEvent: PersistenceEvent): IDomainEvent {
    const EventClass = eventTypeToClassMap[persistenceEvent.event_type];
    if (!EventClass) {
      this.logger.error(`Unknown event type encountered during deserialization: ${persistenceEvent.event_type}`);
      throw new InfrastructureError(`Unknown event type: ${persistenceEvent.event_type}`);
    }
    // The entire domain event is stored in the payload for easy reconstruction.
    return Object.assign(new EventClass(null), persistenceEvent.payload);
  }

  /**
   * Maps a rich domain event object to a flat persistence object for database insertion.
   * This method is a placeholder as the full implementation requires the aggregate type.
   * A more specific method is used in the adapter.
   *
   * @param {IDomainEvent} domainEvent The domain event instance from the aggregate.
   * @returns {PersistenceEvent} A persistence-ready event object.
   */
  public toPersistence(domainEvent: IDomainEvent): PersistenceEvent {
    // This generic method is less useful for event sourcing where aggregate context is needed.
    // See the more specific implementation inside the adapter.
    throw new Error('Method not implemented. Use specific mapper in adapter context.');
  }
}

/**
 * @class RewardsPgAdapter
 * @description PostgreSQL adapter for the Rewards write repository (Event Store).
 * It implements the `IRewardsRepository` port using a PostgreSQL `event_store` table.
 * This class is responsible for persisting and retrieving event-sourced aggregates,
 * adhering to the Hexagonal Architecture and CQRS/ES patterns. It leverages a data
 * mapper to decouple domain events from the persistence schema.
 * @implements {IRewardsRepository}
 */
@Injectable()
export class RewardsPgAdapter implements IRewardsRepository {
  private readonly logger = new Logger(RewardsPgAdapter.name);
  private readonly AGGREGATE_TYPE = 'RewardsAccount';
  private readonly EVENTS_TABLE = 'event_store';

  /**
   * @constructor
   * @param {Pool} pool The PostgreSQL connection pool, injected via DI.
   * @param {RewardsEventMapper} mapper The data mapper for handling event transformations.
   */
  constructor(
    @Inject('PG_POOL') private readonly pool: Pool,
    private readonly mapper: RewardsEventMapper, // Mapper is now a dependency
  ) {}

  /**
   * Retrieves a `RewardsAccountAggregate` by its ID.
   *
   * It fetches all historical domain events for the given ID from the event store,
   * reconstitutes the aggregate to its current state by applying these events in order,
   * and returns the instance.
   *
   * @public
   * @param {string} id The unique identifier of the `RewardsAccountAggregate`.
   * @returns {Promise<RewardsAccountAggregate | null>} A promise that resolves with the reconstituted
   * aggregate instance, or `null` if no events are found for the ID.
   * @throws {InfrastructureError} If there is a database error.
   */
  public async findById(id: string): Promise<RewardsAccountAggregate | null> {
    this.logger.debug(`Finding event stream for ${this.AGGREGATE_TYPE} with ID: ${id}`);
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT event_type, payload, version FROM ${this.EVENTS_TABLE} WHERE aggregate_id = $1 AND aggregate_type = $2 ORDER BY version ASC`,
        [id, this.AGGREGATE_TYPE],
      );

      if (result.rows.length === 0) {
        this.logger.warn(`No events found for ${this.AGGREGATE_TYPE} with ID: ${id}`);
        return null;
      }

      const history = result.rows.map((row) => this.mapper.toDomain(row as PersistenceEvent));
      const aggregate = RewardsAccountAggregate.loadFromHistory(id, history);

      this.logger.debug(`Reconstituted ${this.AGGREGATE_TYPE} ${id} to version ${aggregate.version}`);
      return aggregate;
    } catch (error) {
      this.logger.error(`Error finding ${this.AGGREGATE_TYPE} by ID ${id}: ${error.message}`, error.stack);
      throw new InfrastructureError(`Could not find aggregate by ID: ${id}`);
    } finally {
      client.release();
    }
  }

  /**
   * Persists the state changes of a `RewardsAccountAggregate` to the event store.
   *
   * It retrieves uncommitted events from the aggregate, checks for optimistic concurrency,
   * and saves the events within a single database transaction.
   *
   * @public
   * @param {RewardsAccountAggregate} aggregate The aggregate instance with uncommitted changes.
   * @returns {Promise<void>} A promise that resolves when the events have been successfully saved.
   * @throws {ConcurrencyException} If the aggregate version in the database does not match the expected version.
   * @throws {InfrastructureError} If any other database error occurs.
   */
  public async save(aggregate: RewardsAccountAggregate): Promise<void> {
    const uncommittedEvents = aggregate.getUncommittedEvents();
    if (uncommittedEvents.length === 0) {
      this.logger.debug(`No uncommitted events to save for ${this.AGGREGATE_TYPE} ${aggregate.id}`);
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const baseVersion = aggregate.version - uncommittedEvents.length;
      const currentDbVersion = await this.getAggregateVersion(client, aggregate.id);

      if (currentDbVersion !== baseVersion) {
        throw new ConcurrencyException(
          `Optimistic concurrency check failed for aggregate ${aggregate.id}. Expected version ${baseVersion}, but found ${currentDbVersion}.`,
        );
      }

      for (const event of uncommittedEvents) {
        const persistenceEvent = this.toPersistence(event);
        await client.query(
          `INSERT INTO ${this.EVENTS_TABLE} (aggregate_id, aggregate_type, event_type, payload, version, metadata) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            persistenceEvent.aggregate_id,
            persistenceEvent.aggregate_type,
            persistenceEvent.event_type,
            persistenceEvent.payload,
            persistenceEvent.version,
            persistenceEvent.metadata,
          ],
        );
      }

      await client.query('COMMIT');
      aggregate.markEventsAsCommitted();
      this.logger.log(
        `Successfully saved ${uncommittedEvents.length} events for ${this.AGGREGATE_TYPE} ${aggregate.id}. New version: ${aggregate.version}`,
      );
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof ConcurrencyException) {
        this.logger.warn(error.message);
        throw error;
      }
      this.logger.error(`Error saving events for ${this.AGGREGATE_TYPE} ${aggregate.id}: ${error.message}`, error.stack);
      // Ensure a generic infrastructure error is thrown for other DB issues.
      throw new InfrastructureError(`Could not save events for aggregate ${aggregate.id}`);
    } finally {
      client.release();
    }
  }

  /**
   * Maps a rich domain event object to a flat persistence object for database insertion.
   * @param {IDomainEvent} domainEvent The domain event instance from the aggregate.
   * @returns {PersistenceEvent} A persistence-ready event object.
   */
  private toPersistence(domainEvent: IDomainEvent & { version?: number }): PersistenceEvent {
    if (typeof domainEvent.version !== 'number') {
      throw new InfrastructureError('Domain event is missing a version number for persistence.');
    }
    return {
      aggregate_id: domainEvent.aggregateId,
      aggregate_type: this.AGGREGATE_TYPE,
      event_type: domainEvent.constructor.name,
      payload: domainEvent, // Store the entire event for easy deserialization
      version: domainEvent.version,
      // Metadata would be passed in via a request context in a full implementation
      metadata: { causationId: '...', correlationId: '...' },
    };
  }

  /**
   * Fetches the current version of an aggregate from the database.
   * @private
   * @param {PoolClient} client The active database client.
   * @param {string} aggregateId The ID of the aggregate.
   * @returns {Promise<number>} The latest version of the aggregate, or -1 if it does not exist.
   */
  private async getAggregateVersion(client: PoolClient, aggregateId: string): Promise<number> {
    const result = await client.query(
      `SELECT MAX(version) as current_version FROM ${this.EVENTS_TABLE} WHERE aggregate_id = $1 AND aggregate_type = $2`,
      [aggregateId, this.AGGREGATE_TYPE],
    );
    // A new aggregate has no events, so its base version is -1.
    return result.rows[0]?.current_version === null ? -1 : Number(result.rows[0]?.current_version);
  }
}
