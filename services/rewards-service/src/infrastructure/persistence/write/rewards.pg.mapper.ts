/**
 * @file rewards.pg.mapper.ts
 * @description This file contains the data mapper for rewards domain events,
 * translating between the rich domain model and the PostgreSQL persistence model.
 * This is a new component introduced as part of the Generic Repository Pattern refactoring.
 * @see /docs/adr/ADR-005-generic-repository-pattern.md
 */

import { Injectable } from '@nestjs/common';

// In a real monorepo, this would be imported from a shared library, e.g., '@libs/core/persistence'
/**
 * @interface GenericDataMapper
 * @description A placeholder for the generic data mapper interface mandated by architectural directives.
 * It defines a contract for mapping between domain models and persistence models.
 * @template Domain The domain model type.
 * @template Persistence The persistence model type.
 */
export interface GenericDataMapper<Domain, Persistence> {
  /**
   * Maps a persistence model to a domain model.
   * @param {Persistence} persistenceObject The raw persistence object.
   * @returns {Domain} The rich domain model instance.
   * @throws {Error} If mapping fails, e.g., due to an unknown type.
   */
  toDomain(persistenceObject: any): Domain;

  /**
   * Maps a domain model to a persistence model.
   * @param {Domain} domainObject The rich domain model instance.
   * @returns {Partial<Persistence>} The raw persistence object, often partial as the repository adds context.
   */
  toPersistence(domainObject: Domain): Partial<Persistence>;
}

// These event classes are defined in the domain layer.
import {
  IDomainEvent,
  RewardsAccountCreatedEvent,
  PointsEarnedEvent,
  PointsRedeemedEvent,
  RewardsTierChangedEvent,
  RewardsAccountClosedEvent,
} from '../../../domain/model/rewards.aggregate';

/**
 * @interface RewardsEventPersistence
 * @description Represents the structure of an event record in the PostgreSQL 'event_store' table.
 * This is the "Persistence" type for our data mapper.
 */
export interface RewardsEventPersistence {
  aggregate_id: string;
  aggregate_type: string;
  event_type: string;
  version: number;
  payload: Record<string, any>;
  metadata: Record<string, any>;
  created_at: Date;
}

// Map event type names to their class constructors for deserialization.
const eventTypeToClassMap = {
  RewardsAccountCreatedEvent,
  PointsEarnedEvent,
  PointsRedeemedEvent,
  RewardsTierChangedEvent,
  RewardsAccountClosedEvent,
};

/**
 * @class RewardsEventDataMapper
 * @implements {GenericDataMapper<IDomainEvent, RewardsEventPersistence>}
 * @description Concrete implementation of the GenericDataMapper for mapping between
 * `IDomainEvent` (and its implementations) and the `RewardsEventPersistence` model for PostgreSQL.
 * This class is a crucial part of the infrastructure layer, decoupling the domain from
 * persistence-specific data structures as per the Hexagonal Architecture and Generic Repository Pattern directives.
 * @see {@link ../../../../../../docs/adr/ADR-005-generic-repository-pattern.md}
 */
@Injectable()
export class RewardsEventDataMapper
  implements GenericDataMapper<IDomainEvent, RewardsEventPersistence>
{
  /**
   * Maps a raw persistence event model from PostgreSQL to a rich domain event object.
   * It uses a map to look up the correct event class constructor based on the event type string.
   *
   * @public
   * @method toDomain
   * @param {Pick<RewardsEventPersistence, 'aggregate_id' | 'event_type' | 'payload'>} persistenceObject - The raw event data from the database, typically from a `SELECT` query.
   * @returns {IDomainEvent} An instance of a concrete domain event class (e.g., `PointsEarnedEvent`).
   * @throws {Error} If the `event_type` from the database record is unknown and cannot be mapped to a class.
   * @example
   * const dbRow = { aggregate_id: 'uuid', event_type: 'PointsEarnedEvent', payload: { points: 100, ... } };
   * const domainEvent = mapper.toDomain(dbRow); // returns new PointsEarnedEvent(...)
   */
  public toDomain(
    persistenceObject: Pick<
      RewardsEventPersistence,
      'aggregate_id' | 'event_type' | 'payload'
    >,
  ): IDomainEvent {
    const EventClass = eventTypeToClassMap[persistenceObject.event_type];
    if (!EventClass) {
      throw new Error(
        `Unknown event type '${persistenceObject.event_type}' encountered during deserialization.`,
      );
    }

    // This mapping assumes event constructors follow the pattern: `(aggregateId: string, data: T)`
    // The 'payload' column in the DB stores the 'data' object from the domain event.
    // The `pg` driver automatically deserializes the JSONB `payload` into a JavaScript object.
    const event = new EventClass(
      persistenceObject.aggregate_id,
      persistenceObject.payload,
    );

    return event;
  }

  /**
   * Maps a domain event object to a format suitable for insertion into the PostgreSQL event store.
   * This method extracts the core data from the domain event. The repository layer is responsible for
   * adding contextual persistence data like `version`, `aggregate_type`, and `metadata`.
   *
   * @public
   * @method toPersistence
   * @param {IDomainEvent} domainEvent - The domain event to be persisted.
   * @returns {Pick<RewardsEventPersistence, 'aggregate_id' | 'event_type' | 'payload'>} A plain object representing the core event data for persistence.
   * @example
   * const event = new PointsEarnedEvent('uuid', { points: 100, ... });
   * const persistenceData = mapper.toPersistence(event);
   * // returns { aggregate_id: 'uuid', event_type: 'PointsEarnedEvent', payload: { points: 100, ... } }
   */
  public toPersistence(
    domainEvent: IDomainEvent,
  ): Pick<RewardsEventPersistence, 'aggregate_id' | 'event_type' | 'payload'> {
    return {
      aggregate_id: domainEvent.aggregateId,
      event_type: domainEvent.eventType,
      payload: domainEvent.data,
    };
  }
}
