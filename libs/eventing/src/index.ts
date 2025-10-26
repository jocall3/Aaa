/**
 * @file index.ts
 * @module @platform/eventing
 * @description
 * Main entry point for the universal `@platform/eventing` library.
 * This library provides a comprehensive, abstracted platform for asynchronous, schema-driven
 * communication across all microservices, as mandated by the architectural directives.
 *
 * @see /docs/adr/ADR-002-abstracted-event-bus.md
 * @see /docs/adr/ADR-003-centralized-schema-registry.md
 *
 * @summary
 * The library abstracts the underlying message broker (Kafka) and enforces a strict, schema-first
 * approach using a centralized schema registry (e.g., Confluent Schema Registry).
 * It handles schema validation, versioning, and automatic serialization/deserialization of event payloads,
 * decoupling services from the physical event structure and the underlying broker technology.
 *
 * All exports are fully documented with TSDoc to comply with the "Docs-as-Code" initiative.
 *
 * @example
 * ```typescript
 * // In a service's main bootstrap file
 * import { EventBusFactory, IEventBus, EventingConfig } from '@platform/eventing';
 *
 * const config: EventingConfig = {
 *   broker: {
 *     clientId: 'payments-service',
 *     brokers: ['kafka-broker:9092'],
 *     // ... other Kafka configurations (e.g., for mTLS)
 *   },
 *   schemaRegistry: {
 *     host: 'http://schema-registry:8081',
 *   },
 *   // Optional: specify a dead-letter queue strategy
 *   dlq: {
 *      topic: 'dlq.payments-service.events',
 *      maxRetries: 3,
 *   }
 * };
 *
 * const eventBus: IEventBus = EventBusFactory.create(config);
 * await eventBus.connect();
 *
 * // ... then inject eventBus into the service's application layer
 * ```
 */

// --- Core Interfaces (Ports) ---
/**
 * @description Exports the core contracts (ports) of the eventing platform,
 * defining the essential interfaces for domain events and the event bus itself.
 * Adherence to these interfaces ensures a clean separation between application
 * logic and infrastructure concerns, as per Hexagonal Architecture principles.
 */
export * from './interfaces/domain-event.interface';
export * from './interfaces/event-bus.interface';

// --- Factory & Configuration ---
/**
 * @description Exports the factory for creating event bus instances and the
 * configuration types required for initialization. This is the primary entry point
 * for consumers of the library to instantiate and configure the event bus.
 */
export * from './config/eventing.config';
export * from './factory/event-bus.factory';

// --- Event Definitions & Payloads ---
/**
 * @description Exports base classes and types for creating new domain events.
 * This includes a base event class that ensures all events have a consistent
 * structure and metadata. Using these base types is mandatory for schema registration.
 */
export * from './schemas/base-event';

// --- Custom Errors ---
/**
 * @description Exports custom error classes specific to the eventing library.
 * This allows services to handle event-publishing or subscription failures with
 * specific, typed errors, aligning with the universal error handling framework.
 */
export * from './errors/event-publishing.error';
export * from './errors/schema-registry.error';

// --- Types & Enums ---
/**
 * @description Exports common types and enumerations used throughout the eventing library,
 * such as handler function signatures, subscription options, and event metadata types.
 */
export * from './types/event-handler.type';
export * from './types/subscription-options.type';
