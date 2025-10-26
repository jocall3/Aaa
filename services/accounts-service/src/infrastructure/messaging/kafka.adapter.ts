/**
 * @file kafka.adapter.ts
 * @description This file has been refactored as per the 'Abstracted Event Bus' architectural directive.
 * It no longer contains a direct Kafka implementation. Instead, it acts as an adapter to the new
 * universal `@platform/eventing` library. This class implements the application's IEventPublisher
 * port and delegates all event publishing tasks to the centralized EventBusClient, which handles
 * schema management, serialization (Avro), and the underlying broker communication.
 *
 * @see /docs/adr/ADR-002-abstracted-event-bus.md
 * @module Infrastructure/Messaging
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { IEventPublisher } from '../../application/ports/event-publisher.port';
import { DomainEvent } from '../../domain/events/domain-event.base';
import { EventBusClient, EVENT_BUS_CLIENT, StandardEvent } from '@platform/eventing';

/**
 * @class KafkaAdapter
 * @deprecated The name 'KafkaAdapter' is retained for dependency injection compatibility during the transition. This class is now an adapter for the platform-wide Event Bus.
 * @implements {IEventPublisher}
 * @description Implements the outbound port for publishing domain events. It adapts the application's
 * internal event format to the standard event format required by the universal Eventing library
 * and publishes it.
 */
@Injectable()
export class KafkaAdapter implements IEventPublisher {
  private readonly logger = new Logger(KafkaAdapter.name);

  /**
   * Constructs the Eventing Adapter.
   * @param {EventBusClient} eventBusClient - The injected client from the universal `@platform/eventing` library.
   */
  constructor(
    @Inject(EVENT_BUS_CLIENT) private readonly eventBusClient: EventBusClient,
  ) {
    this.logger.log('Event bus adapter initialized, delegating to @platform/eventing.');
  }

  /**
   * @public
   * @async
   * @method publish
   * @description Transforms a domain event into the platform's standard event format and publishes it to the event bus.
   * The underlying library handles schema registration, serialization (e.g., Avro), and publishing to the message broker (Kafka).
   * @template T - A type that extends the base `DomainEvent`.
   * @param {string} topic - The logical topic to publish to. The eventing library may use this for routing.
   * @param {T} event - The domain event object to be published.
   * @returns {Promise<void>}
   * @throws {Error} Throws a standardized error from the shared error framework if publishing fails.
   *
   * @example
   * const accountCreatedEvent = new AccountCreatedEvent(...);
   * await eventPublisher.publish('accounts.events', accountCreatedEvent);
   */
  public async publish<T extends DomainEvent>(topic: string, event: T): Promise<void> {
    try {
      /**
       * Map the internal domain event to the standardized `StandardEvent` format.
       * This is similar to a CloudEvents structure.
       * The `data` property is the raw JS object, which the Eventing library will
       * serialize against a registered schema (e.g., Avro).
       */
      const standardEvent: StandardEvent<object> = {
        specversion: '1.0',
        id: event.id,
        source: 'accounts-service',
        type: event.eventType,
        subject: event.aggregateId,
        time: event.timestamp.toISOString(),
        data: event.payload,
        // The `dataschema` and `datacontenttype` headers will be added by the EventBusClient
        // based on its schema registry integration.
      };

      await this.eventBusClient.publish(topic, standardEvent);

      this.logger.log(`Event '${event.eventType}' (ID: ${event.id}) successfully handed off to the Event Bus for topic '${topic}'.`);
    } catch (error) {
      this.logger.error(
        `Failed to publish event '${event.eventType}' (ID: ${event.id}) to topic '${topic}' via Event Bus.`,
        error.stack,
      );
      // TODO: Replace with a specific, shared error type like `TransientInfrastructureError`.
      throw new Error(`Failed to publish event: ${error.message}`);
    }
  }
}
