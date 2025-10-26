/**
 * @file This file defines the core interfaces for the new universal Eventing platform library.
 * It specifies the primary `IEventBus` port, which services use for publishing events,
 * and the canonical structure for all `IDomainEvent` objects.
 *
 * This contract enforces a schema-first, abstracted approach to asynchronous communication
 * as per the architectural directive to introduce a universal event bus. While this file
 * defines the publishing interface (`IEventBus`), the Eventing library is also responsible
 * for handling event consumption. Subscriptions are typically managed declaratively within
 * each service (e.g., via decorators on handler methods), which the library's runtime
 * uses to connect to the bus and listen for relevant events.
 *
 * @author Elite AI Implementation Team
 * @version 1.0.0
 * @see /docs/adr/ADR-002-abstracted-event-bus.md
 */

/**
 * @interface IEventMetadata
 * @description Defines the standardized metadata structure that must accompany every domain event.
 * This ensures consistency and provides essential context for tracing, auditing, and routing.
 *
 * @property {string} eventId - A unique identifier (UUID) for this specific event instance. Essential for idempotency and tracing.
 * @property {string} timestamp - The UTC timestamp in ISO 8601 format of when the event occurred.
 * @property {string} correlationId - An ID that groups a series of events part of a single business transaction or request.
 * @property {string} [causationId] - The `eventId` of the event that caused this event to be emitted. Used for building causal chains.
 * @property {string} domain - The business domain that owns the event (e.g., 'accounts', 'payments'). Used for topic mapping.
 * @property {string} sourceService - The name of the microservice that published the event.
 * @property {object} [custom] - An optional key-value map for any other custom, non-standard metadata.
 */
export interface IEventMetadata {
  readonly eventId: string;
  readonly timestamp: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly domain: string;
  readonly sourceService: string;
  readonly custom?: Record<string, string | number | boolean>;
}

/**
 * @interface IDomainEvent
 * @description Represents the canonical structure for any domain event published across the platform.
 * It is a generic interface that pairs a strongly-typed payload with standardized metadata.
 *
 * @template TPayload - The specific type of the event's data payload, which must be a record-like object.
 *
 * @property {string} eventType - The unique, business-meaningful name of the event. This is used for schema lookup in the registry and for routing to subscribers.
 * @property {string} eventVersion - The semantic version of the event's schema (e.g., '1.0.0', '2.1.0'). This is critical for schema evolution.
 * @property {TPayload} payload - The data payload of the event, conforming to its registered schema (e.g., Avro, Protobuf).
 * @property {IEventMetadata} metadata - The standardized metadata providing context for the event.
 */
export interface IDomainEvent<TPayload extends Record<string, any>> {
  readonly eventType: string;
  readonly eventVersion: string;
  readonly payload: TPayload;
  readonly metadata: IEventMetadata;
}

/**
 * @interface IEventBus
 * @description Defines the contract for the abstracted event bus, serving as a core port (in Hexagonal Architecture)
 * for the application's domain and application layers to publish domain events. This abstraction decouples
 * services from the underlying messaging technology (e.g., Kafka, RabbitMQ, etc.).
 *
 * @example
 * ```typescript
 * // In a service's application layer
 * import { IEventBus, IDomainEvent } from '@libs/eventing';
 *
 * class CreateAccountHandler {
 *   constructor(private readonly eventBus: IEventBus) {}
 *
 *   async handle(command: CreateAccountCommand): Promise<void> {
 *     // ... business logic to create an account
 *
 *     const event: IDomainEvent<AccountCreatedPayload> = {
 *       eventType: 'AccountCreated',
 *       eventVersion: '1.0.0',
 *       payload: { accountId: '...', userId: '...', initialBalance: 100 },
 *       metadata: {
 *         eventId: '...',
 *         timestamp: new Date().toISOString(),
 *         correlationId: '...',
 *         domain: 'accounts',
 *         sourceService: 'accounts-service',
 *       }
 *     };
 *
 *     await this.eventBus.publish(event);
 *   }
 * }
 * ```
 */
export interface IEventBus {
  /**
   * Publishes one or more domain events to the event bus.
   * The concrete adapter implementing this interface is responsible for:
   * 1. Deriving the topic/stream name from the event's metadata (e.g., `metadata.domain`).
   * 2. Serializing the event payload using its registered schema (e.g., Avro).
   * 3. Validating the payload against the schema version specified in the event.
   * 4. Handling all aspects of communication with the message broker, including connection management and error handling.
   *
   * @public
   * @async
   * @template TPayload - The payload type of the event(s) being published.
   * @param {IDomainEvent<TPayload> | IDomainEvent<TPayload>[]} events - A single event or an array of events to publish. Publishing multiple events should ideally be an atomic operation if the underlying broker supports it.
   * @returns {Promise<void>} A promise that resolves when the events have been successfully acknowledged by the broker.
   * @throws {SchemaValidationError} If an event payload does not match its registered schema.
   * @throws {EventBusConnectionError} If the client is not connected to the message broker.
   * @throws {EventPublishError} For other generic publishing failures.
   */
  publish<TPayload extends Record<string, any>>(
    events: IDomainEvent<TPayload> | IDomainEvent<TPayload>[],
  ): Promise<void>;

  /**
   * Initializes the connection to the underlying message broker and schema registry.
   * This method must be called during application startup before any events can be published.
   * It is responsible for setting up producers, consumers, and any necessary resources.
   *
   * @public
   * @async
   * @returns {Promise<void>} A promise that resolves when the connection and initialization are complete.
   * @throws {EventBusConnectionError} If the connection to the broker or schema registry fails.
   */
  connect(): Promise<void>;

  /**
   * Gracefully disconnects from the message broker and cleans up resources.
   * This should be called during application shutdown to ensure all buffered messages are sent.
   *
   * @public
   * @async
   * @returns {Promise<void>} A promise that resolves when the disconnection is complete.
   */
  disconnect(): Promise<void>;
}
