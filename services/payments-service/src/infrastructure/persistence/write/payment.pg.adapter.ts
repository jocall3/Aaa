/**
 * @file This file contains the PostgreSQL adapter for the write-side of the Payment domain.
 * It implements the repository port using a generic, multi-layered pattern as mandated
 * by the overall architectural directives. This includes a dedicated data mapper for
 * domain-to-persistence translation, and it handles event sourcing logic for the Payment aggregate.
 *
 * @author Elite AI Implementation Team
 * @version 2.0.0
 * @see /docs/adr/ADR-009-generic-repository-and-data-mapper-pattern.md
 * @see /docs/adr/ADR-004-cqrs-event-sourcing.md
 */

import { inject, injectable } from 'tsyringe';
import { Pool, PoolClient } from 'pg';
import { Logger } from 'pino';

// Core framework & shared library imports from the new architecture
import { GenericDataMapper } from '../../../../../../libs/ddd-core/dist/persistence/generic.data-mapper'; // Hypothetical path
import { InfrastructureError, ConcurrencyError } from '../../../../../../libs/error-framework/dist'; // Hypothetical path
import { DomainEvent } from '../../../../../../libs/ddd-core/dist/domain/domain-event'; // Hypothetical path

// Application/Domain specific imports
import { PaymentWriteRepositoryPort } from '../../../application/ports/persistence/write/payment.write.repository.port';
import { Payment } from '../../../domain/aggregates/payment.aggregate';
import { PaymentInitiatedEvent } from '../../../domain/events/payment-initiated.event';
import { PaymentCompletedEvent } from '../../../domain/events/payment-completed.event';
import { PaymentFailedEvent } from '../../../domain/events/payment-failed.event';
import { PaymentCancelledEvent } from '../../../domain/events/payment-cancelled.event';

/**
 * @interface PaymentEventPersistence
 * @description Represents the data structure of an event as stored in the PostgreSQL `payment_events` table.
 * This is the "Persistence Model".
 * @TSDoc
 */
export interface PaymentEventPersistence {
  event_id: string;
  aggregate_id: string;
  aggregate_type: 'Payment';
  event_type: string;
  payload: Record<string, any>;
  version: number;
  created_at: Date;
}

/**
 * A map of event type names to their corresponding class constructors.
 * This is crucial for deserializing events from the database back into their
 * strongly-typed domain event classes.
 * @internal
 */
const eventTypeMap: { [key: string]: new (...args: any[]) => DomainEvent } = {
  PaymentInitiatedEvent: PaymentInitiatedEvent,
  PaymentCompletedEvent: PaymentCompletedEvent,
  PaymentFailedEvent: PaymentFailedEvent,
  PaymentCancelledEvent: PaymentCancelledEvent,
};

/**
 * @class PaymentEventDataMapper
 * @implements {GenericDataMapper<DomainEvent, PaymentEventPersistence>}
 * @description Maps `Payment` domain events to and from the PostgreSQL persistence model.
 * This class provides a layer of indirection, decoupling the domain logic from database-specific schemas.
 * @TSDoc
 */
@injectable()
export class PaymentEventDataMapper implements GenericDataMapper<DomainEvent, PaymentEventPersistence> {
  private readonly logger: Logger;

  /**
   * @constructor
   * @param {Logger} logger The injected logger instance.
   */
  constructor(@inject('Logger') logger: Logger) {
    this.logger = logger.child({ context: 'PaymentEventDataMapper' });
  }

  /**
   * Maps a raw database row from the event store to a rich domain event object.
   * @param {PaymentEventPersistence} persistence The raw event object from PostgreSQL.
   * @returns {DomainEvent} An instance of a specific domain event class (e.g., PaymentInitiatedEvent).
   * @throws {InfrastructureError} If the event type from the database is unknown.
   * @public
   */
  public toDomain(persistence: PaymentEventPersistence): DomainEvent {
    const EventClass = eventTypeMap[persistence.event_type];
    if (!EventClass) {
      this.logger.error(`Unknown event type encountered in database: '${persistence.event_type}' for aggregate ${persistence.aggregate_id}`);
      throw new InfrastructureError(`Unknown event type '${persistence.event_type}' found in event store.`);
    }

    // Assumes event constructor takes a single payload object.
    const domainEvent = new EventClass(persistence.payload);

    // Re-hydrate metadata properties that live outside the payload
    Object.assign(domainEvent, {
      eventId: persistence.event_id,
      aggregateId: persistence.aggregate_id,
      version: persistence.version,
      timestamp: persistence.created_at,
    });

    return domainEvent;
  }

  /**
   * Maps a rich domain event object to its raw persistence representation for PostgreSQL.
   * @param {DomainEvent} domain The domain event instance.
   * @returns {Omit<PaymentEventPersistence, 'created_at' | 'aggregate_type'>} A plain object ready for insertion.
   * @public
   */
  public toPersistence(domain: DomainEvent): Omit<PaymentEventPersistence, 'created_at' | 'aggregate_type'> {
    return {
      event_id: domain.eventId,
      aggregate_id: domain.aggregateId,
      event_type: domain.eventType,
      payload: domain.payload,
      version: domain.version,
    };
  }
}

