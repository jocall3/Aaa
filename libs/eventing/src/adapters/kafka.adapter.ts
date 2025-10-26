/**
 * @file Implements the Kafka adapter for the universal Eventing platform library.
 * @version 1.0.0
 * @author Elite AI Implementation Team
 * @description This adapter provides a concrete implementation for interacting with Apache Kafka,
 * fulfilling the contract of the IEventBus port. It fully abstracts away the `kafkajs` library
 * and integrates with a Confluent-compatible Schema Registry for robust, schema-first event communication.
 * As per the architectural directive, this component is responsible for automatic schema validation,
 * versioning, and Avro-based serialization/deserialization of all event payloads.
 *
 * @see ADR-002: Abstracted Event Bus with a Centralized Schema Registry
 */

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SchemaRegistry, SchemaRegistryAPIClientArgs, SchemaType } from '@kafkajs/confluent-schema-registry';
import { Kafka, Producer, Consumer, logLevel, ConsumerSubscribeTopic, EachMessagePayload } from 'kafkajs';
import { EVENTING_CONFIG, IEventBus, EventEnvelope, IEventHandler, EventingConfig } from '../ports';

/**
 * @class KafkaAdapter
 * @implements {IEventBus}
 * @implements {OnModuleInit}
 * @implements {OnModuleDestroy}
 * @description This class is the infrastructure adapter for the Event Bus, using Kafka as the message broker.
 * It encapsulates all logic for producing and consuming messages, including Avro schema management.
 */
@Injectable()
export class KafkaAdapter implements IEventBus, OnModuleInit, OnModuleDestroy {
  /**
   * A dedicated logger instance for this adapter.
   * @private
   * @readonly
   */
  private readonly logger = new Logger(KafkaAdapter.name);

  /**
   * The underlying `kafkajs` client instance.
   * @private
   * @readonly
   */
  private readonly kafka: Kafka;

  /**
   * The Kafka producer instance, responsible for sending messages.
   * @private
   * @readonly
   */
  private readonly producer: Producer;

  /**
   * The Kafka consumer instance, responsible for receiving messages.
   * @private
   * @readonly
   */
  private readonly consumer: Consumer;

  /**
   * The client for interacting with the Confluent Schema Registry.
   * @private
   * @readonly
   */
  private readonly registry: SchemaRegistry;

  /**
   * Constructs the KafkaAdapter.
   *
   * @param {EventingConfig} config - The injected configuration object containing connection details for Kafka and the Schema Registry.
   */
  constructor(@Inject(EVENTING_CONFIG) private readonly config: EventingConfig) {
    this.logger.log('Initializing KafkaAdapter...');

    this.kafka = new Kafka({
      clientId: this.config.clientId,
      brokers: this.config.kafka.brokers,
      logLevel: this.config.kafka.logLevel ?? logLevel.INFO,
      ssl: this.config.kafka.ssl,
    });

    const registryConfig: SchemaRegistryAPIClientArgs = this.config.schemaRegistry.options ?? {};
    this.registry = new SchemaRegistry(
      { host: this.config.schemaRegistry.host },
      registryConfig
    );

    this.producer = this.kafka.producer(this.config.kafka.producerOptions ?? {
      idempotent: true,
      allowAutoTopicCreation: false,
    });

    this.consumer = this.kafka.consumer(this.config.kafka.consumerOptions ?? {
      groupId: this.config.consumerGroupId,
    });
  }

  /**
   * A NestJS lifecycle hook that connects the producer and consumer when the module initializes.
   * @returns {Promise<void>}
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.producer.connect();
      this.logger.log('Kafka producer connected successfully.');
      await this.consumer.connect();
      this.logger.log('Kafka consumer connected successfully.');
    } catch (error) {
      this.logger.error('Failed to connect Kafka clients.', error.stack);
      throw error; // Prevent application startup on connection failure
    }
  }

  /**
   * A NestJS lifecycle hook that gracefully disconnects the producer and consumer on shutdown.
   * @returns {Promise<void>}
   */
  async onModuleDestroy(): Promise<void> {
    try {
      await this.producer.disconnect();
      this.logger.log('Kafka producer disconnected successfully.');
      await this.consumer.disconnect();
      this.logger.log('Kafka consumer disconnected successfully.');
    } catch (error) {
      this.logger.error('Failed to disconnect Kafka clients gracefully.', error.stack);
    }
  }

