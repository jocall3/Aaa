import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, logLevel } from 'kafkajs';
import { IEventPublisher } from '../../application/ports/event-publisher.port';
import { DomainEvent } from '../../domain/events/domain-event.base';

/**
 * @class KafkaAdapter
 * @implements {IEventPublisher}
 * @implements {OnModuleInit}
 * @implements {OnModuleDestroy}
 * @description This class is an adapter for the Hexagonal Architecture, implementing the `IEventPublisher` output port.
 * It is responsible for all communication with the Apache Kafka message broker, including connection,
 * producing messages, and handling security (mTLS).
 * It completely encapsulates the `kafkajs` library from the core domain.
 */
@Injectable()
export class KafkaAdapter implements IEventPublisher, OnModuleInit, OnModuleDestroy {
  /**
   * @private
   * @readonly
   * @property {Kafka} kafka - The main `kafkajs` client instance.
   */
  private readonly kafka: Kafka;

  /**
   * @private
   * @readonly
   * @property {Producer} producer - The Kafka producer instance used for sending messages.
   */
  private readonly producer: Producer;

  /**
   * @private
   * @readonly
   * @property {Logger} logger - The logger for this adapter.
   */
  private readonly logger = new Logger(KafkaAdapter.name);

  /**
   * @constructor
   * @description Initializes the Kafka client and producer with configuration from the `ConfigService`.
   * It sets up brokers and SSL configuration for mTLS as per Zero Trust security directives.
   * @param {ConfigService} configService - The service used to access environment configuration.
   */
  constructor(private readonly configService: ConfigService) {
    const brokers = this.configService.get<string>('KAFKA_BROKERS').split(',');

    this.kafka = new Kafka({
      clientId: this.configService.get<string>('KAFKA_CLIENT_ID', 'accounts-service'),
      brokers,
      logLevel: logLevel.INFO,
      ssl: {
        rejectUnauthorized: true,
        // These would be retrieved from a secure source like HashiCorp Vault at runtime
        // and passed via environment variables.
        ca: [this.configService.get<string>('KAFKA_SSL_CA')],
        key: this.configService.get<string>('KAFKA_SSL_KEY'),
        cert: this.configService.get<string>('KAFKA_SSL_CERT'),
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: false,
      idempotent: true, // Ensures messages are written exactly once
      maxInFlightRequests: 5, // Recommended for idempotent producers
    });
  }

  /**
   * @async
   * @method onModuleInit
   * @description A NestJS lifecycle hook that connects the Kafka producer when the module is initialized.
   * This ensures the producer is ready to send messages before the application starts handling requests.
   * @returns {Promise<void>}
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.producer.connect();
      this.logger.log('Kafka producer connected successfully.');
    } catch (error) {
      this.logger.error('Failed to connect Kafka producer.', error.stack);
      // Depending on the application's needs, we might want to throw the error
      // to prevent the service from starting in a faulty state.
      throw error;
    }
  }

  /**
   * @async
   * @method onModuleDestroy
   * @description A NestJS lifecycle hook that gracefully disconnects the Kafka producer when the application is shutting down.
   * This helps prevent message loss.
   * @returns {Promise<void>}
   */
  async onModuleDestroy(): Promise<void> {
    try {
      await this.producer.disconnect();
      this.logger.log('Kafka producer disconnected successfully.');
    } catch (error) {
      this.logger.error('Failed to disconnect Kafka producer.', error.stack);
    }
  }

  /**
   * @public
   * @async
   * @method publish
   * @description Publishes a domain event to a specified Kafka topic. The method serializes the event payload
   * and uses the event's `aggregateId` as the message key to ensure events for the same aggregate
   * are sent to the same partition, maintaining order.
   * @template T - A type that extends the base `DomainEvent`.
   * @param {string} topic - The Kafka topic to which the message will be sent.
   * @param {T} event - The domain event object to be published.
   * @returns {Promise<void>}
   * @throws {Error} If the event payload cannot be serialized or if publishing fails.
   */
  public async publish<T extends DomainEvent>(topic: string, event: T): Promise<void> {
    try {
      const messageValue = JSON.stringify(event);
      await this.producer.send({
        topic,
        messages: [
          {
            key: event.aggregateId, // Use aggregateId for partitioning
            value: messageValue,
            headers: {
              'event-type': event.eventType,
              'timestamp': event.timestamp.toISOString(),
            },
          },
        ],
      });
      this.logger.log(`Event ${event.eventType} with ID ${event.id} published to topic ${topic}.`);
    } catch (error) {
      this.logger.error(`Failed to publish event to topic ${topic}. Event: ${JSON.stringify(event)}`, error.stack);
      // In a real-world scenario, you might implement a retry mechanism or a dead-letter queue.
      throw new Error(`Failed to publish event: ${error.message}`);
    }
  }
}
