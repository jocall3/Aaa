import { inject, injectable } from "tsyringe";
import { Pool, PoolClient } from "pg";

import { PaymentWriteRepositoryPort } from "../../../application/ports/persistence/write/payment.write.repository.port";
import { Payment } from "../../../domain/aggregates/payment.aggregate";
import { DomainEvent } from "../../../domain/events/domain-event";

/**
 * @class PaymentPgAdapter
 * @implements {PaymentWriteRepositoryPort}
 * @description PostgreSQL adapter for the write-side of the Payment domain.
 * This adapter is responsible for persisting and retrieving payment aggregates
 * using an event sourcing approach. It interacts with the 'payment_events' table.
 * It's an infrastructure-layer implementation (an adapter) for a core application port.
 * As per the CQRS and Event Sourcing architectural directives, this adapter handles commands
 * by saving events and rehydrates aggregates from their event history.
 */
@injectable()
export class PaymentPgAdapter implements PaymentWriteRepositoryPort {
  private readonly eventTableName = "payment_events";

  /**
   * @constructor
   * @param {Pool} databaseConnection - The PostgreSQL connection pool injected via DI.
   * @description Constructs an instance of the PaymentPgAdapter.
   */
  public constructor(
    @inject("DatabaseConnection") private readonly databaseConnection: Pool
  ) {}

  /**
   * @async
   * @method findById
   * @param {string} aggregateId - The unique identifier of the Payment aggregate.
   * @returns {Promise<Payment | null>} A promise that resolves to the rehydrated Payment aggregate or null if not found.
   * @description Retrieves all domain events for a given aggregate ID from the event store (PostgreSQL),
   * and rehydrates the Payment aggregate to its current state by replaying the events in order.
   * This is the "rehydration" step in the Event Sourcing pattern.
   */
  public async findById(aggregateId: string): Promise<Payment | null> {
    const query = `
      SELECT event_id, aggregate_id, event_type, event_data, version, created_at
      FROM ${this.eventTableName}
      WHERE aggregate_id = $1
      ORDER BY version ASC;
    `;
    
    try {
      const { rows } = await this.databaseConnection.query(query, [aggregateId]);

      if (rows.length === 0) {
        return null;
      }

      const events: DomainEvent[] = rows.map(row => ({
        eventId: row.event_id,
        aggregateId: row.aggregate_id,
        eventType: row.event_type,
        payload: row.event_data,
        version: parseInt(row.version, 10),
        timestamp: new Date(row.created_at),
      }));

      // The rehydrate method on the aggregate root applies the events to build its state.
      const payment = Payment.rehydrate(aggregateId, events);
      return payment;
    } catch (error) {
      console.error(`[PaymentPgAdapter] Error finding payment aggregate by ID: ${aggregateId}`, error);
      // In a real-world scenario, a more specific infrastructure error should be thrown.
      throw new Error(`Failed to retrieve payment aggregate with ID ${aggregateId}.`);
    }
  }

  /**
   * @async
   * @method save
   * @param {Payment} payment - The Payment aggregate instance containing uncommitted events.
   * @returns {Promise<void>} A promise that resolves when the events have been successfully saved.
   * @description Persists the uncommitted domain events from a Payment aggregate to the event store.
   * This operation is performed within a single database transaction to ensure atomicity,
   * a critical requirement for maintaining consistency in an event-sourced system.
   * If any event fails to save, the entire transaction is rolled back.
   */
  public async save(payment: Payment): Promise<void> {
    const events = payment.getUncommittedEvents();
    if (events.length === 0) {
      return; // Nothing to save
    }

    const client: PoolClient = await this.databaseConnection.connect();

    try {
      await client.query("BEGIN");

      const query = `
        INSERT INTO ${this.eventTableName} (event_id, aggregate_id, event_type, event_data, version)
        VALUES ($1, $2, $3, $4, $5);
      `;

      for (const event of events) {
        const values = [
          event.eventId,
          event.aggregateId,
          event.eventType,
          JSON.stringify(event.payload),
          event.version,
        ];
        await client.query(query, values);
      }

      await client.query("COMMIT");
      
      // After successfully saving, clear the events from the aggregate
      payment.clearUncommittedEvents();

    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`[PaymentPgAdapter] Error saving payment events for aggregate ID ${payment.id}:`, error);
      // This is a critical failure. Throw a specific infrastructure error.
      throw new Error(`Failed to save events for payment aggregate ID ${payment.id}.`);
    } finally {
      client.release();
    }
  }
}