  /**
   * Publishes an event to the Kafka message bus.
   * The event payload is automatically encoded into Avro format using the schema registered for the event's subject.
   *
   * @template T The type of the event data payload.
   * @param {EventEnvelope<T>} event - The event to publish, wrapped in a standard envelope.
   * @returns {Promise<void>}
   * @throws {Error} If schema registration, encoding, or publishing fails.
   *
   * @example
   * const event = {
   *   specversion: '1.0',
   *   id: 'uuid-goes-here',
   *   type: 'com.example.AccountCreated',
   *   source: 'accounts-service',
   *   subject: 'AccountCreated-v1',
   *   data: { accountId: '123', owner: 'user-456' },
   *   key: '123'
   * };
   * await eventBus.publish(event);
   */
  public async publish<T extends Record<string, any>>(event: EventEnvelope<T>): Promise<void> {
    const { topic, subject, key, data } = event;
    const schema = { type: SchemaType.AVRO, schema: JSON.stringify(this.config.schemas[subject]) };

    if (!schema.schema) {
        throw new Error(`Schema not found for subject: ${subject}`);
    }

    try {
      const { id } = await this.registry.register(schema);

      const encodedPayload = await this.registry.encode(id, data);

      await this.producer.send({
        topic,
        messages: [
          {
            key,
            value: encodedPayload,
            headers: { 'ce_specversion': event.specversion, 'ce_id': event.id, 'ce_type': event.type, 'ce_source': event.source, 'ce_subject': event.subject }
          },
        ],
      });

      this.logger.log(`Event ${event.type} (${event.id}) published to topic ${topic}.`);
    } catch (error) {
      this.logger.error(`Failed to publish event ${event.id} to topic ${topic}.`, error.stack);
      // Implement dead-letter queue or retry logic here as needed.
      throw error;
    }
  }

  /**
   * Subscribes to a Kafka topic and registers a handler for incoming messages.
   * The adapter automatically handles Avro deserialization using the schema registry.
   *
   * @template T The expected type of the deserialized event data payload.
   * @param {string} topic - The Kafka topic to subscribe to.
   * @param {IEventHandler<T>} handler - The handler object with a `handle` method to process incoming events.
   * @returns {Promise<void>}
   */
  public async subscribe<T extends Record<string, any>>(
    topic: string | ConsumerSubscribeTopic,
    handler: IEventHandler<T>,
  ): Promise<void> {
    const subscribeOptions = typeof topic === 'string' ? { topic, fromBeginning: true } : topic;
    await this.consumer.subscribe(subscribeOptions);

    await this.consumer.run({
      eachMessage: async (payload) => this.handleMessage(payload, handler),
    });

    this.logger.log(`Subscribed to topic(s): ${JSON.stringify(subscribeOptions)} with handler: ${handler.constructor.name}`);
  }

  /**
   * Internal message handler that decodes the payload and invokes the registered service-level handler.
   *
   * @private
   * @template T The expected type of the deserialized event data payload.
   * @param {EachMessagePayload} payload - The raw payload from `kafkajs`.
   * @param {IEventHandler<T>} handler - The handler to invoke.
   * @returns {Promise<void>}
   */
  private async handleMessage<T extends Record<string, any>>(
    { topic, partition, message }: EachMessagePayload,
    handler: IEventHandler<T>,
  ): Promise<void> {
    if (!message.value) {
      this.logger.warn(`Received message with null value on topic ${topic}. Skipping.`);
      return;
    }

    try {
      const decodedData = await this.registry.decode(message.value);
      const headers = message.headers;

      const event: EventEnvelope<T> = {
        topic,
        key: message.key?.toString(),
        data: decodedData as T,
        specversion: headers?.['ce_specversion']?.toString() ?? '1.0',
        id: headers?.['ce_id']?.toString() ?? 'unknown-id',
        type: headers?.['ce_type']?.toString() ?? 'unknown-type',
        source: headers?.['ce_source']?.toString() ?? 'unknown-source',
        subject: headers?.['ce_subject']?.toString() ?? 'unknown-subject',
        time: new Date(message.timestamp).toISOString(),
      };

      this.logger.debug(`Handling decoded event ${event.id} from topic ${topic}`);
      await handler.handle(event);
    } catch (error) {
      this.logger.error(
        `Error processing message from topic ${topic}, partition ${partition}. Offset: ${message.offset}. Handler: ${handler.constructor.name}`,
        error.stack,
      );
      // Implement logic for un-processable messages (e.g., move to a dead-letter topic).
      // For now, we will log and continue to avoid blocking the consumer.
    }
  }
}