/**
 * @class PaymentPgRepository
 * @implements {PaymentWriteRepositoryPort}
 * @description This is the concrete PostgreSQL implementation of the repository for the `Payment` aggregate.
 * It uses an event sourcing strategy, persisting the aggregate's state as a series of immutable events.
 * It adheres to the generic repository pattern by using a dedicated data mapper.
 * @TSDoc
 */
@injectable()
export class PaymentPgRepository implements PaymentWriteRepositoryPort {
  private readonly logger: Logger;
  private readonly aggregateType = 'Payment';
  private readonly eventTableName = 'payment_events';

  /**
   * @constructor
   * @param {Pool} pool The injected PostgreSQL connection pool.
   * @param {PaymentEventDataMapper} mapper The injected data mapper for events.
   * @param {Logger} logger The injected logger.
   */
  constructor(
    @inject('DatabaseConnection') private readonly pool: Pool,
    @inject(PaymentEventDataMapper) private readonly mapper: PaymentEventDataMapper,
    @inject('Logger') logger: Logger,
  ) {
    this.logger = logger.child({ context: 'PaymentPgRepository' });
  }

  /**
   * Finds a `Payment` aggregate by its unique identifier by loading and replaying its event stream.
   * @param {string} aggregateId The UUID of the payment aggregate.
   * @returns {Promise<Payment | null>} The reconstituted `Payment` aggregate, or `null` if not found.
   * @throws {InfrastructureError} If there is a database or deserialization error.
   * @public
   */
  public async findById(aggregateId: string): Promise<Payment | null> {
    this.logger.debug(`Finding event stream for ${this.aggregateType} with ID: ${aggregateId}`);

    const query = `
      SELECT event_id, aggregate_id, event_type, payload, version, created_at
      FROM ${this.eventTableName}
      WHERE aggregate_id = $1 AND aggregate_type = $2
      ORDER BY version ASC;
    `;

    try {
      const { rows } = await this.pool.query<PaymentEventPersistence>(query, [aggregateId, this.aggregateType]);

      if (rows.length === 0) {
        return null;
      }

      const history = rows.map(row => this.mapper.toDomain(row));

      // Rehydrate the aggregate from its history of events.
      const payment = Payment.rehydrate(aggregateId, history);

      this.logger.debug(`Reconstituted ${this.aggregateType} ${aggregateId} to version ${payment.version}`);
      return payment;
    } catch (error) {
      this.logger.error({ err: error }, `Error finding ${this.aggregateType} by ID ${aggregateId}`);
      throw new InfrastructureError(`Failed to retrieve aggregate with ID ${aggregateId}.`, { cause: error });
    }
  }

  /**
   * Saves a `Payment` aggregate by persisting its uncommitted events to the event store.
   * This operation is atomic and uses optimistic concurrency control to prevent conflicts.
   * @param {Payment} payment The `Payment` aggregate instance with uncommitted events.
   * @returns {Promise<void>}
   * @throws {ConcurrencyError} If a concurrent modification is detected.
   * @throws {InfrastructureError} If any other database error occurs.
   * @public
   */
  public async save(payment: Payment): Promise<void> {
    const events = payment.getUncommittedEvents();
    if (events.length === 0) {
      this.logger.debug(`No uncommitted events to save for ${this.aggregateType} ${payment.id}.`);
      return;
    }

    this.logger.info(`Saving ${events.length} events for ${this.aggregateType} ${payment.id}`);
    const client: PoolClient = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO ${this.eventTableName} (event_id, aggregate_id, aggregate_type, event_type, payload, version)
        VALUES ($1, $2, $3, $4, $5, $6);
      `;

      for (const event of events) {
        const persistenceEvent = this.mapper.toPersistence(event);
        const values = [
          persistenceEvent.event_id,
          persistenceEvent.aggregate_id,
          this.aggregateType,
          persistenceEvent.event_type,
          persistenceEvent.payload, // pg driver will stringify the object to JSONB
          persistenceEvent.version,
        ];
        await client.query(query, values);
      }

      await client.query('COMMIT');

      payment.clearUncommittedEvents();
      this.logger.info(`Successfully saved events for ${this.aggregateType} ${payment.id}. New version: ${payment.version}`);
    } catch (error) {
      await client.query('ROLLBACK');

      // PostgreSQL error code for unique_violation on the (aggregate_id, version) index
      if (error.code === '23505') {
        this.logger.warn(`Concurrency conflict while saving ${this.aggregateType} ${payment.id}.`);
        throw new ConcurrencyError(
          `Concurrency conflict on aggregate ${this.aggregateType} with ID ${payment.id}.`, { cause: error }
        );
      }

      this.logger.error({ err: error }, `Error saving events for ${this.aggregateType} ${payment.id}`);
      throw new InfrastructureError(`Failed to save events for aggregate ID ${payment.id}.`, { cause: error });
    } finally {
      client.release();
    }
  }
}
